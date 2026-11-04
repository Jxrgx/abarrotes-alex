import "server-only";

import { toCents } from "@/lib/catalog/pricing";
import { formatPresentation } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import type { ProductUnit, SaleType } from "./product-forms";

// Listado administrativo de productos (Fase 8C.1). Cliente AUTENTICADO (RLS del
// admin: incluye inactivos). Producto + subcategoría + categoría + marca + precios
// por sucursal + promociones en UNA consulta (embeds de PostgREST), sin N+1.

export type AdminBranchPrice = {
  /** id de branch_products (acciones rápidas de disponibilidad). */
  id: string;
  branchId: string;
  priceCents: number;
  /** Texto para el formulario ("18.50"). */
  price: string;
  isAvailable: boolean;
  /** Promoción vigente más baja (puede no aplicar si no es menor al precio). */
  promoCents: number | null;
};

export type AdminProduct = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  isFeatured: boolean;
  presentation: string | null;
  presentationValue: string | null;
  unit: ProductUnit | null;
  saleType: SaleType;
  imagePath: string | null;
  subcategoryId: string;
  subcategoryName: string;
  subcategoryActive: boolean;
  categoryId: string;
  categoryName: string;
  categoryActive: boolean;
  brandId: string | null;
  brandName: string | null;
  brandActive: boolean;
  /** Por sucursal (branchId → precio). */
  prices: Record<string, AdminBranchPrice>;
};

export type ProductFormOptions = {
  categories: { id: string; name: string; isActive: boolean }[];
  subcategories: { id: string; name: string; categoryId: string; isActive: boolean }[];
  brands: { id: string; name: string; isActive: boolean }[];
  branches: { id: string; name: string; isActive: boolean }[];
};

function queryError(what: string, code: string | undefined): never {
  console.error(`[admin] ${what}: ${code ?? "sin código"}`); // solo el código
  throw new Error(`No se pudieron cargar ${what}.`);
}

type Promo = { promotional_price: number; starts_at: string | null; ends_at: string | null; is_active: boolean };

// Promoción vigente (misma regla que la RLS pública: activa y dentro de su vigencia).
function currentPromoCents(promotions: Promo[], now: number): number | null {
  const current = promotions.filter(
    (promo) =>
      promo.is_active &&
      (promo.starts_at === null || Date.parse(promo.starts_at) <= now) &&
      (promo.ends_at === null || Date.parse(promo.ends_at) > now),
  );
  return current.length ? Math.min(...current.map((promo) => toCents(promo.promotional_price))) : null;
}

export async function listAdminProducts(): Promise<AdminProduct[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      `id, name, slug, is_active, is_featured, presentation, unit, sale_type, image_path, subcategory_id, brand_id,
       subcategory:subcategories!inner ( name, is_active, sort_order, category:categories!inner ( id, name, is_active, sort_order ) ),
       brand:brands ( name, is_active ),
       branch_products ( id, branch_id, price, is_available, promotions ( promotional_price, starts_at, ends_at, is_active ) )`,
    )
    .order("name");
  if (error) queryError("los productos", error.code);

  // Hora de la petición (el panel es dinámico: requireAdmin → connection()).
  const now = Date.now();
  return data
    .map((row) => ({
      sortKey: [row.subcategory.category.sort_order, row.subcategory.sort_order] as const,
      item: {
        id: row.id,
        name: row.name,
        slug: row.slug,
        isActive: row.is_active,
        isFeatured: row.is_featured,
        presentation: formatPresentation(row.presentation, row.unit),
        presentationValue: row.presentation === null ? null : String(row.presentation),
        unit: row.unit,
        saleType: row.sale_type,
        imagePath: row.image_path,
        subcategoryId: row.subcategory_id,
        subcategoryName: row.subcategory.name,
        subcategoryActive: row.subcategory.is_active,
        categoryId: row.subcategory.category.id,
        categoryName: row.subcategory.category.name,
        categoryActive: row.subcategory.category.is_active,
        brandId: row.brand_id,
        brandName: row.brand?.name ?? null,
        brandActive: row.brand?.is_active ?? true,
        prices: Object.fromEntries(
          row.branch_products.map((bp) => [
            bp.branch_id,
            {
              id: bp.id,
              branchId: bp.branch_id,
              priceCents: toCents(bp.price),
              price: (toCents(bp.price) / 100).toFixed(2),
              isAvailable: bp.is_available,
              promoCents: currentPromoCents(bp.promotions, now),
            },
          ]),
        ),
      } satisfies AdminProduct,
    }))
    // Como en la tienda: orden de categoría, de subcategoría y nombre.
    .sort((a, b) => a.sortKey[0] - b.sortKey[0] || a.sortKey[1] - b.sortKey[1] || a.item.name.localeCompare(b.item.name, "es"))
    .map(({ item }) => item);
}

export async function getProductFormOptions(): Promise<ProductFormOptions> {
  const supabase = await createClient();
  const [categories, subcategories, brands, branches] = await Promise.all([
    supabase.from("categories").select("id, name, is_active").order("sort_order").order("name"),
    supabase.from("subcategories").select("id, name, category_id, is_active").order("sort_order").order("name"),
    supabase.from("brands").select("id, name, is_active").order("name"),
    supabase.from("branches").select("id, name, is_active").order("is_active", { ascending: false }).order("name"),
  ]);
  for (const result of [categories, subcategories, brands, branches]) {
    if (result.error) queryError("las opciones del formulario", result.error.code);
  }
  return {
    categories: categories.data!.map((row) => ({ id: row.id, name: row.name, isActive: row.is_active })),
    subcategories: subcategories.data!.map((row) => ({ id: row.id, name: row.name, categoryId: row.category_id, isActive: row.is_active })),
    brands: brands.data!.map((row) => ({ id: row.id, name: row.name, isActive: row.is_active })),
    branches: branches.data!.map((row) => ({ id: row.id, name: row.name, isActive: row.is_active })),
  };
}
