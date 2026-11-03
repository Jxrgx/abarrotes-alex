import "server-only";

import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type UserRole = Database["public"]["Enums"]["user_role"];

export type AdminContext = {
  userId: string;
  email: string | null;
  fullName: string | null;
  /** null = usuario autenticado sin profile (sin privilegios). */
  role: UserRole | null;
};

// Sesión + rol del usuario actual, una vez por request.
// La autoridad es auth (JWT verificado con getClaims) + profiles.role; nunca el email.
export const getAdminContext = cache(async (): Promise<AdminContext | null> => {
  // Validar la sesión depende del request Y de la hora actual: al crear el
  // cliente y en getClaims(), @supabase/auth-js compara expires_at con
  // Date.now(). Con Partial Prefetching las cookies están disponibles al
  // prerenderizar el App Shell, así que leerlas no basta para salir del
  // prerender; connection() hace que esta verificación ocurra solo al atender
  // la petición (nunca en el shell ni en un prefetch).
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;

  // RLS: cada usuario solo puede leer su propio profile.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", claims.sub)
    .maybeSingle();

  return {
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    fullName: profile?.full_name ?? null,
    role: profile?.role ?? null,
  };
});

// Para layouts y páginas del panel: sin sesión -> login; sin rol admin -> sin acceso.
// Se llama en cada página protegida (no solo en el layout): layouts y páginas se
// renderizan en paralelo. Las políticas RLS son la defensa final de los datos.
export async function requireAdmin(): Promise<AdminContext & { role: "admin" }> {
  const context = await getAdminContext();
  if (!context) redirect("/admin/login");
  if (context.role !== "admin") redirect("/admin/sin-acceso");
  return context as AdminContext & { role: "admin" };
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  employee: "Empleado",
};
