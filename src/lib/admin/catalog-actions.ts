"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/session";
import { slugify } from "@/lib/slug";
import { createClient } from "@/lib/supabase/server";

import {
  brandFormSchema,
  type CatalogEntity,
  catalogMutationError,
  categoryFormSchema,
  type MutationResult,
  notFoundMessage,
  parseCatalogForm,
  setActiveSchema,
  subcategoryFormSchema,
  successMessage,
} from "./catalog-forms";

// Mutaciones de Categorías, Subcategorías y Marcas (Fase 8B).
//
// Cada acción es un endpoint público: el botón oculto NO es seguridad. Por eso:
//   1. requireAdmin() (sesión + rol) antes de todo;
//   2. validación con Zod en el servidor (el cliente valida solo por UX);
//   3. cliente autenticado → RLS (`private.is_admin()`) y constraints son la autoridad final.
// Sin DELETE: se desactiva (`is_active`). El slug se genera siempre desde el nombre.

const TABLES = { category: "categories", subcategory: "subcategories", brand: "brands" } as const;

// Las tres pantallas comparten datos (nombres de categoría, conteos): se refrescan juntas.
// La tienda no usa caché ("use cache"), así que lee el cambio en la siguiente visita.
function revalidateCatalogAdmin() {
  revalidatePath("/admin/categorias");
  revalidatePath("/admin/subcategorias");
  revalidatePath("/admin/marcas");
}

function failure(entity: CatalogEntity, code: string | undefined): MutationResult {
  console.error(`[admin] ${TABLES[entity]}: ${code ?? "sin código"}`); // solo el código
  return { ok: false, ...catalogMutationError(entity, code) };
}

export async function saveCategory(formData: FormData): Promise<MutationResult> {
  await requireAdmin();
  const parsed = parseCatalogForm(categoryFormSchema, formData);
  if (!parsed.ok) return parsed;
  const { id, name, sortOrder, isActive } = parsed.data;

  const values = { name, slug: slugify(name), sort_order: sortOrder, is_active: isActive };
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("categories").update(values).eq("id", id).select("id")
    : await supabase.from("categories").insert(values).select("id");

  if (error) return failure("category", error.code);
  if (data.length === 0) return { ok: false, message: notFoundMessage("category") };
  revalidateCatalogAdmin();
  return { ok: true, message: successMessage("category", id ? "updated" : "created") };
}

export async function saveSubcategory(formData: FormData): Promise<MutationResult> {
  await requireAdmin();
  const parsed = parseCatalogForm(subcategoryFormSchema, formData);
  if (!parsed.ok) return parsed;
  const { id, name, sortOrder, isActive, categoryId, confirmMove } = parsed.data;
  const supabase = await createClient();

  if (id) {
    // Mover una subcategoría mueve a todos sus productos (su categoría es derivada).
    // Se exige confirmación con el conteo ACTUAL de la base, no el que vio la pantalla.
    const { data: current, error } = await supabase
      .from("subcategories")
      .select("category_id, products(count)")
      .eq("id", id)
      .maybeSingle();
    if (error) return failure("subcategory", error.code);
    if (!current) return { ok: false, message: notFoundMessage("subcategory") };

    const products = current.products as unknown as { count: number }[];
    const productCount = products[0]?.count ?? 0;
    if (current.category_id !== categoryId && productCount > 0 && !confirmMove) {
      return {
        ok: false,
        message: "Confirma que quieres mover los productos a la nueva categoría.",
        confirmMove: { productCount },
      };
    }
  }

  const values = { name, slug: slugify(name), sort_order: sortOrder, is_active: isActive, category_id: categoryId };
  const { data, error } = id
    ? await supabase.from("subcategories").update(values).eq("id", id).select("id")
    : await supabase.from("subcategories").insert(values).select("id");

  if (error) return failure("subcategory", error.code);
  if (data.length === 0) return { ok: false, message: notFoundMessage("subcategory") };
  revalidateCatalogAdmin();
  return { ok: true, message: successMessage("subcategory", id ? "updated" : "created") };
}

export async function saveBrand(formData: FormData): Promise<MutationResult> {
  await requireAdmin();
  const parsed = parseCatalogForm(brandFormSchema, formData);
  if (!parsed.ok) return parsed;
  const { id, name, isActive } = parsed.data;

  const values = { name, slug: slugify(name), is_active: isActive };
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("brands").update(values).eq("id", id).select("id")
    : await supabase.from("brands").insert(values).select("id");

  if (error) return failure("brand", error.code);
  if (data.length === 0) return { ok: false, message: notFoundMessage("brand") };
  revalidateCatalogAdmin();
  return { ok: true, message: successMessage("brand", id ? "updated" : "created") };
}

// Activar / desactivar desde el listado. No toca hijos ni productos: la visibilidad
// pública la resuelve RLS a partir de la jerarquía (ver docs/admin.md).
async function setActive(entity: CatalogEntity, id: string, isActive: boolean): Promise<MutationResult> {
  await requireAdmin();
  const parsed = setActiveSchema.safeParse({ id, isActive });
  if (!parsed.success) return { ok: false, message: notFoundMessage(entity) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABLES[entity])
    .update({ is_active: parsed.data.isActive })
    .eq("id", parsed.data.id)
    .select("id");

  if (error) return failure(entity, error.code);
  if (data.length === 0) return { ok: false, message: notFoundMessage(entity) };
  revalidateCatalogAdmin();
  return { ok: true, message: successMessage(entity, parsed.data.isActive ? "activated" : "deactivated") };
}

export async function setCategoryActive(id: string, isActive: boolean) {
  return setActive("category", id, isActive);
}

export async function setSubcategoryActive(id: string, isActive: boolean) {
  return setActive("subcategory", id, isActive);
}

export async function setBrandActive(id: string, isActive: boolean) {
  return setActive("brand", id, isActive);
}
