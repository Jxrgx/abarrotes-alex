import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { runInNewContext } from "node:vm";

import sharp from "sharp";

import { createSeenOrders, parseOrderEvent } from "./dedupe";
import { type ClaimedOrder, dispatchNewOrderPush, type PushDeps, type PushTarget } from "./dispatch";
import { buildNewOrderPushPayload } from "./payload";

const ORDER_ID = "3f0c1a6e-0000-4000-8000-000000000001";
const target = (name: string): PushTarget => ({ endpoint: `https://push.example.test/${name}`, p256dh: "p", auth: "a" });

describe("payload del push", () => {
  test("solo folio, total y tipo de entrega; enlace interno al pedido", () => {
    const payload = buildNewOrderPushPayload({ orderId: ORDER_ID, folio: "ALEX-000123", totalCents: 24550, deliveryType: "delivery" });
    assert.deepEqual(payload, {
      title: "Nuevo pedido ALEX-000123",
      body: "$245.50 · Entrega a domicilio",
      url: `/admin/pedidos/${ORDER_ID}`,
      tag: `pedido-${ORDER_ID}`,
      orderId: ORDER_ID,
      folio: "ALEX-000123",
    });
    assert.equal(buildNewOrderPushPayload({ orderId: ORDER_ID, folio: "ALEX-000124", totalCents: 1500, deliveryType: "pickup" }).body, "$15.00 · Recoger en sucursal");
  });
  test("id inválido → error (nunca un enlace construido con datos externos)", () => {
    assert.throws(() => buildNewOrderPushPayload({ orderId: "../login", folio: "ALEX-1", totalCents: 1, deliveryType: "pickup" }));
  });
});

describe("despacho del push", () => {
  function fakeDeps(order: ClaimedOrder | null, codes: Record<string, number | Error>) {
    const calls = { sent: [] as { endpoint: string; payload: string }[], finished: [] as unknown[] };
    const deps: PushDeps = {
      claim: async () => order,
      finish: async (_id, result) => {
        calls.finished.push(result);
      },
      send: async (subscription, payload) => {
        calls.sent.push({ endpoint: subscription.endpoint, payload });
        const code = codes[subscription.endpoint];
        if (code instanceof Error) throw code;
        return code ?? 201;
      },
    };
    return { deps, calls };
  }
  const order = (subscriptions: PushTarget[]): ClaimedOrder => ({ orderId: ORDER_ID, folio: "ALEX-000123", totalCents: 24550, deliveryType: "delivery", subscriptions });

  test("sin configuración (VAPID/secreto) → no envía y no falla", async () => {
    assert.deepEqual(await dispatchNewOrderPush(ORDER_ID, null), { status: "not-configured" });
  });

  test("ya reclamado (reintento idempotente o pedido repetido) → no envía nada", async () => {
    const { deps, calls } = fakeDeps(null, {});
    assert.deepEqual(await dispatchNewOrderPush(ORDER_ID, deps), { status: "not-claimed" });
    assert.equal(calls.sent.length, 0);
    assert.equal(calls.finished.length, 0);
  });

  test("envía a todos los dispositivos; 404/410 se limpian; otros fallos se registran", async () => {
    const gone = new Error("gone") as Error & { statusCode: number };
    gone.statusCode = 410;
    const { deps, calls } = fakeDeps(order([target("ok"), target("expirado"), target("muerto"), target("error")]), {
      [target("expirado").endpoint]: 404,
      [target("muerto").endpoint]: gone,
      [target("error").endpoint]: 500,
    });
    const result = await dispatchNewOrderPush(ORDER_ID, deps);
    assert.deepEqual(result, { status: "done", sent: 1, failed: 1, gone: 2 });
    assert.equal(calls.sent.length, 4);
    assert.deepEqual(calls.finished, [
      { ok: [target("ok").endpoint], failed: [target("error").endpoint], gone: [target("expirado").endpoint, target("muerto").endpoint] },
    ]);
  });

  test("el contenido enviado no lleva datos personales", async () => {
    const { deps, calls } = fakeDeps(order([target("ok")]), {});
    await dispatchNewOrderPush(ORDER_ID, deps);
    const sent = JSON.parse(calls.sent[0].payload);
    assert.deepEqual(Object.keys(sent).sort(), ["body", "folio", "orderId", "tag", "title", "url"]);
  });

  test("cualquier error (base, red) → status error, nunca lanza (el pedido ya fue exitoso)", async () => {
    const failing: PushDeps = {
      claim: async () => {
        throw new Error("db caída con endpoint https://secreto");
      },
      finish: async () => {},
      send: async () => 201,
    };
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args.join(" "));
    try {
      assert.deepEqual(await dispatchNewOrderPush(ORDER_ID, failing), { status: "error" });
    } finally {
      console.error = original;
    }
    assert.doesNotMatch(String(errors), /secreto|https:/, "el log no incluye detalles ni endpoints");
  });
});

