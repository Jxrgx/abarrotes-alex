// Precios por mayoreo en el navegador (docs/wholesale.md) sobre el catálogo SINTÉTICO del
// modo `fixture` (tests/e2e/fixture-data.mjs). Requiere una instancia LOCAL:
//   npm run build
//   QA_FAULT_FILE=<archivo con "fixture"> NODE_OPTIONS="--import ./tests/e2e/fault-injection.mjs" npx next start -p 3101
//   E2E_BASE_URL=http://localhost:3101 npm run test:e2e:wholesale
// No crea datos: el catálogo vive en memoria del proceso local, las escrituras REST están
// bloqueadas en ese modo y /api/pedidos se intercepta en el navegador (0 pedidos).
import { BASE, check, hasCreds, launch, login, mainText, newPage, relevantConsole, screenshot, sleep, summary } from "./lib.mjs";

if (!/localhost|127\.0\.0\.1/.test(BASE)) throw new Error("Solo contra una instancia local con el modo fixture.");

const card = (page, name) =>
  page.evaluate((n) => {
    const article = [...document.querySelectorAll("main article")].find((a) => a.querySelector("h2, h3")?.textContent.trim() === n);
    if (!article) return null;
    return {
      text: article.innerText.replace(/\s+/g, " "),
      hint: [...article.querySelectorAll("p")].find((p) => /^Mayoreo/.test(p.textContent.trim()))?.textContent.trim() ?? null,
      height: Math.round(article.getBoundingClientRect().height),
    };
  }, name);
const clickIn = (page, name, label) =>
  page.evaluate(
    (n, l) => {
      const article = [...document.querySelectorAll("main article")].find((a) => a.querySelector("h2, h3")?.textContent.trim() === n);
      const button = [...(article?.querySelectorAll("button") ?? [])].find((b) => (b.getAttribute("aria-label") ?? b.textContent).startsWith(l));
      button?.click();
      return Boolean(button);
    },
    name,
    label,
  );
const announced = (page) => page.evaluate(() => document.querySelector("[aria-live=polite]")?.textContent ?? "");
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);

let orderBody = null;
let orderRequests = 0;
async function guard(page) {
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (request.isInterceptResolutionHandled()) return;
    if (new URL(request.url()).pathname === "/api/pedidos") {
      orderRequests++;
      orderBody = JSON.parse(request.postData() ?? "null");
      return request.abort("failed");
    }
    return request.continue();
  });
}

