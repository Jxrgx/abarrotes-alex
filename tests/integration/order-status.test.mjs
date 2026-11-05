// Fase 8E: máquina de estados de pedidos en PostgreSQL (PGlite). Datos sintéticos.
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

import { createDatabase, createSyntheticOrder, USERS } from "./harness.mjs";

let ctx;
before(async () => {
  ctx = await createDatabase();
});

// Cambia el estado con la función del panel como `who`; persiste si tiene éxito.
async function change(orderId, expected, next, who = "admin") {
  return ctx.as(who, `select public.update_order_status($1, $2, $3) as status`, [orderId, expected, next], { persist: true });
}
const statusOf = async (id) => (await ctx.one(`select status from orders where id = $1`, [id])).status;
const history = async (id) => (await ctx.db.query(`select previous_status, new_status, changed_by from order_status_history where order_id = $1 order by created_at, new_status`, [id])).rows;

async function walk(orderId, path) {
  for (let i = 1; i < path.length; i++) {
    const result = await change(orderId, path[i - 1], path[i]);
    assert.ok(result.ok, `${path[i - 1]} → ${path[i]}: ${result.message}`);
  }
}

describe("espejo TypeScript ↔ SQL", () => {
  test("canTransition() coincide con private.order_status_transition_allowed en las 128 combinaciones", async () => {
    const { canTransition } = await import("../../src/lib/orders/status.ts");
    const statuses = ["new", "confirmed", "preparing", "ready", "on_the_way", "ready_for_pickup", "delivered", "cancelled"];
    const { rows } = await ctx.db.query(
      `select d::text as delivery, f::text as "from", t::text as "to", private.order_status_transition_allowed(d, f, t) as allowed
       from unnest(enum_range(null::public.delivery_type)) d, unnest(enum_range(null::public.order_status)) f, unnest(enum_range(null::public.order_status)) t`,
    );
    assert.equal(rows.length, 2 * statuses.length * statuses.length);
    const mismatches = rows.filter((row) => row.from !== row.to && canTransition(row.delivery, row.from, row.to) !== row.allowed);
    assert.deepEqual(mismatches, []);
  });
});

describe("delivery", () => {
  test("new → confirmed → preparing → ready → on_the_way → delivered", async () => {
    const id = await createSyntheticOrder(ctx, { deliveryType: "delivery" });
    await walk(id, ["new", "confirmed", "preparing", "ready", "on_the_way", "delivered"]);
    assert.equal(await statusOf(id), "delivered");
    const rows = await history(id);
    assert.equal(rows.length, 6, "1 de create_order + 5 cambios, sin duplicados");
    assert.equal(rows.filter((row) => row.previous_status === null)[0].changed_by, null, "estado inicial: changed_by NULL (Sistema)");
    assert.ok(rows.filter((row) => row.previous_status !== null).every((row) => row.changed_by === USERS.admin), "cambios con changed_by = auth.uid()");
  });

  test("transiciones inválidas", async () => {
    const id = await createSyntheticOrder(ctx, { deliveryType: "delivery" });
    for (const target of ["delivered", "preparing", "ready", "on_the_way", "ready_for_pickup"]) {
      const result = await change(id, "new", target);
      assert.equal(result.code, "ORD02", `new → ${target}`);
    }
    await walk(id, ["new", "confirmed", "preparing", "ready"]);
    assert.equal((await change(id, "ready", "ready_for_pickup")).code, "ORD02", "delivery no pasa por ready_for_pickup");
    await walk(id, ["ready", "on_the_way", "delivered"]);
    for (const target of ["new", "confirmed", "cancelled", "on_the_way"]) {
      assert.equal((await change(id, "delivered", target)).code, "ORD02", `delivered → ${target}`);
    }
  });
});

describe("pickup", () => {
  test("new → confirmed → preparing → ready → ready_for_pickup → delivered", async () => {
    const id = await createSyntheticOrder(ctx, { deliveryType: "pickup" });
    await walk(id, ["new", "confirmed", "preparing", "ready", "ready_for_pickup", "delivered"]);
    assert.equal(await statusOf(id), "delivered");
  });

  test("pickup no pasa por on_the_way", async () => {
    const id = await createSyntheticOrder(ctx, { deliveryType: "pickup" });
    await walk(id, ["new", "confirmed", "preparing", "ready"]);
    assert.equal((await change(id, "ready", "on_the_way")).code, "ORD02");
  });
});

describe("cancelación", () => {
  for (const [delivery, from] of [["delivery", "new"], ["delivery", "confirmed"], ["pickup", "preparing"], ["pickup", "ready"], ["delivery", "on_the_way"], ["pickup", "ready_for_pickup"]]) {
    test(`${delivery}: ${from} → cancelled permitido; después es final`, async () => {
      const id = await createSyntheticOrder(ctx, { deliveryType: delivery });
      const path = { new: ["new"], confirmed: ["new", "confirmed"], preparing: ["new", "confirmed", "preparing"], ready: ["new", "confirmed", "preparing", "ready"], on_the_way: ["new", "confirmed", "preparing", "ready", "on_the_way"], ready_for_pickup: ["new", "confirmed", "preparing", "ready", "ready_for_pickup"] }[from];
      await walk(id, path);
      assert.ok((await change(id, from, "cancelled")).ok);
      for (const target of ["new", "confirmed", "delivered"]) {
        assert.equal((await change(id, "cancelled", target)).code, "ORD02", `cancelled → ${target}`);
      }
    });
  }
});

describe("concurrencia", () => {
  test("A confirma; B (con estado viejo) intenta cancelar → ORD01, sin sobrescribir", async () => {
    const id = await createSyntheticOrder(ctx);
    assert.ok((await change(id, "new", "confirmed", "admin")).ok);
    const stale = await change(id, "new", "cancelled", "admin2");
    assert.equal(stale.code, "ORD01");
    assert.equal(await statusOf(id), "confirmed");
  });
  test("pedido inexistente → P0002", async () => {
    assert.equal((await change("00000000-0000-4000-8000-00000000dead", "new", "confirmed")).code, "P0002");
  });
});

describe("seguridad", () => {
  test("anon, sin profile y employee no leen ni cambian pedidos", async () => {
    const id = await createSyntheticOrder(ctx);
    for (const who of ["anon", "noprofile", "employee"]) {
      const result = await change(id, "new", "confirmed", who);
      assert.equal(result.ok, false, who);
      assert.match(result.code, /^(42501)$/, `${who}: ${result.code}`);
      const read = await ctx.as(who, `select count(*)::int n from orders`);
      assert.ok(!read.ok || read.rows[0].n === 0, `${who} no lee pedidos`);
    }
    assert.equal(await statusOf(id), "new");
  });

  test("UPDATE directo por la API también respeta la máquina de estados", async () => {
    const id = await createSyntheticOrder(ctx);
    const jump = await ctx.as("admin", `update orders set status = 'delivered' where id = $1`, [id]);
    assert.equal(jump.code, "ORD02");
    const valid = await ctx.as("admin", `update orders set status = 'confirmed' where id = $1 returning status`, [id], { persist: true });
    assert.ok(valid.ok);
    assert.equal((await history(id)).length, 2, "el trigger existente registra el cambio una sola vez");
  });

  test("el admin no puede editar importes ni partidas", async () => {
    const id = await createSyntheticOrder(ctx);
    assert.equal((await ctx.as("admin", `update orders set total = 1 where id = $1`, [id])).code, "42501");
    assert.equal((await ctx.as("admin", `update order_items set quantity = 9 where order_id = $1`, [id])).code, "42501");
  });
});
