import { z } from "zod";

import { normalizeSearchText } from "@/lib/catalog/normalize";
import { slugify } from "@/lib/slug";

// Validación de los formularios de Categorías, Subcategorías y Marcas (Fase 8B).
// La usan las Server Actions (autoridad) y el cliente (solo UX). Sin dependencias
// de servidor para poder probarse con node --test.

export type CatalogEntity = "category" | "subcategory" | "brand";

export const ENTITY_LABELS: Record<CatalogEntity, { singular: string; plural: string }> = {
  category: { singular: "categoría", plural: "categorías" },
  subcategory: { singular: "subcategoría", plural: "subcategorías" },
  brand: { singular: "marca", plural: "marcas" },
};

export const NAME_MAX_LENGTH = 60;
export const SORT_ORDER_MAX = 9999;

// Errores por nombre de campo del formulario (p. ej. "name", "price:<branchId>").
export type FieldErrors = Partial<Record<string, string>>;

export type MutationResult =
  | { ok: true; message: string }
  | {
      ok: false;
      message: string;
      fieldErrors?: FieldErrors;
      /** Cambio de categoría de una subcategoría con productos sin confirmar. */
      confirmMove?: { productCount: number };
    };

const nameSchema = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(1, "Escribe un nombre.")
      .min(2, "El nombre debe tener al menos 2 caracteres.")
      .max(NAME_MAX_LENGTH, `El nombre debe tener como máximo ${NAME_MAX_LENGTH} caracteres.`)
      .refine((value) => slugify(value).length > 0, "El nombre debe incluir letras o números."),
  );

// Campo vacío → 0. Enteros de 0 a 9999 (se sugiere avanzar de 10 en 10).
const sortOrderSchema = z
  .string()
  .trim()
  .transform((value) => (value === "" ? "0" : value))
  .pipe(
    z
      .string()
      .regex(/^\d+$/, "Escribe un número entero sin decimales.")
      .transform(Number)
      .pipe(z.number().max(SORT_ORDER_MAX, `El orden debe estar entre 0 y ${SORT_ORDER_MAX}.`)),
  );

const idSchema = z.uuid("Identificador no válido.");

// Checkbox HTML: presente ("on") = true; ausente = false.
const checkboxSchema = z.string().optional().transform((value) => value === "on" || value === "true");

const baseFields = {
  id: z.string().optional().transform((value) => value || undefined).pipe(idSchema.optional()),
  name: nameSchema,
  isActive: checkboxSchema,
};

export const categoryFormSchema = z.object({ ...baseFields, sortOrder: sortOrderSchema });
export const subcategoryFormSchema = z.object({
  ...baseFields,
  sortOrder: sortOrderSchema,
  categoryId: z.string().min(1, "Elige una categoría.").pipe(z.uuid("Elige una categoría.")),
  confirmMove: checkboxSchema,
});
export const brandFormSchema = z.object(baseFields);

export type CategoryInput = z.infer<typeof categoryFormSchema>;
export type SubcategoryInput = z.infer<typeof subcategoryFormSchema>;
export type BrandInput = z.infer<typeof brandFormSchema>;

export const setActiveSchema = z.object({ id: idSchema, isActive: z.boolean() });

type FormSchema = typeof categoryFormSchema | typeof subcategoryFormSchema | typeof brandFormSchema;

// FormData → objeto validado o errores por campo (en español).
export function parseCatalogForm<S extends FormSchema>(
  schema: S,
  formData: FormData,
): { ok: true; data: z.infer<S> } | { ok: false; fieldErrors: FieldErrors; message: string } {
  const raw: Record<string, string | undefined> = {};
  for (const key of ["id", "name", "sortOrder", "categoryId", "isActive", "confirmMove"]) {
    const value = formData.get(key);
    raw[key] = typeof value === "string" ? value : undefined;
  }
  if (raw.name === undefined) raw.name = "";
  if (raw.categoryId === undefined && schema === subcategoryFormSchema) raw.categoryId = "";
  if (raw.sortOrder === undefined && schema !== brandFormSchema) raw.sortOrder = "";

  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data as z.infer<S> };

  const fieldErrors: FieldErrors = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0];
    if ((key === "name" || key === "sortOrder" || key === "categoryId") && !fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return { ok: false, fieldErrors, message: "Revisa los campos marcados." };
}

