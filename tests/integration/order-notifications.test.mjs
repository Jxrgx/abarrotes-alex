// Notificaciones de pedidos (migración 20261106000200): suscripciones push con RLS,
// evento único por pedido (idempotencia), Broadcast privado mínimo y despacho protegido
// por secreto. PGlite efímero; datos y endpoints sintéticos (nunca reales).
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

import { createDatabase, USERS } from "./harness.mjs";

const SECRET = "s".repeat(48);
let ctx;
let BRANCH;
let PRODUCT;

const endpoint = (name) => `https://push.example.test/${name}`;
const save = (who, name) =>
  ctx.as(who, `select public.save_push_subscription($1, 'p256dh-${name}', 'auth-${name}')`, [endpoint(name)], { persist: true });

async function createOrder({ requestId = crypto.randomUUID(), expected = null } = {}) {
  const result = await ctx.as(
    "anon",
    `select public.create_order($1, $2, $3::jsonb, 'Cliente Sintético', '5500000000', 'delivery', p_address => 'Calle Ficticia 1', p_neighborhood => 'Colonia Sintética', p_customer_notes => 'Nota privada', p_expected_subtotal => $4) as r`,
    [requestId, BRANCH, JSON.stringify([{ product_id: PRODUCT, quantity: 1 }]), expected],
    { persist: true },
  );
  return result.ok ? result.rows[0].r : { error: result.message };
}
const events = async (orderId) => Number((await ctx.one(`select count(*) n from private.order_push_events where order_id = $1`, [orderId])).n);
const messages = async (orderId) => (await ctx.db.query(`select topic, event, private, payload from realtime.messages where payload ->> 'order_id' = $1`, [orderId])).rows;
const claim = (orderId, secret = SECRET) => ctx.as("anon", `select public.claim_order_push($1, $2) as r`, [orderId, secret], { persist: true });

before(async () => {
  ctx = await createDatabase();
  BRANCH = (await ctx.one(`select id from branches order by name limit 1`)).id;
  PRODUCT = (await ctx.one(`select product_id from branch_products where branch_id = $1 and is_available order by price limit 1`, [BRANCH])).product_id;
  await ctx.db.query(`select private.set_push_dispatch_secret($1)`, [SECRET]);
});

describe("push_subscriptions: RLS y alta explícita por dispositivo", () => {
  test("admin registra su dispositivo y solo ve los suyos; otro admin no los ve", async () => {
    assert.ok((await save("admin", "a1")).ok);
    assert.ok((await save("admin", "a2")).ok, "varios dispositivos por admin");
    assert.ok((await save("admin2", "b1")).ok);
    const own = await ctx.as("admin", `select endpoint from push_subscriptions order by endpoint`);
    assert.deepEqual(own.rows.map((row) => row.endpoint), [endpoint("a1"), endpoint("a2")]);
    const other = await ctx.as("admin2", `select endpoint from push_subscriptions`);
    assert.deepEqual(other.rows.map((row) => row.endpoint), [endpoint("b1")]);
  });

  test("anon, empleado y usuario sin perfil: ni leen ni registran", async () => {
    assert.equal((await ctx.as("anon", `select count(*) n from push_subscriptions`)).ok, false);
    assert.equal((await ctx.as("anon", `select public.save_push_subscription('https://x.test/1', 'p', 'a')`)).ok, false);
    for (const who of ["employee", "noprofile"]) {
      assert.match((await save(who, `${who}-1`)).message ?? "", /FORBIDDEN|permission/i, who);
      assert.equal(Number((await ctx.as(who, `select count(*) n from push_subscriptions`)).rows[0].n), 0, who);
    }
  });

  test("insertar o actualizar directo (sin la función) no está permitido", async () => {
    const insert = await ctx.as("admin", `insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://x.test/directo', 'p', 'a')`, [USERS.admin]);
    assert.equal(insert.ok, false);
    const update = await ctx.as("admin", `update push_subscriptions set user_id = $1`, [USERS.admin2]);
    assert.equal(update.ok, false);
  });

  test("desactivar en un dispositivo no afecta a los demás ni a otros admins", async () => {
    const removed = await ctx.as("admin", `delete from push_subscriptions where endpoint = $1 returning endpoint`, [endpoint("a2")], { persist: true });
    assert.equal(removed.rows.length, 1);
    const foreign = await ctx.as("admin", `delete from push_subscriptions where endpoint = $1 returning endpoint`, [endpoint("b1")], { persist: true });
    assert.equal(foreign.rows.length, 0, "no puede borrar el dispositivo de otro admin");
    const left = (await ctx.db.query(`select endpoint from push_subscriptions order by endpoint`)).rows.map((row) => row.endpoint);
    assert.deepEqual(left, [endpoint("a1"), endpoint("b1")]);
  });

  test("el mismo navegador con otra cuenta: la suscripción pasa al usuario actual", async () => {
    await save("admin2", "a1");
    const owner = await ctx.one(`select user_id from push_subscriptions where endpoint = $1`, [endpoint("a1")]);
    assert.equal(owner.user_id, USERS.admin2);
    await save("admin", "a1");
  });

  test("endpoint inválido (no https) se rechaza", async () => {
    const result = await ctx.as("admin", `select public.save_push_subscription('http://inseguro.test/1', 'p', 'a')`);
    assert.equal(result.ok, false);
  });
});