describe("deduplicación en el panel", () => {
  test("el mismo pedido avisa una sola vez (Realtime + push)", () => {
    const seen = createSeenOrders(2);
    assert.equal(seen.markNew(ORDER_ID), true);
    assert.equal(seen.markNew(ORDER_ID), false);
    assert.equal(seen.markNew(null), false);
  });
  test("eventos mínimos válidos; cualquier otra cosa se ignora", () => {
    assert.deepEqual(parseOrderEvent({ order_id: ORDER_ID, folio: "ALEX-000123" }), { orderId: ORDER_ID, folio: "ALEX-000123" });
    assert.deepEqual(parseOrderEvent({ orderId: ORDER_ID, folio: "<script>" }), { orderId: ORDER_ID, folio: null });
    assert.equal(parseOrderEvent({ order_id: "1; drop" }), null);
    assert.equal(parseOrderEvent(null), null);
  });
});

// ---------------------------------------------------------------------------
// Service Worker (public/sw.js) en un contexto simulado: sin navegador ni push reales.
// ---------------------------------------------------------------------------

type FakeClient = { url: string; focused: boolean; visibilityState: string; messages: unknown[]; navigated?: string; focus: () => Promise<void>; navigate: (url: string) => Promise<void>; postMessage: (m: unknown) => void };

function loadServiceWorker(windows: FakeClient[]) {
  const handlers: Record<string, (event: unknown) => void> = {};
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const opened: string[] = [];
  const self = {
    location: { origin: "https://abarrotes.test" },
    addEventListener: (type: string, handler: (event: unknown) => void) => (handlers[type] = handler),
    skipWaiting: () => {},
    clients: {
      claim: async () => {},
      matchAll: async () => windows,
      openWindow: async (url: string) => {
        opened.push(url);
      },
    },
    registration: {
      showNotification: async (title: string, options: Record<string, unknown>) => {
        shown.push({ title, options });
      },
    },
  };
  runInNewContext(readFileSync("public/sw.js", "utf8"), { self, URL });
  async function dispatch(type: string, event: Record<string, unknown>) {
    let pending: Promise<unknown> = Promise.resolve();
    handlers[type]({ ...event, waitUntil: (promise: Promise<unknown>) => (pending = promise) });
    await pending;
  }
  return { dispatch, shown, opened, handlers };
}

// Los objetos creados dentro del contexto vm tienen otro prototipo: se comparan como JSON.
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

function fakeClient(path: string, visible: boolean): FakeClient {
  const client: FakeClient = {
    url: `https://abarrotes.test${path}`,
    focused: visible,
    visibilityState: visible ? "visible" : "hidden",
    messages: [],
    focus: async () => {},
    navigate: async (url) => {
      client.navigated = url;
    },
    postMessage: (message) => client.messages.push(message),
  };
  return client;
}

const pushEvent = (data: unknown) => ({ data: { json: () => data } });
const pushData = { title: "Nuevo pedido ALEX-000123", body: "$245.50 · Entrega a domicilio", url: `/admin/pedidos/${ORDER_ID}`, tag: `pedido-${ORDER_ID}`, orderId: ORDER_ID, folio: "ALEX-000123" };

