// E2E Fase 8D: promociones con sesión REAL sobre el producto __E2E__. Sin pedidos.
// Requiere el producto "__E2E__ Producto <runId>" (y su categoría/subcategoría __E2E__).
// Uso: npm run test:e2e:promotions -- <runId>   (después: npm run test:e2e:cleanup -- <runId>)
import {
  BASE, check, clearAndType, clickText, dialogText, launch, login, metrics, newPage, relevantConsole, screenshot, sleep, summary, waitDialogClosed, waitToast,
} from "./lib.mjs";

const RUN = process.argv[2];
if (!RUN) throw new Error("Falta el runId del producto __E2E__ (p. ej. e2e-pmwfp).");
const PROD = `__E2E__ Producto ${RUN}`;
const CAT = `__E2E__ Categoria ${RUN} editada`;
const SUB = `__E2E__ Subcategoria ${RUN} editada`;
const Q = encodeURIComponent(`Producto ${RUN}`);

// "YYYY-MM-DDTHH:mm" en hora de Mérida para un instante (como lo escribiría el admin).
const merida = (date) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Merida", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};
const day = 24 * 3600 * 1000;

const browser = await launch();
const context = await browser.createBrowserContext();
const page = await newPage(context, 1440);
await login(page);

const goto = async (path) => page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" });
const promoRow = () => page.evaluate((n) => [...document.querySelectorAll("main table tbody tr")].filter((tr) => tr.textContent.includes(n)).map((tr) => tr.innerText.replace(/\s+/g, " ")), PROD);
async function setRowActive(path, name, active, toastText) {
  await goto(path);
  await page.evaluate((n) => [...document.querySelectorAll(`button[aria-label="Más acciones para ${n}"]`)].find((b) => b.checkVisibility())?.click(), name);
  await page.waitForSelector("[role=menuitem]", { timeout: 10000 });
  await sleep(150);
  await clickText(page, "[role=menuitem]", active ? "Activar" : "Desactivar");
  if (!active) {
    await page.waitForSelector("dialog[open]");
    await clickText(page, "dialog[open] button", "Desactivar");
    await waitDialogClosed(page);
  }
  return waitToast(page, toastText);
}
async function editProduct(change) {
  await goto("/admin/productos");
  await page.evaluate((n) => [...document.querySelectorAll(`button[aria-label="Editar ${n}"]`)].find((b) => b.checkVisibility()).click(), PROD);
  await page.waitForSelector("dialog[open] #producto-nombre");
  await page.evaluate(change);
  await clickText(page, "dialog[open] button[type=submit]", "Guardar");
  return waitDialogClosed(page, 60000);
}
async function setProductPrice(price) {
  await goto("/admin/productos");
  await page.evaluate((n) => [...document.querySelectorAll(`button[aria-label="Editar ${n}"]`)].find((b) => b.checkVisibility()).click(), PROD);
  await page.waitForSelector("dialog[open] #producto-nombre");
  await clearAndType(page, "dialog[open] input[name^='price:']", price);
  await clickText(page, "dialog[open] button[type=submit]", "Guardar");
  return waitDialogClosed(page, 60000);
}
async function storeCard() {
  const ctx = await browser.createBrowserContext();
  const p = await newPage(ctx, 1440);
  await p.goto(`${BASE}/productos?q=${Q}`, { waitUntil: "networkidle0" });
  const result = await p.evaluate((n) => [...document.querySelectorAll("main article")].find((a) => a.querySelector("h2,h3")?.textContent.trim() === n)?.innerText.replace(/\s+/g, " ") ?? null, PROD);
  await ctx.close();
  return result;
}
// Abre "Nueva promoción", elige el producto E2E y llena el formulario.
async function newPromotion({ price, start = "", end = "" }) {
  await goto("/admin/promociones");
  await clickText(page, "main button", "Nueva");
  await page.waitForSelector("dialog[open] #promo-producto");
  await page.type("#promo-producto", `producto ${RUN}`);
  await sleep(200);
  await page.evaluate((n) => [...document.querySelectorAll("dialog[open] button[aria-label^='Elegir']")].find((b) => b.getAttribute("aria-label").includes(n))?.click(), PROD);
  await page.waitForSelector("#promo-precio");
  await sleep(150);
  await page.type("#promo-precio", price);
  if (start) await page.focus("#promo-inicio");
  if (start) await page.type("#promo-inicio", start.replace("T", ""));
  if (end) await page.type("#promo-fin", end.replace("T", ""));
}
async function editPromotion(rowIndex, fill) {
  await goto("/admin/promociones");
  await page.evaluate((n, index) => {
    const rows = [...document.querySelectorAll("main table tbody tr")].filter((tr) => tr.textContent.includes(n));
    rows[index].querySelector("button[aria-label^='Editar']").click();
  }, PROD, rowIndex);
  await page.waitForSelector("dialog[open] #promo-precio");
  await fill();
  await clickText(page, "dialog[open] button[type=submit]", "Guardar");
  return waitDialogClosed(page);
}
// Escribe en un datetime-local de forma fiable (asigna el valor como lo haría el usuario).
const setDateTime = (selector, value) => page.evaluate((s, v) => {
  const input = document.querySelector(s);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  setter.call(input, v);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}, selector, value);

