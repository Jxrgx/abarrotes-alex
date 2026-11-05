// E2E de MUTACIÓN de pedidos (Fase 8E): crea UN pedido persistente con datos sintéticos
// por el flujo normal de la tienda (carrito → checkout → create_order) y lo recorre por
// la UI del panel hasta Entregado:
//   Nuevo → Confirmado → Preparando → Listo → En camino → Entregado
// Navegador → Server Action → update_order_status → PostgreSQL → trigger de historial →
// revalidación → UI.
//
// ⚠️ CONSUME UN FOLIO REAL y el pedido queda en la base (no se borra; la sequence no se
// reinicia). NO forma parte de npm test: requiere ejecución explícita con --crear-pedido.
// Si ya existe un pedido "__E2E__ Cliente estados", no crea otro.
//
// Uso: npm run test:e2e:order-lifecycle -- --crear-pedido
//      --ensayo            recorre el checkout SIN pulsar "Confirmar pedido" (no crea nada)
//      --continuar=ALEX-…  reanuda las transiciones sobre ese pedido E2E (no crea otro)
import { createClient } from "@supabase/supabase-js";

import { BASE, check, launch, login, mainText, newPage, relevantConsole, sleep, summary } from "./lib.mjs";

const REHEARSAL = process.argv.includes("--ensayo");
const RESUME = process.argv.find((arg) => arg.startsWith("--continuar="))?.split("=")[1] ?? null;
if (!process.argv.includes("--crear-pedido") && !REHEARSAL && !RESUME) {
  console.log("Este script crea un pedido persistente y consume un folio. Ejecútalo con --crear-pedido (o --ensayo / --continuar=ALEX-…).");
  process.exit(1);
}

const CUSTOMER = "__E2E__ Cliente estados";
const STEPS = [
  { to: "confirmed", label: "Confirmado", action: "Confirmar pedido", toast: "Pedido confirmado", next: "Empezar a preparar" },
  { to: "preparing", label: "Preparando", action: "Empezar a preparar", toast: "Pedido en preparación", next: "Marcar listo" },
  { to: "ready", label: "Listo", action: "Marcar listo", toast: "Pedido listo", next: "Enviar (en camino)" },
  { to: "on_the_way", label: "En camino", action: "Enviar (en camino)", toast: "Pedido en camino", next: "Marcar entregado" },
  { to: "delivered", label: "Entregado", action: "Marcar entregado", toast: "Pedido entregado", next: null },
];

// Mismo formato que formatBusinessDateTimeFull (America/Merida).
const meridaFormat = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Merida", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
const nowCandidates = () => [0, -60_000, 60_000].map((offset) => meridaFormat.format(new Date(Date.now() + offset)));

const browser = await launch();
const adminContext = await browser.createBrowserContext();
const admin = await newPage(adminContext, 1440);
await login(admin);
const goto = (page, path) => page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" });

async function dashboard() {
  await goto(admin, "/admin");
  return admin.evaluate(() => {
    const kpi = Object.fromEntries([...document.querySelectorAll("main ul li")].slice(0, 4).map((li) => [li.querySelector("p")?.textContent.trim(), li.querySelectorAll("p")[1]?.textContent.trim()]));
    const recent = Object.fromEntries([...document.querySelectorAll("main table tbody tr")].map((tr) => [tr.cells[0].textContent.trim(), tr.cells[4].textContent.trim()]));
    return { pending: Number(kpi["Pedidos pendientes"]), today: Number(kpi["Pedidos hoy"]), recent };
  });
}

console.log("== Guardia: un solo pedido E2E");
await goto(admin, `/admin/pedidos?q=${encodeURIComponent("E2E Cliente estados")}`);
const existing = await admin.evaluate(() => [...document.querySelectorAll("main table tbody tr")].map((tr) => tr.cells[0].textContent.trim()));
if (RESUME && !(existing.length === 1 && existing[0] === RESUME)) {
  console.log("--continuar solo acepta el folio del pedido E2E existente.");
  await browser.close();
  process.exit(1);
}
if (existing.length > 0 && !RESUME) {
  console.log(`Ya existe un pedido E2E (${existing.join(", ")}). No se crea otro.`);
  await browser.close();
  process.exit(1);
}
check("no existe un pedido E2E previo", true);
const before = await dashboard();

