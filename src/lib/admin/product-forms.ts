import { z } from "zod";

import { decimalToCents } from "@/lib/catalog/pricing";
import { normalizeSearchText } from "@/lib/catalog/normalize";
import { slugify } from "@/lib/slug";
import { Constants, type Database } from "@/types/database";

import type { FieldErrors } from "./catalog-forms";

// Validación del formulario de productos (Fase 8C.1). Pura: la usan la Server
// Action (autoridad) y el cliente (solo UX). Precios y presentación viajan como
// TEXTO decimal normalizado; nunca se usa un float como autoridad.

export type ProductUnit = Database["public"]["Enums"]["product_unit"];
export type SaleType = Database["public"]["Enums"]["sale_type"];

// Valores reales del enum de PostgreSQL (tipos generados), con texto amigable.
export const PRODUCT_UNITS = Constants.public.Enums.product_unit;
export const SALE_TYPES = Constants.public.Enums.sale_type;
export const UNIT_LABELS: Record<ProductUnit, string> = { ml: "ml", L: "L", g: "g", kg: "kg", pieza: "piezas" };
export const SALE_TYPE_LABELS: Record<SaleType, string> = { unit: "Por unidad", weight: "Por peso" };

export const PRODUCT_NAME_MAX = 100;
export const PRICE_MAX_CENTS = 99_999_99; // $99,999.99

export type BranchPriceInput = { branchId: string; price: string; isAvailable: boolean };
export type ProductInput = {
  id?: string;
  name: string;
  subcategoryId: string;
  brandId: string | null;
  /** Texto decimal normalizado ("1.5") o null = sin presentación. */
  presentation: string | null;
  unit: ProductUnit | null;
  saleType: SaleType;
  isFeatured: boolean;
  isActive: boolean;
  branches: BranchPriceInput[];
};

// "$1,234.5" → "1234.50"; null si no es un precio válido (0 a 99,999.99, máx. 2 decimales).
export function normalizePrice(raw: string): string | null {
  let value = raw.trim().replace(/^\$/, "").trim();
  // La coma solo como separador de miles bien formado ("1,234.50"); "18,50" se rechaza
  // en lugar de interpretarse como 1850.
  if (value.includes(",")) {
    if (!/^\d{1,3}(,\d{3})+(\.\d*)?$/.test(value)) return null;
    value = value.replace(/,/g, "");
  }
  const match = /^(\d{1,5})(?:\.(\d{0,2}))?$/.exec(value);
  if (!match) return null;
  return `${Number(match[1])}.${(match[2] ?? "").padEnd(2, "0")}`;
}

export function priceToCents(raw: string): number | null {
  const normalized = normalizePrice(raw);
  return normalized === null ? null : decimalToCents(normalized);
}

// "1.50" → "1.5"; null si no es una cantidad válida (> 0, máx. 3 decimales).
export function normalizePresentation(raw: string): string | null {
  const match = /^(\d{1,5})(?:\.(\d{1,3}))?$/.exec(raw.trim());
  if (!match) return null;
  const decimals = (match[2] ?? "").replace(/0+$/, "");
  const text = `${Number(match[1])}${decimals ? `.${decimals}` : ""}`;
  return Number(text) > 0 ? text : null;
}

const uuid = z.uuid();
const text = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

