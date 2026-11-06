// Recorrido de compra guiado (UX): inicio → Agregar → barra "Ver mi pedido" → carrito →
// "Continuar pedido" → checkout por secciones (domicilio / recoger) → validaciones →
// confirmación con "Enviar pedido por WhatsApp". SIN credenciales.
//
// SEGURIDAD DE DATOS: no se confirma ningún pedido. Toda petición a /api/pedidos se
// aborta en el navegador (y se cuenta: debe ser 0). La confirmación usa un comprobante
// SINTÉTICO (ALEX-999999) escrito en sessionStorage. Al terminar, carrito y sesión vacíos.
// Las capturas quedan en tests/e2e/.artifacts/ (ignorado por git).
// Uso: npm run test:e2e:funnel   (E2E_BASE_URL para apuntar a otra instancia)
import { BASE, check, launch, mainText, newPage, relevantConsole, screenshot, sleep, summary } from "./lib.mjs";

const MOCK_FOLIO = "ALEX-999999";
let orderRequests = 0;

async function guard(page) {
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (request.isInterceptResolutionHandled()) return;
    if (new URL(request.url()).pathname === "/api/pedidos") {
      orderRequests++;
      return request.abort("failed");
    }
    return request.continue();
  });
}

const bar = (page) =>
  page.evaluate(() => {
    const link = [...document.querySelectorAll("a[href='/carrito']")].find((a) => a.textContent.includes("Ver mi pedido"));
    const box = link?.closest(".fixed");
    if (!box || !box.checkVisibility()) return null;
    const r = box.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, vh: innerHeight, text: box.innerText.replace(/\s+/g, " ").trim(), label: link.getAttribute("aria-label"), linkHeight: link.getBoundingClientRect().height };
  });
const headings = (page) => page.evaluate(() => [...document.querySelectorAll("main form h2")].filter((h) => h.checkVisibility()).map((h) => h.textContent.replace(/\s+/g, " ").trim()));
const stepNumbers = (page) => page.evaluate(() => [...document.querySelectorAll("main form section > div > span[aria-hidden=true]")].filter((e) => e.checkVisibility()).map((e) => e.textContent.trim()));
async function tap(page, finder) {
  const handle = (await page.evaluateHandle(finder)).asElement();
  if (!handle) return false;
  await handle.evaluate((e) => e.scrollIntoView({ block: "center" }));
  await handle.tap();
  return true;
}