describe("evento de pedido nuevo: uno por pedido, sin PII, solo si se confirma", () => {
  test("crear pedido → un evento y un Broadcast privado con solo order_id y folio", async () => {
    const receipt = await createOrder();
    assert.equal(await events(receipt.order_id), 1);
    const sent = await messages(receipt.order_id);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].topic, "admin:orders");
    assert.equal(sent[0].event, "order_created");
    assert.equal(sent[0].private, true);
    assert.deepEqual(Object.keys(sent[0].payload).sort(), ["folio", "order_id"]);
  });

  test("reintento idempotente (mismo clientRequestId) → mismo pedido, sin evento nuevo", async () => {
    const requestId = crypto.randomUUID();
    const first = await createOrder({ requestId });
    const again = await createOrder({ requestId });
    assert.equal(again.order_id, first.order_id);
    assert.equal(again.replayed, true);
    assert.equal(await events(first.order_id), 1);
    assert.equal((await messages(first.order_id)).length, 1);
  });

  test("PRICE_CHANGED (pedido revertido) → ni evento ni Broadcast", async () => {
    const before = Number((await ctx.one(`select count(*) n from private.order_push_events`)).n);
    const beforeMessages = Number((await ctx.one(`select count(*) n from realtime.messages`)).n);
    const result = await createOrder({ expected: 0.01 });
    assert.match(result.error ?? "", /PRICE_CHANGED/);
    assert.equal(Number((await ctx.one(`select count(*) n from private.order_push_events`)).n), before);
    assert.equal(Number((await ctx.one(`select count(*) n from realtime.messages`)).n), beforeMessages);
  });
});

describe("Realtime Authorization: solo admins reciben admin:orders", () => {
  test("admin lee los mensajes del topic; empleado, anon y otros topics no", async () => {
    await createOrder();
    const read = (who, topic) => ctx.as(who, `select count(*) n from realtime.messages`, [], { settings: { "realtime.topic": topic } });
    assert.ok(Number((await read("admin", "admin:orders")).rows[0].n) > 0);
    assert.equal(Number((await read("employee", "admin:orders")).rows[0].n), 0);
    assert.equal(Number((await read("noprofile", "admin:orders")).rows[0].n), 0);
    assert.equal(Number((await read("anon", "admin:orders")).rows[0].n), 0);
    assert.equal(Number((await read("admin", "otro:topic")).rows[0].n), 0);
  });
  test("ningún cliente puede publicar en admin:orders", async () => {
    const insert = await ctx.as("admin", `insert into realtime.messages (topic, extension, payload, event) values ('admin:orders', 'broadcast', '{}', 'order_created')`, [], { settings: { "realtime.topic": "admin:orders" } });
    assert.equal(insert.ok, false);
  });
});

