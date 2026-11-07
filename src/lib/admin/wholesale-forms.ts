import type { FieldErrors } from "./catalog-forms";
import { normalizePrice, priceToCents } from "./price-input";

// Precios por mayoreo en el formulario de producto (docs/wholesale.md). Módulo puro: lo
// usan el cliente (UX) y la Server Action. La AUTORIDAD es la base (constraints y
// triggers de wholesale_prices); aquí solo se dan mensajes claros antes de enviar.

export const WHOLESALE_MIN_QUANTITY = 2;
/** Igual que la cantidad máxima por producto del carrito y de create_order. */
export const WHOLESALE_MAX_QUANTITY = 99;
export const WHOLESALE_MAX_TIERS = 10;

export const WHOLESALE_MESSAGES = {
  notLower: "El precio por mayoreo debe ser menor que el precio normal.",
  overlap: "Este rango se cruza con otro precio por mayoreo.",
  maxBeforeMin: "La cantidad final debe ser igual o mayor que la inicial.",
  increasing: "Un nivel para una cantidad mayor no puede tener un precio superior al nivel anterior.",
  weight: "Los precios por mayoreo solo están disponibles para productos por unidad.",
  stale: "Los precios por mayoreo cambiaron mientras editabas. Recarga la página.",
} as const;

export type WholesaleTierInput = {
  /** id de wholesale_prices al editar un nivel existente; null = nuevo. */
  id: string | null;
  minQuantity: number;
  /** null = sin límite. */
  maxQuantity: number | null;
  /** Texto decimal normalizado ("20.00"). */
  unitPrice: string;
};

/** Nombre de los campos de un nivel: wholesale:<branchId>:<índice>:<campo>. */
export const tierField = (branchId: string, index: number, field: "id" | "min" | "max" | "unlimited" | "price" | "original") =>
  `wholesale:${branchId}:${index}:${field}`;
/** Error de grupo (solapamiento u orden de precios) de una sucursal. */
export const tierGroupField = (branchId: string) => `wholesale:${branchId}`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseQuantity(raw: string): number | null {
  if (!/^\d{1,2}$/.test(raw.trim())) return null;
  const value = Number(raw.trim());
  return value >= WHOLESALE_MIN_QUANTITY && value <= WHOLESALE_MAX_QUANTITY ? value : null;
}

/**
 * Lee y valida los niveles de una sucursal. `priceInput` = precio normal escrito en el
 * formulario. Un nivel existente cuyo precio no cambió NO se rechaza si quedó por
 * encima del nuevo precio normal: queda «Requiere revisión» (la base tampoco lo
 * rechaza y deja de aplicarlo), igual que las promociones.
 */
export function parseWholesaleTiers(
  formData: FormData,
  branchId: string,
  priceInput: string,
  errors: FieldErrors,
): WholesaleTierInput[] {
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  const indexes = new Set<number>();
  const prefix = `wholesale:${branchId}:`;
  for (const key of formData.keys()) {
    if (!key.startsWith(prefix)) continue;
    const index = Number(key.slice(prefix.length).split(":")[0]);
    if (Number.isInteger(index) && index >= 0) indexes.add(index);
  }
  const ordered = [...indexes].sort((a, b) => a - b);
  if (ordered.length > WHOLESALE_MAX_TIERS) {
    errors[tierGroupField(branchId)] = `Puedes definir como máximo ${WHOLESALE_MAX_TIERS} precios por mayoreo.`;
    return [];
  }

  const normalCents = priceToCents(priceInput);
  const tiers: (WholesaleTierInput & { index: number; cents: number | null })[] = [];
  for (const index of ordered) {
    const field = (name: Parameters<typeof tierField>[2]) => tierField(branchId, index, name);
    const idRaw = text(field("id"));
    const id = UUID.test(idRaw) ? idRaw.toLowerCase() : null;

    const minRaw = text(field("min"));
    const minQuantity = parseQuantity(minRaw);
    if (!minRaw.trim()) errors[field("min")] = "Escribe la cantidad inicial.";
    else if (minQuantity === null) errors[field("min")] = `Escribe una cantidad entera entre ${WHOLESALE_MIN_QUANTITY} y ${WHOLESALE_MAX_QUANTITY}.`;

    let maxQuantity: number | null = null;
    if (text(field("unlimited")) !== "on") {
      const maxRaw = text(field("max"));
      maxQuantity = parseQuantity(maxRaw);
      if (!maxRaw.trim()) errors[field("max")] = "Escribe la cantidad final o elige «Sin límite».";
      else if (maxQuantity === null) errors[field("max")] = `Escribe una cantidad entera entre ${WHOLESALE_MIN_QUANTITY} y ${WHOLESALE_MAX_QUANTITY}.`;
      else if (minQuantity !== null && maxQuantity < minQuantity) errors[field("max")] = WHOLESALE_MESSAGES.maxBeforeMin;
    }

    const priceRaw = text(field("price"));
    const unitPrice = normalizePrice(priceRaw);
    const cents = unitPrice === null ? null : priceToCents(unitPrice);
    const unchanged = id !== null && unitPrice !== null && normalizePrice(text(field("original"))) === unitPrice;
    if (!priceRaw.trim()) errors[field("price")] = "Escribe el precio por pieza.";
    else if (cents === null) errors[field("price")] = "Escribe un precio válido (p. ej. 20.00).";
    else if (cents <= 0) errors[field("price")] = "El precio por mayoreo debe ser mayor a 0.";
    else if (normalCents !== null && cents >= normalCents && !unchanged) errors[field("price")] = WHOLESALE_MESSAGES.notLower;

    tiers.push({ id, minQuantity: minQuantity ?? 0, maxQuantity, unitPrice: unitPrice ?? "", index, cents });
  }

  // Reglas entre niveles (solo si cada nivel es válido por sí mismo).
  const valid = tiers.filter((tier) => tier.minQuantity > 0 && tier.cents !== null && (tier.maxQuantity === null || tier.maxQuantity >= tier.minQuantity));
  const sorted = [...valid].sort((a, b) => a.minQuantity - b.minQuantity);
  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    if (previous.maxQuantity === null || current.minQuantity <= previous.maxQuantity) {
      errors[tierField(branchId, current.index, "min")] ??= WHOLESALE_MESSAGES.overlap;
      errors[tierGroupField(branchId)] ??= WHOLESALE_MESSAGES.overlap;
    } else if ((current.cents ?? 0) > (previous.cents ?? 0)) {
      errors[tierField(branchId, current.index, "price")] ??= WHOLESALE_MESSAGES.increasing;
      errors[tierGroupField(branchId)] ??= WHOLESALE_MESSAGES.increasing;
    }
  }

  return tiers.map(({ id, minQuantity, maxQuantity, unitPrice }) => ({ id, minQuantity, maxQuantity, unitPrice }));
}

/** "3–5 pzas", "12+ pzas". */
export function tierRangeLabel(minQuantity: number, maxQuantity: number | null) {
  if (maxQuantity === null) return `${minQuantity}+ pzas`;
  if (maxQuantity === minQuantity) return `${minQuantity} pzas`;
  return `${minQuantity}–${maxQuantity} pzas`;
}

/** Ahorro por pieza frente al precio normal ("$2.00", "9.1 %"); null si no es descuento. */
export function tierSavings(tierCents: number, normalCents: number) {
  if (normalCents <= 0 || tierCents >= normalCents) return null;
  const savingsCents = normalCents - tierCents;
  const percent = Math.round((savingsCents / normalCents) * 1000) / 10;
  return { savingsCents, percent: `${percent.toLocaleString("es-MX", { maximumFractionDigits: 1 })} %` };
}
