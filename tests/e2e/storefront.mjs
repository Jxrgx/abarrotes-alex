// QA de la tienda (Fase 9B): inicio, catálogo, búsqueda, búsqueda instantánea, carrito,
// checkout y confirmación, como cliente en móvil y desktop. SIN credenciales.
//
// SEGURIDAD DE DATOS: toda petición del navegador a /api/pedidos se INTERCEPTA y se
// responde con un mock; nunca llega al servidor, así que no se crea ningún pedido ni se
// consume ningún folio. El comprobante de éxito es sintético (ALEX-999999, solo en
// sessionStorage). Al terminar, el carrito queda vacío.
// Uso: npm run test:e2e:store   (E2E_BASE_URL para apuntar a otra instancia)
import { BASE, check, launch, mainText, metrics, newPage, relevantConsole, sleep, summary } from "./lib.mjs";

const browser = await launch();
const MOCK_FOLIO = "ALEX-999999";
let realOrderRequests = 0;
let mockedOrderRequests = 0;

// Intercepta /api/pedidos (y opcionalmente otras rutas) en una página.
async function guard(page, handlers = {}) {
  await page.setRequestInterception(true);
  page.on("request", async (request) => {
    if (request.isInterceptResolutionHandled()) return;
    const path = new URL(request.url()).pathname;
    if (path === "/api/pedidos") {
      mockedOrderRequests++;
      const handler = handlers.pedidos ?? (() => ({ status: 503, body: { error: { code: "SERVER_ERROR", message: "x" } } }));
      const result = await handler(JSON.parse(request.postData() ?? "{}"));
      if (result === "abort") return request.abort("failed");
      if (result.delay) await sleep(result.delay);
      return request.respond({ status: result.status, contentType: "application/json", body: JSON.stringify(result.body) });
    }
    if (handlers[path]) {
      const result = handlers[path](request);
      if (result === "abort") return request.abort("failed");
    }
    // Red de seguridad: /api/pedidos jamás se deja pasar (se contaría aquí).
    if (path === "/api/pedidos") realOrderRequests++;
    return request.continue();
  });
}
const text = (page, selector) => page.$eval(selector, (e) => e.innerText.replace(/\s+/g, " ")).catch(() => "");
const cartCount = (page) => page.evaluate(() => document.querySelector("header a[href='/carrito']")?.getAttribute("aria-label") ?? "");
const productNames = (page) => page.evaluate(() => [...document.querySelectorAll("main article h3, main article h2")].map((h) => h.textContent.trim()));
const visibleSearch = async (page) => (await page.evaluateHandle(() => [...document.querySelectorAll("header input[type=search]")].find((e) => e.checkVisibility()))).asElement();

// ---------------------------------------------------------------------------
console.log("== Inicio");
let ctx = await browser.createBrowserContext();
let page = await newPage(ctx, 390);
await guard(page);
await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
const home = await mainText(page);
for (const section of ["Ofertas", "Productos destacados", "Preguntas frecuentes", "Horario"]) check(`inicio muestra «${section}»`, home.includes(section));
check("footer con datos de la sucursal", /Tel\.|Dirección|Sucursal/.test(await text(page, "footer")));
const links = await page.evaluate(() => [...new Set([...document.querySelectorAll("a[href^='/'], a[href^='#']")].map((a) => a.getAttribute("href")))]);
const anchors = links.filter((href) => href.startsWith("#"));
check(`anclas del inicio con destino (${anchors.join(", ")})`, await page.evaluate((list) => list.every((href) => document.getElementById(href.slice(1))), anchors));
let brokenLinks = [];
for (const href of links.filter((href) => href.startsWith("/"))) {
  const response = await fetch(`${BASE}${href}`, { redirect: "manual" });
  if (response.status >= 400) brokenLinks.push(`${response.status} ${href}`);
}
check(`enlaces internos del inicio sin 4xx/5xx (${links.length})`, brokenLinks.length === 0, brokenLinks);
await page.evaluate(() => window.scrollTo(0, 1500));
await sleep(300);
check("header sticky visible tras hacer scroll", await page.evaluate(() => { const r = document.querySelector("body > header, header").getBoundingClientRect(); return r.top === 0 && r.height > 0; }));
await page.keyboard.press("Tab");
check("primer Tab: «Saltar al contenido»", (await page.evaluate(() => document.activeElement?.textContent?.trim())) === "Saltar al contenido");
for (const width of [320, 390, 768, 1440]) {
  await page.setViewport({ width, height: 900 });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  check(`inicio ${width}px sin overflow horizontal`, !(await metrics(page)).overflowX);
}
await ctx.close();

