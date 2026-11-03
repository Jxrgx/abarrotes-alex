"use server";

import { createClient } from "@/lib/supabase/server";

export type SignInResult = { ok: true } | { ok: false; message: string };

const GENERIC_ERROR = "No pudimos iniciar sesión con esas credenciales.";

// Inicio de sesión con Supabase Auth (email + contraseña). La contraseña solo
// viaja a Supabase: no se guarda ni se registra. @supabase/ssr escribe las
// cookies de sesión en la respuesta.
export async function signIn(formData: FormData): Promise<SignInResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { ok: false, message: "Escribe tu correo y tu contraseña." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  // Mismo mensaje para email inexistente y contraseña incorrecta: no se revela
  // si una cuenta existe.
  if (error || !data.user) return { ok: false, message: GENERIC_ERROR };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  if (profile?.role !== "admin") {
    // Autenticado pero sin rol admin: no se deja una sesión abierta sin uso.
    await supabase.auth.signOut();
    return { ok: false, message: "Esta cuenta no tiene acceso al panel administrativo." };
  }

  return { ok: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