let folio = RESUME;
if (!RESUME) {
console.log("== Crear el pedido por el flujo normal de la tienda");
const storeContext = await browser.createBrowserContext();
const store = await newPage(storeContext, 1440);
await goto(store, "/productos?q=agua");
const added = await store.evaluate(() => {
  const article = [...document.querySelectorAll("main article")].find((a) => a.querySelector("h2,h3")?.textContent.trim() === "Agua natural");
  const button = article?.querySelector("button[aria-label^='Agregar']");
  button?.click();
  return Boolean(button && !button.disabled);
});
check("producto agregado al carrito", added);
await sleep(600);
await goto(store, "/checkout");
await store.waitForSelector("#checkout-nombre", { timeout: 20000 });
await store.type("#checkout-nombre", CUSTOMER);
await store.type("#checkout-telefono", "5500000000");
await store.evaluate(() => document.querySelector("input[name=deliveryType][value=delivery]")?.click());
await store.waitForSelector("#checkout-direccion");
await store.type("#checkout-direccion", "Calle Sintética 123");
await store.type("#checkout-colonia", "Colonia Prueba");
await store.type("#checkout-referencias", "Pedido sintético de prueba");
await store.type("#checkout-efectivo", "100");
await store.type("#checkout-notas", "Prueba E2E de estados. No preparar.");
await store.waitForFunction(() => {
  const button = [...document.querySelectorAll("button[type=submit]")].find((b) => b.textContent.includes("Confirmar pedido"));
  return button && !button.disabled;
}, { timeout: 30000 });
const preview = await store.evaluate(() => document.querySelector("main")?.innerText.replace(/s+/g, " ") ?? "");
check("checkout listo: producto en el resumen y botón habilitado", preview.includes("Agua natural"));
if (REHEARSAL) {
  console.log("Ensayo: se detiene antes de «Confirmar pedido». No se creó ningún pedido.");
  await browser.close();
  summary("Ensayo");
  process.exit(process.exitCode ?? 0);
}
await Promise.all([
  store.waitForFunction(() => location.pathname.startsWith("/pedido/"), { timeout: 60000 }),
  store.evaluate(() => [...document.querySelectorAll("button[type=submit]")].find((b) => b.textContent.includes("Confirmar pedido")).click()),
]);
folio = decodeURIComponent(new URL(store.url()).pathname.split("/").pop());
check(`pedido creado por la tienda: ${folio}`, /^ALEX-\d{6,}$/.test(folio), folio);
await storeContext.close();
}

console.log("== Pedido en el panel");
const afterCreate = await dashboard();
if (!RESUME) {
  check(`dashboard: pendientes ${before.pending} → ${afterCreate.pending}`, afterCreate.pending === before.pending + 1);
  check(`dashboard: pedidos hoy ${before.today} → ${afterCreate.today}`, afterCreate.today === before.today + 1);
  check("dashboard: aparece en recientes como Nuevo", afterCreate.recent[folio] === "Nuevo", afterCreate.recent[folio]);
} else if (afterCreate.recent[folio] !== "Entregado") {
  before.pending -= 1; // el pedido E2E ya cuenta como pendiente
}
await goto(admin, `/admin/pedidos?q=${encodeURIComponent(folio)}`);
const detailHref = await admin.evaluate((f) => [...document.querySelectorAll("main table tbody tr")].find((tr) => tr.cells[0].textContent.trim() === f)?.querySelector("a")?.getAttribute("href"), folio);
check("listado lo encuentra por folio", Boolean(detailHref));
const orderId = detailHref.split("/").pop();

const detail = () => admin.evaluate(() => ({
  header: document.querySelector("main article header")?.innerText.replace(/\s+/g, " ") ?? "",
  buttons: [...document.querySelectorAll("main article header button")].filter((b) => b.checkVisibility()).map((b) => b.textContent.trim()),
  history: [...document.querySelectorAll("main article ol li")].map((li) => li.innerText.replace(/\s+/g, " ")),
  text: document.querySelector("main")?.innerText.replace(/\s+/g, " ") ?? "",
}));

await goto(admin, detailHref);
let state = await detail();
check("detalle: Domicilio y datos sintéticos", state.header.includes("Domicilio") && state.text.includes("Calle Sintética 123") && state.text.includes("Paga con $100.00"));
check("historial: primera entrada «Nuevo · Sistema»", /^Nuevo .*Sistema$/.test(state.history[0] ?? ""), state.history);
const startIndex = STEPS.findIndex((step) => !state.history.some((entry) => entry.startsWith(`${step.label} `)));
if (!RESUME) check("acción siguiente: «Confirmar pedido» + Cancelar", state.buttons[0] === "Confirmar pedido" && state.buttons[1]?.includes("Cancelar"), state.buttons);