// ---------------------------------------------------------------------------
console.log("== Catálogo y búsqueda completa");
ctx = await browser.createBrowserContext();
page = await newPage(ctx, 1440);
await guard(page);
const search = async (q) => {
  await page.goto(`${BASE}/productos?q=${encodeURIComponent(q)}`, { waitUntil: "networkidle0" });
  return productNames(page);
};
const cola = await search("cola");
check(`«cola» → 2 refrescos (${cola.length})`, cola.length === 2 && cola.every((n) => /cola/i.test(n)));
check("«COLA» igual que «cola»", JSON.stringify(await search("COLA")) === JSON.stringify(cola));
check("«japones» → Cacahuate japonés (sin acento)", (await search("japones")).some((n) => n.includes("japonés")));
check("«JAPONÉS» → Cacahuate japonés (mayúsculas y acento)", (await search("JAPONÉS")).some((n) => n.includes("japonés")));
check("«lacteos» → productos de Lácteos", (await search("lacteos")).some((n) => /Leche|Yogur/.test(n)));
// Varias palabras: cada una al inicio de una palabra de nombre, marca, subcategoría o categoría
// (la presentación no participa en la búsqueda completa; ver docs/catalog.md).
check("«refresco burbuja» (varias palabras) → 2 refrescos", (await search("refresco burbuja")).length === 2);
check("«cola leche» (palabras sin producto común) → 0", (await search("cola leche")).length === 0);
const none = await search("jabon");
check("«jabon» (no hay jabones en el catálogo) → estado vacío con salida", none.length === 0 && /Limpiar filtros|Ver todos/.test(await mainText(page)));
for (const q of ["%", "'", "\"<script>alert(1)</script>", "a_b", "100%", "(cola)"]) {
  const response = await fetch(`${BASE}/productos?q=${encodeURIComponent(q)}`);
  check(`búsqueda con caracteres especiales ${JSON.stringify(q)} → ${response.status}`, response.status === 200);
}
await page.goto(`${BASE}/productos?q=${encodeURIComponent("<b>x</b>")}`, { waitUntil: "networkidle0" });
// La consulta se sanea (solo letras, números, espacios, - . ') y se muestra como texto.
check("la consulta con HTML no inyecta marcado", await page.evaluate(() => !document.querySelector("main b") && !document.querySelector("main h1").innerHTML.includes("<b>")));

