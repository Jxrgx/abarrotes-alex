// Regresión: auth + panel (sesión real) y tienda (catálogo, búsqueda, búsqueda
// instantánea, carrito). Solo lectura salvo login/logout; NO crea pedidos.
// Uso: npm run test:e2e
import { BASE, check, clickText, containsCreds, launch, login, mainText, metrics, newPage, relevantConsole, sleep, summary, typeEmailWrongPassword } from "./lib.mjs";

const browser = await launch();

console.log("== Auth");
let ctx = await browser.createBrowserContext();
let page = await newPage(ctx, 1440);
await typeEmailWrongPassword(page);
await page.click("button[type=submit]");
await page.waitForSelector("#login-error", { timeout: 20000 }).catch(() => null);
check("credenciales incorrectas → mensaje genérico", (await page.$eval("#login-error", (e) => e.textContent).catch(() => null)) === "No pudimos iniciar sesión con esas credenciales.");
check("login con Enter → /admin", (await login(page, "enter")) === "/admin");
check("storage sin credenciales", !containsCreds(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))));
for (let i = 0; i < 3; i++) await page.reload({ waitUntil: "networkidle0" });
check("3 refresh conservan la sesión", new URL(page.url()).pathname === "/admin" && (await mainText(page)).includes("Pedidos hoy"));
for (const path of ["/admin/productos", "/admin/categorias", "/admin/subcategorias", "/admin/marcas", "/admin/promociones", "/admin/pedidos", "/admin/sucursales"]) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" });
  const text = await mainText(page);
  check(`${path} carga con sesión (sin error)`, new URL(page.url()).pathname === path && !text.includes("No pudimos cargar"), text.slice(0, 120));
}
await page.goto(`${BASE}/admin/login`, { waitUntil: "networkidle0" });
check("/admin/login con sesión → /admin", new URL(page.url()).pathname === "/admin");
await clickText(page, "aside button", "Cerrar sesión");
await page.waitForFunction(() => location.pathname === "/admin/login", { timeout: 20000 }).catch(() => null);
check("logout → /admin/login", new URL(page.url()).pathname === "/admin/login");
for (const path of ["/admin", "/admin/productos", "/admin/promociones", "/admin/categorias"]) {
  const response = await fetch(`${BASE}${path}`, { redirect: "manual" });
  check(`${path} sin sesión → 307 login`, response.status === 307 && response.headers.get("location") === "/admin/login");
}
await ctx.close();

console.log("== Tienda");
ctx = await browser.createBrowserContext();
page = await newPage(ctx, 390);
await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
const home = await mainText(page);
check("inicio con Ofertas y Destacados", home.includes("Ofertas") && home.includes("Productos destacados"));
check("inicio móvil sin overflow", !(await metrics(page)).overflowX);
await page.goto(`${BASE}/productos`, { waitUntil: "networkidle0" });
const total = await page.evaluate(() => document.querySelectorAll("main article").length);
check(`catálogo con productos (${total})`, total >= 10);
await page.goto(`${BASE}/productos?categoria=bebidas`, { waitUntil: "networkidle0" });
const drinks = await page.evaluate(() => document.querySelectorAll("main article").length);
check(`filtro por categoría (${drinks} de ${total})`, drinks > 0 && drinks < total);
await page.goto(`${BASE}/productos?q=liquido`, { waitUntil: "networkidle0" });
check("búsqueda completa sin acentos (liquido → líquido)", (await page.evaluate(() => [...document.querySelectorAll("main article h2, main article h3")].map((h) => h.textContent))).some((n) => n.includes("líquido")));
await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
await page.evaluate(() => [...document.querySelectorAll("header input[type=search]")].find((e) => e.checkVisibility())?.focus());
await page.keyboard.type("refresco");
await page.waitForFunction(() => location.pathname === "/productos" && new URL(location.href).searchParams.get("q") === "refresco", { timeout: 15000 }).catch(() => null);
await page.waitForFunction(() => document.querySelectorAll("main article").length > 0, { timeout: 15000 }).catch(() => null);
const found = await page.evaluate(() => [...document.querySelectorAll("main article h2, main article h3")].map((h) => h.textContent));
check("buscar desde el inicio filtra el catálogo (refresco → Refresco de cola)", found.some((n) => n.includes("Refresco de cola")), found.slice(0, 3));
await page.goto(`${BASE}/productos?q=agua`, { waitUntil: "networkidle0" });
await page.evaluate(() => document.querySelector("main article button[aria-label^='Agregar']")?.click());
await sleep(600);
check("agregar actualiza el contador", /1 producto/.test(await page.evaluate(() => document.querySelector("header a[href='/carrito']")?.getAttribute("aria-label") ?? "")));
await page.goto(`${BASE}/carrito`, { waitUntil: "networkidle0" });
await page.waitForFunction(() => document.querySelector("main")?.innerText.includes("Subtotal"), { timeout: 15000 }).catch(() => null);
check("carrito muestra la partida y el subtotal", /Agua natural/.test(await mainText(page)) && /Subtotal/.test(await mainText(page)));
await page.evaluate(() => [...document.querySelectorAll("main button[aria-label^='Eliminar']")].find((b) => b.checkVisibility())?.click());
await sleep(600);
check("quitar vacía el carrito", !/Agua natural/.test(await mainText(page)));
await ctx.close();

const issues = relevantConsole();
check(`consola sin errores (${issues.length})`, issues.length === 0, issues.slice(0, 3));
await browser.close();
summary("Regresión");
