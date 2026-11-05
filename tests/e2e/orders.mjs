// E2E de pedidos (Fase 8E) con sesión real — SOLO LECTURA: nunca cambia el estado de un
// pedido (abre la confirmación de cancelar y la cierra con "No, volver"). Las capturas
// van a tests/e2e/.artifacts (ignorada por git) porque pueden mostrar datos de clientes.
// Uso: npm run test:e2e:orders
import { BASE, check, clickText, dialogText, launch, login, mainText, metrics, newPage, relevantConsole, screenshot, sleep, summary } from "./lib.mjs";

const browser = await launch();
const context = await browser.createBrowserContext();
const page = await newPage(context, 1440);
await login(page);
const goto = (path) => page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" });

console.log("== Listado");
await goto("/admin/pedidos");
let text = await mainText(page);
const total = Number(/(\d+) pedidos?/.exec(text)?.[1] ?? -1);
check(`muestra el conteo (${total})`, total >= 0, text.slice(0, 120));
if (total > 0) {
  const rows = await page.evaluate(() => [...document.querySelectorAll("main table tbody tr")].map((tr) => ({ folio: tr.cells[0].textContent.trim(), link: tr.querySelector("a")?.getAttribute("href") })));
  check("tabla con folio y enlace «Ver pedido»", rows.length > 0 && rows.every((row) => /^ALEX-\d{6,}$/.test(row.folio) && /^\/admin\/pedidos\/[0-9a-f-]{36}$/.test(row.link)), rows.length);
  check("el listado no muestra direcciones", !(await page.evaluate(() => /Dirección|Colonia|Referencias/.test(document.querySelector("main table").innerText))));
  check("máximo 25 por página", rows.length <= 25);
}
let m = await metrics(page);
check("1440 sin overflow ni targets < 40px", !m.overflowX && m.small.length === 0, m);
await screenshot(page, "orders-list-1440.png", { fullPage: true });

console.log("== Filtros en la URL (servidor)");
for (const query of ["estado=pendientes", "estado=delivered", "entrega=pickup", "entrega=delivery", "periodo=hoy", "periodo=7d", "periodo=30d", "q=ALEX", "q=zzzz-no-existe", "estado=inventado&periodo=ayer", "page=999"]) {
  await goto(`/admin/pedidos?${query}`);
  text = await mainText(page);
  check(`?${query} carga sin error`, !text.includes("No pudimos cargar") && /\d+ pedidos?|No encontramos pedidos/.test(text), text.slice(0, 120));
}
// Búsqueda sin acentos ni mayúsculas con un pedido existente (el nombre se toma en tiempo
// de ejecución; no queda en el código ni en la salida).
await goto("/admin/pedidos");
const sample = await page.evaluate(() => {
  const row = document.querySelector("main table tbody tr");
  return row ? { folio: row.cells[0].textContent.trim(), name: row.cells[1].textContent.trim() } : null;
});
if (sample) {
  const variant = sample.name.normalize("NFD").replace(/[̀-̂̈]/g, "").normalize("NFC").toUpperCase().split(" ")[0];
  await goto(`/admin/pedidos?q=${encodeURIComponent(variant)}`);
  const folios = await page.evaluate(() => [...document.querySelectorAll("main table tbody tr")].map((tr) => tr.cells[0].textContent.trim()));
  check("búsqueda por nombre sin acentos y en mayúsculas encuentra el pedido", folios.includes(sample.folio));
  await goto(`/admin/pedidos?q=${encodeURIComponent(sample.folio.toLowerCase())}`);
  const byFolio = await page.evaluate(() => [...document.querySelectorAll("main table tbody tr")].map((tr) => tr.cells[0].textContent.trim()));
  check("búsqueda por folio en minúsculas devuelve solo ese pedido", byFolio.length === 1 && byFolio[0] === sample.folio, byFolio.length);
}
await goto("/admin/pedidos?q=zzzz-no-existe");
check("sin resultados: mensaje y «Limpiar filtros»", (await mainText(page)).includes("No encontramos pedidos con estos filtros.") && (await clickText(page, "main a", "Limpiar filtros")));
await page.waitForFunction(() => location.search === "", { timeout: 15000 }).catch(() => null);
await goto("/admin/pedidos");
await page.select("#pedidos-entrega", "pickup");
await page.waitForFunction(() => location.search.includes("entrega=pickup"), { timeout: 15000 }).catch(() => null);
check("cambiar un filtro actualiza la URL (formulario GET)", page.url().includes("entrega=pickup"));
await page.goBack({ waitUntil: "networkidle0" });
check("Atrás restaura el filtro anterior", !page.url().includes("entrega=pickup"));