await page.goto(`${BASE}/productos?categoria=bebidas&orden=precio-asc`, { waitUntil: "networkidle0" });
const prices = await page.evaluate(() => [...document.querySelectorAll("main article")].map((a) => Number((a.innerText.match(/\$(\d+\.\d\d)(?![\s\S]*\$\d)/) ?? [])[1])));
check(`bebidas por precio ascendente (${prices.join(", ")})`, prices.length > 1 && prices.every((p, i) => i === 0 || p >= prices[i - 1]));
check("título de la página = categoría", (await page.title()).startsWith("Bebidas"));
await page.goto(`${BASE}/productos?categoria=bebidas&subcategoria=refrescos`, { waitUntil: "networkidle0" });
check("subcategoría filtra (refrescos)", (await productNames(page)).every((n) => /Refresco/.test(n)));
await page.goto(`${BASE}/productos?categoria=bebidas&subcategoria=leche`, { waitUntil: "networkidle0" });
check("subcategoría de otra categoría → se ignora sin error", (await productNames(page)).length > 0);
await page.goto(`${BASE}/productos?categoria=no-existe&marca=nada&orden=raro&producto=no-uuid`, { waitUntil: "networkidle0" });
check("parámetros inválidos → catálogo completo", (await productNames(page)).length >= 10);
await page.goto(`${BASE}/productos?marca=burbuja`, { waitUntil: "networkidle0" });
const brand = await productNames(page);
check(`filtro por marca (Burbuja: ${brand.length})`, brand.length >= 1 && brand.length < 10);
// Limpiar filtros, back/forward y refresh
await page.goto(`${BASE}/productos?q=cola&categoria=bebidas`, { waitUntil: "networkidle0" });
const clear = await page.evaluateHandle(() => [...document.querySelectorAll("main a")].find((a) => a.textContent.includes("Limpiar filtros") && a.checkVisibility()));
await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => null), clear.click()]);
await page.waitForFunction(() => location.search === "", { timeout: 10000 }).catch(() => null);
check("«Limpiar filtros» → /productos sin parámetros", new URL(page.url()).search === "" && (await productNames(page)).length >= 10);
await page.goBack({ waitUntil: "networkidle0" });
await page.waitForFunction(() => location.search.includes("q=cola"), { timeout: 10000 }).catch(() => null);
await sleep(500);
check("Atrás restaura la búsqueda y sus resultados", new URL(page.url()).search.includes("q=cola") && (await productNames(page)).length === 2);
await page.goForward({ waitUntil: "networkidle0" });
await sleep(500);
check("Adelante vuelve al catálogo completo", (await productNames(page)).length >= 10);
await page.goto(`${BASE}/productos?q=cola`, { waitUntil: "networkidle0" });
await page.reload({ waitUntil: "networkidle0" });
check("refresh conserva la búsqueda", (await productNames(page)).length === 2);

// ---------------------------------------------------------------------------
console.log("== Búsqueda en el grid (sin dropdown)");
await page.goto(`${BASE}/productos`, { waitUntil: "networkidle0" });
const allCount = (await productNames(page)).length;
const searchInput = await visibleSearch(page);
await searchInput.click();
await searchInput.type("cola", { delay: 60 });
await page.waitForFunction(() => new URL(location.href).searchParams.get("q") === "cola", { timeout: 10000 }).catch(() => null);
await page.waitForFunction(() => !document.querySelector("[aria-busy=true]"), { timeout: 10000 }).catch(() => null);
let names = await productNames(page);
check("escribir filtra el grid en vivo (sin Enter): ?q=cola", new URL(page.url()).searchParams.get("q") === "cola" && names.length > 0 && names.length < allCount, names);
check("«cola» no trae «chocolate» (prefijo de palabra)", !names.some((name) => /chocolate/i.test(name)), names);
check("no existe dropdown/listbox de sugerencias", await page.evaluate(() => !document.querySelector("[role=listbox], [role=option], [role=combobox]")));
check("el campo conserva el foco y el texto (sin remontarse)", await page.evaluate(() => document.activeElement?.matches("header input[type=search]") && document.activeElement.value === "cola"));
check("conteo «N productos para “cola”»", /productos? para “cola”/.test(await text(page, "main [role=status]")));
await searchInput.click({ clickCount: 3 });
await page.keyboard.press("Backspace");
await page.waitForFunction(() => !new URL(location.href).searchParams.has("q"), { timeout: 10000 }).catch(() => null);
await page.waitForFunction(() => !document.querySelector("[aria-busy=true]"), { timeout: 10000 }).catch(() => null);
check("limpiar el campo quita ?q y el grid vuelve completo", !new URL(page.url()).searchParams.has("q") && (await productNames(page)).length === allCount);
// Atrás/adelante: el campo refleja la URL.
await searchInput.type("leche", { delay: 40 });
await page.waitForFunction(() => new URL(location.href).searchParams.get("q") === "leche", { timeout: 10000 }).catch(() => null);
await page.goto(`${BASE}/productos?q=agua`, { waitUntil: "networkidle0" });
await page.goBack({ waitUntil: "networkidle0" });
check("atrás → el campo muestra la búsqueda de la URL", await page.evaluate(() => [...document.querySelectorAll("header input[type=search]")].every((input) => input.value === new URL(location.href).searchParams.get("q"))));
await page.goForward({ waitUntil: "networkidle0" });
check("adelante → ?q=agua en el campo y en el grid", await page.evaluate(() => [...document.querySelectorAll("header input[type=search]")].every((input) => input.value === "agua")) && (await productNames(page)).every((name) => /agua/i.test(name)));
// Búsqueda + filtros: la categoría se conserva al escribir.
await page.goto(`${BASE}/productos?categoria=bebidas`, { waitUntil: "networkidle0" });
await (await visibleSearch(page)).type("agua", { delay: 40 });
await page.waitForFunction(() => new URL(location.href).searchParams.get("q") === "agua", { timeout: 10000 }).catch(() => null);
check("escribir conserva categoría (q + categoria)", new URL(page.url()).searchParams.get("categoria") === "bebidas");

