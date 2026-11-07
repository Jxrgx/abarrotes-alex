// Inyección de fallos para QA (Fase 9B). Se carga como preload SOLO en una instancia local de
// `next start` (nunca en producción) y envuelve el fetch del servidor hacia Supabase:
//   NODE_OPTIONS="--import ./tests/e2e/fault-injection.mjs" QA_FAULT_FILE=<archivo> npx next start -p 3101
// El modo se lee del archivo en cada petición (lo escribe tests/e2e/states.mjs):
//   off        → sin cambios
//   rest-down  → toda consulta /rest/v1 falla como error de red (Auth sigue funcionando,
//                y también la lectura de `profiles` para que el admin pueda iniciar sesión)
//   all-down   → todo Supabase (incluido Auth) falla como error de red
//   empty      → catálogo, promociones y pedidos responden listas vacías (solo lectura simulada)
// Nunca escribe en la base: solo bloquea o simula respuestas.
import { readFileSync } from "node:fs";

const file = process.env.QA_FAULT_FILE;
// Perezoso: Next carga .env.local después de este preload.
function supabaseHost() {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host;
  } catch {
    return "";
  }
}
const EMPTY_TABLES = new Set(["products", "branch_products", "catalog_items", "promotions", "orders"]);

function mode() {
  try {
    return readFileSync(file, "utf8").trim();
  } catch {
    return "off";
  }
}

if (file) {
  const original = globalThis.fetch;
  globalThis.fetch = async function faultyFetch(input, init) {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    const current = url.host === supabaseHost() ? mode() : "off";
    if (current === "off") return original(input, init);
    const isRest = url.pathname.startsWith("/rest/v1/");
    const table = url.pathname.split("/")[3];
    if (current === "all-down" || (current === "rest-down" && isRest && table !== "profiles")) {
      throw new TypeError("fetch failed (QA: Supabase simulado como caído)");
    }
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const accept = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).get("accept") ?? "";
    if (current === "empty" && isRest && method === "GET" && EMPTY_TABLES.has(table) && !accept.includes("vnd.pgrst.object")) {
      return new Response("[]", { status: 200, headers: { "content-type": "application/json", "content-range": "*/0" } });
    }
    return original(input, init);
  };
}
