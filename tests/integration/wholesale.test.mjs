// Precios por mayoreo (migración 20261108000100, docs/wholesale.md): integridad en la base,
// RLS, regla única de precio (private.line_price) y su espejo en TypeScript, create_order
// (pricing_type, PRICE_CHANGED, campos falsos ignorados) y admin_save_product atómico.
// PGlite efímero; productos y pedidos SINTÉTICOS (nunca datos reales).
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

import { decimalToCents, resolveUnitPrice } from "../../src/lib/catalog/pricing.ts";
import { parseWholesaleTiers } from "../../src/lib/catalog/products.ts";
import { createDatabase } from "./harness.mjs";

const BRANCH = "00000000-0000-4000-8000-000000000001";
let ctx;
let SUBCATEGORY;
let seq = 0;

// Producto sintético visible en la sucursal semilla (como superusuario: sin RLS).
async function makeProduct(price, { saleType = "unit", promo = null, active = true } = {}) {
  seq += 1;
  const product = await ctx.one(
    `insert into products (name, slug, subcategory_id, sale_type, is_active) values ($1, $2, $3, $4, $5) returning id`,
    [`Producto mayoreo ${seq}`, `producto-mayoreo-${seq}`, SUBCATEGORY, saleType, active],
  );
  const bp = await ctx.one(`insert into branch_products (branch_id, product_id, price) values ($1, $2, $3) returning id`, [BRANCH, product.id, price]);
  if (promo !== null) await ctx.db.query(`insert into promotions (branch_product_id, promotional_price) values ($1, $2)`, [bp.id, promo]);
  return { productId: product.id, bpId: bp.id };
}
const addTier = (bpId, min, max, price) =>
  ctx.db.query(`insert into wholesale_prices (branch_product_id, min_quantity, max_quantity, unit_price) values ($1, $2, $3, $4) returning id`, [bpId, min, max, price]);
const insertAs = (who, bpId, min, max, price, persist = false) =>
  ctx.as(who, `insert into wholesale_prices (branch_product_id, min_quantity, max_quantity, unit_price) values ($1, $2, $3, $4) returning id`, [bpId, min, max, price], { persist });
async function linePrice(bpId, quantity) {
  const row = await ctx.one(`select unit_price::text as unit_price, pricing_type::text as pricing_type from private.line_price($1, $2)`, [bpId, quantity]);
  return { unitCents: decimalToCents(row.unit_price), pricingType: row.pricing_type };
}
// Reglas tal como las ve la tienda (anon, vista catalog_items) → espejo TypeScript.
async function storeRules(bpId) {
  const result = await ctx.as("anon", `select price::text as price, promo_price::text as promo, wholesale_tiers from catalog_items where id = $1`, [bpId]);
  const row = result.rows[0];
  return {
    priceCents: decimalToCents(row.price),
    promoPriceCents: row.promo === null ? null : decimalToCents(row.promo),
    wholesaleTiers: parseWholesaleTiers(row.wholesale_tiers),
  };
}

async function order(items, { expected = null, requestId = crypto.randomUUID() } = {}) {
  const result = await ctx.as(
    "anon",
    `select public.create_order($1, $2, $3::jsonb, 'Cliente Sintético', '5500000000', 'pickup', p_expected_subtotal => $4) as receipt`,
    [requestId, BRANCH, JSON.stringify(items), expected],
    { persist: true },
  );
  return result.ok ? { ok: true, receipt: result.rows[0].receipt } : result;
}

const save = (who, { productId = null, name, saleType = "unit", price = "22.00", wholesale, persist = true }) => {
  const branch = { branch_id: BRANCH, price, is_available: true };
  if (wholesale !== undefined) branch.wholesale = wholesale;
  return ctx.as(
    who,
    `select public.admin_save_product($1, $2, $3, $4, null, null, null, $5, false, true, $6::jsonb) as id`,
    [productId, name, name.toLowerCase().replace(/\s+/g, "-"), SUBCATEGORY, saleType, JSON.stringify([branch])],
    { persist },
  );
};
const tiersOf = async (productId) =>
  (await ctx.db.query(
    `select w.id, w.min_quantity, w.max_quantity, w.unit_price::text as unit_price from wholesale_prices w
     join branch_products bp on bp.id = w.branch_product_id where bp.product_id = $1 order by w.min_quantity`,
    [productId],
  )).rows;