console.log("== Búsqueda desde el inicio");
await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
await (await visibleSearch(page)).type("a", { delay: 40 });
await sleep(700);
check("1 carácter en el inicio → no navega todavía", new URL(page.url()).pathname === "/");
await page.keyboard.type("gua", { delay: 40 });
await page.waitForFunction(() => location.pathname === "/productos", { timeout: 10000 }).catch(() => null);
await page.waitForFunction(() => document.querySelectorAll("main article").length > 0, { timeout: 10000 }).catch(() => null);
check("al escribir «agua» en el inicio lleva a /productos?q=agua", new URL(page.url()).pathname === "/productos" && new URL(page.url()).searchParams.get("q") === "agua");
check("el campo conserva foco y texto tras navegar", await page.evaluate(() => document.activeElement?.matches("header input[type=search]") && document.activeElement.value === "agua"));
check("sin dropdown en el inicio", await page.evaluate(() => !document.querySelector("[role=listbox]")));

console.log("== ?page= (catálogo semilla: 1 página de 24)");
await page.goto(`${BASE}/productos?page=99`, { waitUntil: "networkidle0" });
check("página inexistente → «Esta página no existe» con acciones, sin paginación", /Esta página no existe/.test(await mainText(page)) && !(await page.$("nav[aria-label='Paginación de productos']")));
for (const value of ["abc", "0", "-3", "1.5"]) {
  const response = await page.goto(`${BASE}/productos?page=${value}`, { waitUntil: "networkidle0" });
  check(`?page=${value} → página 1 sin error (${response.status()})`, response.status() === 200 && (await productNames(page)).length === allCount);
}
check("una sola página → sin paginación", !(await page.$("nav[aria-label='Paginación de productos']")));
await ctx.close();