export function parseProductForm(formData: FormData):
  | { ok: true; data: ProductInput }
  | { ok: false; fieldErrors: FieldErrors; message: string } {
  const errors: FieldErrors = {};

  const name = text(formData, "name").trim().replace(/\s+/g, " ");
  if (!name) errors.name = "Escribe un nombre.";
  else if (name.length < 2) errors.name = "El nombre debe tener al menos 2 caracteres.";
  else if (name.length > PRODUCT_NAME_MAX) errors.name = `El nombre debe tener como máximo ${PRODUCT_NAME_MAX} caracteres.`;
  else if (!slugify(name)) errors.name = "El nombre debe incluir letras o números.";

  const subcategoryId = text(formData, "subcategoryId");
  if (!uuid.safeParse(subcategoryId).success) {
    errors.subcategoryId = "Elige una subcategoría.";
    if (!uuid.safeParse(text(formData, "categoryId")).success) errors.categoryId = "Elige una categoría.";
  }

  const brandRaw = text(formData, "brandId");
  const brandId = brandRaw === "" ? null : brandRaw;
  if (brandId !== null && !uuid.safeParse(brandId).success) errors.brandId = "Elige una marca o «Sin marca».";

  // Presentación: cantidad y unidad juntas, o ninguna (CHECK products_presentation_unit_pair).
  const unitRaw = text(formData, "unit");
  const unit = unitRaw === "" ? null : ((PRODUCT_UNITS as readonly string[]).includes(unitRaw) ? (unitRaw as ProductUnit) : undefined);
  const presentationRaw = text(formData, "presentation").trim();
  let presentation: string | null = null;
  if (unit === undefined) errors.unit = "Elige una unidad válida.";
  else if (unit !== null) {
    if (!presentationRaw) errors.presentation = "Escribe la cantidad (p. ej. 600).";
    else {
      presentation = normalizePresentation(presentationRaw);
      if (presentation === null) errors.presentation = "Escribe una cantidad mayor a 0, con hasta 3 decimales.";
    }
  }

  const saleTypeRaw = text(formData, "saleType");
  const saleType = (SALE_TYPES as readonly string[]).includes(saleTypeRaw) ? (saleTypeRaw as SaleType) : null;
  if (!saleType) errors.saleType = "Elige el tipo de venta.";
  // Sin restricciones entre sale_type y unit: solo las del dominio (enum + CHECK de la BD).

  // Precio y disponibilidad por sucursal: campos price:<branchId> y available:<branchId>.
  const branches: BranchPriceInput[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("price:") || typeof value !== "string") continue;
    const branchId = key.slice("price:".length);
    if (!uuid.safeParse(branchId).success) continue;
    const price = normalizePrice(value);
    if (!value.trim()) errors[key] = "Escribe el precio.";
    else if (price === null) errors[key] = "Escribe un precio válido entre 0 y 99,999.99 (p. ej. 18.50).";
    branches.push({ branchId, price: price ?? "", isAvailable: text(formData, `available:${branchId}`) !== "false" });
  }
  if (branches.length === 0) errors.branches = "Indica el precio en al menos una sucursal.";

  const idRaw = text(formData, "id");
  const id = idRaw === "" ? undefined : idRaw;
  if (id !== undefined && !uuid.safeParse(id).success) errors.name ??= "Identificador no válido.";

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors, message: "Revisa los campos marcados." };
  return {
    ok: true,
    data: {
      id,
      name,
      subcategoryId,
      brandId,
      presentation,
      unit: unit ?? null,
      saleType: saleType!,
      isFeatured: text(formData, "isFeatured") === "on",
      isActive: text(formData, "isActive") === "on",
      branches,
    },
  };
}

// Errores de admin_save_product / PostgREST → mensaje en español, sin detalles internos.
export function productMutationError(code: string | undefined): { message: string; fieldErrors?: FieldErrors } {
  switch (code) {
    case "23505":
      return { message: "Ya existe un producto con ese nombre.", fieldErrors: { name: "Ya existe un producto con ese nombre." } };
    case "23503":
      return { message: "La subcategoría, la marca o la sucursal seleccionada ya no existe. Recarga la página." };
    case "42501":
      return { message: "No tienes permiso para realizar esta acción." };
    case "P0002":
      return { message: "No encontramos este producto. Recarga la página." };
    case "23514":
    case "22023":
      return { message: "Revisa los datos del formulario." };
    default:
      return { message: "No pudimos guardar los cambios. Inténtalo de nuevo." };
  }
}

// Advertencia de promoción: la tienda solo aplica una promoción menor al precio normal.
export function promotionWarning(promoCents: number | null, priceInput: string): string | null {
  const priceCents = priceToCents(priceInput);
  if (promoCents === null || priceCents === null || promoCents < priceCents) return null;
  const money = (cents: number) => `$${(cents / 100).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `Existe una promoción de ${money(promoCents)}. Con el nuevo precio de ${money(priceCents)}, esa promoción dejará de aplicarse.`;
}

// Búsqueda administrativa: cada palabra debe aparecer en nombre, marca, categoría o subcategoría.
export function matchesProductSearch(
  product: { name: string; brandName: string | null; categoryName: string; subcategoryName: string },
  query: string,
) {
  const words = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeSearchText(
    [product.name, product.brandName ?? "", product.categoryName, product.subcategoryName].join(" "),
  );
  return words.every((word) => haystack.includes(word));
}
