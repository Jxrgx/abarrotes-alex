// Regresión de layout de AdminDialog (hoja inferior en móvil, modal en sm+). SOLO LECTURA:
// abre cada diálogo, mide y cierra con Esc sin guardar.
// IMPORTANTE: Chromium emulado no reproduce Safari iOS (barra dinámica ni teclado real).
// Esta suite comprueba geometría, scroll interno, foco y la lógica de visualViewport con
// un teclado SIMULADO; la validación definitiva se hace en un iPhone físico.
// Uso: E2E_BASE_URL=<url> npm run test:e2e:dialogs
import { BASE, check, hasCreds, launch, login, newPage, relevantConsole, sleep, summary } from "./lib.mjs";

if (!hasCreds()) throw new Error("Requiere ADMIN_TEST_EMAIL / ADMIN_TEST_PASSWORD en .env.local");

const MOBILE = [320, 375, 390, 430];
const DESKTOP = [768, 1440];

// Diálogos a revisar: cómo abrirlos desde cada página (siempre sin guardar).
const visibleButton = (label) => `[...document.querySelectorAll("main button")].find((b) => b.checkVisibility() && ${label})`;
const CASES = [
  { path: "/admin/categorias", name: "Categorías · Nueva", open: visibleButton(`b.textContent.trim() === "Nueva categoría"`) },
  { path: "/admin/categorias", name: "Categorías · Editar", open: visibleButton(`b.getAttribute("aria-label")?.startsWith("Editar ")`) },
  { path: "/admin/subcategorias", name: "Subcategorías · Nueva", open: visibleButton(`b.textContent.trim() === "Nueva subcategoría"`) },
  { path: "/admin/subcategorias", name: "Subcategorías · Editar", open: visibleButton(`b.getAttribute("aria-label")?.startsWith("Editar ")`) },
  { path: "/admin/marcas", name: "Marcas · Nueva", open: visibleButton(`b.textContent.trim() === "Nueva marca"`) },
  { path: "/admin/marcas", name: "Marcas · Editar", open: visibleButton(`b.getAttribute("aria-label")?.startsWith("Editar ")`) },
  { path: "/admin/productos", name: "Productos · Nuevo", open: visibleButton(`b.textContent.trim() === "Nuevo producto"`) },
  { path: "/admin/productos?q=__E2E__", name: "Productos · Editar", open: visibleButton(`b.getAttribute("aria-label")?.startsWith("Editar __E2E__")`) },
  { path: "/admin/productos?q=__E2E__", name: "Productos · Duplicar", menu: "Más acciones para __E2E__", item: "Duplicar" },
  { path: "/admin/promociones", name: "Promociones · Nueva", open: visibleButton(`b.textContent.trim() === "Nueva promoción"`) },
  { path: "/admin/promociones", name: "Promociones · Editar", open: visibleButton(`b.getAttribute("aria-label")?.startsWith("Editar ")`) },
  // Confirmación (también AdminDialog). Solo se abre y se cierra con Esc.
  { path: "/admin/marcas", name: "Confirmación · Desactivar", menuFirst: true, item: "Desactivar" },
];

// Interacción real (tap en táctil, click con ratón): el foco y la activación de usuario
// son los mismos que en un dispositivo, incluido el elemento al que vuelve el foco.
async function press(page, handle) {
  const element = handle.asElement();
  if (!element) return false;
  const touch = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  await element.evaluate((e) => e.scrollIntoView({ block: "center" }));
  if (touch) await element.tap();
  else await element.click();
  return true;
}

async function openCase(page, c) {
  await page.goto(`${BASE}${c.path}`, { waitUntil: "networkidle0" });
  if (c.open) {
    if (!(await press(page, await page.evaluateHandle(`(() => ${c.open})()`)))) return false;
  } else {
    const trigger = await page.evaluateHandle(({ menu, menuFirst }) =>
      [...document.querySelectorAll("main button[aria-label^='Más acciones']")].find((x) => {
        const label = x.getAttribute("aria-label");
        return x.checkVisibility() && (menuFirst ? !label.includes("__E2E__") : label.startsWith(menu));
      }), c);
    if (!(await press(page, trigger))) return false;
    await sleep(300);
    const item = await page.evaluateHandle((text) => [...document.querySelectorAll("[role=menuitem]")].find((x) => x.textContent.trim().startsWith(text)), c.item);
    if (!(await press(page, item))) return false;
  }
  await page.waitForSelector("dialog[open]", { timeout: 5000 }).catch(() => null);
  await sleep(350); // animación de entrada
  return page.evaluate(() => Boolean(document.querySelector("dialog[open]")));
}

