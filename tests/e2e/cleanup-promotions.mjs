// Limpieza legítima: borra SOLO las promociones del producto "__E2E__ Producto <runId>"
// con la sesión del admin de pruebas (llave pública + login; RLS admin permite DELETE en
// promotions). Nunca service_role. Solo imprime conteos.
import { createClient } from "@supabase/supabase-js";

const env = (key) => (process.env[key] ?? "").trim();
if (!process.argv[2]) throw new Error("Falta el runId del producto __E2E__.");
const PRODUCT = `__E2E__ Producto ${process.argv[2]}`;

const supabase = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { persistSession: false } });
const { error: loginError } = await supabase.auth.signInWithPassword({ email: env("ADMIN_TEST_EMAIL"), password: env("ADMIN_TEST_PASSWORD") });
if (loginError) { console.log("login falló:", loginError.status); process.exit(1); }

const { data, error } = await supabase
  .from("promotions")
  .select("id, branch_product:branch_products!inner ( product:products!inner ( name ) )")
  .eq("branch_product.product.name", PRODUCT);
if (error) { console.log("consulta falló:", error.code); process.exit(1); }
const ids = data.filter((row) => row.branch_product.product.name === PRODUCT).map((row) => row.id);
console.log(`promociones del producto E2E encontradas: ${ids.length}`);
if (ids.length) {
  const { data: deleted, error: deleteError } = await supabase.from("promotions").delete().in("id", ids).select("id");
  console.log(deleteError ? `borrado falló: ${deleteError.code}` : `borradas: ${deleted.length}`);
}
await supabase.auth.signOut();