before(async () => {
  ctx = await createDatabase();
  SUBCATEGORY = (await ctx.one(`select id from subcategories where slug = 'refrescos'`)).id;
});

describe("integridad en la base", () => {
  test("rangos: mínimo 2, máximo ≥ mínimo, ≤ 99, precio > 0", async () => {
    const { bpId } = await makeProduct("22.00");
    assert.equal((await insertAs("admin", bpId, 1, 5, "20.00")).code, "23514", "min 1");
    assert.equal((await insertAs("admin", bpId, 5, 3, "20.00")).code, "23514", "max < min");
    assert.equal((await insertAs("admin", bpId, 3, 100, "20.00")).code, "23514", "max 100");
    assert.equal((await insertAs("admin", bpId, 100, null, "20.00")).code, "23514", "min 100");
    assert.equal((await insertAs("admin", bpId, 3, 5, "0.00")).code, "23514", "precio 0");
    assert.ok((await insertAs("admin", bpId, 3, 3, "20.00")).ok, "rango de una sola cantidad");
    assert.ok((await insertAs("admin", bpId, 2, null, "20.00")).ok, "2+ sin límite");
  });

  test("sin solapamiento (exclusion constraint), contiguos y con huecos permitidos", async () => {
    const { bpId } = await makeProduct("22.00");
    await addTier(bpId, 3, 6, "20.00");
    assert.equal((await insertAs("admin", bpId, 5, 10, "19.00")).code, "23P01", "3–6 y 5–10");
    assert.equal((await insertAs("admin", bpId, 6, 10, "19.00")).code, "23P01", "comparten el 6");
    assert.ok((await insertAs("admin", bpId, 7, 11, "19.00")).ok, "contiguo 7–11");
    assert.ok((await insertAs("admin", bpId, 10, null, "17.00")).ok, "hueco 7–9 permitido (10+)");
    await addTier(bpId, 12, null, "17.00");
    assert.equal((await insertAs("admin", bpId, 20, 30, "16.00")).code, "23P01", "dentro de 12+");
    const other = await makeProduct("22.00");
    assert.ok((await insertAs("admin", other.bpId, 3, 6, "20.00")).ok, "otro producto: sin conflicto");
  });

  test("precio < normal (WHL01), solo por unidad (WHL02), no creciente (WHL03), producto fijo (WHL04)", async () => {
    const { bpId } = await makeProduct("22.00");
    assert.equal((await insertAs("admin", bpId, 3, 5, "22.00")).code, "WHL01", "igual al normal");
    assert.equal((await insertAs("admin", bpId, 3, 5, "22.01")).code, "WHL01", "mayor al normal");
    const weight = await makeProduct("120.00", { saleType: "weight" });
    assert.equal((await insertAs("admin", weight.bpId, 3, 5, "100.00")).code, "WHL02");
    await addTier(bpId, 3, 5, "18.00");
    assert.equal((await insertAs("admin", bpId, 6, 11, "20.00")).code, "WHL03", "más cantidad, precio mayor");
    assert.equal((await insertAs("admin", bpId, 2, 2, "17.00")).code, "WHL03", "menos cantidad, precio menor");
    assert.ok((await insertAs("admin", bpId, 6, 11, "18.00")).ok, "igual al nivel anterior: permitido");
    const tier = (await ctx.one(`select id from wholesale_prices where branch_product_id = $1 limit 1`, [bpId])).id;
    const other = await makeProduct("22.00");
    assert.equal((await ctx.as("admin", `update wholesale_prices set branch_product_id = $2 where id = $1`, [tier, other.bpId])).code, "WHL04");
  });

  test("precio normal baja: el nivel queda «Requiere revisión», no se aplica ni se expone", async () => {
    const { bpId } = await makeProduct("22.00");
    const tier = (await addTier(bpId, 3, null, "20.00")).rows[0].id;
    await ctx.db.query(`update branch_products set price = 19.00 where id = $1`, [bpId]);
    assert.deepEqual(await linePrice(bpId, 5), { unitCents: 1900, pricingType: "normal" }, "no se cobra 20 > 19");
    assert.deepEqual((await storeRules(bpId)).wholesaleTiers, [], "la tienda no lo ve");
    assert.ok((await ctx.as("admin", `update wholesale_prices set min_quantity = 4 where id = $1 returning id`, [tier])).ok, "editar rango: permitido");
    assert.equal((await ctx.as("admin", `update wholesale_prices set unit_price = 19.50 where id = $1`, [tier])).code, "WHL01");
    assert.ok((await ctx.as("admin", `update wholesale_prices set unit_price = 18.00 where id = $1 returning id`, [tier])).ok, "corregir: permitido");
    assert.ok((await ctx.as("admin", `delete from wholesale_prices where id = $1 returning id`, [tier])).ok, "quitar: permitido");
  });

  test("borrar el producto de la sucursal elimina sus niveles (CASCADE, sin huérfanos)", async () => {
    const { bpId } = await makeProduct("22.00");
    await addTier(bpId, 3, 5, "20.00");
    await addTier(bpId, 6, null, "18.00");
    await ctx.db.query(`delete from branch_products where id = $1`, [bpId]);
    assert.equal(Number((await ctx.one(`select count(*) c from wholesale_prices where branch_product_id = $1`, [bpId])).c), 0);
  });

  test("order_items exige pricing_type en partidas nuevas", async () => {
    const { productId } = await makeProduct("22.00");
    const created = await order([{ product_id: productId, quantity: 1 }]);
    assert.ok(created.ok, created.message);
    await assert.rejects(
      ctx.db.query(`insert into order_items (order_id, product_id, product_name, unit_price, quantity, subtotal) values ($1, $2, 'X', 1, 1, 1)`, [created.receipt.order_id, productId]),
      /order_items_pricing_type_required/,
    );
  });
});

