import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseEnv } from "./env";

// Cliente de Supabase para Client Components (navegador).
export function createClient() {
  const { url, anonKey } = getSupabaseEnv();

  return createBrowserClient(url, anonKey);
}
