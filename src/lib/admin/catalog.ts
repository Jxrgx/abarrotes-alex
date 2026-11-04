import "server-only";

import { createClient } from "@/lib/supabase/server";

// Listados administrativos de Categorías, Subcategorías y Marcas (Fase 8B).
// Cliente AUTENTICADO (RLS del admin: incluye registros inactivos); nunca el
// cliente público ni service_role. Los conteos van embebidos en la MISMA consulta
// (PostgREST `tabla(count)`): una consulta por listado, sin N+1.

export type AdminCategory = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  sortOrder: number;
  subcategoryCount: number;
  productCount: number;
};

export type AdminSubcategory = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  sortOrder: number;
  categoryId: string;
  categoryName: string;
  categoryActive: boolean;
  productCount: number;
};

export type AdminBrand = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  productCount: number;
};

export type CategoryOption = { id: string; name: string; isActive: boolean };

// `products(count)` llega como [{ count: n }].
function countOf(value: unknown): number {
  return Array.isArray(value) && typeof value[0]?.count === "number" ? value[0].count : 0;
}

function queryError(what: string, code: string | undefined): never {
  console.error(`[admin] ${what}: ${code ?? "sin código"}`); // solo el código, nunca el mensaje
  throw new Error(`No se pudieron cargar ${what}.`);
}

export async function listAdminCategories(): Promise<AdminCategory[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug, is_active, sort_order, subcategories(count), subs:subcategories(products(count))")
    .order("sort_order")
    .order("name");
  if (error) queryError("las categorías", error.code);

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    subcategoryCount: countOf(row.subcategories),
    // Productos de la categoría = suma de los productos de sus subcategorías.
    productCount: row.subs.reduce((sum, sub) => sum + countOf(sub.products), 0),
  }));
}

export async function listCategoryOptions(): Promise<CategoryOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, is_active")
    .order("sort_order")
    .order("name");
  if (error) queryError("las categorías", error.code);
  return data.map((row) => ({ id: row.id, name: row.name, isActive: row.is_active }));
}

export async function listAdminSubcategories(): Promise<AdminSubcategory[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subcategories")
    .select("id, name, slug, is_active, sort_order, category_id, category:categories!inner(name, is_active, sort_order), products(count)");
  if (error) queryError("las subcategorías", error.code);

  return data
    .map((row) => ({
      sortKey: [row.category.sort_order, row.category.name] as const,
      item: {
        id: row.id,
        name: row.name,
        slug: row.slug,
        isActive: row.is_active,
        sortOrder: row.sort_order,
        categoryId: row.category_id,
        categoryName: row.category.name,
        categoryActive: row.category.is_active,
        productCount: countOf(row.products),
      },
    }))
    // Agrupadas como en la tienda: orden de la categoría, luego de la subcategoría.
    .sort(
      (a, b) =>
        a.sortKey[0] - b.sortKey[0] ||
        a.sortKey[1].localeCompare(b.sortKey[1], "es") ||
        a.item.sortOrder - b.item.sortOrder ||
        a.item.name.localeCompare(b.item.name, "es"),
    )
    .map(({ item }) => item);
}

export async function listAdminBrands(): Promise<AdminBrand[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brands")
    .select("id, name, slug, is_active, products(count)")
    .order("name");
  if (error) queryError("las marcas", error.code);

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    isActive: row.is_active,
    productCount: countOf(row.products),
  }));
}