describe("RLS", () => {
  test("anon, sin profile y employee no escriben; anon solo ve niveles aplicables de productos visibles", async () => {
    const { bpId } = await makeProduct("22.00");
    const tier = (await addTier(bpId, 3, 5, "20.00")).rows[0].id;
    for (const who of ["anon", "noprofile", "employee"]) {
      assert.equal((await insertAs(who, bpId, 6, null, "18.00")).code, "42501", `${who} insert`);
      const update = await ctx.as(who, `update wholesale_prices set unit_price = 1 where id = $1 returning id`, [tier]);
      assert.ok(update.code === "42501" || (update.ok && update.rows.length === 0), `${who} update`);
      const remove = await ctx.as(who, `delete from wholesale_prices where id = $1 returning id`, [tier]);
      assert.ok(remove.code === "42501" || (remove.ok && remove.rows.length === 0), `${who} delete`);
    }
    assert.equal((await ctx.as("anon", `truncate wholesale_prices`)).code, "42501", "truncate");
    assert.equal((await ctx.as("anon", `select id from wholesale_prices where id = $1`, [tier])).rows.length, 1, "visible");

    const hidden = await makeProduct("22.00", { active: false });
    const hiddenTier = (await addTier(hidden.bpId, 3, 5, "20.00")).rows[0].id;
    assert.equal((await ctx.as("anon", `select id from wholesale_prices where id = $1`, [hiddenTier])).rows.length, 0, "producto inactivo");
    assert.equal((await ctx.as("anon", `select id from catalog_items where id = $1`, [hidden.bpId])).rows.length, 0, "inactivo fuera del catálogo");
    assert.equal((await ctx.as("admin", `select id from wholesale_prices where id = $1`, [hiddenTier])).rows.length, 1, "admin ve todo");
  });
});

// Matriz de la especificación: misma respuesta en PostgreSQL (autoridad) y TypeScript.
const MATRIX = [
  {
    name: "sin promoción ni mayoreo",
    price: "22.00", promo: null, tiers: [],
    expect: { 1: [2200, "normal"], 2: [2200, "normal"], 50: [2200, "normal"] },
  },
  {
    name: "3–5 $20 · 6–11 $18.50 · 12+ $17",
    price: "22.00", promo: null, tiers: [[3, 5, "20.00"], [6, 11, "18.50"], [12, null, "17.00"]],
    expect: { 1: [2200, "normal"], 2: [2200, "normal"], 3: [2000, "wholesale"], 5: [2000, "wholesale"], 6: [1850, "wholesale"], 11: [1850, "wholesale"], 12: [1700, "wholesale"], 99: [1700, "wholesale"] },
  },
  {
    name: "solo 3–5: la 6 vuelve al precio normal",
    price: "22.00", promo: null, tiers: [[3, 5, "20.00"]],
    expect: { 2: [2200, "normal"], 3: [2000, "wholesale"], 5: [2000, "wholesale"], 6: [2200, "normal"] },
  },
  {
    name: "promoción 19 + mayoreo 3–5 $20 · 6+ $18",
    price: "22.00", promo: "19.00", tiers: [[3, 5, "20.00"], [6, null, "18.00"]],
    expect: { 1: [1900, "promotion"], 3: [1900, "promotion"], 5: [1900, "promotion"], 6: [1800, "wholesale"], 40: [1800, "wholesale"] },
  },
  {
    name: "empate promoción = mayoreo → promotion",
    price: "22.00", promo: "20.00", tiers: [[3, null, "20.00"]],
    expect: { 1: [2000, "promotion"], 3: [2000, "promotion"], 10: [2000, "promotion"] },
  },
  {
    name: "huecos: 3–5 y 10+",
    price: "22.00", promo: null, tiers: [[3, 5, "20.00"], [10, null, "17.00"]],
    expect: { 4: [2000, "wholesale"], 7: [2200, "normal"], 9: [2200, "normal"], 10: [1700, "wholesale"] },
  },
];

