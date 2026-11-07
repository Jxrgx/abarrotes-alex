// Estados de error y vacíos (Fase 9B) contra una instancia LOCAL con inyección de fallos
// (tests/e2e/fault-injection.mjs). No toca producción: Supabase se simula caído o vacío
// solo para esa instancia. Ver tests/README.md para levantarla.
// Uso: QA_FAULT_FILE=<archivo> E2E_BASE_URL=http://localhost:3101 npm run test:e2e:states
import { writeFileSync } from "node:fs";

import { BASE, check, launch, login, mainText, newPage, relevantConsole, sleep, summary } from "./lib.mjs";

const FILE = process.env.QA_FAULT_FILE;
if (!FILE) throw new Error("Define QA_FAULT_FILE (el mismo archivo que usa la instancia con fault-injection).");
const setMode = (mode) => writeFileSync(FILE, mode);
const LEAK = /stack|postgres|PGRST|fetch failed|QA:|TypeError|node_modules/i;
const UUID = "11111111-1111-4111-8111-111111111111";

const browser = await launch();
try {
  setMode("off");
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx, 390);
  const go = (path) => page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" });
  // Carrito con un producto real antes de simular fallos.
  await go("/productos?q=agua");
  await page.evaluate(() => document.querySelector("main article button[aria-label^='Agregar']")?.click());
  await sleep(500);
  check("instancia con fault-injection responde normal en modo off", /1 producto/.test(await page.evaluate(() => document.querySelector("header a[href='/carrito']")?.getAttribute("aria-label") ?? "")));
  check("login de la cuenta E2E (modo off)", (await login(page)) === "/admin");

  console.log("== Vacíos (catálogo, promociones y pedidos sin datos)");
  setMode("empty");
  await go("/");
  let text = await mainText(page);
  check("inicio sin productos: sin secciones rotas ni errores", !/No pudimos cargar/.test(text) && !/NaN|undefined/.test(text));
  await go("/productos");
  text = await mainText(page);
  check("catálogo sin productos → estado vacío", /0 productos|No (encontramos|hay)/.test(text), text.slice(0, 160));
  await go("/carrito");
  await sleep(1200);
  text = await mainText(page);
  check("carrito con producto que ya no está → no disponible y sin poder continuar", /no (está )?disponible|ya no está/i.test(text), text.slice(0, 200));
  await go("/admin/productos");
  check("admin productos vacío → «Aún no hay productos.» con acción para crear", /Aún no hay productos/.test(await mainText(page)) && await page.evaluate(() => [...document.querySelectorAll("main button")].some((b) => b.checkVisibility() && /producto/i.test(b.textContent))), (await mainText(page)).slice(0, 200));
  await go("/admin/promociones");
  check("admin promociones vacío → estado vacío", /(Aún no hay|No hay|Todavía no hay) promociones|primera promoción/i.test(await mainText(page)), (await mainText(page)).slice(0, 200));
  await go("/admin/pedidos");
  check("admin pedidos vacío → estado vacío", /(Aún no hay|No hay|Todavía no hay) pedidos|No encontramos pedidos/i.test(await mainText(page)), (await mainText(page)).slice(0, 200));

  console.log("== Supabase REST caído (Auth funciona)");
  setMode("rest-down");
  for (const path of ["/", "/productos", "/productos?q=cola"]) {
    const response = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" });
    text = await mainText(page);
    check(`${path}: error amigable con «Intentar de nuevo» (${response.status()})`, /No pudimos cargar/.test(text) && /Intentar de nuevo/.test(text) && !LEAK.test(text), text.slice(0, 160));
  }
  const cart = await fetch(`${BASE}/api/carrito`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ branchId: UUID, productIds: [UUID] }) });
  const cartBody = await cart.text();
  check(`/api/carrito caído → ${cart.status} sin detalles internos`, cart.status >= 500 && !LEAK.test(cartBody), cartBody.slice(0, 120));
  await go("/carrito");
  await sleep(1200);
  check("carrito con API caída → «No pudimos cargar tu carrito» y Reintentar", /No pudimos cargar tu carrito/.test(await mainText(page)));
  await go("/checkout");
  await sleep(1200);
  text = await mainText(page);
  check("checkout con Supabase caído → no permite enviar y explica el problema", !/Confirmar pedido/.test(text) || (await page.evaluate(() => { const b = document.querySelector("main form button[type=submit]"); return !b || b.disabled; })), text.slice(0, 200));
  for (const path of ["/admin", "/admin/pedidos", "/admin/productos", "/admin/categorias", "/admin/promociones"]) {
    await go(path);
    text = await mainText(page);
    check(`${path}: error de carga con reintento (sesión conservada)`, new URL(page.url()).pathname === path && /No pudimos cargar/.test(text) && !LEAK.test(text), text.slice(0, 160));
  }

  console.log("== Supabase completamente caído (también Auth)");
  setMode("all-down");
  const admin = await fetch(`${BASE}/admin`, { redirect: "manual" });
  check(`/admin sin Supabase → redirección al login, no 500 (${admin.status})`, admin.status === 307 || admin.status === 200);
  const fresh = await newPage(await browser.createBrowserContext(), 390);
  await fresh.goto(`${BASE}/admin/login`, { waitUntil: "networkidle0" });
  await fresh.type("#login-email", "qa-sintetico@example.com");
  await fresh.type("#login-password", "contraseña-sintética");
  await fresh.click("button[type=submit]");
  await fresh.waitForSelector("#login-error", { timeout: 20000 }).catch(() => null);
  const loginError = await fresh.$eval("#login-error", (e) => e.textContent).catch(() => "");
  check("login sin Supabase → mensaje amigable sin detalles", Boolean(loginError) && !LEAK.test(loginError), loginError);
  await fresh.browserContext().close();

  // React #441 = "An error occurred in the Server Components render" (mensaje omitido en producción):
// es el registro esperado cuando error.tsx muestra un fallo del servidor (aquí, simulado).
const issues = relevantConsole().filter((issue) => !/Failed to load resource|net::ERR|React error #441/.test(issue.text));
  check(`consola sin errores de JavaScript (${issues.length})`, issues.length === 0, issues.slice(0, 3));
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await ctx.close();
} finally {
  setMode("off");
  await browser.close();
}
summary("Estados de error y vacíos");
