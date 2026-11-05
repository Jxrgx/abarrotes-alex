"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import type { MutationResult } from "./catalog-forms";
import { parsePromotionForm, promotionMutationError } from "./promotion-forms";

// Mutaciones de promociones (Fase 8D): requireAdmin() → validación en el servidor →
// cliente autenticado (RLS admin). La BASE es la autoridad de las reglas de negocio:
//   - sin solapamiento entre promociones activas del mismo branch_product
//     (exclusion constraint promotions_no_overlap; sin condiciones de carrera);
//   - precio promocional < precio normal al crear, cambiar precio o reactivar
//     (trigger private.validate_promotion);
//   - el producto de una promoción no cambia.
// Sin DELETE en la UI: se desactiva (conserva la configuración).

function revalidatePromotions() {
  revalidatePath("/admin/promociones");
  revalidatePath("/admin/productos"); // muestra la oferta vigente
  revalidatePath("/");
  revalidatePath("/productos");
}

function failure(code: string | undefined): MutationResult {
  console.error(`[admin] promotions: ${code ?? "sin código"}`); // solo el código
  return { ok: false, ...promotionMutationError(code) };
}

export async function savePromotion(formData: FormData): Promise<MutationResult> {
  await requireAdmin();
  const parsed = parsePromotionForm(formData);
  if (!parsed.ok) return parsed;
  const { id, branchProductId, promotionalPrice, startsAt, endsAt, isActive } = parsed.data;

  const supabase = await createClient();
  // promotional_price como texto ("18.00"): PostgreSQL lo convierte a numeric sin float.
  const values = { promotional_price: promotionalPrice as unknown as number, starts_at: startsAt, ends_at: endsAt, is_active: isActive };
  const { data, error } = id
    ? await supabase.from("promotions").update(values).eq("id", id).select("id")
    : await supabase.from("promotions").insert({ ...values, branch_product_id: branchProductId! }).select("id");

  if (error) return failure(error.code);
  if (data.length === 0) return { ok: false, message: "No encontramos esta promoción. Recarga la página." };
  revalidatePromotions();
  return { ok: true, message: id ? "Promoción actualizada" : "Promoción creada" };
}

const idSchema = z.uuid();

// Reactivar vuelve a pasar por la base: precio < normal y sin solapamiento.
export async function setPromotionActive(id: string, isActive: boolean): Promise<MutationResult> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success || typeof isActive !== "boolean") {
    return { ok: false, message: "No encontramos esta promoción. Recarga la página." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("promotions").update({ is_active: isActive }).eq("id", id).select("id");
  if (error) return failure(error.code);
  if (data.length === 0) return { ok: false, message: "No encontramos esta promoción. Recarga la página." };
  revalidatePromotions();
  return { ok: true, message: isActive ? "Promoción activada" : "Promoción desactivada" };
}
