import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/types/database";

import { getSupabaseEnv } from "./env";

// Cliente de Supabase para Server Components, Server Functions y Route Handlers.
// Crea siempre un cliente nuevo por petición; nunca lo compartas entre peticiones.
export async function createClient() {
  const { url, anonKey } = getSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Los Server Components no pueden escribir cookies. Se puede ignorar
          // mientras la sesión se refresque en otro punto (p. ej. proxy.ts).
        }
      },
    },
  });
}
