// QA del panel (Fase 9B) con sesión real. SOLO LECTURA: los formularios se abren, se
// envían únicamente VACÍOS (inválidos: la validación los rechaza sin escribir) y se cierran
// sin guardar. No cambia estados de pedidos ni toca productos comerciales.
// Credenciales: ADMIN_TEST_* (nunca se imprimen). Uso: npm run test:e2e:admin
import { BASE, check, consoleIssues, containsCreds, dialogText, launch, login, mainText, metrics, newPage, relevantConsole, sleep, summary } from "./lib.mjs";

const browser = await launch();
const ctx = await browser.createBrowserContext();
const page = await newPage(ctx, 1440);
const go = (path) => page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" });
const activeInDialog = () => page.evaluate(() => Boolean(document.activeElement?.closest("dialog[open]")));
const activeLabel = () => page.evaluate(() => (document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent ?? "").trim());
const clickButton = (text) => page.evaluate((t) => {
  const button = [...document.querySelectorAll("main button")].find((b) => b.checkVisibility() && b.textContent.replace(/\s+/g, " ").trim() === t);
  button?.focus();
  button?.click();
  return Boolean(button);
}, text);

console.log("== Auth");
check("login con Enter → /admin", (await login(page, "enter")) === "/admin");
for (let i = 0; i < 5; i++) await page.reload({ waitUntil: "networkidle0" });
check("5 refresh conservan la sesión", new URL(page.url()).pathname === "/admin" && (await mainText(page)).includes("Pedidos hoy"));
check("cookies de sesión HttpOnly o sin credenciales legibles", !containsCreds(await page.evaluate(() => document.cookie + JSON.stringify({ ...localStorage, ...sessionStorage }))));

console.log("== Dashboard");
const dash = await mainText(page);
for (const label of ["Pedidos hoy", "Importe", "Pedidos recientes", "Productos más pedidos"]) check(`dashboard muestra «${label}»`, dash.includes(label));
check("fechas y montos válidos (sin NaN / Invalid Date / undefined)", !/NaN|Invalid Date|undefined|null/.test(dash));
const recent = await page.evaluate(() => [...new Set([...document.querySelectorAll("main a[href^='/admin/pedidos/']")].filter((a) => a.checkVisibility()).map((a) => a.getAttribute("href")))]);
let badLinks = [];
for (const href of recent) {
  const response = await page.evaluate((h) => fetch(h, { redirect: "manual" }).then((r) => r.status), href);
  if (response >= 400) badLinks.push(href);
}
check(`enlaces a pedidos recientes válidos (${recent.length})`, recent.length > 0 && badLinks.length === 0, badLinks);

console.log("== Navegación y teclado");
const navLinks = await page.evaluate(() => [...document.querySelectorAll("aside nav a")].map((a) => a.getAttribute("href")));
check(`barra lateral con los módulos (${navLinks.length})`, ["/admin", "/admin/pedidos", "/admin/productos", "/admin/categorias", "/admin/subcategorias", "/admin/marcas", "/admin/promociones", "/admin/sucursales"].every((h) => navLinks.includes(h)));
await go("/admin/productos");
check("enlace activo con aria-current=page", await page.evaluate(() => document.querySelector("aside nav a[aria-current=page]")?.getAttribute("href") === "/admin/productos"));
await page.keyboard.press("Tab");
check("primer Tab: «Saltar al contenido»", (await page.evaluate(() => document.activeElement?.textContent?.trim())) === "Saltar al contenido");

// Menú móvil: Enter abre, Escape cierra y devuelve el foco.
await page.setViewport({ width: 390, height: 844 });
await go("/admin/productos");
await page.focus("header button[aria-haspopup=dialog]");
await page.keyboard.press("Enter");
await sleep(300);
check("menú móvil abre con Enter y enfoca dentro", await activeInDialog());
await page.keyboard.press("Escape");
await sleep(300);
check("Escape cierra el menú y devuelve el foco al botón", !(await dialogText(page)) && (await page.evaluate(() => document.activeElement?.matches("header button[aria-haspopup=dialog]"))));
await page.setViewport({ width: 1440, height: 900 });