const browser = await launch();
try {
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx, 390);
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await guard(page);

  console.log("== Inicio sin carrito (390)");
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "networkidle0" });
  const hero = await page.evaluate(() => document.querySelector("#hero-title")?.closest("section")?.innerText.replace(/\s+/g, " ") ?? "");
  check("hero explica el proceso: carrito → datos → WhatsApp", /Haz tu pedido fácil y rápido/.test(hero) && /carrito/.test(hero) && /datos/.test(hero) && /WhatsApp/.test(hero), hero);
  check("beneficios visibles en móvil (domicilio, sucursal, efectivo)", await page.evaluate(() => ["Entrega a domicilio", "Recoge en sucursal", "Pago en efectivo"].every((t) => [...document.querySelectorAll("#hero-title ~ ul li, section ul li")].some((li) => li.checkVisibility() && li.textContent.includes(t)))));
  check("CTA principal «Ver productos»", await page.evaluate(() => [...document.querySelectorAll("main a")].some((a) => a.checkVisibility() && a.textContent.trim().startsWith("Ver productos"))));
  check("sin productos en el carrito no hay barra «Ver mi pedido»", (await bar(page)) === null);
  await screenshot(page, "funnel-home-vacio-390.png");

  console.log("== Agregar → aparece la barra");
  check("tocar «Agregar» en el inicio", await tap(page, () => [...document.querySelectorAll("main #productos article button[aria-label^='Agregar']")].find((b) => b.checkVisibility())));
  await sleep(500);
  let b = await bar(page);
  check("barra visible con cantidad y «Ver mi pedido»", b && /1 producto/.test(b.text) && /Ver mi pedido/.test(b.text) && /1 producto/.test(b.label), b);
  check("barra anclada al fondo, botón ≥ 44px", b && Math.abs(b.bottom - b.vh) <= 1 && b.linkHeight >= 44, b);
  check("la tarjeta muestra el selector de cantidad (feedback conservado)", await page.evaluate(() => Boolean(document.querySelector("main #productos article [aria-label*='Aumentar'], main #productos article [aria-label*='Quitar'], main #productos article [aria-label*='Disminuir']"))));
  await tap(page, () => [...document.querySelectorAll("main #productos article button[aria-label^='Agregar']")].find((b) => b.checkVisibility()));
  await sleep(400);
  b = await bar(page);
  check("la barra se actualiza (2 productos)", b && /2 productos/.test(b.text), b);
  await screenshot(page, "funnel-home-con-carrito-390.png");
  // No tapa el contenido: al final de la página, el footer termina antes de la barra.
  const end = await page.evaluate(() => { scrollTo(0, document.documentElement.scrollHeight); const f = document.querySelector("footer").getBoundingClientRect(); return { footerBottom: f.bottom }; });
  await sleep(300);
  b = await bar(page);
  check("al final de la página el footer no queda bajo la barra", b && end.footerBottom <= b.top + 1, { ...end, barTop: b?.top });
  await page.evaluate(() => scrollTo(0, 0));
  // Escribiendo en la búsqueda (teclado abierto) la barra se oculta.
  await page.evaluate(() => [...document.querySelectorAll("header input[role=combobox]")].find((e) => e.checkVisibility())?.focus());
  await sleep(200);
  check("con la búsqueda enfocada la barra se oculta", (await bar(page)) === null);
  await page.evaluate(() => document.activeElement?.blur());

  console.log("== /productos con carrito");
  await page.goto(`${BASE}/productos`, { waitUntil: "networkidle0" });
  check("barra visible en /productos", Boolean(await bar(page)));
  await screenshot(page, "funnel-productos-con-carrito-390.png");
  await tap(page, () => [...document.querySelectorAll("main button")].find((x) => x.checkVisibility() && x.textContent.includes("Filtros")));
  await sleep(400);
  const covered = await page.evaluate(() => {
    const link = [...document.querySelectorAll("a[href='/carrito']")].find((a) => a.textContent.includes("Ver mi pedido"));
    const r = link.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return Boolean(document.querySelector("dialog[open]")) && !link.contains(top);
  });
  check("con Filtros abierto la barra queda debajo del diálogo", covered);
  await page.keyboard.press("Escape");
  await sleep(200);

  console.log("== Desktop (sin barra; carrito del header)");
  for (const width of [768, 1440]) {
    await page.setViewport({ width, height: 900 });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
    check(`[${width}] sin barra inferior; contador en el header`, (await bar(page)) === null && /2 productos/.test(await page.evaluate(() => document.querySelector("header a[href='/carrito']")?.getAttribute("aria-label") ?? "")));
  }
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  console.log("== Ver mi pedido → carrito");
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await tap(page, () => [...document.querySelectorAll("a[href='/carrito']")].find((a) => a.textContent.includes("Ver mi pedido")));
  await page.waitForFunction(() => location.pathname === "/carrito", { timeout: 10000 }).catch(() => null);
  await page.waitForFunction(() => /Continuar pedido/.test(document.querySelector("main")?.innerText ?? ""), { timeout: 15000 }).catch(() => null);
  let text = await mainText(page);
  check("«Ver mi pedido» lleva al carrito", new URL(page.url()).pathname === "/carrito");
  check("carrito: «Tu pedido» + ayuda", /Tu pedido/.test(text) && /Revisa los productos y ajusta las cantidades antes de continuar/.test(text), text.slice(0, 160));
  check("carrito: subtotal, envío por confirmar y «Continuar pedido»", /Subtotal/.test(text) && /Envío\s*Por confirmar/i.test(text) && /Continuar pedido/.test(text));
  check("carrito: sin lenguaje de pago en línea", !/Comprar ahora|Pagar ahora|Finalizar compra|checkout/i.test(text));
  check("carrito: sin barra «Ver mi pedido» (tiene su propia acción)", (await bar(page)) === null);
  await screenshot(page, "funnel-carrito-390.png", { fullPage: true });

  console.log("== Continuar pedido → checkout por secciones");
  await tap(page, () => [...document.querySelectorAll("main a[href='/checkout']")].find((a) => a.checkVisibility()));
  await page.waitForSelector("#checkout-nombre", { timeout: 15000 }).catch(() => null);
  text = await mainText(page);
  check("checkout: «Completa tu pedido», sin barra inferior", /Completa tu pedido/.test(text) && (await bar(page)) === null);
  check("checkout móvil: arriba se recuerda cantidad y monto", /2 productos · \$[\d,.]+ \+ envío/.test(text), text.slice(0, 200));
  let h = await headings(page);
  check("domicilio: Entrega → Tus datos → Dirección → Pago → Comentarios", JSON.stringify(h.slice(0, 5)) === JSON.stringify(["Entrega", "Tus datos", "Dirección de entrega", "Pago", "Comentarios"]), h);
  check("domicilio: pasos numerados 1–4", JSON.stringify(await stepNumbers(page)) === JSON.stringify(["1", "2", "3", "4"]), await stepNumbers(page));
  check("entrega primero: pregunta visible como legend del grupo", await page.evaluate(() => { const l = document.querySelector("main form fieldset legend"); return l?.checkVisibility() && /¿Cómo quieres recibir tu pedido\?/.test(l.textContent); }));
  check("efectivo sin select de una sola opción", await page.evaluate(() => !document.querySelector("main form select") && /Efectivo/.test(document.querySelector("main form").innerText)));
  check("comentarios: indicaciones marcadas como opcionales, sin número de paso", /Indicaciones para la tienda\s*\(opcional\)/.test(text) && (await stepNumbers(page)).length === 4);
  check("junto al botón: «Después podrás enviarlo por WhatsApp a Abarrotes Alex.»", await page.evaluate(() => /Después podrás enviarlo por WhatsApp a Abarrotes Alex\./.test(document.getElementById("checkout-siguiente-paso")?.textContent ?? "") && document.querySelector("main form button[type=submit]")?.getAttribute("aria-describedby") === "checkout-siguiente-paso"));
  await screenshot(page, "funnel-checkout-domicilio-390.png", { fullPage: true });

  await page.evaluate(() => [...document.querySelectorAll("main input[type=radio]")].find((r) => r.value === "pickup")?.click());
  await sleep(300);
  h = await headings(page);
  text = await mainText(page);
  check("recoger: sin sección ni campos de dirección", !h.includes("Dirección de entrega") && !(await page.evaluate(() => Boolean(document.querySelector("#checkout-direccion")))), h);
  check("recoger: muestra dónde recoger (sucursal, dirección y horario)", /Recoges tu pedido en/.test(text) && /Calle 24|Concepci|Champot/.test(text) && /a\. m\.|p\. m\./.test(text), text.slice(0, 400));
  check("recoger: pasos renumerados 1–3", JSON.stringify(await stepNumbers(page)) === JSON.stringify(["1", "2", "3"]), await stepNumbers(page));
  await screenshot(page, "funnel-checkout-recoger-390.png", { fullPage: true });

  await page.evaluate(() => [...document.querySelectorAll("main input[type=radio]")].find((r) => r.value === "delivery")?.click());
  await sleep(300);
  await page.evaluate(() => document.querySelector("main form button[type=submit]")?.click());
  await sleep(500);
  const focus = await page.evaluate(() => { const a = document.activeElement; const r = a.getBoundingClientRect(); const header = document.querySelector("header").getBoundingClientRect(); return { id: a.id, top: r.top, headerBottom: header.bottom, vh: innerHeight }; });
  check("enviar vacío: foco en Nombre, visible bajo el header fijo", focus.id === "checkout-nombre" && focus.top >= focus.headerBottom && focus.top < focus.vh, focus);
  check("errores junto a los campos (aria-invalid + mensaje)", await page.evaluate(() => ["#checkout-nombre", "#checkout-telefono", "#checkout-direccion", "#checkout-colonia"].every((s) => document.querySelector(s)?.getAttribute("aria-invalid") === "true")));
  await screenshot(page, "funnel-checkout-errores-390.png");
  await page.type("#checkout-nombre", "Cliente QA");
  await page.type("#checkout-telefono", "5500000000");
  await page.evaluate(() => document.querySelector("main form button[type=submit]")?.click());
  await sleep(500);
  const focus2 = await page.evaluate(() => { const a = document.activeElement; const r = a.getBoundingClientRect(); return { id: a.id, top: r.top, headerBottom: document.querySelector("header").getBoundingClientRect().bottom }; });
  check("error en la sección Dirección (fuera de vista) → foco y scroll a Dirección", focus2.id === "checkout-direccion" && focus2.top >= focus2.headerBottom, focus2);
  await page.type("#checkout-efectivo", "1000");
  await sleep(200);
  check("cambio aproximado al indicar efectivo", /Cambio aproximado: \$/.test(await mainText(page)));

  for (const width of [320, 430, 768, 1440]) {
    // Cambiar isMobile recarga la página: se espera a que el formulario vuelva a estar listo.
    await page.setViewport({ width, height: width < 768 ? 800 : 900, isMobile: width < 768, hasTouch: width < 768 });
    await page.waitForSelector("main form button[type=submit]", { timeout: 15000 });
    await sleep(300);
    const m = await page.evaluate(() => { const b = document.querySelector("main form button[type=submit]"); b.scrollIntoView({ block: "center" }); const r = b.getBoundingClientRect(); return { overflow: document.documentElement.scrollWidth > innerWidth + 1, reachable: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight }; });
    check(`[${width}] checkout sin overflow y «Confirmar pedido» alcanzable`, !m.overflow && m.reachable, m);
    if (width === 1440) await screenshot(page, "funnel-checkout-1440.png", { fullPage: true });
  }
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  console.log("== Confirmación (comprobante sintético)");
  await page.evaluate((folio) => {
    const receipt = { orderId: "00000000-0000-4000-8000-000000000999", folio, status: "new", createdAt: new Date().toISOString(), deliveryType: "delivery", paymentMethod: "cash", subtotalCents: 4250, shippingCents: null, totalCents: 4250, replayed: false, branch: { name: "Sucursal Sintética", whatsappNumber: "5215500000000" }, items: [{ productId: "00000000-0000-4000-8000-000000000001", name: "Agua natural", presentation: "1.5 L", unitPriceCents: 1500, quantity: 1, subtotalCents: 1500 }, { productId: "00000000-0000-4000-8000-000000000002", name: "Leche entera", presentation: "1 L", unitPriceCents: 2750, quantity: 1, subtotalCents: 2750 }] };
    sessionStorage.setItem("abarrotes-alex:order-confirmations", JSON.stringify({ [folio]: { receipt, contact: { name: "Cliente QA", address: "Calle Sintética 1", neighborhood: "Centro", cashAmountCents: 10000 }, savedAt: Date.now() } }));
  }, MOCK_FOLIO);
  await page.goto(`${BASE}/pedido/${MOCK_FOLIO}`, { waitUntil: "networkidle0" });
  text = await mainText(page);
  const order = await page.evaluate(() => {
    const t = document.querySelector("main").innerText;
    const at = (s) => t.indexOf(s);
    return { confirmed: at("¡Pedido confirmado!"), folio: at("ALEX-999999"), step: at("Último paso"), cta: at("Enviar pedido por WhatsApp"), detail: at("Detalle del pedido") };
  });
  check("confirmación: confirmado → folio → «Último paso» → WhatsApp → detalle", order.confirmed >= 0 && order.confirmed < order.folio && order.folio < order.step && order.step < order.cta && order.cta < order.detail, order);
  const wa = await page.evaluate(() => { const a = document.querySelector("a[href^='https://wa.me/']"); const r = a?.getBoundingClientRect(); return a && { primary: a.className.includes("bg-primary"), aboveFold: r.bottom <= innerHeight }; });
  check("«Enviar pedido por WhatsApp» es la acción principal y se ve sin desplazarse", wa?.primary && wa.aboveFold, wa);
  check("WhatsApp no se abre solo (sigue en la confirmación)", new URL(page.url()).pathname === `/pedido/${MOCK_FOLIO}`);
  check("confirmación: sin barra «Ver mi pedido»", (await bar(page)) === null);
  await screenshot(page, "funnel-confirmacion-390.png", { fullPage: true });

  check(`ninguna petición a /api/pedidos (${orderRequests})`, orderRequests === 0);
  const issues = relevantConsole();
  check(`consola sin errores (${issues.length})`, issues.length === 0, issues.slice(0, 3));
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await ctx.close();
} finally {
  await browser.close();
}
summary("Recorrido de compra");