const browser = await launch();
try {
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx, 390);
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await guard(page);

  console.log("== Tarjetas (390)");
  await page.goto(`${BASE}/productos`, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle0" });
  const globito = await card(page, "Globito");
  check("Globito: «Mayoreo desde 3 pzas · $20.00 c/u»", globito?.hint === "Mayoreo desde 3 pzas · $20.00 c/u", globito);
  const cola = await card(page, "Refresco de cola");
  check("oferta + mayoreo: badge «Oferta», precio $19.00 tachado $22.00 y «Mayoreo desde 6 pzas · $18.00»", /Oferta/.test(cola?.text) && /\$19\.00/.test(cola?.text) && /\$22\.00/.test(cola?.text) && cola?.hint === "Mayoreo desde 6 pzas · $18.00 c/u", cola);
  check("rango acotado: «Mayoreo de 3 a 5 pzas»", (await card(page, "Agua natural"))?.hint === "Mayoreo de 3 a 5 pzas · $13.50 c/u");
  const galletas = await card(page, "Galletas de chocolate");
  check("solo oferta: sin mayoreo («Oferta» reservado a promociones)", galletas?.hint === null && /Oferta/.test(galletas?.text));
  const jabon = await card(page, "Jabón de barra");
  check("agotado: muestra mayoreo pero no se puede agregar", jabon?.hint === "Mayoreo desde 4 pzas · $16.00 c/u" && /Agotado/.test(jabon?.text) && !(await clickIn(page, "Jabón de barra", "Agregar")));
  check("por peso: sin mayoreo", (await card(page, "Cacahuate japonés a granel"))?.hint === null);
  const leche = await card(page, "Leche entera");
  check(`tarjeta con mayoreo no crece en exceso (${globito?.height}px vs ${leche?.height}px sin mayoreo)`, globito && leche && globito.height - leche.height <= 48, { globito: globito?.height, leche: leche?.height });
  check("390: sin desbordamiento horizontal", !(await overflow(page)));
  await screenshot(page, "mayoreo-productos-390.png", { fullPage: true });

  console.log("== Stepper en la tarjeta: 1 → 2 → 3 → 2");
  await clickIn(page, "Globito", "Agregar");
  await sleep(300);
  check("1: «Mayoreo desde 3 pzas»", (await card(page, "Globito")).hint === "Mayoreo desde 3 pzas · $20.00 c/u");
  await clickIn(page, "Globito", "Aumentar");
  await sleep(300);
  check("2: «Mayoreo: agrega 1 más y paga $20.00 c/u»", (await card(page, "Globito")).hint === "Mayoreo: agrega 1 más y paga $20.00 c/u");
  await clickIn(page, "Globito", "Aumentar");
  await sleep(300);
  check("3: «Mayoreo aplicado · $20.00 c/u»", (await card(page, "Globito")).hint === "Mayoreo aplicado · $20.00 c/u");
  check("aria-live anuncia el precio mayoreo al alcanzarlo (texto, no solo color)", /Precio mayoreo aplicado: \$20\.00 cada uno/.test(await announced(page)), await announced(page));
  await clickIn(page, "Globito", "Aumentar");
  await sleep(300);
  check("4: orienta al siguiente nivel «agrega 2 más y paga $18.50»", (await card(page, "Globito")).hint === "Mayoreo: agrega 2 más y paga $18.50 c/u");
  await clickIn(page, "Globito", "Disminuir");
  await clickIn(page, "Globito", "Disminuir");
  await sleep(300);
  check("de vuelta a 2: vuelve a orientar y anuncia que ya no aplica", (await card(page, "Globito")).hint === "Mayoreo: agrega 1 más y paga $20.00 c/u" && /Ya no aplica el precio mayoreo/.test(await announced(page)));
  await screenshot(page, "mayoreo-tarjeta-stepper-390.png");

  console.log("== Carrito: 2 → 3 → 2 → 6 → 12");
  await page.goto(`${BASE}/carrito`, { waitUntil: "networkidle0" });
  const line = () =>
    page.evaluate(() => {
      const li = [...document.querySelectorAll("main li")].find((item) => /Globito/.test(item.textContent));
      return {
        text: li?.innerText.replace(/\s+/g, " ") ?? "",
        subtotal: document.querySelector("#carrito-resumen")?.closest("section")?.querySelector("dd")?.textContent.trim(),
      };
    });
  const setQuantity = async (value) => {
    const input = await page.$("main li input[inputmode=numeric]");
    await input.click({ clickCount: 3 });
    await input.type(String(value));
    await page.keyboard.press("Enter");
    await sleep(400);
  };
  let current = await line();
  check("2: $22.00 c/u · $44.00 y «Agrega 1 más para obtener $20.00 c/u»", /\$22\.00 c\/u/.test(current.text) && /\$44\.00/.test(current.text) && /Agrega 1 más para obtener \$20\.00 c\/u/.test(current.text) && current.subtotal === "$44.00", current);
  await page.evaluate(() => [...document.querySelectorAll("main li button")].find((b) => /Aumentar/.test(b.getAttribute("aria-label") ?? ""))?.click());
  await sleep(400);
  current = await line();
  check("3: badge «Mayoreo», $20.00 c/u (normal tachado) y subtotal $60.00 al instante", /Mayoreo/.test(current.text) && /\$20\.00 c\/u/.test(current.text) && /\$22\.00/.test(current.text) && current.subtotal === "$60.00", current);
  check("3: siguiente nivel discreto «Agrega 3 más para obtener $18.50 c/u»", /Agrega 3 más para obtener \$18\.50 c\/u/.test(current.text));
  await screenshot(page, "mayoreo-carrito-390.png", { fullPage: true });
  await page.evaluate(() => [...document.querySelectorAll("main li button")].find((b) => /Disminuir/.test(b.getAttribute("aria-label") ?? ""))?.click());
  await sleep(400);
  check("3 → 2: vuelve a $44.00", (await line()).subtotal === "$44.00");
  await setQuantity(6);
  check("6: 6 × $18.50 = $111.00", (await line()).subtotal === "$111.00", await line());
  await setQuantity(12);
  current = await line();
  check("12: 12 × $17.00 = $204.00, sin siguiente nivel", current.subtotal === "$204.00" && !/Agrega \d+ más/.test(current.text), current);
  const stored = await page.evaluate(() => localStorage.getItem("abarrotes-alex:cart"));
  check("localStorage guarda solo productId y quantity (sin precios)", /"quantity":12/.test(stored) && !/price|Price|pricing|Cents/.test(stored), stored);
  check("carrito 390: sin desbordamiento", !(await overflow(page)));

  console.log("== Checkout (interceptado)");
  await page.goto(`${BASE}/checkout`, { waitUntil: "networkidle0" });
  await page.waitForSelector("#checkout-nombre", { timeout: 15000 }).catch(() => null);
  const summaryText = await page.evaluate(() => document.getElementById("checkout-resumen")?.closest("section")?.innerText.replace(/\s+/g, " ") ?? "");
  check("resumen: etiqueta discreta «Mayoreo · $17.00 c/u» y $204.00", /Mayoreo · \$17\.00 c\/u/.test(summaryText) && /\$204\.00/.test(summaryText), summaryText.slice(0, 300));
  await page.evaluate(() => [...document.querySelectorAll("main input[type=radio]")].find((r) => r.value === "pickup")?.click());
  await sleep(300);
  await page.type("#checkout-nombre", "Cliente Sintético");
  await page.type("#checkout-telefono", "5500000000");
  await page.evaluate(() => document.querySelector("main form button[type=submit]")?.click());
  await sleep(800);
  const item = orderBody?.items?.[0] ?? {};
  check("el pedido enviado lleva solo ids y cantidades (sin precio ni tipo) y el subtotal visto (comparación)", orderRequests === 1 && JSON.stringify(Object.keys(item).sort()) === JSON.stringify(["productId", "quantity"]) && item.quantity === 12 && orderBody.expectedSubtotalCents === 20400, orderBody && { keys: Object.keys(item), expected: orderBody.expectedSubtotalCents });
  await page.evaluate(() => localStorage.clear());

  console.log("== Confirmación (comprobante sintético en sessionStorage)");
  await page.evaluate(() => {
    const receipt = {
      orderId: "f9000000-0000-4000-8000-000000000001", folio: "ALEX-QA0001", status: "new", createdAt: new Date().toISOString(),
      deliveryType: "pickup", paymentMethod: "cash", subtotalCents: 6000, shippingCents: null, totalCents: 6000, replayed: false,
      branch: { name: "Abarrotes Alex - Concepción Durán", whatsappNumber: null },
      items: [{ productId: "f0000000-0000-4000-8000-000000000001", name: "Globito", presentation: "220 g", unitPriceCents: 2000, quantity: 3, subtotalCents: 6000, pricingType: "wholesale" }],
    };
    sessionStorage.setItem("abarrotes-alex:order-confirmations", JSON.stringify({ "ALEX-QA0001": { receipt, contact: { name: "Cliente Sintético" }, savedAt: Date.now() } }));
  });
  await page.goto(`${BASE}/pedido/ALEX-QA0001`, { waitUntil: "networkidle0" });
  check("confirmación: «Precio mayoreo · $20.00 c/u» desde el snapshot", /Precio mayoreo · \$20\.00 c\/u/.test(await mainText(page)));
  await screenshot(page, "mayoreo-confirmacion-390.png", { fullPage: true });

  console.log("== Responsive (320, 430, 768, 1440)");
  for (const width of [320, 430, 768, 1440]) {
    const view = await newPage(ctx, width);
    await view.goto(`${BASE}/productos`, { waitUntil: "networkidle0" });
    const g = await card(view, "Globito");
    check(`${width}: tarjeta con mayoreo legible y sin desbordamiento`, g?.hint?.startsWith("Mayoreo") && !(await overflow(view)), g);
    await screenshot(view, `mayoreo-productos-${width}.png`, { fullPage: width < 768 });
    await view.close();
  }
  await ctx.close();

  console.log("== Panel (sesión real, solo lectura; escrituras bloqueadas por el modo fixture)");
  if (!hasCreds()) {
    console.log("  (sin credenciales: se omite el panel)");
  } else {
    const adminCtx = await browser.createBrowserContext();
    for (const width of [390, 1440]) {
      const admin = await newPage(adminCtx, width);
      if (width === 390) await admin.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      if (width === 390) await login(admin);
      await admin.goto(`${BASE}/admin/productos`, { waitUntil: "networkidle0" });
      const list = await mainText(admin);
      check(`${width}: listado muestra «Mayoreo desde 3 pzas»`, /Mayoreo desde 3 pzas/.test(list), list.slice(0, 200));
      await admin.evaluate(() => document.querySelector("button[aria-label='Editar Globito']")?.click());
      await admin.waitForSelector("dialog[open]", { timeout: 10000 }).catch(() => null);
      await sleep(400);
      const dialog = () => admin.evaluate(() => document.querySelector("dialog[open]")?.innerText.replace(/\s+/g, " ") ?? "");
      let text = await dialog();
      check(`${width}: sección «Precios por mayoreo» con descripción y 3 niveles`, /Precios por mayoreo/.test(text) && /Define precios especiales según la cantidad comprada\./.test(text) && (await admin.$$("dialog[open] ol[aria-label='Precios por mayoreo'] > li")).length === 3);
      check(`${width}: retroalimentación «3–5 pzas → $20.00 c/u · Ahorro $2.00 por pieza (9.1 %)» y «12+ pzas»`, /3–5 pzas → \$20\.00 c\/u · Ahorro \$2\.00 por pieza \(9\.1 %\)/.test(text) && /12\+ pzas/.test(text), text.slice(0, 600));
      check(`${width}: «Sin límite» marcado en el último nivel`, await admin.evaluate(() => [...document.querySelectorAll("dialog[open] ol[aria-label='Precios por mayoreo'] input[type=checkbox]")].at(-1)?.checked === true));
      await admin.evaluate(() => [...document.querySelectorAll("dialog[open] button")].find((b) => /Agregar precio por mayoreo/.test(b.textContent))?.click());
      await sleep(200);
      check(`${width}: «Agregar precio por mayoreo» agrega un nivel`, (await admin.$$("dialog[open] ol[aria-label='Precios por mayoreo'] > li")).length === 4);
      const targets = await admin.evaluate(() => [...document.querySelectorAll("dialog[open] ol[aria-label='Precios por mayoreo'] button, dialog[open] ol[aria-label='Precios por mayoreo'] input:not([type=hidden])")].filter((e) => e.type !== "checkbox").map((e) => Math.round(e.getBoundingClientRect().height)));
      check(`${width}: controles del editor ≥ 40 px (${[...new Set(targets)].join(", ")})`, targets.every((h) => h >= 40));
      await screenshot(admin, `mayoreo-admin-form-${width}.png`);
      // Por peso: el editor se oculta con explicación y aviso de eliminación.
      await admin.evaluate(() => [...document.querySelectorAll("dialog[open] input[type=radio][name=saleType]")].find((r) => r.value === "weight")?.click());
      await sleep(200);
      text = await dialog();
      check(`${width}: por peso → sin editor, explicación y aviso de que se eliminarán`, !(await admin.$("dialog[open] ol[aria-label='Precios por mayoreo']")) && /solo están disponibles para productos por unidad/.test(text) && /se eliminarán los 3 precios por mayoreo/.test(text));
      await admin.keyboard.press("Escape");
      await sleep(300);
      check(`${width}: cerrado sin guardar`, !(await admin.$("dialog[open]")));
      await admin.goto(`${BASE}/admin/pedidos/f9000000-0000-4000-8000-000000000001`, { waitUntil: "networkidle0" });
      const detail = await mainText(admin);
      check(`${width}: detalle del pedido: «Mayoreo» en la partida de mayoreo y «Oferta» en la de promoción`, /\$20\.00 c\/u Mayoreo/.test(detail) && /\$19\.00 c\/u Oferta/.test(detail), detail.slice(0, 400));
      check(`${width}: panel sin desbordamiento`, !(await overflow(admin)));
      await screenshot(admin, `mayoreo-admin-pedido-${width}.png`, { fullPage: true });
      await admin.close();
    }
    await adminCtx.close();
  }

  const issues = relevantConsole().filter((issue) => !/ERR_FAILED/.test(issue.text ?? ""));
  check(`consola sin errores (${issues.length})`, issues.length === 0, issues.slice(0, 3));
} finally {
  await browser.close();
}
summary("Precios por mayoreo");