// Errores de PostgREST/PostgreSQL → mensaje para el administrador. Nunca SQL,
// nombres de constraints ni códigos internos.
export function catalogMutationError(
  entity: CatalogEntity,
  code: string | undefined,
): { message: string; fieldErrors?: FieldErrors } {
  const label = ENTITY_LABELS[entity].singular;
  switch (code) {
    case "23505": {
      // unique_violation: el slug (derivado del nombre) ya existe.
      const message =
        entity === "subcategory"
          ? "Ya existe una subcategoría con ese nombre en esta categoría."
          : `Ya existe una ${label} con ese nombre.`;
      return { message, fieldErrors: { name: message } };
    }
    case "23503": // foreign_key_violation: la categoría elegida ya no existe
      return {
        message: "La categoría seleccionada ya no existe. Recarga la página.",
        fieldErrors: { categoryId: "Elige otra categoría." },
      };
    case "42501": // RLS / privilegios
      return { message: "No tienes permiso para realizar esta acción." };
    case "23514": // check_violation
      return { message: "Revisa los datos del formulario." };
    default:
      return { message: "No pudimos guardar los cambios. Inténtalo de nuevo." };
  }
}

export function notFoundMessage(entity: CatalogEntity) {
  return `No encontramos esta ${ENTITY_LABELS[entity].singular}. Recarga la página.`;
}

// Mensajes de éxito ("Categoría creada", "Marca desactivada", …).
export function successMessage(
  entity: CatalogEntity,
  action: "created" | "updated" | "activated" | "deactivated",
) {
  const label = ENTITY_LABELS[entity].singular;
  const verb = { created: "creada", updated: "actualizada", activated: "activada", deactivated: "desactivada" }[action];
  return `${label[0].toUpperCase()}${label.slice(1)} ${verb}`;
}

export function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

// Consecuencias públicas de desactivar, según las políticas RLS actuales
// (docs/admin.md → "Desactivar y jerarquía"). Nada se desactiva en cascada.
export function deactivationConsequence(
  entity: CatalogEntity,
  counts: { subcategories?: number; products: number },
): string[] {
  if (entity === "category") {
    const subcategories = counts.subcategories ?? 0;
    if (subcategories === 0 && counts.products === 0) {
      return ["La categoría dejará de mostrarse en la tienda mientras permanezca inactiva."];
    }
    return [
      `La categoría y todo su contenido (${plural(subcategories, "subcategoría", "subcategorías")} y ${plural(counts.products, "producto", "productos")}) dejarán de mostrarse en la tienda mientras permanezca inactiva.`,
      "Las subcategorías y los productos no se desactivan: vuelven a mostrarse al reactivarla.",
    ];
  }
  if (entity === "subcategory") {
    if (counts.products === 0) return ["La subcategoría dejará de mostrarse en la tienda mientras permanezca inactiva."];
    return [
      `Los productos de esta subcategoría (${plural(counts.products, "producto", "productos")}) dejarán de mostrarse públicamente mientras permanezca inactiva.`,
      "Los productos no se desactivan: vuelven a mostrarse al reactivarla.",
    ];
  }
  // Marca: RLS NO oculta productos por marca inactiva (brand_id es opcional).
  if (counts.products === 0) return ["La marca dejará de aparecer en el filtro de marcas de la tienda."];
  return [
    "La marca dejará de aparecer en el filtro de marcas de la tienda.",
    counts.products === 1
      ? "Su producto seguirá a la venta, pero sin mostrar la marca."
      : `Sus ${counts.products} productos seguirán a la venta, pero sin mostrar la marca.`,
  ];
}

// Orden sugerido para un registro nuevo: siguiente múltiplo de 10 después del mayor.
export function nextSortOrder(values: number[]) {
  const max = values.length ? Math.max(...values) : 0;
  return Math.min(SORT_ORDER_MAX, Math.floor(max / 10) * 10 + 10);
}

// Búsqueda administrativa por nombre: sin acentos ni mayúsculas, "contiene".
// Independiente del live search de la tienda (Fuse.js); solo comparte la normalización.
export function matchesAdminSearch(name: string, query: string) {
  const needle = normalizeSearchText(query.trim());
  return needle === "" || normalizeSearchText(name).includes(needle);
}