// ---------------------------------------------------------------------------
console.log("== Carrito");
ctx = await browser.createBrowserContext();
page = await newPage(ctx, 390);
await guard(page);
await page.goto(`${BASE}/carrito`, { waitUntil: "networkidle0" });
check("carrito vacío con CTA a productos", /Tu carrito está vacío/.test(await mainText(page)) && await page.evaluate(() => Boolean([...document.querySelectorAll("main a[href='/productos']")].length)));
const add = async (q) => {
  await page.goto(`${BASE}/productos?q=${encodeURIComponent(q)}`, { waitUntil: "networkidle0" });
  await page.evaluate(() => document.querySelector("main article button[aria-label^='Agregar']")?.click());
  await sleep(500);
};
await add("detergente");
await add("leche entera");
await add("agua");
check("contador del header = 3 productos", /3 productos/.test(await cartCount(page)), await cartCount(page));
await page.goto(`${BASE}/carrito`, { waitUntil: "networkidle0" });
await page.waitForFunction(() => document.querySelector("main")?.innerText.includes("Subtotal"), { timeout: 15000 }).catch(() => null);
let cartText = await mainText(page);
check("carrito con varios productos y promoción (Detergente $37.00)", /Detergente en polvo/.test(cartText) && /\$37\.00/.test(cartText) && /Leche entera/.test(cartText));
await page.evaluate(() => [...document.querySelectorAll("main button[aria-label^='Aumentar cantidad de Leche']")].find((b) => b.checkVisibility())?.click());
await sleep(400);
check("+ aumenta la cantidad", await page.evaluate(() => [...document.querySelectorAll("main input[aria-label^='Cantidad de Leche']")].find((i) => i.checkVisibility())?.value === "2"));
const qty = await page.evaluateHandle(() => [...document.querySelectorAll("main input[aria-label^='Cantidad de Leche']")].find((i) => i.checkVisibility()));
await qty.click({ clickCount: 3 });
await qty.type("150");
await page.keyboard.press("Tab");
await sleep(400);
check("cantidad: máximo 2 dígitos (1 a 99)", Number(await qty.evaluate((i) => i.value)) <= 99 && (await qty.evaluate((i) => i.maxLength)) === 2);
await qty.click({ clickCount: 3 });
await qty.type("0");
await page.keyboard.press("Tab");
await sleep(400);
check("cantidad 0 → no se acepta (vuelve a un valor válido)", Number(await qty.evaluate((i) => i.value)) >= 1);
await qty.click({ clickCount: 3 });
await qty.type("2");
await page.keyboard.press("Enter");
await sleep(300);
await page.reload({ waitUntil: "networkidle0" });
await page.waitForFunction(() => document.querySelector("main")?.innerText.includes("Subtotal"), { timeout: 15000 }).catch(() => null);
check("refresh conserva productos y cantidades", /Leche entera/.test(await mainText(page)) && await page.evaluate(() => [...document.querySelectorAll("main input[aria-label^='Cantidad de Leche']")].find((i) => i.checkVisibility())?.value === "2"));
// Multitab: otra pestaña del mismo navegador recibe el cambio (evento storage).
const other = await newPage(ctx, 390);
await guard(other);
await other.goto(`${BASE}/`, { waitUntil: "networkidle0" });
const otherBefore = await cartCount(other);
await page.bringToFront();
const removed = await page.evaluate(() => { const b = [...document.querySelectorAll("main button[aria-label^='Eliminar Agua']")].find((b) => b.checkVisibility()); b?.click(); return Boolean(b); });
await sleep(800);
// El contador cuenta unidades (Leche ×2): la otra pestaña debe coincidir y haber cambiado.
check("multitab: la otra pestaña se actualiza al quitar un producto", removed && (await cartCount(other)) === (await cartCount(page)) && (await cartCount(other)) !== otherBefore, { before: otherBefore, page: await cartCount(page), other: await cartCount(other) });
await other.close();
check("UI de 360px del carrito sin overflow", !(await metrics(page)).overflowX);
// Vaciar con confirmación
await page.evaluate(() => [...document.querySelectorAll("main button")].find((b) => b.textContent.trim() === "Vaciar carrito")?.click());
await sleep(200);
check("Vaciar pide confirmación y enfoca «Cancelar»", (await page.evaluate(() => document.activeElement?.textContent.trim())) === "Cancelar");
await page.keyboard.press("Enter");
await sleep(200);
check("Cancelar conserva el carrito", /Leche entera/.test(await mainText(page)));
// Producto que ya no existe (id desconocido) en el storage.
await page.evaluate(() => {
  const cart = JSON.parse(localStorage.getItem("abarrotes-alex:cart"));
  cart.items.push({ productId: "00000000-0000-4000-8000-000000000001", quantity: 1 });
  localStorage.setItem("abarrotes-alex:cart", JSON.stringify(cart));
});
await page.reload({ waitUntil: "networkidle0" });
await sleep(1000);
cartText = await mainText(page);
check("producto inexistente → marcado como no disponible", /no (está )?disponible|ya no está/i.test(cartText), cartText.slice(0, 300));
await page.goto(`${BASE}/checkout`, { waitUntil: "networkidle0" });
await sleep(800);
check("checkout bloquea el envío con un producto no disponible", await page.evaluate(() => { const b = [...document.querySelectorAll("main button[type=submit]")][0]; return !b || b.disabled || b.getAttribute("aria-disabled") === "true"; }) || /no disponible|Revisa tu carrito/i.test(await mainText(page)));
// Storage corrupto
for (const corrupt of ["{no json", JSON.stringify({ version: 9, items: [] }), JSON.stringify({ version: 1, branchId: "x", items: "no" })]) {
  await page.evaluate((value) => localStorage.setItem("abarrotes-alex:cart", value), corrupt);
  await page.goto(`${BASE}/carrito`, { waitUntil: "networkidle0" });
  check(`storage corrupto ${corrupt.slice(0, 22)}… → carrito vacío sin error`, /Tu carrito está vacío/.test(await mainText(page)));
}
// /api/carrito caído
await page.evaluate(() => localStorage.setItem("abarrotes-alex:cart", JSON.stringify({ version: 1, branchId: null, items: [] })));
await add("agua");
await page.close();
page = await newPage(ctx, 390);
await guard(page, { "/api/carrito": () => "abort" });
await page.goto(`${BASE}/carrito`, { waitUntil: "networkidle0" });
await sleep(1500);
check("/api/carrito caído → mensaje con Reintentar (productos conservados)", /No pudimos cargar tu carrito/.test(await mainText(page)) && /Agua/.test(await page.evaluate(() => localStorage.getItem("abarrotes-alex:cart") ? "Agua" : "")));
await ctx.close();