// Geometría y comportamiento del diálogo abierto.
const measure = (page) => page.evaluate(() => {
  const d = document.querySelector("dialog[open]");
  const r = d.getBoundingClientRect();
  const body = d.querySelector(".overflow-y-auto");
  const title = d.querySelector("h2").getBoundingClientRect();
  const actions = [...d.querySelectorAll("button")].filter((b) => b.closest(".border-t") && b.checkVisibility()).map((b) => b.getBoundingClientRect());
  const before = { page: document.scrollingElement.scrollTop, dialog: d.scrollTop };
  let bodyScrolls = null;
  if (body && body.scrollHeight > body.clientHeight + 1) {
    body.scrollTop = body.scrollHeight;
    bodyScrolls = body.scrollTop > 0;
  }
  const after = { page: document.scrollingElement.scrollTop, dialog: d.scrollTop };
  if (body) body.scrollTop = 0;
  const active = document.activeElement;
  return {
    vw: innerWidth, vh: innerHeight,
    top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height,
    titleVisible: title.top >= r.top - 1 && title.bottom <= r.bottom + 1 && title.top >= 0,
    actionsVisible: actions.length > 0 && actions.every((a) => a.top >= 0 && a.bottom <= innerHeight + 1 && a.bottom <= r.bottom + 1),
    hOverflow: d.scrollWidth > d.clientWidth + 1 || (body ? body.scrollWidth > body.clientWidth + 1 : false) || document.documentElement.scrollWidth > innerWidth + 1,
    bodyScrolls, pageMoved: after.page !== before.page, dialogScrolled: after.dialog !== 0,
    focusInside: d.contains(active),
    focusIsTextField: active instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit", "file"].includes(active.type) || active instanceof HTMLTextAreaElement,
    coarse: matchMedia("(pointer: coarse)").matches,
  };
});

