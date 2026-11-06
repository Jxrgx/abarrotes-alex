import type { PostgrestError } from "@supabase/supabase-js";

// Al terminar un prerender (p. ej. el prefetch parcial de un enlace), Next.js rechaza los
// fetch() pendientes a propósito. supabase-js atrapa ese rechazo y lo devuelve como
// { error } sin el digest de Next, así que unstable_rethrow no lo reconoce. No es un fallo
// del catálogo: React descarta ese render. Solo se omite el log; el error se lanza igual.
export function isPrerenderAbort(error: Pick<PostgrestError, "message">) {
  return /During prerendering, fetch\(\) rejects when the prerender is complete/.test(error.message ?? "");
}

// Registra el detalle técnico solo en el servidor y lanza un error genérico.
// error.tsx muestra un mensaje amigable; nunca se expone el error de Supabase.
export function catalogQueryError(context: string, error: PostgrestError): Error {
  if (!isPrerenderAbort(error)) console.error(`[catalog] ${context}: ${error.code}`); // solo el código
  return new Error(`No se pudo cargar ${context}.`);
}