// Diálogos de alta: foco inicial, trampa de foco, validación sin guardar, Escape y foco de regreso.
const modules = [
  { path: "/admin/categorias", button: "Nueva categoría" },
  { path: "/admin/subcategorias", button: "Nueva subcategoría" },
  { path: "/admin/marcas", button: "Nueva marca" },
  { path: "/admin/productos", button: "Nuevo producto" },
  { path: "/admin/promociones", button: "Nueva promoción" },
];
for (const { path, button } of modules) {
  console.log(`== ${path}`);
  await go(path);
  const text = await mainText(page);
  check(`${path}: carga sin error y con resumen`, !text.includes("No pudimos cargar") && /\d+ \w+/.test(text));
  // Búsqueda sin resultados → estado vacío.
  const search = await page.$("main input[type=search]");
  if (search) {
    await search.type("zzzz-sin-resultados");
    await sleep(700);
    check(`${path}: búsqueda sin resultados → estado vacío`, /No (encontramos|hay)/.test(await mainText(page)));
  }
  await go(path);
  const opened = await clickButton(button);
  await sleep(400);
  check(`${path}: «${button}» abre un diálogo con foco dentro`, opened && Boolean(await dialogText(page)) && (await activeInDialog()));
  for (let i = 0; i < 25; i++) await page.keyboard.press("Tab");
  check(`${path}: Tab no sale del diálogo`, await activeInDialog());
  await page.keyboard.down("Shift");
  for (let i = 0; i < 3; i++) await page.keyboard.press("Tab");
  await page.keyboard.up("Shift");
  check(`${path}: Shift+Tab no sale del diálogo`, await activeInDialog());
  // Envío vacío: debe marcar errores y NO cerrar (no se guarda nada).
  await page.evaluate(() => document.querySelector("dialog[open] form button[type=submit]")?.click());
  await sleep(1500);
  const invalid = await page.evaluate(() => [...document.querySelectorAll("dialog[open] [aria-invalid=true], dialog[open] input:invalid, dialog[open] select:invalid")].length);
  check(`${path}: envío vacío → errores visibles y el diálogo sigue abierto`, Boolean(await dialogText(page)) && invalid > 0, { invalid });
  const m390 = await (async () => { await page.setViewport({ width: 390, height: 844 }); await sleep(300); const r = await page.evaluate(() => { const d = document.querySelector("dialog[open]")?.getBoundingClientRect(); return d && d.left >= 0 && d.right <= innerWidth + 1; }); await page.setViewport({ width: 1440, height: 900 }); return r; })();
  check(`${path}: diálogo cabe a 390px`, m390);
  await page.keyboard.press("Escape");
  await sleep(400);
  check(`${path}: Escape cierra y devuelve el foco a «${button}»`, !(await dialogText(page)) && (await activeLabel()).replace(/\s+/g, " ").includes(button.split(" ")[0]));
  check(`${path}: nada guardado (sin toast de éxito)`, !/(creada|creado|guardad[oa])/i.test(await page.evaluate(() => document.querySelector("[role=status][aria-live]")?.innerText ?? "")));
}

console.log("== Productos: __E2E__ y filtros (sin guardar)");
await go("/admin/productos?q=__E2E__");
const e2e = await page.evaluate(() => [...document.querySelectorAll("main tbody tr")].filter((r) => r.innerText.includes("__E2E__")).map((r) => r.innerText.replace(/s+/g, " ")).join(" || "));
check("producto __E2E__ existe", /__E2E__/.test(e2e));
check("producto __E2E__ en estado acordado: inactivo, agotado, no destacado", /Inactivo/.test(e2e) && /Agotado/.test(e2e) && !/Destacado/.test(e2e), e2e.slice(0, 300));
check("producto __E2E__ sin imagen (placeholder)", await page.evaluate(() => [...document.querySelectorAll("main tr, main li")].filter((r) => r.innerText.includes("__E2E__") && r.checkVisibility()).every((r) => !r.querySelector("img[src*='product-images']"))));
const edit = await page.evaluate(() => { const b = [...document.querySelectorAll("main button[aria-label^='Editar __E2E__']")].find((x) => x.checkVisibility()); b?.click(); return Boolean(b); });
await sleep(600);
check("editar __E2E__ abre el formulario con sus datos", edit && /Editar producto/.test(await dialogText(page) ?? "") && (await page.evaluate(() => document.querySelector("dialog[open] input[name=name]")?.value.includes("__E2E__"))));
await page.keyboard.press("Escape");
await sleep(400);
const menu = await page.evaluate(() => { const b = [...document.querySelectorAll("main button[aria-label^='Más acciones para __E2E__']")].find((x) => x.checkVisibility()); b?.click(); return Boolean(b); });
await sleep(300);
check("menú «Más acciones» abre con menuitems y foco dentro", menu && (await page.evaluate(() => document.activeElement?.getAttribute("role") === "menuitem")));
await page.keyboard.press("ArrowDown");
await page.keyboard.press("Escape");
await sleep(200);
check("Escape cierra el menú y devuelve el foco al disparador", await page.evaluate(() => document.activeElement?.getAttribute("aria-label")?.startsWith("Más acciones")));
await page.evaluate(() => [...document.querySelectorAll("main button[aria-label^='Más acciones para __E2E__']")].find((x) => x.checkVisibility())?.click());
await sleep(300);
await page.evaluate(() => [...document.querySelectorAll("[role=menuitem]")].find((i) => i.textContent.includes("Duplicar"))?.click());
await sleep(600);
check("duplicar abre «Duplicar producto» (se cierra sin guardar)", /Duplicar producto/.test(await dialogText(page) ?? ""));
await page.keyboard.press("Escape");
await sleep(300);
for (const query of ["estado=inactivos", "disponibilidad=agotados", "categoria=no-existe", "page=999"]) {
  await go(`/admin/productos?${query}`);
  check(`productos ?${query} carga sin error`, !(await mainText(page)).includes("No pudimos cargar"));
}

