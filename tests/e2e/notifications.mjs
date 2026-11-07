// PWA del panel y avisos de pedidos (Fase 10), SIN pedidos reales ni pushes reales:
// - manifest y Service Worker (registro silencioso, sin pedir permisos al cargar);
// - tarjeta "Notificaciones de pedidos" (estado sin configuración VAPID en este entorno);
// - un push SINTÉTICO entregado por Chrome (CDP ServiceWorker.deliverPushMessage) al SW:
//   con el panel a la vista → aviso dentro de la app (sin notificación del sistema);
//   fuera del panel → notificación del sistema con folio/total y ruta interna.
// Folio y pedido sintéticos (ALEX-999999 / UUID ficticio): nada toca la base.
// Uso: E2E_BASE_URL=<url> npm run test:e2e:notifications
import { BASE, check, hasCreds, launch, login, newPage, relevantConsole, sleep, summary } from "./lib.mjs";

if (!hasCreds()) throw new Error("Requiere ADMIN_TEST_EMAIL / ADMIN_TEST_PASSWORD en .env.local");

const ORDER_ID = "00000000-0000-4000-8000-000000000999";
const PUSH = { title: "Nuevo pedido ALEX-999999", body: "$15.00 · Recoger en sucursal", url: `/admin/pedidos/${ORDER_ID}`, tag: `pedido-${ORDER_ID}`, orderId: ORDER_ID, folio: "ALEX-999999" };