describe("regla de precio: PostgreSQL (private.line_price) = TypeScript (resolveUnitPrice)", () => {
  for (const scenario of MATRIX) {
    test(scenario.name, async () => {
      const { bpId } = await makeProduct(scenario.price, { promo: scenario.promo });
      for (const [min, max, price] of scenario.tiers) await addTier(bpId, min, max, price);
      const rules = await storeRules(bpId);
      for (const [quantity, [cents, type]] of Object.entries(scenario.expect)) {
        assert.deepEqual(await linePrice(bpId, Number(quantity)), { unitCents: cents, pricingType: type }, `SQL qty ${quantity}`);
      }
      // Paridad exhaustiva 1..99.
      for (let quantity = 1; quantity <= 99; quantity++) {
        const sql = await linePrice(bpId, quantity);
        const ts = resolveUnitPrice(rules, quantity);
        assert.deepEqual({ unitCents: ts.unitCents, pricingType: ts.pricingType }, sql, `paridad qty ${quantity}`);
      }
    });
  }

  test("producto por peso: el mayoreo nunca aplica (aunque existan filas antiguas)", async () => {
    const { bpId, productId } = await makeProduct("22.00");
    await addTier(bpId, 3, null, "20.00");
    await ctx.db.query(`update products set sale_type = 'weight' where id = $1`, [productId]);
    assert.deepEqual(await linePrice(bpId, 5), { unitCents: 2200, pricingType: "normal" });
    assert.deepEqual((await storeRules(bpId)).wholesaleTiers, []);
  });

  test("el catálogo ordena por el precio de UNA unidad, no por el mayoreo", async () => {
    const { bpId } = await makeProduct("22.00");
    await addTier(bpId, 12, null, "15.00");
    const row = (await ctx.as("anon", `select effective_price::text as p, wholesale_tiers from catalog_items where id = $1`, [bpId])).rows[0];
    assert.equal(row.p, "22.00");
    assert.deepEqual(row.wholesale_tiers, [{ min: 12, max: null, price: 15.0 }]);
  });
});

