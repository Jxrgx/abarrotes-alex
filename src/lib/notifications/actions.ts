"use server";

import { z } from "zod";

import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Alta y baja de la suscripción push del dispositivo actual (solo admins). La
// autoridad es la base: save_push_subscription exige admin y las bajas pasan por RLS
// (cada admin solo borra las suyas). Nunca se registran endpoints ni claves.

export type PushSubscriptionResult = { ok: true } | { ok: false; message: string };

const base64url = z.string().regex(/^[A-Za-z0-9_-]+=*$/);
const subscriptionInput = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(2048),
  keys: z.object({ p256dh: base64url.min(1).max(200), auth: base64url.min(1).max(100) }),
});

const FAILED = "No pudimos guardar este dispositivo. Inténtalo de nuevo.";

export async function savePushSubscription(input: unknown): Promise<PushSubscriptionResult> {
  await requireAdmin();
  const parsed = subscriptionInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: FAILED };

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.keys.p256dh,
    p_auth: parsed.data.keys.auth,
  });
  if (error) {
    console.error(`[push] save_push_subscription: ${error.code}`);
    return { ok: false, message: FAILED };
  }
  return { ok: true };
}

export async function deletePushSubscription(endpoint: unknown): Promise<PushSubscriptionResult> {
  await requireAdmin();
  const parsed = z.url({ protocol: /^https$/ }).max(2048).safeParse(endpoint);
  if (!parsed.success) return { ok: true }; // nada que borrar

  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", parsed.data);
  if (error) {
    console.error(`[push] delete push_subscription: ${error.code}`);
    return { ok: false, message: "No pudimos desactivar este dispositivo. Inténtalo de nuevo." };
  }
  return { ok: true };
}
