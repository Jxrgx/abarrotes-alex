import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { getSupabaseEnv } from "./env";

// Cliente PÚBLICO de Supabase para el servidor: datos que no dependen del usuario
// (catálogo, sucursales, promociones, create_order).
// - Llave publishable; nunca service_role ni secretos.
// - No lee cookies ni carga sesión: siempre actúa como `anon`, con su RLS.
// - Sin estado de usuario, por eso se comparte entre requests y sus consultas se
//   pueden cachear en el futuro ("use cache") sin mezclar datos de sesiones.
// Para Auth o datos que dependen de la sesión usa `createClient` de ./server.
let publicClient: SupabaseClient<Database> | undefined;

export function getPublicSupabase(): SupabaseClient<Database> {
  if (!publicClient) {
    const { url, anonKey } = getSupabaseEnv();
    publicClient = createClient<Database>(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return publicClient;
}