describe("create_order con mayoreo", () => {
  test("partida completa al precio del nivel, pricing_type, comprobante y campos falsos ignorados", async () => {
    const a = await makeProduct("22.00");
    await addTier(a.bpId, 3, 5, "20.00");
    await addTier(a.bpId, 6, null, "18.00");
    const b = await makeProduct("10.00", { promo: "9.00" });

    const two = await order([{ product_id: a.productId, quantity: 2 }]);
    assert.equal(two.receipt.subtotal, "44.00", "2 × 22");
    const three = await order([
      // Campos que el navegador NO controla: se ignoran.
      { product_id: a.productId, quantity: 3, unit_price: 0.01, pricing_type: "wholesale", wholesale_price: 1 },
      { product_id: b.productId, quantity: 1, unit_price: 0.01, pricing_type: "normal" },
    ]);
    assert.ok(three.ok, three.message);
    const items = Object.fromEntries(three.receipt.items.map((item) => [item.product_id, item]));
    assert.deepEqual([items[a.productId].unit_price, items[a.productId].subtotal, items[a.productId].pricing_type], ["20.00", "60.00", "wholesale"], "3 × 20, no 2×22 + 1×20");
    assert.deepEqual([items[b.productId].unit_price, items[b.productId].pricing_type], ["9.00", "promotion"]);
    assert.equal(three.receipt.subtotal, "69.00");

    const stored = await ctx.db.query(`select pricing_type::text as t from order_items i join orders o on o.id = i.order_id where o.folio = $1 order by t`, [three.receipt.folio]);
    assert.deepEqual(stored.rows.map((row) => row.t), ["promotion", "wholesale"]);

    // Snapshot histórico: cambiar o borrar reglas no recalcula pedidos.
    await ctx.db.query(`delete from wholesale_prices where branch_product_id = $1`, [a.bpId]);
    const after = await ctx.db.query(`select unit_price::text as u, pricing_type::text as t from order_items i join orders o on o.id = i.order_id where o.folio = $1 and i.product_id = $2`, [three.receipt.folio, a.productId]);
    assert.deepEqual(after.rows[0], { u: "20.00", t: "wholesale" });
  });

  test("PRICE_CHANGED si el mayoreo cambia entre carrito y confirmación (subtotal real)", async () => {
    const { bpId, productId } = await makeProduct("22.00");
    const tier = (await addTier(bpId, 3, null, "20.00")).rows[0].id;
    const items = [{ product_id: productId, quantity: 4 }];
    const seen = resolveUnitPrice(await storeRules(bpId), 4).unitCents * 4; // lo que vio el cliente: 80.00
    assert.equal(seen, 8000);
    await ctx.db.query(`update wholesale_prices set unit_price = 19.00 where id = $1`, [tier]);
    const changed = await order(items, { expected: "80.00" });
    assert.equal(changed.message, "PRICE_CHANGED");
    // Con el subtotal nuevo (76.00) se crea.
    assert.ok((await order(items, { expected: "76.00" })).ok);
    // Quitar el mayoreo también cambia el subtotal.
    await ctx.db.query(`delete from wholesale_prices where id = $1`, [tier]);
    assert.equal((await order(items, { expected: "76.00" })).message, "PRICE_CHANGED");
  });

  test("idempotencia intacta: el reintento devuelve el mismo comprobante con pricing_type", async () => {
    const { bpId, productId } = await makeProduct("22.00");
    await addTier(bpId, 3, null, "20.00");
    const requestId = crypto.randomUUID();
    const first = await order([{ product_id: productId, quantity: 3 }], { requestId });
    const again = await order([{ product_id: productId, quantity: 3 }], { requestId });
    assert.equal(again.receipt.folio, first.receipt.folio);
    assert.equal(again.receipt.replayed, true);
    assert.equal(again.receipt.items[0].pricing_type, "wholesale");
  });
});