console.log("== Detalle");
await goto("/admin/pedidos");
const firstLink = await page.evaluate(() => document.querySelector("main table tbody tr a")?.getAttribute("href"));
if (firstLink) {
  await goto(firstLink);
  text = await mainText(page);
  check("secciones: Cliente, Entrega, Pago, Productos, Historial", ["Cliente", "Entrega", "Pago", "Productos", "Historial"].every((section) => text.includes(section)));
  check("envío NULL se muestra «Por confirmar» (no $0.00)", !text.includes("Envío $0.00") || text.includes("Por confirmar"));
  check("historial con «Sistema» para el estado inicial", text.includes("Sistema"));
  const final = text.includes("Estado final");
  if (!final) {
    const action = await page.evaluate(() => [...document.querySelectorAll("header button")].filter((b) => b.checkVisibility()).map((b) => b.textContent.trim()));
    check(`acción siguiente + cancelar visibles arriba (${action.join(" | ")})`, action.length === 2 && action[1].includes("Cancelar"), action);
    await page.evaluate(() => [...document.querySelectorAll("header button")].find((b) => b.checkVisibility() && b.textContent.includes("Cancelar")).click());
    await page.waitForSelector("dialog[open]");
    await sleep(200);
    const dialog = await dialogText(page);
    check("confirmación: «¿Cancelar el pedido ALEX-…?» y no podrá reactivarse", /¿Cancelar el pedido ALEX-\d+\?/.test(dialog) && dialog.includes("no podrá reactivarse"), dialog);
    check("foco inicial en «No, volver»", (await page.evaluate(() => document.activeElement?.textContent.trim())) === "No, volver");
    await clickText(page, "dialog[open] button", "No, volver");
    await sleep(300);
    check("«No, volver» cierra sin cambiar nada", !(await dialogText(page)) && !(await mainText(page)).includes("Cancelado"));
  }
  m = await metrics(page);
  check("detalle 1440 sin overflow ni targets < 40px", !m.overflowX && m.small.length === 0, m);
  await screenshot(page, "orders-detail-1440.png", { fullPage: true });
  await page.setViewport({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle0" });
  m = await metrics(page);
  check("detalle 390 sin overflow ni targets < 40px", !m.overflowX && m.small.length === 0, m);
  if (!final) {
    const bar = await page.evaluate(() => {
      const el = [...document.querySelectorAll("div.fixed")].find((d) => d.checkVisibility() && d.querySelector("button"));
      const r = el?.getBoundingClientRect();
      return el ? { bottom: Math.round(innerHeight - r.bottom), buttons: [...el.querySelectorAll("button")].map((b) => b.textContent.trim()) } : null;
    });
    check(`móvil: barra inferior fija con la acción siguiente y Cancelar (${bar?.buttons.join(" | ")})`, bar?.bottom === 0 && bar.buttons.length === 2, bar);
    check("móvil: la barra no tapa el final del contenido (padding inferior)", await page.evaluate(() => getComputedStyle(document.querySelector("main article")).paddingBottom !== "0px"));
  }
  await screenshot(page, "orders-detail-390.png", { fullPage: true });
  await goto("/admin/pedidos");
  m = await metrics(page);
  check("listado 390: tarjetas, sin tabla ni overflow", !m.overflowX && m.small.length === 0 && !(await page.evaluate(() => document.querySelector("main table")?.checkVisibility())), m);
  await screenshot(page, "orders-list-390.png", { fullPage: true });
  await page.setViewport({ width: 1440, height: 900 });
}

console.log("== Pedido inexistente / id inválido");
for (const path of ["/admin/pedidos/00000000-0000-4000-8000-00000000dead", "/admin/pedidos/no-es-un-id"]) {
  const response = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" });
  text = await page.evaluate(() => document.body.innerText);
  // Con streaming el 404 llega con estado 200 (Next agrega noindex); se valida el contenido.
  check(`${path} → «No encontramos este pedido.» sin datos`, text.includes("No encontramos este pedido.") && !text.includes("Historial"), { status: response.status() });
}

const issues = relevantConsole();
check(`consola sin errores (${issues.length})`, issues.length === 0, issues.slice(0, 3));
await browser.close();
summary("Pedidos E2E (solo lectura)");