// ---------------------------------------------------------------------------
console.log("== Checkout (mock de /api/pedidos: nada llega al servidor)");
ctx = await browser.createBrowserContext();
page = await newPage(ctx, 390);
let lastBody = null;
let mode = "invalid";
await guard(page, {
  pedidos: (body) => {
    lastBody = body;
    if (mode === "abort") return "abort";
    if (mode === "server") return { status: 500, body: { error: { code: "SERVER_ERROR", message: "x" } } };
    if (mode === "invalid") return { status: 400, body: { error: { code: "INVALID_CHECKOUT_DATA", message: "x", fields: ["customer.phone"] } } };
    const items = body.items.map((item, index) => ({ productId: item.productId, name: index === 0 ? "Café de olla «ñandú» & cía" : "Agua natural", presentation: "1 L", unitPriceCents: 1500, quantity: item.quantity, subtotalCents: 1500 * item.quantity }));
    const subtotal = items.reduce((sum, item) => sum + item.subtotalCents, 0);
    return {
      delay: 1200,
      status: 201,
      body: { order: { orderId: "00000000-0000-4000-8000-000000000999", folio: MOCK_FOLIO, status: "new", createdAt: new Date().toISOString(), deliveryType: body.delivery.type, paymentMethod: "cash", subtotalCents: subtotal, shippingCents: null, totalCents: subtotal, replayed: false, branch: { name: "Sucursal Sintética", whatsappNumber: "5215500000000" }, items } },
    };
  },
});
await page.goto(`${BASE}/checkout`, { waitUntil: "networkidle0" });
check("checkout vacío → invita a ver productos", /Tu carrito está vacío/.test(await mainText(page)));
await add("agua");
await add("leche entera");
await page.goto(`${BASE}/checkout`, { waitUntil: "networkidle0" });
await page.waitForSelector("#checkout-nombre", { timeout: 15000 });
const attrs = await page.evaluate(() => Object.fromEntries(["#checkout-nombre", "#checkout-telefono", "#checkout-efectivo"].map((s) => { const e = document.querySelector(s); return [s, `${e.type}|${e.inputMode}|${e.autocomplete}`]; })));
check("autocomplete / inputmode (name, tel, decimal)", attrs["#checkout-nombre"].includes("name") && attrs["#checkout-telefono"] === "tel|tel|tel-national" && attrs["#checkout-efectivo"].includes("decimal"), attrs);
check("resumen con envío por confirmar", /por confirmar/i.test(await mainText(page)));
const submit = () => page.evaluate(() => document.querySelector("main form button[type=submit]")?.click());
await submit();
await sleep(500);
check("enviar vacío → errores y foco en el primer campo inválido", (await page.evaluate(() => document.activeElement?.id)) === "checkout-nombre" && mockedOrderRequests === 0);
check("campos inválidos con aria-invalid y mensaje asociado", await page.evaluate(() => { const e = document.querySelector("#checkout-nombre"); return e.getAttribute("aria-invalid") === "true" && (e.getAttribute("aria-describedby") ?? "").split(" ").some((id) => document.getElementById(id)?.textContent.trim()); }));
await page.type("#checkout-nombre", "Cliente QA Ñandú");
await page.type("#checkout-telefono", "12");
await submit();
await sleep(400);
check("teléfono inválido → foco en teléfono", (await page.evaluate(() => document.activeElement?.id)) === "checkout-telefono");
await page.click("#checkout-telefono", { clickCount: 3 });
await page.type("#checkout-telefono", "5500000000");
const deliveryVisible = () => page.evaluate(() => Boolean(document.querySelector("#checkout-direccion")?.checkVisibility()));
const chooseDelivery = (type) => page.evaluate((t) => { const radio = [...document.querySelectorAll("main input[type=radio]")].find((r) => r.value === t); radio?.click(); return Boolean(radio); }, type);
await chooseDelivery("pickup");
await sleep(200);
const pickupHidesAddress = !(await deliveryVisible());
await chooseDelivery("delivery");
await sleep(200);
check("recoger oculta la dirección; domicilio la muestra", pickupHidesAddress && (await deliveryVisible()));
await submit();
await sleep(400);
check("domicilio sin dirección → foco en Dirección", (await page.evaluate(() => document.activeElement?.id)) === "checkout-direccion");
await page.type("#checkout-direccion", "Calle Sintética 123");
await page.type("#checkout-colonia", "Centro");
await page.type("#checkout-referencias", "Portón azul, entre 1 y 2");
await page.type("#checkout-efectivo", "1");
await page.keyboard.press("Tab");
await submit();
await sleep(400);
check("efectivo menor al total → error en efectivo", (await page.evaluate(() => document.activeElement?.id)) === "checkout-efectivo" && mockedOrderRequests === 0);
await page.click("#checkout-efectivo", { clickCount: 3 });
await page.type("#checkout-efectivo", "500");
await sleep(300);
check("cambio aproximado visible con efectivo mayor", /cambio/i.test(await mainText(page)));
await page.type("#checkout-notas", "Sin bolsa; tocar el timbre 🔔");
check("checkout 360px sin overflow", !(await metrics(page)).overflowX);
for (const [width, height, label] of [[320, 640, "320px"], [720, 450, "zoom 200% (720×450)"]]) {
  await page.setViewport({ width, height });
  await sleep(300);
  const reachable = await page.evaluate(() => { const b = document.querySelector("main form button[type=submit]"); b?.scrollIntoView({ block: "center" }); const r = b?.getBoundingClientRect(); return Boolean(r && r.width > 0 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight); });
  check(`checkout ${label}: sin overflow y botón de envío alcanzable`, !(await metrics(page)).overflowX && reachable);
}
await page.setViewport({ width: 390, height: 844 });
// Error del servidor por campo (mock): foco en teléfono y carrito intacto.
mode = "invalid";
await submit();
await sleep(800);
check("INVALID_CHECKOUT_DATA del servidor → foco en el campo señalado", (await page.evaluate(() => document.activeElement?.id)) === "checkout-telefono" && mockedOrderRequests === 1);
check("el request no incluye precios del cliente (solo ids y cantidades)", lastBody && lastBody.items.every((item) => Object.keys(item).sort().join() === "productId,quantity"));
mode = "abort";
await submit();
await sleep(800);
check("error de red → mensaje con reintento y carrito conservado", /conexión|red|intentar/i.test(await mainText(page)) && /2 productos/.test(await cartCount(page)));
const attemptId = lastBody.clientRequestId;
mode = "server";
await submit();
await sleep(800);
check("reintento usa el mismo clientRequestId (idempotencia)", lastBody.clientRequestId === attemptId);
check("error 500 → mensaje genérico, sin detalles técnicos", !/SERVER_ERROR|stack|postgres/i.test(await mainText(page)));
mode = "ok";
await submit();
await sleep(300);
check("estado de envío visible (botón deshabilitado/ocupado)", await page.evaluate(() => { const b = document.querySelector("main form button[type=submit]"); return Boolean(b?.disabled || b?.getAttribute("aria-busy") === "true" || b?.getAttribute("aria-disabled") === "true"); }));
await page.waitForFunction((folio) => location.pathname === `/pedido/${folio}`, { timeout: 15000 }, MOCK_FOLIO).catch(() => null);
await sleep(800);