console.log("== Preparación: jerarquía y producto E2E activos (temporal)");
check("categoría E2E activada", await setRowActive("/admin/categorias", CAT, true, "Categoría activada"));
check("subcategoría E2E activada", await setRowActive("/admin/subcategorias", SUB, true, "Subcategoría activada"));
let error = await editProduct(() => {
  if (!document.querySelector("#producto-activo").checked) document.querySelector("#producto-activo").click();
  [...document.querySelectorAll("dialog[open] label")].find((l) => l.textContent.trim() === "Disponible")?.click();
});
check("producto E2E activo y disponible (precio normal $21.00)", error === null, error);

console.log("== Listado inicial");
await goto("/admin/promociones");
const seedRows = await page.evaluate(() => [...document.querySelectorAll("main table tbody tr")].length);
check(`listado con las promociones existentes (${seedRows})`, seedRows >= 2);
await screenshot(page, "promo-listado-1440.png", { fullPage: true });

console.log("== Crear promoción $18 sin fechas");
await goto("/admin/promociones");
await clickText(page, "main button", "Nueva");
await page.waitForSelector("dialog[open] #promo-producto");
check("foco inicial en el buscador de productos", (await page.evaluate(() => document.activeElement?.id)) === "promo-producto");
await page.type("#promo-producto", `producto ${RUN}`);
await sleep(200);
const found = await page.evaluate((n) => [...document.querySelectorAll("dialog[open] button[aria-label^='Elegir']")].map((b) => b.getAttribute("aria-label")).filter((l) => l.includes(n)), PROD);
check("buscador encuentra el producto E2E con su precio normal", found.length === 1 && found[0].includes("$21.00"), found);
await screenshot(page, "promo-buscador-1440.png");
await page.evaluate((n) => [...document.querySelectorAll("dialog[open] button[aria-label^='Elegir']")].find((b) => b.getAttribute("aria-label").includes(n)).click(), PROD);
await page.waitForSelector("#promo-precio");
await sleep(200);
check("al elegir, el foco pasa al precio promocional", (await page.evaluate(() => document.activeElement?.id)) === "promo-precio");
check("precio normal de solo lectura: $21.00", (await dialogText(page)).includes("Precio normal $21.00"));
await page.type("#promo-precio", "21");
await sleep(100);
check("precio igual al normal → error en vivo", (await dialogText(page)).includes("El precio promocional debe ser menor que el precio normal."));
await clickText(page, "dialog[open] button[type=submit]", "Crear");
await sleep(200);
check("no se puede enviar con precio ≥ normal (validación del navegador)", Boolean(await dialogText(page)));
await clearAndType(page, "#promo-precio", "18");
await sleep(100);
check("ahorro en vivo: $3.00 (14%)", (await dialogText(page)).includes("Ahorro para el cliente: $3.00 (14%)"));
check("el error del intento anterior desaparece al corregir el precio", !(await dialogText(page)).includes("debe ser menor"));
await screenshot(page, "promo-nueva-1440.png");
await clickText(page, "dialog[open] button[type=submit]", "Crear");
error = await waitDialogClosed(page);
check("«Promoción creada»", error === null && (await waitToast(page, "Promoción creada")), error);
let rows = await promoRow();
check("listado: $21.00 → $18.00, ahorro −$3.00 (14%), sin fechas, Vigente", rows.length === 1 && /\$21\.00 \$18\.00 −\$3\.00 \(14%\) Sin fechas.*Vigente/.test(rows[0]), rows);