describe("despacho de push: secreto, reclamo único, sin PII y limpieza 404/410", () => {
  test("sin el secreto correcto → FORBIDDEN (no expone suscripciones)", async () => {
    const receipt = await createOrder();
    for (const secret of ["", "otro-secreto", SECRET.slice(1)]) {
      const result = await claim(receipt.order_id, secret);
      assert.equal(result.ok, false, JSON.stringify(secret));
      assert.match(result.message, /FORBIDDEN/);
    }
  });

  test("reclamo: payload mínimo (folio, total, tipo) + dispositivos de admins; segundo reclamo → null", async () => {
    // Un empleado con una suscripción insertada a mano no debe recibir pedidos.
    await ctx.db.query(`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'p', 'a')`, [USERS.employee, endpoint("empleado")]);
    const receipt = await createOrder();
    const first = await claim(receipt.order_id);
    const payload = first.rows[0].r;
    assert.deepEqual(Object.keys(payload).sort(), ["delivery_type", "folio", "order_id", "subscriptions", "total"]);
    assert.equal(payload.folio, receipt.folio);
    assert.equal(payload.delivery_type, "delivery");
    assert.doesNotMatch(JSON.stringify(payload), /Cliente Sintético|5500000000|Calle Ficticia|Colonia Sintética|Nota privada/);
    const endpoints = payload.subscriptions.map((s) => s.endpoint).sort();
    assert.deepEqual(endpoints, [endpoint("a1"), endpoint("b1")]);
    assert.equal((await claim(receipt.order_id)).rows[0].r, null, "el mismo pedido no se notifica dos veces");
  });

  test("pedido inexistente o de hace más de una hora → null", async () => {
    assert.equal((await claim(crypto.randomUUID())).rows[0].r, null);
    const receipt = await createOrder();
    await ctx.db.query(`update orders set created_at = now() - interval '2 hours' where id = $1`, [receipt.order_id]);
    assert.equal((await claim(receipt.order_id)).rows[0].r, null);
  });

  test("finish: borra endpoints 404/410, marca éxitos y fallos", async () => {
    await save("admin", "muerto");
    const receipt = await createOrder();
    await claim(receipt.order_id);
    const result = await ctx.as(
      "anon",
      `select public.finish_order_push($1, $2, $3::text[], $4::text[], $5::text[])`,
      [receipt.order_id, SECRET, [endpoint("a1")], [endpoint("b1")], [endpoint("muerto")]],
      { persist: true },
    );
    assert.ok(result.ok, result.message);
    assert.equal(Number((await ctx.one(`select count(*) n from push_subscriptions where endpoint = $1`, [endpoint("muerto")])).n), 0);
    const a1 = await ctx.one(`select last_success_at from push_subscriptions where endpoint = $1`, [endpoint("a1")]);
    const b1 = await ctx.one(`select last_failure_at from push_subscriptions where endpoint = $1`, [endpoint("b1")]);
    assert.ok(a1.last_success_at && b1.last_failure_at);
    const event = await ctx.one(`select finished_at, sent_count, failed_count from private.order_push_events where order_id = $1`, [receipt.order_id]);
    assert.ok(event.finished_at);
    assert.equal(event.sent_count, 1);
    assert.equal(event.failed_count, 2);
    const forbidden = await ctx.as("anon", `select public.finish_order_push($1, 'mal', '{}', '{}', $2::text[])`, [receipt.order_id, [endpoint("a1")]]);
    assert.equal(forbidden.ok, false);
  });

  test("pedidos existentes previos a la migración no generan eventos retroactivos", async () => {
    const orphan = await ctx.one(`select count(*) n from orders o where not exists (select 1 from private.order_push_events e where e.order_id = o.id)`);
    assert.equal(Number(orphan.n), 0, "en esta base todos los pedidos se crearon después del trigger");
  });
});