const browser = await launch();
try {
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx, 390);
  check("login de la cuenta E2E", (await login(page)) === "/admin");

  for (const width of [...MOBILE, ...DESKTOP]) {
    const mobile = width < 640;
    await page.setViewport({ width, height: mobile ? 844 : 900, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 3 : 1 });
    console.log(`== ${width}px (${mobile ? "táctil, hoja inferior" : "modal"})`);
    for (const c of CASES) {
      const label = `[${width}] ${c.name}`;
      if (!(await openCase(page, c))) {
        check(`${label}: se abre`, false);
        continue;
      }
      const m = await measure(page);
      const inViewport = m.top >= -1 && m.bottom <= m.vh + 1 && m.left >= -1 && m.right <= m.vw + 1;
      if (mobile) {
        check(`${label}: hoja anclada al fondo, ancho completo, dentro del viewport`, inViewport && Math.abs(m.bottom - m.vh) <= 1 && Math.abs(m.width - m.vw) <= 1 && m.height <= m.vh * 0.92 + 1, m);
        check(`${label}: foco dentro, sin abrir teclado (no en un campo de texto)`, m.coarse && m.focusInside && !m.focusIsTextField, { coarse: m.coarse, focusIsTextField: m.focusIsTextField });
      } else {
        check(`${label}: modal centrado (no hoja gigante) dentro del viewport`, inViewport && m.top > 8 && m.bottom < m.vh - 8 && m.width <= 672 + 1, m);
        check(`${label}: foco dentro del diálogo`, m.focusInside);
      }
      check(`${label}: título visible, acciones accesibles, sin scroll horizontal`, m.titleVisible && m.actionsVisible && !m.hOverflow, m);
      check(`${label}: una sola zona de scroll (cuerpo), sin mover la página ni el <dialog>`, m.bodyScrolls !== false && !m.pageMoved && !m.dialogScrolled, m);
      await page.keyboard.press("Escape");
      await sleep(250);
      check(`${label}: Esc cierra y el foco vuelve a la página`, await page.evaluate(() => !document.querySelector("dialog[open]") && document.activeElement !== document.body));
    }
  }
  await ctx.close();

  // Teclado SIMULADO: se reemplaza window.visualViewport por uno controlable, como lo
  // reduce iOS al abrir el teclado (el viewport de layout no cambia).
  console.log("== Teclado simulado (visualViewport reducido) a 390px");
  const kctx = await browser.createBrowserContext();
  const kpage = await newPage(kctx, 390);
  await kpage.evaluateOnNewDocument(() => {
    const fake = new EventTarget();
    Object.assign(fake, { offsetTop: 0, offsetLeft: 0, scale: 1, pageTop: 0, pageLeft: 0 });
    Object.defineProperty(fake, "width", { get: () => innerWidth });
    let height = null;
    Object.defineProperty(fake, "height", { get: () => height ?? innerHeight });
    window.__setVisualHeight = (h) => { height = h; fake.dispatchEvent(new Event("resize")); };
    Object.defineProperty(window, "visualViewport", { configurable: true, get: () => fake });
  });
  await kpage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  check("login (contexto con teclado simulado)", (await login(kpage)) === "/admin");
  const opened = await openCase(kpage, CASES.find((c) => c.name === "Productos · Editar"));
  check("editar producto abierto", opened);
  const keyboardTop = 480;
  await kpage.evaluate((h) => window.__setVisualHeight(h), keyboardTop);
  await sleep(250);
  // El usuario toca un campo de la parte baja del formulario.
  await kpage.evaluate(() => { const f = [...document.querySelectorAll("dialog[open] input, dialog[open] select, dialog[open] textarea")].filter((x) => x.checkVisibility()); f.at(-1)?.focus(); });
  await kpage.evaluate((h) => window.__setVisualHeight(h), keyboardTop); // iOS vuelve a emitir resize
  await sleep(250);
  const k = await kpage.evaluate((h) => {
    const d = document.querySelector("dialog[open]").getBoundingClientRect();
    const f = document.activeElement.getBoundingClientRect();
    const actions = [...document.querySelectorAll("dialog[open] .border-t button")].filter((b) => b.checkVisibility()).map((b) => b.getBoundingClientRect());
    return { top: d.top, bottom: d.bottom, height: d.height, field: { top: f.top, bottom: f.bottom }, actionsAbove: actions.every((a) => a.bottom <= h + 1), titleTop: document.querySelector("dialog[open] h2").getBoundingClientRect().top };
  }, keyboardTop);
  check(`con teclado: la hoja termina sobre el teclado (bottom ${Math.round(k.bottom)} ≈ ${keyboardTop})`, Math.abs(k.bottom - keyboardTop) <= 1, k);
  check("con teclado: altura ≤ 92% del área visible, título visible", k.height <= keyboardTop * 0.92 + 1 && k.titleTop >= 0, k);
  check("con teclado: el campo enfocado queda visible dentro de la hoja", k.field.top >= k.top && k.field.bottom <= keyboardTop + 1, k);
  check("con teclado: botones de acción sobre el teclado", k.actionsAbove, k);
  await kpage.evaluate(() => window.__setVisualHeight(null));
  await sleep(250);
  const back = await kpage.evaluate(() => { const d = document.querySelector("dialog[open]").getBoundingClientRect(); return { bottom: d.bottom, vh: innerHeight }; });
  check(`teclado cerrado: la hoja vuelve al fondo (bottom ${Math.round(back.bottom)} = ${back.vh})`, Math.abs(back.bottom - back.vh) <= 1, back);
  await kpage.keyboard.press("Escape");
  await kctx.close();

  const issues = relevantConsole();
  check(`consola sin errores (${issues.length})`, issues.length === 0, issues.slice(0, 3));
} finally {
  await browser.close();
}
summary("Diálogos del panel");
