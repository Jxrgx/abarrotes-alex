// Pruebas de seguridad SIN credenciales (Fase 9A): headers, endpoints públicos con entradas
// abusivas, rutas admin sin sesión, Storage y RPC con la llave PÚBLICA (anon).
// NUNCA envía un pedido válido: todas las solicitudes a /api/pedidos son inválidas a
// propósito, así que no se crea ningún pedido ni se consume ningún folio.
// Uso: npm run test:security   (E2E_BASE_URL para apuntar a otra instancia)
import { BASE, check, summary } from "./lib.mjs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const UUID = "11111111-1111-4111-8111-111111111111";
const LEAK = /stack|at \w+ \(|postgres|relation |constraint|syntax error|select |insert |PGRST|node_modules|\\.next/i;

console.log("== Headers de seguridad");
for (const path of ["/", "/productos", "/carrito", "/checkout", "/admin/login", "/api/busqueda"]) {
  const response = await fetch(`${BASE}${path}`, { redirect: "manual" });
  const h = (name) => response.headers.get(name) ?? "";
  const csp = h("content-security-policy");
  check(`${path}: CSP con frame-ancestors 'none', object-src 'none', base-uri y form-action`, /frame-ancestors 'none'/.test(csp) && /object-src 'none'/.test(csp) && /base-uri 'self'/.test(csp) && /form-action 'self'/.test(csp), csp.slice(0, 120));
  check(`${path}: CSP sin orígenes de scripts externos`, /script-src 'self'( 'unsafe-inline')?( 'unsafe-eval')?;/.test(csp), csp.match(/script-src[^;]*/)?.[0]);
  check(`${path}: nosniff, DENY, Referrer-Policy, Permissions-Policy, sin X-Powered-By`,
    h("x-content-type-options") === "nosniff" && h("x-frame-options") === "DENY" && h("referrer-policy") === "strict-origin-when-cross-origin" && /camera=\(\)/.test(h("permissions-policy")) && !response.headers.has("x-powered-by"));
}

console.log("== Panel sin sesión");
for (const path of ["/admin", "/admin/pedidos", "/admin/pedidos/" + UUID, "/admin/productos", "/admin/promociones"]) {
  const response = await fetch(`${BASE}${path}`, { redirect: "manual" });
  check(`${path} → 307 login, private no-store, noindex`, response.status === 307 && response.headers.get("location") === "/admin/login" && /no-store/.test(response.headers.get("cache-control") ?? "") && /noindex/.test(response.headers.get("x-robots-tag") ?? ""));
}

// Tras rechazar un cuerpo enorme el servidor puede cerrar esa conexión; si el cliente la
// reutiliza falla con ECONNRESET. Se reintenta una vez con conexión nueva.
async function request(url, init) {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (!/ECONNRESET|socket/i.test(String(error?.cause?.message ?? ""))) throw error;
    return fetch(url, init);
  }
}
const post = (path, body, headers = { "content-type": "application/json" }) => request(`${BASE}${path}`, { method: "POST", headers, body });
async function expectStatus(label, responsePromise, status, extra) {
  const response = await responsePromise;
  const text = await response.text();
  check(`${label} → ${response.status}`, response.status === status && !LEAK.test(text) && (!extra || extra(text)), { status: response.status, body: text.slice(0, 120) });
}
const invalidOrder = (overrides = {}) => JSON.stringify({ clientRequestId: UUID, branchId: UUID, items: [], customer: { name: "Prueba Seguridad", phone: "5500000000" }, delivery: { type: "pickup" }, payment: { method: "cash" }, ...overrides });

console.log("== /api/pedidos (solo solicitudes inválidas)");
await expectStatus("GET", request(`${BASE}/api/pedidos`), 405);
await expectStatus("Content-Type text/plain", post("/api/pedidos", invalidOrder(), { "content-type": "text/plain" }), 415);
await expectStatus("sin Content-Type", post("/api/pedidos", invalidOrder(), {}), 415);
await expectStatus("JSON mal formado", post("/api/pedidos", "{\"items\": ["), 400, (t) => t.includes("INVALID_CHECKOUT_DATA"));
await expectStatus("payload de 40 KB", post("/api/pedidos", JSON.stringify({ x: "a".repeat(40 * 1024) })), 413);
// Content-Length ausente (stream chunked) y cuerpo enorme: se corta al pasar el límite.
const chunked = new ReadableStream({
  start(controller) {
    for (let i = 0; i < 64; i++) controller.enqueue(new TextEncoder().encode("a".repeat(1024)));
    controller.close();
  },
});
// El servidor deja de leer al pasar el límite: responde 413 o corta la conexión mientras el
// cliente sigue enviando (ECONNRESET). En ambos casos el cuerpo no se procesa.
try {
  const response = await fetch(`${BASE}/api/pedidos`, { method: "POST", headers: { "content-type": "application/json" }, body: chunked, duplex: "half" });
  check(`cuerpo chunked de 64 KB sin Content-Length → ${response.status}`, response.status === 413);
} catch (error) {
  check("cuerpo chunked de 64 KB sin Content-Length → conexión cortada (no se procesa)", /ECONNRESET|socket|terminated/i.test(String(error?.cause?.message ?? error?.message)));
}
await expectStatus("carrito vacío", post("/api/pedidos", invalidOrder()), 400, (t) => t.includes("CART_EMPTY"));
await expectStatus("101 partidas", post("/api/pedidos", invalidOrder({ items: Array.from({ length: 101 }, (_, i) => ({ productId: `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`, quantity: 1 })) })), 400, (t) => t.includes("INVALID_CART"));
await expectStatus("cantidad 1000", post("/api/pedidos", invalidOrder({ items: [{ productId: UUID, quantity: 1000 }] })), 400, (t) => t.includes("INVALID_QUANTITY"));
await expectStatus("nombre de 5 000 caracteres", post("/api/pedidos", invalidOrder({ items: [{ productId: UUID, quantity: 1 }], customer: { name: "Ñ".repeat(5000), phone: "5500000000" } })), 400, (t) => t.includes("customer.name"));
await expectStatus("UUID inválido", post("/api/pedidos", invalidOrder({ clientRequestId: "' or 1=1 --", items: [{ productId: UUID, quantity: 1 }] })), 400);
await expectStatus("cuerpo JSON no objeto", post("/api/pedidos", "[]"), 400);