console.log("== Tienda con la promoción vigente");
let card = await storeCard();
check("tarjeta: Oferta, $18.00 y antes $21.00", card?.includes("Oferta") && card.includes("$18.00") && card.includes("$21.00"), card);
const ctx = await browser.createBrowserContext();
const store = await newPage(ctx, 1440);
await store.goto(`${BASE}/`, { waitUntil: "networkidle0" });
check("aparece en «Ofertas» del inicio", await store.evaluate((n) => [...document.querySelectorAll("section[aria-labelledby=ofertas-title] h2, section[aria-labelledby=ofertas-title] h3")].some((h) => h.textContent.trim() === n), PROD));
await store.evaluate(() => [...document.querySelectorAll("header input[type=search]")].find((e) => e.checkVisibility())?.focus());
await store.keyboard.type(`E2E Producto ${RUN}`);
await store.waitForFunction((n) => [...document.querySelectorAll("main article")].some((a) => a.textContent.includes(n)), { timeout: 15000 }, PROD).catch(() => null);
const card = await store.evaluate((n) => [...document.querySelectorAll("main article")].find((a) => a.textContent.includes(n))?.innerText.replace(/\s+/g, " "), PROD);
check("búsqueda en el grid: $18.00 (precio promocional)", card?.includes("$18.00"), card);
await store.goto(`${BASE}/productos?q=${Q}`, { waitUntil: "networkidle0" });
await store.evaluate((n) => [...document.querySelectorAll("main article")].find((a) => a.querySelector("h2,h3")?.textContent.trim() === n)?.querySelector("button[aria-label^='Agregar']").click(), PROD);
await sleep(600);
await store.goto(`${BASE}/carrito`, { waitUntil: "networkidle0" });
await store.waitForFunction((n) => document.querySelector("main")?.innerText.includes(n), { timeout: 15000 }, PROD).catch(() => null);
const cart = await store.evaluate(() => document.querySelector("main").innerText.replace(/\s+/g, " "));
check("carrito: $18.00 (precio vigente resuelto por el servidor)", cart.includes("$18.00 c/u") && /Subtotal.*\$18\.00/.test(cart), cart.slice(0, 250));
await goto("/admin/productos");
const productRow = await page.evaluate((n) => [...document.querySelectorAll("main table tbody tr")].find((tr) => tr.textContent.includes(n))?.innerText.replace(/\s+/g, " "), PROD);
check("admin de productos muestra «Oferta $18.00»", /Oferta \$18\.00/.test(productRow ?? ""), productRow);

console.log("== Solapamiento");
await newPromotion({ price: "17" });
await clickText(page, "dialog[open] button[type=submit]", "Crear");
error = await waitDialogClosed(page, 8000);
check("otra activa sin fechas → «Ya existe una promoción activa que se cruza con estas fechas.»", error?.includes("Ya existe una promoción activa que se cruza con estas fechas."), error);
await screenshot(page, "promo-conflicto-1440.png");
await page.keyboard.press("Escape");
await sleep(300);
check("el rechazo no creó nada", (await promoRow()).length === 1);

