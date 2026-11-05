import { businessLocalToIso } from "@/lib/datetime";

import type { FieldErrors } from "./catalog-forms";
import { normalizePrice, priceToCents } from "./product-forms";

// Promociones (Fase 8D): estados, validación y errores. Puro (cliente y servidor).
//
// Vigencia — la MISMA regla que la RLS pública y create_order (no cambiar una sin las otras):
//   vigente ⇔ is_active AND (starts_at NULL OR starts_at <= ahora) AND (ends_at NULL OR ends_at > ahora)
// Ventana semiabierta [inicio, fin); NULL = sin límite. Además la tienda solo aplica la
// promoción si promotional_price < precio normal.

export type PromotionStatus = "active" | "scheduled" | "expired" | "disabled" | "review";

export const PROMOTION_STATUS: Record<PromotionStatus, { label: string; tone: "success" | "brand" | "neutral" | "warning" | "danger"; help: string }> = {
  active: { label: "Vigente", tone: "success", help: "Se aplica ahora en la tienda." },
  scheduled: { label: "Programada", tone: "brand", help: "Empezará a aplicarse sola en la fecha de inicio." },
  expired: { label: "Vencida", tone: "neutral", help: "Su fecha de fin ya pasó; no se aplica." },
  disabled: { label: "Desactivada", tone: "neutral", help: "No se aplica hasta que la actives." },
  review: { label: "Requiere revisión", tone: "warning", help: "El precio normal bajó: la promoción ya no es un descuento y la tienda la ignora." },
};

export type PromotionTiming = {
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  promoCents: number;
  priceCents: number;
};

// Estado visible. Orden: desactivada → vencida → requiere revisión → programada → vigente.
export function promotionStatus(promotion: PromotionTiming, nowMs: number): PromotionStatus {
  if (!promotion.isActive) return "disabled";
  if (promotion.endsAt !== null && Date.parse(promotion.endsAt) <= nowMs) return "expired";
  if (promotion.promoCents >= promotion.priceCents) return "review";
  if (promotion.startsAt !== null && Date.parse(promotion.startsAt) > nowMs) return "scheduled";
  return "active";
}

/** Ahorro en centavos y porcentaje redondeado (null si no hay descuento). */
export function promotionSavings(priceCents: number, promoCents: number) {
  if (promoCents >= priceCents || priceCents <= 0) return null;
  const cents = priceCents - promoCents;
  return { cents, percent: Math.round((cents / priceCents) * 100) };
}

export type PromotionInput = {
  id?: string;
  branchProductId?: string;
  /** Texto decimal normalizado ("18.00"). */
  promotionalPrice: string;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
};

// FormData → promoción validada. Las fechas llegan del <input datetime-local> en hora de
// Mérida y se convierten a ISO aquí (cliente y servidor usan la misma conversión).
// normalPriceCents: solo para validar en el navegador; el servidor confía en la BD.
export function parsePromotionForm(formData: FormData, normalPriceCents?: number | null):
  | { ok: true; data: PromotionInput }
  | { ok: false; fieldErrors: FieldErrors; message: string } {
  const errors: FieldErrors = {};
  const id = text(formData, "id") || undefined;
  if (id && !UUID.test(id)) errors.promotionalPrice = "Identificador no válido.";
  const branchProductId = text(formData, "branchProductId") || undefined;
  if (!id && (!branchProductId || !UUID.test(branchProductId))) errors.branchProductId = "Elige un producto.";

  const rawPrice = text(formData, "promotionalPrice");
  const promotionalPrice = normalizePrice(rawPrice);
  if (!rawPrice) errors.promotionalPrice = "Escribe el precio promocional.";
  else if (promotionalPrice === null) errors.promotionalPrice = "Escribe un precio válido (p. ej. 18.50).";
  else if (normalPriceCents != null && priceToCents(promotionalPrice)! >= normalPriceCents) {
    errors.promotionalPrice = PROMOTION_MESSAGES.priceNotLower;
  }

  const startsRaw = text(formData, "startsAt");
  const endsRaw = text(formData, "endsAt");
  const startsAt = startsRaw ? businessLocalToIso(startsRaw) : null;
  const endsAt = endsRaw ? businessLocalToIso(endsRaw) : null;
  if (startsRaw && !startsAt) errors.startsAt = "Escribe una fecha y hora válidas.";
  if (endsRaw && !endsAt) errors.endsAt = "Escribe una fecha y hora válidas.";
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) errors.endsAt = PROMOTION_MESSAGES.endBeforeStart;

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors, message: "Revisa los campos marcados." };
  return {
    ok: true,
    data: { id, branchProductId: id ? undefined : branchProductId, promotionalPrice: promotionalPrice!, startsAt, endsAt, isActive: text(formData, "isActive") === "on" },
  };
}

export const PROMOTION_MESSAGES = {
  overlap: "Ya existe una promoción activa que se cruza con estas fechas.",
  priceNotLower: "El precio promocional debe ser menor que el precio normal.",
  endBeforeStart: "La fecha de fin debe ser posterior al inicio.",
} as const;

// Errores de la base → mensaje en español (sin SQL, constraints ni códigos).
//   23P01 promotions_no_overlap · PRM01/PRM02 trigger private.validate_promotion · 23514 CHECK
export function promotionMutationError(code: string | undefined): { message: string; fieldErrors?: FieldErrors } {
  switch (code) {
    case "23P01":
      // Pista: una promoción VENCIDA que sigue activa también cuenta (su ventana sigue
      // ocupada en el pasado y una promoción "sin fechas" incluye el pasado).
      return {
        message: PROMOTION_MESSAGES.overlap,
        fieldErrors: { startsAt: `${PROMOTION_MESSAGES.overlap} Revisa las promociones de este producto, incluidas las vencidas que sigan activas.` },
      };
    case "PRM01":
      return { message: PROMOTION_MESSAGES.priceNotLower, fieldErrors: { promotionalPrice: PROMOTION_MESSAGES.priceNotLower } };
    case "PRM02":
      return { message: "El producto de una promoción no se puede cambiar. Desactívala y crea otra." };
    case "23514":
      return { message: "Revisa el precio y las fechas de la promoción." };
    case "23503":
      return { message: "El producto seleccionado ya no existe en esa sucursal. Recarga la página." };
    case "42501":
      return { message: "No tienes permiso para realizar esta acción." };
    default:
      return { message: "No pudimos guardar la promoción. Inténtalo de nuevo." };
  }
}