for (const [index, step] of STEPS.entries()) {
  if (startIndex === -1 || index < startIndex) continue;
  console.log(`== ${index + 1}. ${step.action} → ${step.label}`);
  const historyBefore = state.history.length;
  await admin.evaluate((label) => [...document.querySelectorAll("main article header button")].find((b) => b.checkVisibility() && b.textContent.trim() === label).click(), step.action);
  const toastOk = await admin.waitForFunction((t) => document.querySelector("[role=status][aria-live]")?.innerText.includes(t), { timeout: 30000 }, step.toast).then(() => true).catch(() => false);
  check(`aviso «${step.toast}»`, toastOk);
  state = await detail();
  check(`estado visible: ${step.label}`, state.header.includes(step.label), state.header.slice(0, 80));
  check(`historial +1 exacto (${historyBefore} → ${state.history.length})`, state.history.length === historyBefore + 1, state.history);
  const last = state.history.at(-1) ?? "";
  check(`última entrada «${step.label}» por «Tú», sin duplicados`, last.startsWith(`${step.label} `) && last.includes("· Tú") && state.history.filter((entry) => entry.startsWith(`${step.label} `)).length === 1, "entrada");
  check("fecha/hora en America/Merida", nowCandidates().some((candidate) => last.includes(candidate)), "fecha");
  if (step.next) check(`siguiente acción: «${step.next}»`, state.buttons[0] === step.next, state.buttons);
  else check("Entregado: sin acciones y «Estado final»", state.buttons.length === 0 && state.header.includes("Estado final"), state.buttons);
  await admin.reload({ waitUntil: "networkidle0" });
  const reloaded = await detail();
  check("refresh conserva estado e historial", reloaded.header.includes(step.label) && reloaded.history.length === state.history.length);
  await goto(admin, `/admin/pedidos?q=${encodeURIComponent(folio)}`);
  const listStatus = await admin.evaluate((f) => [...document.querySelectorAll("main table tbody tr")].find((tr) => tr.cells[0].textContent.trim() === f)?.cells[4].textContent.trim(), folio);
  check(`listado: ${step.label}`, listStatus === step.label, listStatus);
  const dash = await dashboard();
  check(`dashboard recientes: ${step.label}`, dash.recent[folio] === step.label, dash.recent[folio]);
  const expectedPending = step.to === "delivered" ? before.pending : before.pending + 1;
  check(`dashboard pendientes: ${dash.pending} (esperado ${expectedPending})`, dash.pending === expectedPending);
  await goto(admin, detailHref);
  state = await detail();
}

console.log("== Operación segura después de Entregado");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { error: loginError } = await supabase.auth.signInWithPassword({ email: process.env.ADMIN_TEST_EMAIL, password: process.env.ADMIN_TEST_PASSWORD });
check("sesión admin para la operación segura", !loginError, loginError?.status);
let rpc = await supabase.rpc("update_order_status", { p_order_id: orderId, p_expected_status: "delivered", p_new_status: "on_the_way" });
check(`Entregado → En camino rechazado (${rpc.error?.code})`, rpc.error?.code === "ORD02");
rpc = await supabase.rpc("update_order_status", { p_order_id: orderId, p_expected_status: "on_the_way", p_new_status: "delivered" });
check(`estado esperado obsoleto rechazado (${rpc.error?.code})`, rpc.error?.code === "ORD01");
await supabase.auth.signOut();
await admin.reload({ waitUntil: "networkidle0" });
state = await detail();
check("el pedido permanece Entregado con 6 entradas de historial", state.header.includes("Entregado") && state.history.length === 6, state.history.length);
check("historial cronológico Nuevo → … → Entregado", state.history.map((entry) => entry.split(" ")[0]).join(">") === "Nuevo>Confirmado>Preparando>Listo>En>Entregado", state.history.map((entry) => entry.split(" ")[0]));

await admin.setViewport({ width: 390, height: 844 });
await admin.reload({ waitUntil: "networkidle0" });
const mobileBar = await admin.evaluate(() => [...document.querySelectorAll("div.fixed")].some((d) => d.checkVisibility() && d.querySelector("button")));
check("móvil: sin barra de acciones en estado final", !mobileBar && (await mainText(admin)).includes("Estado final"));

const issues = relevantConsole();
check(`consola sin errores (${issues.length})`, issues.length === 0, issues.slice(0, 3));
await browser.close();
console.log(`\nFOLIO E2E: ${folio}`);
summary("Ciclo de vida del pedido");