console.log("== Programada → la tienda usa el precio normal");
const tomorrow = merida(new Date(Date.now() + day));
error = await editPromotion(0, () => setDateTime("#promo-inicio", tomorrow));
check("editar: inicio mañana", error === null && (await waitToast(page, "Promoción actualizada")), error);
rows = await promoRow();
check("estado «Programada» con «Desde …»", /Desde .*Programada/.test(rows[0]), rows);
card = await storeCard();
check("tienda: $21.00 sin oferta", card?.includes("$21.00") && !card.includes("Oferta") && !card.includes("$18.00"), card);

console.log("== Vencida → la tienda usa el precio normal");
error = await editPromotion(0, async () => {
  await setDateTime("#promo-inicio", merida(new Date(Date.now() - 3 * day)));
  await setDateTime("#promo-fin", merida(new Date(Date.now() - day)));
});
check("editar: ventana en el pasado", error === null, error);
rows = await promoRow();
check("estado «Vencida» (sigue activa)", /Vencida/.test(rows[0]), rows);
card = await storeCard();
check("tienda: $21.00 sin oferta", card?.includes("$21.00") && !card.includes("Oferta"), card);
await newPromotion({ price: "17" });
await clickText(page, "dialog[open] button[type=submit]", "Crear");
error = await waitDialogClosed(page, 8000);
check("una vencida-activa también bloquea otra «sin fechas» (con pista)", error?.includes("incluidas las vencidas que sigan activas"), error);
await page.keyboard.press("Escape");
await sleep(300);

console.log("== Desactivar / reactivar con conflicto");
await goto("/admin/promociones");
await page.evaluate((n) => [...document.querySelectorAll("main table tbody tr")].find((tr) => tr.textContent.includes(n)).querySelector("button[aria-label^='Más acciones']").click(), PROD);
await page.waitForSelector("[role=menuitem]");
await clickText(page, "[role=menuitem]", "Desactivar");
await page.waitForSelector("dialog[open]");
check("confirmación: «Esta promoción dejará de aplicarse inmediatamente»", (await dialogText(page)).includes("Esta promoción dejará de aplicarse inmediatamente"));
await screenshot(page, "promo-desactivar-1440.png");
await clickText(page, "dialog[open] button", "Desactivar");
await waitDialogClosed(page);
check("«Promoción desactivada» y estado Desactivada", (await waitToast(page, "Promoción desactivada")) && /Desactivada/.test((await promoRow())[0]));
await newPromotion({ price: "17" });
await clickText(page, "dialog[open] button[type=submit]", "Crear");
error = await waitDialogClosed(page);
check("ahora sí: promoción B $17 sin fechas", error === null && (await waitToast(page, "Promoción creada")), error);
rows = await promoRow();
check("dos promociones del producto: una Vigente y una Desactivada", rows.length === 2 && rows.some((r) => /Vigente/.test(r)) && rows.some((r) => /Desactivada/.test(r)), rows);
await page.evaluate((n) => [...document.querySelectorAll("main table tbody tr")].find((tr) => tr.textContent.includes(n) && tr.textContent.includes("Desactivada")).querySelector("button[aria-label^='Más acciones']").click(), PROD);
await page.waitForSelector("[role=menuitem]");
await clickText(page, "[role=menuitem]", "Activar");
check("reactivar la A (se cruza con B) → rechazado con mensaje", await waitToast(page, "Ya existe una promoción activa que se cruza con estas fechas."));
await page.waitForNetworkIdle({ idleTime: 300 }).catch(() => null);
check("…y sigue Desactivada", (await promoRow()).some((r) => /Desactivada/.test(r)));

console.log("== Precio normal baja → «Requiere revisión»");
error = await setProductPrice("16.00");
check("precio normal del producto → $16.00", error === null, error);
await goto("/admin/promociones");
rows = await promoRow();
check("B ($17) queda «Requiere revisión» y «Sin descuento»", rows.some((r) => /Sin descuento.*Requiere revisión/.test(r)), rows);
await screenshot(page, "promo-revision-1440.png", { fullPage: true });
card = await storeCard();
check("tienda ignora la promoción: $16.00 sin oferta", card?.includes("$16.00") && !card.includes("Oferta"), card);
error = await editPromotion(rows.findIndex((r) => /Requiere revisión/.test(r)), async () => {
  const text = await dialogText(page);
  check("el formulario explica la revisión", text.includes("El precio normal bajó"));
  await clearAndType(page, "#promo-precio", "15");
});
check("corregir B a $15 → vuelve a Vigente", error === null && (await promoRow()).some((r) => /Vigente/.test(r)), error);
card = await storeCard();
check("tienda: Oferta $15.00 sobre $16.00", card?.includes("Oferta") && card.includes("$15.00"), card);

