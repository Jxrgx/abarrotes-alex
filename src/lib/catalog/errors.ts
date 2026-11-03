import type { PostgrestError } from "@supabase/supabase-js";

// Registra el detalle técnico solo en el servidor y lanza un error genérico.
// error.tsx muestra un mensaje amigable; nunca se expone el error de Supabase.
export function catalogQueryError(context: string, error: PostgrestError): Error {
  console.error(`[catalog] ${context}: ${error.code} ${error.message}`);
  return new Error(`No se pudo cargar ${context}.`);
}