console.log("== Confirmación (comprobante sintético)");
const confirmation = await mainText(page);
check("confirmación con folio, productos y total", confirmation.includes(MOCK_FOLIO) && confirmation.includes("Agua natural") && /Total/.test(confirmation));
check("carrito vacío tras el pedido", !/\d+ productos?/.test(await cartCount(page)) || /0 productos|vacío/.test(await cartCount(page)));
const wa = await page.evaluate(() => document.querySelector("a[href^='https://wa.me/']")?.getAttribute("href"));
const waText = wa ? decodeURIComponent(new URL(wa).searchParams.get("text") ?? "") : "";
check("enlace de WhatsApp al número de la sucursal", Boolean(wa) && new URL(wa).pathname === "/5215500000000");
check("mensaje de WhatsApp: folio, ñ, «», &, saltos de línea, emoji", waText.includes(MOCK_FOLIO) && waText.includes("ñandú") && waText.includes("«") && waText.includes("& cía") && waText.includes("\n") && waText.includes("🔔"), waText.slice(0, 200));
check("enlace de WhatsApp se abre en pestaña nueva y sin opener", await page.evaluate(() => { const a = document.querySelector("a[href^='https://wa.me/']"); return a?.target === "_blank" && /noopener|noreferrer/.test(a.rel); }));
await page.reload({ waitUntil: "networkidle0" });
await sleep(500);
check("refresh conserva el comprobante (sessionStorage)", (await mainText(page)).includes("Agua natural"));
const fresh = await newPage(await browser.createBrowserContext(), 390);
await fresh.goto(`${BASE}/pedido/${MOCK_FOLIO}`, { waitUntil: "networkidle0" });
const freshText = await mainText(fresh);
check("otro navegador: sin comprobante ni datos del pedido (privacidad)", !freshText.includes("Agua natural") && !freshText.includes("Ñandú") && freshText.includes(MOCK_FOLIO));
await fresh.browserContext().close();
check(`ninguna petición a /api/pedidos llegó al servidor (${mockedOrderRequests} simuladas)`, realOrderRequests === 0 && mockedOrderRequests >= 4);
// Limpieza: carrito vacío y sin comprobantes sintéticos.
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
await ctx.close();

const issues = relevantConsole().filter((issue) => !/net::ERR_FAILED|Failed to load resource/.test(issue.text));
check(`consola sin errores (${issues.length})`, issues.length === 0, issues.slice(0, 4));
await browser.close();
summary("Tienda");
