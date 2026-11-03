// Diagnóstico de conexión con Supabase (solo desarrollo, no forma parte del build).
// Uso: npm run check:supabase
// Consulta, con la llave pública y sujeta a RLS, las sucursales activas.
// Nunca imprime la URL ni las llaves.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local.");
  process.exit(1);
}

if (new URL(url).pathname !== "/") {
  console.error("NEXT_PUBLIC_SUPABASE_URL debe ser la URL base del proyecto (sin /rest/v1 ni otro path).");
  process.exit(1);
}

const supabase = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await supabase
  .from("branches")
  .select("name")
  .eq("is_active", true)
  .order("name");

if (error) {
  console.error(`Error al consultar Supabase: ${error.code ?? ""} ${error.message}`);
  process.exit(1);
}

if (data.length === 0) {
  console.error("Conexión correcta, pero no hay sucursales activas visibles.");
  process.exit(1);
}

console.log(`Conexión correcta. Sucursales activas: ${data.map((b) => b.name).join(", ")}`);