console.log("== /api/carrito");
await expectStatus("GET", request(`${BASE}/api/carrito`), 405);
await expectStatus("Content-Type text/plain", post("/api/carrito", JSON.stringify({ branchId: UUID, productIds: [UUID] }), { "content-type": "text/plain" }), 415);
await expectStatus("JSON mal formado", post("/api/carrito", "{"), 400);
await expectStatus("payload de 20 KB", post("/api/carrito", JSON.stringify({ branchId: UUID, productIds: Array(500).fill(UUID) })), 413);
await expectStatus("101 productos", post("/api/carrito", JSON.stringify({ branchId: UUID, productIds: Array.from({ length: 101 }, (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`) })), 400);
await expectStatus("IDs no UUID", post("/api/carrito", JSON.stringify({ branchId: UUID, productIds: ["1; drop table products"] })), 400);
await expectStatus("solicitud válida de solo lectura (sucursal inexistente)", post("/api/carrito", JSON.stringify({ branchId: UUID, productIds: [UUID, UUID] })), 200, (t) => t.includes("\"products\":[]"));

console.log("== Supabase con la llave pública (anon)");
const sb = (path, init = {}) => fetch(`${SUPABASE_URL}${path}`, { ...init, headers: { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}`, ...(init.headers ?? {}) } });
const rpc = (name, body) => sb(`/rest/v1/rpc/${name}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
for (const [name, body] of [
  ["update_order_status", { p_order_id: UUID, p_expected_status: "new", p_new_status: "confirmed" }],
  ["admin_dashboard", { p_branch_id: UUID, p_time_zone: "America/Merida", p_pending_statuses: ["new"] }],
  ["admin_save_product", { p_product_id: UUID, p_name: "x", p_slug: "x", p_subcategory_id: UUID, p_brand_id: null, p_presentation: null, p_unit: null, p_sale_type: "unit", p_is_featured: false, p_is_active: false, p_branches: [] }],
]) {
  const response = await rpc(name, body);
  const json = await response.json().catch(() => ({}));
  check(`RPC ${name} como anon → rechazada (${json.code ?? response.status})`, response.status >= 400 && ["42501", "401", "403"].some((code) => String(json.code ?? response.status) === code || response.status === 401 || response.status === 403), json.code);
}
const emptyCart = await rpc("create_order", { p_client_request_id: UUID, p_branch_id: UUID, p_items: [], p_customer_name: "Prueba", p_customer_phone: "5500000000", p_delivery_type: "pickup" });
check("RPC create_order directa con carrito vacío → rechazada por la base (sin pedido)", emptyCart.status >= 400 && /CART_EMPTY/.test(await emptyCart.text()));
for (const table of ["orders", "order_items", "order_status_history", "profiles"]) {
  const response = await sb(`/rest/v1/${table}?select=id&limit=1`);
  const json = await response.json().catch(() => null);
  check(`anon no lee ${table}`, (Array.isArray(json) && json.length === 0) || response.status >= 400, response.status);
}
const write = await sb("/rest/v1/categories", { method: "POST", headers: { "content-type": "application/json", prefer: "return=minimal" }, body: JSON.stringify({ name: "x", slug: "seguridad-x" }) });
check(`anon no escribe en el catálogo (${write.status})`, write.status === 401 || write.status === 403);

console.log("== Storage product-images con la llave pública");
const upload = await sb(`/storage/v1/object/product-images/products/${UUID}/${UUID}.webp`, { method: "POST", headers: { "content-type": "image/webp" }, body: new Uint8Array([82, 73, 70, 70]) });
check(`anon no sube imágenes (${upload.status})`, upload.status >= 400);
const html = await sb(`/storage/v1/object/product-images/products/${UUID}/pagina.html`, { method: "POST", headers: { "content-type": "text/html" }, body: "<script>alert(1)</script>" });
check(`no se puede usar como hosting de HTML (${html.status})`, html.status >= 400);
const list = await sb("/storage/v1/object/list/product-images", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prefix: "products", limit: 10 }) });
const listed = await list.json().catch(() => null);
check("anon no lista el bucket", list.status >= 400 || (Array.isArray(listed) && listed.length === 0), list.status);
const removal = await sb("/storage/v1/object/product-images", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ prefixes: [`products/${UUID}/${UUID}.webp`] }) });
const removed = await removal.json().catch(() => null);
check("anon no borra objetos", removal.status >= 400 || (Array.isArray(removed) && removed.length === 0), removal.status);

summary("Seguridad");
