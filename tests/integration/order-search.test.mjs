// Fase 8E: búsqueda de pedidos sin acentos (conservando la ñ), con filtros y paginación.
// Usa la condición REAL del panel (orderSearchCondition) traducida a SQL. Nombres sintéticos.
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

import { normalizeOrderSearch, ORDER_PAGE_SIZE, orderSearchCondition, sanitizeOrderSearch } from "../../src/lib/admin/order-filters.ts";
import { createDatabase } from "./harness.mjs";

let ctx;
const NAMES = ["María Prueba", "José Prueba", "Ángel Prueba", "Martín Prueba", "Peña Prueba", "Pena Prueba", "ZOË PRUEBA"];

// Pedido sintético con nombre/teléfono/entrega controlados (create_order como anon).
async function order(name, phone, deliveryType = "pickup") {
  const { db, one } = ctx;
  const branch = (await one(`select id from branches order by name limit 1`)).id;
  const product = (await one(`select product_id from branch_products where branch_id = $1 order by price limit 1`, [branch])).product_id;
  await db.exec("set role anon;");
  try {
    return (await one(
      `select (public.create_order(gen_random_uuid(), $1, $2::jsonb, $3, $4, $5::public.delivery_type, p_address => $6, p_neighborhood => $7))->>'order_id' as id`,
      [branch, JSON.stringify([{ product_id: product, quantity: 1 }]), name, phone, deliveryType, deliveryType === "delivery" ? "Calle Ficticia 1" : null, deliveryType === "delivery" ? "Colonia Sintética" : null],
    )).id;
  } finally {
    await db.exec("reset role;");
  }
}

// "folio.ilike.*x*,customer_name_search.ilike.*y*" (PostgREST) → SQL con parámetros.
function toSql(condition, params) {
  return `(${condition.split(",").map((part) => {
    const [column, , pattern] = part.split(/\.(ilike)\./).filter(Boolean).length === 3 ? part.split(/\.(ilike)\./) : [];
    params.push(pattern.replaceAll("*", "%"));
    return `${column} ilike $${params.length}`;
  }).join(" or ")})`;
}

// Misma consulta que listAdminOrders: filtros + búsqueda + orden + página, como admin.
async function search({ q = "", status = null, delivery = null, page = 1 } = {}) {
  const params = [];
  const where = ["true"];
  const cleaned = sanitizeOrderSearch(q);
  const condition = orderSearchCondition(cleaned);
  if (condition) where.push(toSql(condition, params));
  if (status) { params.push(status); where.push(`status = $${params.length}::public.order_status`); }
  if (delivery) { params.push(delivery); where.push(`delivery_type = $${params.length}::public.delivery_type`); }
  const base = `from orders where ${where.join(" and ")}`;
  const total = await ctx.as("admin", `select count(*)::int n ${base}`, params);
  const rows = await ctx.as("admin", `select customer_name, folio ${base} order by created_at desc, folio desc limit ${ORDER_PAGE_SIZE} offset ${(page - 1) * ORDER_PAGE_SIZE}`, params);
  assert.ok(total.ok && rows.ok, total.message ?? rows.message);
  return { total: total.rows[0].n, names: rows.rows.map((row) => row.customer_name), folios: rows.rows.map((row) => row.folio) };
}

before(async () => {
  ctx = await createDatabase();
  for (const [index, name] of NAMES.entries()) await order(name, `55000000${String(index).padStart(2, "0")}`, index % 2 ? "delivery" : "pickup");
  for (let i = 1; i <= 30; i++) await order(`Cliente Paginación ${i}`, "5511112222");
});

describe("normalización SQL ↔ TypeScript", () => {
  test("private.order_search_normalize coincide con normalizeOrderSearch", async () => {
    const samples = ["María", "JOSÉ", "Ángel", "Martín", "Peña", "ÑANDÚ", "Güero", "Zoë", "àâä èêë ìîï òôö ùûü", "Árbol ÉXITO Ícono Óvalo Único Ü"];
    for (const sample of samples) {
      const sql = (await ctx.one(`select private.order_search_normalize($1) as v`, [sample])).v;
      assert.equal(sql, normalizeOrderSearch(sample), sample);
    }
  });
  test("la columna generada se llenó al crear el pedido (create_order sin cambios)", async () => {
    const row = await ctx.one(`select customer_name_search from orders where customer_name = 'Peña Prueba'`);
    assert.equal(row.customer_name_search, "peña prueba");
  });
});

describe("sin acentos ni mayúsculas", () => {
  for (const [query, expected] of [["Maria", "María Prueba"], ["maría", "María Prueba"], ["Jose", "José Prueba"], ["ANGEL", "Ángel Prueba"], ["Angel", "Ángel Prueba"], ["Martin", "Martín Prueba"], ["zoe", "ZOË PRUEBA"]]) {
    test(`«${query}» encuentra «${expected}»`, async () => {
      const { names } = await search({ q: query });
      assert.deepEqual(names, [expected]);
    });
  }
  test("la ñ es otra letra: «Peña» no trae «Pena» ni al revés", async () => {
    assert.deepEqual((await search({ q: "peña" })).names, ["Peña Prueba"]);
    assert.deepEqual((await search({ q: "PENA" })).names, ["Pena Prueba"]);
  });
  test("caracteres con significado en PostgREST se sanean (sin errores ni inyección)", async () => {
    const { total } = await search({ q: "María,(%*)" });
    assert.equal(total, 1);
  });
});

describe("folio y teléfono", () => {
  test("folio exacto y parcial", async () => {
    const folio = (await ctx.one(`select folio from orders where customer_name = 'José Prueba'`)).folio;
    assert.deepEqual((await search({ q: folio })).names, ["José Prueba"]);
    assert.deepEqual((await search({ q: folio.toLowerCase() })).names, ["José Prueba"], "folio sin importar mayúsculas");
  });
  test("teléfono con espacios", async () => {
    assert.deepEqual((await search({ q: "55 0000 0002" })).names, ["Ángel Prueba"]);
  });
});

describe("filtros + búsqueda + paginación", () => {
  test("búsqueda + tipo de entrega", async () => {
    assert.deepEqual((await search({ q: "prueba", delivery: "delivery" })).names.sort(), ["José Prueba", "Martín Prueba", "Pena Prueba"]);
    assert.equal((await search({ q: "maria", delivery: "delivery" })).total, 0);
  });
  test("búsqueda + estado", async () => {
    const id = (await ctx.one(`select id from orders where customer_name = 'Martín Prueba'`)).id;
    await ctx.as("admin", `select public.update_order_status($1, 'new', 'confirmed')`, [id], { persist: true });
    assert.deepEqual((await search({ q: "martin", status: "confirmed" })).names, ["Martín Prueba"]);
    assert.equal((await search({ q: "martin", status: "new" })).total, 0);
  });
  test("paginación con búsqueda sin acentos (25 + 5, sin repetir)", async () => {
    const first = await search({ q: "paginacion", page: 1 });
    const second = await search({ q: "PAGINACIÓN", page: 2 });
    assert.equal(first.total, 30);
    assert.equal(second.total, 30);
    assert.equal(first.names.length, 25);
    assert.equal(second.names.length, 5);
    assert.equal(new Set([...first.folios, ...second.folios]).size, 30);
  });
});