console.log("== Promociones (lectura)");
for (const estado of ["vigentes", "programadas", "vencidas", "desactivadas", "revision"]) {
  await go(`/admin/promociones?estado=${estado}`);
  const text = await mainText(page);
  check(`promociones ?estado=${estado} carga sin error`, !text.includes("No pudimos cargar") && !/NaN|Invalid Date/.test(text));
}

console.log("== Pedidos (solo lectura)");
await go("/admin/pedidos?q=cliente%20estados");
check("búsqueda «cliente estados» (minúsculas) encuentra ALEX-000003", (await mainText(page)).includes("ALEX-000003"));
await go("/admin/pedidos?q=CLIENTE%20ESTADOS");
check("búsqueda en MAYÚSCULAS encuentra ALEX-000003", (await mainText(page)).includes("ALEX-000003"));
await go("/admin/pedidos?q=alex-000003");
const byFolio = await page.evaluate(() => [...new Set([...document.querySelectorAll("main a[href^='/admin/pedidos/']")].map((a) => a.getAttribute("href")))]);
check("búsqueda por folio en minúsculas → 1 pedido", byFolio.length === 1);
await go(byFolio[0]);
const detail = await mainText(page);
check("ALEX-000003: Entregado, estado final y sin acciones de cambio", /Entregado/.test(detail) && /Estado final/.test(detail) && !(await page.evaluate(() => [...document.querySelectorAll("main button")].some((b) => /Cancelar|Confirmar|Marcar|Pasar a/.test(b.textContent)))));
check("detalle con historial y fechas válidas", /Historial/.test(detail) && !/NaN|Invalid Date/.test(detail));

console.log("== Responsive y zoom 200% (720px)");
const routes = ["/admin", "/admin/pedidos", byFolio[0], "/admin/productos", "/admin/categorias", "/admin/subcategorias", "/admin/marcas", "/admin/promociones", "/admin/sucursales"];
for (const [width, height] of [[320, 640], [390, 844], [768, 1024], [720, 450], [1024, 768], [1440, 900]]) {
  await page.setViewport({ width, height });
  const problems = [];
  for (const route of routes) {
    await go(route);
    const m = await metrics(page);
    if (m.overflowX) problems.push(`${route}: overflow ${await page.evaluate(() => [...document.querySelectorAll("main *")].filter((e) => e.checkVisibility() && e.getBoundingClientRect().right > innerWidth + 1 && !e.closest(".overflow-x-auto")).slice(0, 2).map((e) => e.tagName + ":" + (e.getAttribute("aria-label") ?? e.textContent).trim().slice(0, 30)).join(", "))}`);
    // Las acciones de cada fila deben estar al alcance (visibles o desplazando su contenedor).
    const clipped = await page.evaluate(() => [...document.querySelectorAll("main button[aria-label^='Editar']")].filter((b) => b.checkVisibility()).some((b) => {
      let el = b.parentElement;
      while (el && el !== document.body) {
        const style = getComputedStyle(el);
        if (style.overflowX === "hidden" && b.getBoundingClientRect().right > el.getBoundingClientRect().right + 1) return true;
        el = el.parentElement;
      }
      return false;
    }));
    if (clipped) problems.push(`${route}: acciones recortadas`);
  }
  check(`${width}x${height}: sin overflow ni acciones recortadas en ${routes.length} rutas`, problems.length === 0, problems);
}
await page.setViewport({ width: 1440, height: 900 });

console.log("== Logout y Atrás");
await go("/admin");
await page.evaluate(() => [...document.querySelectorAll("aside button")].find((b) => b.textContent.includes("Cerrar sesión"))?.click());
await page.waitForFunction(() => location.pathname === "/admin/login", { timeout: 20000 }).catch(() => null);
check("logout → /admin/login", new URL(page.url()).pathname === "/admin/login");
await page.goBack({ waitUntil: "networkidle0" }).catch(() => null);
await sleep(800);
check("Atrás tras logout no muestra el panel", new URL(page.url()).pathname === "/admin/login" || !(await mainText(page)).includes("Pedidos hoy"));

const all = relevantConsole();
check("sin warnings de Date.now ni de hidratación", !all.some((issue) => /Date\.now|hydrat|did not match/i.test(issue.text)), all.slice(0, 3));
check(`consola sin errores (${all.length})`, all.length === 0, all.slice(0, 4));
check("credenciales ausentes de la consola", !consoleIssues.some((issue) => containsCreds(issue.text)));
await browser.close();
summary("Panel QA");