describe("Service Worker", () => {
  test("no intercepta peticiones (sin fetch: nada se cachea)", () => {
    const { handlers } = loadServiceWorker([]);
    assert.deepEqual(Object.keys(handlers).sort(), ["activate", "install", "notificationclick", "push"]);
  });

  test("panel cerrado → notificación del sistema con folio/total y ruta interna", async () => {
    const sw = loadServiceWorker([]);
    await sw.dispatch("push", pushEvent(pushData));
    assert.equal(sw.shown.length, 1);
    assert.equal(sw.shown[0].title, "Nuevo pedido ALEX-000123");
    assert.equal(sw.shown[0].options.body, "$245.50 · Entrega a domicilio");
    assert.deepEqual(plain(sw.shown[0].options.data), { path: `/admin/pedidos/${ORDER_ID}` });
    assert.equal(sw.shown[0].options.tag, `pedido-${ORDER_ID}`);
  });

  test("panel a la vista → sin notificación del sistema; la app recibe el aviso (dedupe)", async () => {
    const panel = fakeClient("/admin", true);
    const sw = loadServiceWorker([panel]);
    await sw.dispatch("push", pushEvent(pushData));
    assert.equal(sw.shown.length, 0);
    assert.deepEqual(plain(panel.messages), [{ type: "order-push", orderId: ORDER_ID, folio: "ALEX-000123" }]);
  });

  test("panel abierto pero en segundo plano → sí notifica", async () => {
    const sw = loadServiceWorker([fakeClient("/admin/pedidos", false)]);
    await sw.dispatch("push", pushEvent(pushData));
    assert.equal(sw.shown.length, 1);
  });

  test("URL externa o manipulada en el push → se abre la lista de pedidos, nunca otra ruta", async () => {
    const sw = loadServiceWorker([]);
    await sw.dispatch("push", pushEvent({ ...pushData, url: "https://malicioso.test/robo" }));
    assert.deepEqual(plain(sw.shown[0].options.data), { path: "/admin/pedidos" });
  });

  test("clic con el panel abierto → enfoca y navega al pedido", async () => {
    const panel = fakeClient("/admin", false);
    const sw = loadServiceWorker([panel]);
    await sw.dispatch("notificationclick", { notification: { close: () => {}, data: { path: `/admin/pedidos/${ORDER_ID}` } } });
    assert.equal(panel.navigated, `https://abarrotes.test/admin/pedidos/${ORDER_ID}`);
    assert.equal(sw.opened.length, 0);
  });

  test("clic: si el sistema rechaza focus() (iOS), igual navega al pedido", async () => {
    const panel = fakeClient("/admin", false);
    panel.focus = () => Promise.reject(new Error("no permitido"));
    const sw = loadServiceWorker([panel]);
    await sw.dispatch("notificationclick", { notification: { close: () => {}, data: { path: `/admin/pedidos/${ORDER_ID}` } } });
    assert.equal(panel.navigated, `https://abarrotes.test/admin/pedidos/${ORDER_ID}`);
  });

  test("clic: sin navigate() disponible → la app recibe { type: navigate } con la ruta interna", async () => {
    const panel = fakeClient("/admin", false);
    panel.navigate = () => Promise.reject(new TypeError("navigate no disponible"));
    const sw = loadServiceWorker([panel]);
    await sw.dispatch("notificationclick", { notification: { close: () => {}, data: { path: `/admin/pedidos/${ORDER_ID}` } } });
    assert.deepEqual(plain(panel.messages), [{ type: "navigate", path: `/admin/pedidos/${ORDER_ID}` }]);
  });

  test("clic con la app cerrada → abre /admin/pedidos/<id> (Auth decide si pide login)", async () => {
    const sw = loadServiceWorker([fakeClient("/productos", true)]);
    await sw.dispatch("notificationclick", { notification: { close: () => {}, data: { path: `/admin/pedidos/${ORDER_ID}` } } });
    assert.deepEqual(sw.opened, [`https://abarrotes.test/admin/pedidos/${ORDER_ID}`]);
  });
});

describe("manifest de la PWA del panel", () => {
  const manifest = JSON.parse(readFileSync("public/admin.webmanifest", "utf8"));

  test("instalable en Chrome: nombre, start_url /admin, standalone, iconos 192/512 y maskable", () => {
    assert.equal(manifest.name, "Abarrotes Alex");
    assert.ok(manifest.short_name);
    assert.equal(manifest.start_url, "/admin");
    assert.equal(manifest.scope, "/admin");
    assert.equal(manifest.display, "standalone");
    assert.equal(manifest.prefer_related_applications, undefined);
    const sizes = manifest.icons.map((icon: { sizes: string; purpose: string }) => `${icon.sizes}:${icon.purpose}`);
    assert.deepEqual(sizes.sort(), ["192x192:any", "512x512:any", "512x512:maskable"]);
  });

  test("los iconos existen y tienen el tamaño declarado", async () => {
    for (const icon of manifest.icons as { src: string; sizes: string }[]) {
      const meta = await sharp(`public${icon.src}`).metadata();
      assert.equal(`${meta.width}x${meta.height}`, icon.sizes, icon.src);
    }
  });
});

describe("manifest de la PWA de la tienda", () => {
  const store = JSON.parse(readFileSync("public/tienda.webmanifest", "utf8"));
  const admin = JSON.parse(readFileSync("public/admin.webmanifest", "utf8"));

  test("instalable en Chrome: abre la tienda (/), standalone, iconos 192/512 y maskable", () => {
    assert.equal(store.name, "Abarrotes Alex");
    assert.ok(store.short_name);
    assert.equal(store.start_url, "/");
    assert.equal(store.scope, "/");
    assert.equal(store.display, "standalone");
    assert.equal(store.prefer_related_applications, undefined);
    const sizes = store.icons.map((icon: { sizes: string; purpose: string }) => `${icon.sizes}:${icon.purpose}`);
    assert.deepEqual(sizes.sort(), ["192x192:any", "512x512:any", "512x512:maskable"]);
  });

  test("es una app distinta del panel: id y start_url propios", () => {
    assert.notEqual(store.id, admin.id);
    assert.notEqual(store.start_url, admin.start_url);
    assert.ok(!store.start_url.startsWith("/admin"));
  });

  test("los iconos existen y tienen el tamaño declarado", async () => {
    for (const icon of store.icons as { src: string; sizes: string }[]) {
      const meta = await sharp(`public${icon.src}`).metadata();
      assert.equal(`${meta.width}x${meta.height}`, icon.sizes, icon.src);
    }
  });
});