describe("admin_save_product con niveles (una transacción)", () => {
  test("crear con uno, varios y sin límite; editar; quitar; reacomodar rangos", async () => {
    const created = await save("admin", { name: "Galleta mayoreo", wholesale: [{ id: null, min_quantity: 3, max_quantity: null, unit_price: "20.00" }] });
    assert.ok(created.ok, created.message);
    const productId = created.rows[0].id;
    assert.deepEqual((await tiersOf(productId)).map((t) => [t.min_quantity, t.max_quantity, t.unit_price]), [[3, null, "20.00"]]);

    const [one] = await tiersOf(productId);
    const several = await save("admin", {
      productId, name: "Galleta mayoreo",
      wholesale: [
        { id: one.id, min_quantity: 3, max_quantity: 5, unit_price: "20.00" },
        { id: null, min_quantity: 6, max_quantity: 11, unit_price: "18.50" },
        { id: null, min_quantity: 12, max_quantity: null, unit_price: "17.00" },
      ],
    });
    assert.ok(several.ok, several.message);
    const tiers = await tiersOf(productId);
    assert.deepEqual(tiers.map((t) => [t.min_quantity, t.max_quantity, t.unit_price]), [[3, 5, "20.00"], [6, 11, "18.50"], [12, null, "17.00"]]);
    assert.equal(tiers[0].id, one.id, "el nivel editado conserva su id");

    // 3–5 y 6–11 → 3–6 y 7–11 en el mismo guardado (transitoriamente se cruzan).
    const moved = await save("admin", {
      productId, name: "Galleta mayoreo",
      wholesale: [
        { id: tiers[0].id, min_quantity: 3, max_quantity: 6, unit_price: "19.50" },
        { id: tiers[1].id, min_quantity: 7, max_quantity: 11, unit_price: "18.00" },
      ],
    });
    assert.ok(moved.ok, moved.message);
    assert.deepEqual((await tiersOf(productId)).map((t) => [t.min_quantity, t.max_quantity, t.unit_price]), [[3, 6, "19.50"], [7, 11, "18.00"]], "12+ eliminado");

    // Sin la clave "wholesale": no se tocan.
    assert.ok((await save("admin", { productId, name: "Galleta mayoreo" })).ok);
    assert.equal((await tiersOf(productId)).length, 2);
    // Lista vacía: se eliminan.
    assert.ok((await save("admin", { productId, name: "Galleta mayoreo", wholesale: [] })).ok);
    assert.equal((await tiersOf(productId)).length, 0);
  });

  test("rechazos atómicos: solapamiento, precio ≥ normal, creciente, peso, id ajeno, sin permiso", async () => {
    const created = await save("admin", { name: "Jabon mayoreo", wholesale: [{ id: null, min_quantity: 3, max_quantity: 5, unit_price: "20.00" }] });
    const productId = created.rows[0].id;
    const before = await tiersOf(productId);
    const attempt = (wholesale, extra = {}) => save("admin", { productId, name: "Jabon mayoreo", wholesale, ...extra });

    assert.equal((await attempt([{ id: null, min_quantity: 3, max_quantity: 6, unit_price: "20.00" }, { id: null, min_quantity: 5, max_quantity: 10, unit_price: "19.00" }])).code, "23P01");
    assert.equal((await attempt([{ id: null, min_quantity: 3, max_quantity: null, unit_price: "22.00" }])).code, "WHL01");
    assert.equal((await attempt([{ id: null, min_quantity: 3, max_quantity: 5, unit_price: "18.00" }, { id: null, min_quantity: 6, max_quantity: null, unit_price: "20.00" }])).code, "WHL03");
    assert.equal((await attempt([{ id: null, min_quantity: 3, max_quantity: null, unit_price: "20.00" }], { saleType: "weight" })).code, "WHL02");
    assert.equal((await attempt([{ id: null, min_quantity: 1, max_quantity: null, unit_price: "20.00" }])).code, "23514");
    assert.equal((await attempt([{ id: null, min_quantity: "3", max_quantity: null, unit_price: 20 }])).code, "22023", "tipos estrictos");
    const foreign = await makeProduct("22.00");
    const foreignTier = (await addTier(foreign.bpId, 3, null, "20.00")).rows[0].id;
    assert.equal((await attempt([{ id: foreignTier, min_quantity: 3, max_quantity: null, unit_price: "20.00" }])).code, "WHL05");
    for (const who of ["employee", "noprofile", "anon"]) {
      assert.equal((await save(who, { productId, name: "Jabon mayoreo", wholesale: [] })).code, "42501", who);
    }
    // Nada cambió con ningún intento fallido (ni el precio normal ni los niveles).
    assert.deepEqual(await tiersOf(productId), before);
    assert.equal((await ctx.one(`select price::text p from branch_products where product_id = $1`, [productId])).p, "22.00");
  });

  test("bajar el precio normal sin tocar el nivel lo deja «Requiere revisión»; cambiarlo exige < normal", async () => {
    const created = await save("admin", { name: "Arroz mayoreo", wholesale: [{ id: null, min_quantity: 3, max_quantity: null, unit_price: "20.00" }] });
    const productId = created.rows[0].id;
    const [tier] = await tiersOf(productId);
    const same = { id: tier.id, min_quantity: 3, max_quantity: null, unit_price: "20.00" };
    assert.ok((await save("admin", { productId, name: "Arroz mayoreo", price: "19.00", wholesale: [same] })).ok, "no bloquea el guardado");
    assert.equal((await tiersOf(productId))[0].unit_price, "20.00", "se conserva para revisión");
    assert.equal((await save("admin", { productId, name: "Arroz mayoreo", price: "19.00", wholesale: [{ ...same, unit_price: "19.50" }] })).code, "WHL01");
    assert.ok((await save("admin", { productId, name: "Arroz mayoreo", price: "19.00", wholesale: [{ ...same, unit_price: "18.00" }] })).ok);
  });

  test("cambiar a venta por peso con lista vacía elimina los niveles", async () => {
    const created = await save("admin", { name: "Frijol mayoreo", wholesale: [{ id: null, min_quantity: 3, max_quantity: null, unit_price: "20.00" }] });
    const productId = created.rows[0].id;
    assert.ok((await save("admin", { productId, name: "Frijol mayoreo", saleType: "weight", wholesale: [] })).ok);
    assert.equal((await tiersOf(productId)).length, 0);
  });
});
