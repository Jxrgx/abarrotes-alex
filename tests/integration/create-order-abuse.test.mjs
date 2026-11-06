// Fase 9A: abuso de create_order llamado DIRECTAMENTE por RPC como anon (la llave pública
// lo permite). La base debe rechazar cada caso sin crear pedidos. Datos sintéticos.
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

import { createDatabase } from "./harness.mjs";

let ctx;
let BRANCH;
let PRODUCT;
const UUID = () => crypto.randomUUID();

before(async () => {
  ctx = await createDatabase();
  BRANCH = (await ctx.one(`select id from branches order by name limit 1`)).id;
  PRODUCT = (await ctx.one(`select product_id from branch_products where branch_id = $1 and is_available order by price limit 1`, [BRANCH])).product_id;
});

// create_order como anon; devuelve el código de dominio del error (o "OK").
async function attempt({ items = [{ product_id: PRODUCT, quantity: 1 }], name = "Cliente Sintético", phone = "5500000000", delivery = "pickup", branch = BRANCH, extra = "" } = {}) {
  const result = await ctx.as("anon", `select public.create_order($1, $2, $3::jsonb, $4, $5, $6::public.delivery_type ${extra}) as r`, [UUID(), branch, JSON.stringify(items), name, phone, delivery]);
  if (result.ok) return "OK";
  return /"code"\s*:\s*"(\w+)"/.exec(result.message)?.[1] ?? result.message.match(/^(\w+)/)?.[1] ?? result.code;
}
const ordersCount = async () => Number((await ctx.one(`select count(*) n from orders`)).n);

describe("create_order directo (anon): la base rechaza el abuso", () => {
  test("carrito: vacío, > 100 partidas, duplicados, tipos incorrectos", async () => {
    const before = await ordersCount();
    assert.equal(await attempt({ items: [] }), "CART_EMPTY");
    assert.equal(await attempt({ items: Array.from({ length: 101 }, () => ({ product_id: UUID(), quantity: 1 })) }), "INVALID_CART");
    assert.equal(await attempt({ items: [{ product_id: PRODUCT, quantity: 1 }, { product_id: PRODUCT, quantity: 2 }] }), "INVALID_CART");
    assert.equal(await attempt({ items: [{ product_id: "no-uuid", quantity: 1 }] }), "INVALID_CART");
    assert.equal(await attempt({ items: [{ product_id: PRODUCT, quantity: "1" }] }), "INVALID_CART");
    assert.equal(await attempt({ items: { product_id: PRODUCT } }), "INVALID_CART");
    assert.equal(await ordersCount(), before);
  });

  test("cantidades: 0, 100, decimales y negativas", async () => {
    for (const quantity of [0, 100, 1.5, -1, 1e9]) {
      assert.equal(await attempt({ items: [{ product_id: PRODUCT, quantity }] }), "INVALID_QUANTITY", String(quantity));
    }
  });

  test("textos enormes y teléfono inválido", async () => {
    assert.equal(await attempt({ name: "Ñ".repeat(5000) }), "INVALID_CHECKOUT_DATA");
    assert.equal(await attempt({ name: " " }), "INVALID_CHECKOUT_DATA");
    assert.equal(await attempt({ phone: "abc" }), "INVALID_CHECKOUT_DATA");
    assert.equal(await attempt({ extra: `, p_customer_notes => '${"x".repeat(501)}'` }), "INVALID_CHECKOUT_DATA");
    assert.equal(await attempt({ delivery: "delivery", extra: `, p_address => '${"x".repeat(301)}', p_neighborhood => 'Colonia'` }), "INVALID_CHECKOUT_DATA");
  });

  test("efectivo: negativo, con 3 decimales o enorme", async () => {
    for (const cash of ["-1", "10.001", "100000000"]) {
      assert.equal(await attempt({ extra: `, p_cash_amount => ${cash}` }), "INVALID_CHECKOUT_DATA", cash);
    }
  });

  test("sucursal o producto inexistentes no revelan nada", async () => {
    assert.equal(await attempt({ branch: UUID() }), "BRANCH_UNAVAILABLE");
    assert.equal(await attempt({ items: [{ product_id: UUID(), quantity: 1 }] }), "PRODUCT_UNAVAILABLE");
  });

  test("anon no puede insertar pedidos ni partidas directamente", async () => {
    const order = await ctx.as("anon", `insert into orders (branch_id, customer_name, customer_phone, delivery_type, subtotal, total) values ($1, 'X', '5500000000', 'pickup', 1, 1)`, [BRANCH]);
    assert.equal(order.code, "42501");
    const item = await ctx.as("anon", `insert into order_items (order_id, product_id, product_name, unit_price, quantity, subtotal) values ($1, $2, 'X', 1, 1, 1)`, [UUID(), PRODUCT]);
    assert.equal(item.code, "42501");
    const history = await ctx.as("anon", `insert into order_status_history (order_id, new_status) values ($1, 'new')`, [UUID()]);
    assert.equal(history.code, "42501");
  });

  test("anon no puede quemar folios llamando a la sequence o a next_order_folio", async () => {
    assert.equal((await ctx.as("anon", `select nextval('public.order_folio_seq')`)).code, "42501");
    assert.equal((await ctx.as("anon", `select public.next_order_folio()`)).code, "42501");
  });

  test("un pedido válido sigue funcionando (y es idempotente por client_request_id)", async () => {
    const requestId = UUID();
    const call = () => ctx.as("anon", `select public.create_order($1, $2, $3::jsonb, 'Cliente Sintético', '5500000000', 'pickup') as r`, [requestId, BRANCH, JSON.stringify([{ product_id: PRODUCT, quantity: 2 }])], { persist: true });
    const first = await call();
    const second = await call();
    assert.ok(first.ok && second.ok);
    assert.equal(first.rows[0].r.order_id, second.rows[0].r.order_id);
    assert.equal(second.rows[0].r.replayed, true);
  });
});