console.log("== Responsive 390");
await page.setViewport({ width: 390, height: 844 });
await goto("/admin/promociones");
let m = await metrics(page);
check("listado móvil (tarjetas) sin overflow ni targets < 40px", !m.overflowX && m.small.length === 0 && !(await page.evaluate(() => document.querySelector("main table").checkVisibility())), m);
await screenshot(page, "promo-listado-390.png", { fullPage: true });
await clickText(page, "main button", "Nueva");
await page.waitForSelector("dialog[open] #promo-producto");
await page.type("#promo-producto", "a");
await sleep(200);
m = await metrics(page);
check("buscador móvil sin overflow ni targets < 40px", !m.overflowX && m.small.length === 0, m);
await screenshot(page, "promo-nueva-390.png");
await page.keyboard.press("Escape"); // 1.ª Esc: limpia la búsqueda (nativo de type=search)
await sleep(200);
await page.keyboard.press("Escape"); // 2.ª Esc: cierra el diálogo
await sleep(300);
check("Esc (dos veces desde el buscador) cierra el diálogo", !(await dialogText(page)));
await page.evaluate((n) => [...document.querySelectorAll("main ul[aria-label] > li")].find((li) => li.textContent.includes(n) && li.textContent.includes("Vigente"))?.querySelector("button[aria-label^='Editar']").click(), PROD);
await page.waitForSelector("dialog[open] #promo-precio");
await sleep(300);
check("editar precarga el precio promocional ($15.00)", (await page.$eval("#promo-precio", (e) => e.value)) === "15.00");
m = await metrics(page);
check("editar móvil (fechas) sin overflow ni targets < 40px", !m.overflowX && m.small.length === 0, m);
await screenshot(page, "promo-editar-390.png");
await page.keyboard.press("Escape");
await sleep(300);
await page.setViewport({ width: 1440, height: 900 });

console.log("== Limpieza: desactivar B (las promociones E2E se borran después con la sesión admin)");
await goto("/admin/promociones");
await page.evaluate((n) => [...document.querySelectorAll("main table tbody tr")].find((tr) => tr.textContent.includes(n) && tr.textContent.includes("Vigente")).querySelector("button[aria-label^='Más acciones']").click(), PROD);
await page.waitForSelector("[role=menuitem]");
await clickText(page, "[role=menuitem]", "Desactivar");
await page.waitForSelector("dialog[open]");
await clickText(page, "dialog[open] button", "Desactivar");
await waitDialogClosed(page);
check("B desactivada", await waitToast(page, "Promoción desactivada"));
error = await setProductPrice("21.00");
check("precio normal restaurado a $21.00", error === null, error);
error = await editProduct(() => {
  const set = (selector, value) => { const el = document.querySelector(selector); if (el.checked !== value) el.click(); };
  set("#producto-activo", false);
  set("#producto-destacado", false);
  [...document.querySelectorAll("dialog[open] label")].find((l) => l.textContent.trim() === "Agotado")?.click();
});
check("producto E2E: inactivo, no destacado, agotado", error === null, error);
check("subcategoría E2E desactivada", await setRowActive("/admin/subcategorias", SUB, false, "Subcategoría desactivada"));
check("categoría E2E desactivada", await setRowActive("/admin/categorias", CAT, false, "Categoría desactivada"));

const issues = relevantConsole();
check(`consola sin errores (${issues.length})`, issues.length === 0, issues.slice(0, 3));
await ctx.close();
await browser.close();
summary("Promociones E2E");