const browser = await launch();
try {
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx, 390);
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  console.log("== Manifests (tienda y panel separados)");
  const manifestHref = async (path) => {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" });
    return page.evaluate(() => [...document.querySelectorAll("link[rel=manifest]")].map((link) => link.getAttribute("href")).join(","));
  };
  check("la tienda enlaza solo su manifest (abre /)", (await manifestHref("/")) === "/tienda.webmanifest");
  check("/admin/login enlaza solo el manifest del panel", (await manifestHref("/admin/login")) === "/admin.webmanifest");
  const store = await (await fetch(`${BASE}/tienda.webmanifest`)).json();
  check("manifest de la tienda: id/start_url /, standalone", store.id === "/" && store.start_url === "/" && store.display === "standalone");
  const manifest = await (await fetch(`${BASE}/admin.webmanifest`)).json();
  check("manifest: start_url /admin, standalone, iconos 192/512", manifest.start_url === "/admin" && manifest.display === "standalone" && ["192x192", "512x512"].every((size) => manifest.icons.some((icon) => icon.sizes === size)));

  console.log("== Panel: tarjeta y Service Worker");
  check("login", (await login(page)) === "/admin");
  // La tarjeta llega del servidor como «Revisando este dispositivo…» y resuelve su estado
  // al hidratar: se espera a que salga de ese estado (en producción tarda más que en local).
  await page.waitForFunction(() => {
    const text = document.getElementById("notificaciones-titulo")?.closest("section")?.innerText ?? "";
    return /Notificaciones de pedidos/.test(text) && !/Revisando este dispositivo/.test(text);
  }, { timeout: 15000 }).catch(() => null);
  const card = await page.evaluate(() => document.getElementById("notificaciones-titulo")?.closest("section")?.innerText.replace(/\s+/g, " ") ?? "");
  check("tarjeta «Notificaciones de pedidos» visible en el dashboard", /Notificaciones de pedidos/.test(card), card);
  // Con la clave pública VAPID en el build: botón para activar (no se pulsa: registraría
  // una suscripción real). Sin ella: «todavía no están configuradas», sin botón.
  if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    check("con VAPID: «Activar notificaciones de pedidos» disponible", /Activar notificaciones de pedidos/.test(card) && /aunque el panel esté cerrado/.test(card), card);
  } else {
    check("sin VAPID en este entorno → «todavía no están configuradas» (sin botón que falle)", /todavía no están configuradas/.test(card) && !/Activar notificaciones/.test(card), card);
  }
  check("no se pidió permiso al abrir la página", await page.evaluate(() => Notification.permission === "default"));
  await page.waitForFunction(async () => Boolean(await navigator.serviceWorker.getRegistration("/")), { timeout: 15000 }).catch(() => null);
  const sw = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration("/");
    await navigator.serviceWorker.ready;
    return { script: registration?.active?.scriptURL ?? null, scope: registration?.scope ?? null };
  });
  check("Service Worker registrado en silencio (/sw.js, alcance /)", sw.script?.endsWith("/sw.js") && new URL(sw.scope).pathname === "/", sw);

  console.log("== Push sintético entregado por Chrome al Service Worker");
  await ctx.overridePermissions(BASE, ["notifications"]);
  const cdp = await page.createCDPSession();
  const registrations = new Map();
  cdp.on("ServiceWorker.workerRegistrationUpdated", ({ registrations: list }) => list.forEach((r) => registrations.set(r.scopeURL, r.registrationId)));
  await cdp.send("ServiceWorker.enable");
  await sleep(500);
  const registrationId = registrations.get(`${new URL(BASE).origin}/`);
  check("registro del SW visible por CDP", Boolean(registrationId));
  const deliver = () => cdp.send("ServiceWorker.deliverPushMessage", { origin: new URL(BASE).origin, registrationId, data: JSON.stringify(PUSH) });
  // Chrome headless no conserva notificaciones (getNotifications() siempre vacío): se
  // instrumenta el propio Service Worker para registrar cada showNotification.
  const swTarget = await browser.waitForTarget((t) => t.type() === "service_worker" && t.url().endsWith("/sw.js"), { timeout: 10000 });
  const worker = await swTarget.worker();
  await worker.evaluate(() => {
    self.__shown = [];
    const original = self.registration.showNotification.bind(self.registration);
    self.registration.showNotification = (title, options) => {
      self.__shown.push({ title, body: options?.body, tag: options?.tag, data: options?.data });
      return original(title, options);
    };
  });
  const notifications = () => worker.evaluate(() => self.__shown);

  await page.bringToFront();
  await deliver();
  await page.waitForFunction(() => /Nuevo pedido ALEX-999999/.test(document.body.innerText), { timeout: 10000 }).catch(() => null);
  const banner = await page.evaluate(() => [...document.querySelectorAll("[role=status]")].map((e) => e.innerText).join(" "));
  check("panel a la vista: aviso en la app «Nuevo pedido ALEX-999999» con «Ver pedido»", /Nuevo pedido ALEX-999999/.test(banner) && /Ver pedido/.test(banner), banner.slice(0, 200));
  check("panel a la vista: sin notificación del sistema duplicada", (await notifications()).length === 0, await notifications());
  check("el enlace del aviso lleva al pedido (ruta interna por id)", await page.evaluate((id) => Boolean([...document.querySelectorAll("a")].find((a) => a.getAttribute("href") === `/admin/pedidos/${id}`)), ORDER_ID));
  await deliver();
  await sleep(800);
  check("el mismo pedido no avisa dos veces (dedupe)", await page.evaluate(() => (document.body.innerText.match(/Nuevo pedido ALEX-999999/g) ?? []).length === 1));

  // Fuera del panel (tienda): el SW muestra la notificación del sistema.
  await page.goto(`${BASE}/productos`, { waitUntil: "networkidle0" });
  await deliver();
  await sleep(800);
  const shown = await notifications();
  check("fuera del panel: notificación del sistema con folio y total, sin datos personales", shown.length === 1 && shown[0].title === PUSH.title && shown[0].body === PUSH.body && shown[0].tag === PUSH.tag, shown);
  check("la notificación abre la ruta interna del pedido", shown[0]?.data?.path === `/admin/pedidos/${ORDER_ID}`, shown[0]?.data);

  // App suspendida (segundo plano) → al volver a primer plano el panel pide datos frescos
  // al servidor (RSC), aunque no haya llegado ningún aviso en vivo mientras tanto.
  console.log("== Volver a primer plano revalida el panel");
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle0" });
  await sleep(500);
  let refreshes = 0;
  const countRefresh = (request) => {
    if (request.headers()["rsc"] === "1" && new URL(request.url()).pathname === "/admin") refreshes++;
  };
  page.on("request", countRefresh);
  const setVisibility = (state) =>
    page.evaluate((value) => {
      Object.defineProperty(document, "visibilityState", { value, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    }, state);
  await setVisibility("hidden");
  await sleep(300);
  check("en segundo plano no se consulta nada (sin polling)", refreshes === 0, refreshes);
  await setVisibility("visible");
  await sleep(1500);
  check(`al volver a primer plano se revalida el panel (${refreshes} petición/es)`, refreshes >= 1, refreshes);
  page.off("request", countRefresh);

  const issues = relevantConsole().filter((issue) => !/Failed to load resource/.test(issue.text));
  check(`consola sin errores (${issues.length})`, issues.length === 0, issues.slice(0, 3));
  await ctx.close();
} finally {
  await browser.close();
}
summary("Notificaciones y PWA");
