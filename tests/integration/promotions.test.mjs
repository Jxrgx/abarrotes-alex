// Fase 8D: integridad de promociones (solapamiento, precio, producto fijo) y precio que
// aplica create_order en los límites de tiempo. PGlite, datos del seed + sintéticos.
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

import { createDatabase } from "./harness.mjs";

let ctx;
let AGUA; // 15.00, sin promociones en el seed
let COLA; // 18.00, promoción del seed sin fechas
let DET; // 42.00
const t = (day) => `2027-01-${day}T00:00:00-06:00`;
const insert = (who, bp, price, starts = null, ends = null, active = true, persist = false) =>
  ctx.as(who, `insert into promotions (branch_product_id, promotional_price, starts_at, ends_at, is_active) values ($1, $2, $3, $4, $5) returning id`, [bp, price, starts, ends, active], { persist });

before(async () => {
  ctx = await createDatabase();
  const bp = async (slug) => (await ctx.one(`select bp.id, bp.product_id from branch_products bp join products p on p.id = bp.product_id where p.slug = $1`, [slug]));
  AGUA = await bp("agua-natural-1-5-l");
  COLA = await bp("refresco-cola-600-ml");
  DET = await bp("detergente-polvo-1-kg");
});

describe("seguridad", () => {
  test("anon, sin profile y employee no crean ni desactivan", async () => {
    for (const who of ["anon", "noprofile", "employee"]) {
      assert.equal((await insert(who, AGUA.id, "10.00")).code, "42501", who);
      const update = await ctx.as(who, `update promotions set is_active = false returning id`);
      assert.ok((update.ok && update.rows.length === 0) || update.code === "42501", who);
    }
  });
});

describe("precio", () => {
  test("igual o mayor al normal → PRM01; negativo → 23514; 0 permitido; inactiva no se valida", async () => {
    assert.equal((await insert("admin", AGUA.id, "15.00")).code, "PRM01");
    assert.equal((await insert("admin", AGUA.id, "15.01")).code, "PRM01");
    assert.equal((await insert("admin", AGUA.id, "-1")).code, "23514");
    assert.ok((await insert("admin", AGUA.id, "0.00")).ok);
    assert.ok((await insert("admin", AGUA.id, "16.00", null, null, false)).ok);
  });
});

describe("solapamiento (NULL = infinito, ventana [inicio, fin))", () => {
  test("cruces, bordes, inactivas y reactivación", async () => {
    const A = (await insert("admin", AGUA.id, "12.00", t("10"), t("20"), true, true)).rows[0].id;
    assert.equal((await insert("admin", AGUA.id, "11.00", t("15"), t("25"))).code, "23P01");
    assert.ok((await insert("admin", AGUA.id, "11.00", t("20"), t("25"))).ok, "toca el fin: no se cruza");
    assert.ok((await insert("admin", AGUA.id, "11.00", t("01"), t("10"))).ok, "termina al empezar: no se cruza");
    assert.equal((await insert("admin", AGUA.id, "11.00")).code, "23P01", "sin fechas cruza todo");
    assert.equal((await insert("admin", AGUA.id, "11.00", t("18"), null)).code, "23P01");
    assert.equal((await insert("admin", AGUA.id, "11.00", null, t("11"))).code, "23P01");
    assert.ok((await insert("admin", AGUA.id, "11.00", null, null, false)).ok, "inactiva no cuenta");
    assert.equal((await insert("admin", COLA.id, "14.00", t("15"), t("25"))).code, "23P01", "la del seed sin fechas bloquea");
    const B = (await insert("admin", AGUA.id, "11.00", t("15"), t("25"), false, true)).rows[0].id;
    assert.equal((await ctx.as("admin", `update promotions set is_active = true where id = $1`, [B])).code, "23P01", "reactivar solapada");
    assert.equal((await ctx.as("admin", `update promotions set ends_at = $2 where id = $1`, [A, t("09")])).code, "23514", "fin antes del inicio");
    await ctx.db.query(`delete from promotions where id = any($1)`, [[A, B]]);
  });
});

describe("revisión y producto fijo", () => {
  test("precio normal baja: reactivar falla, editar fechas/desactivar/corregir se permite; producto no cambia", async () => {
    const A = (await insert("admin", AGUA.id, "12.00", null, null, true, true)).rows[0].id;
    await ctx.db.query(`update branch_products set price = 11.00 where id = $1`, [AGUA.id]);
    assert.ok((await ctx.as("admin", `update promotions set ends_at = $2 where id = $1 returning id`, [A, t("19")])).ok);
    assert.ok((await ctx.as("admin", `update promotions set is_active = false where id = $1 returning id`, [A], { persist: true })).ok);
    assert.equal((await ctx.as("admin", `update promotions set is_active = true where id = $1`, [A])).code, "PRM01");
    assert.ok((await ctx.as("admin", `update promotions set promotional_price = 10.50 where id = $1 returning id`, [A])).ok);
    assert.equal((await ctx.as("admin", `update promotions set branch_product_id = $2 where id = $1`, [A, DET.id])).code, "PRM02");
    await ctx.db.query(`update branch_products set price = 15.00 where id = $1`, [AGUA.id]);
    await ctx.db.query(`delete from promotions where id = $1`, [A]);
  });
});

describe("create_order: límites de tiempo (misma semántica que la RLS)", () => {
  const cases = [
    ["sin fechas", "null", "null", true, true],
    ["starts_at = ahora (incluido)", "now()", "null", true, true],
    ["starts_at = ahora + 1 s", "now() + interval '1 second'", "null", true, false],
    ["ends_at = ahora (excluido)", "null", "now()", true, false],
    ["ends_at = ahora + 1 s", "null", "now() + interval '1 second'", true, true],
    ["futura", "now() + interval '1 day'", "null", true, false],
    ["vencida", "now() - interval '2 days'", "now() - interval '1 day'", true, false],
    ["desactivada", "null", "null", false, false],
  ];
  for (const [label, starts, ends, active, applies] of cases) {
    test(`${label} → ${applies ? "precio promocional" : "precio normal"}`, async () => {
      const { db, one } = ctx;
      const target = await one(`select bp.id, bp.product_id, bp.branch_id from branch_products bp join products p on p.id = bp.product_id where p.slug = 'galletas-saladas-12-piezas'`);
      await db.exec("begin;");
      try {
        await db.query(`insert into promotions (branch_product_id, promotional_price, starts_at, ends_at, is_active) values ($1, 20.00, ${starts}, ${ends}, $2)`, [target.id, active]);
        const line = await one(`select unit_price::text as price from private.priced_order_lines($1, $2::jsonb)`, [target.branch_id, JSON.stringify([{ product_id: target.product_id, quantity: 1 }])]);
        await db.exec("set local role anon;");
        const visible = Number((await one(`select count(*) n from promotions where branch_product_id = $1`, [target.id])).n) > 0;
        assert.equal(line.price, applies ? "20.00" : "22.00");
        assert.equal(visible, applies, "la tienda (RLS) coincide con create_order");
      } finally {
        await db.exec("rollback;");
      }
    });
  }
});
