import { cache } from "react";

import { formatPresentation, formatUnit } from "@/lib/format";
import { getPublicSupabase } from "@/lib/supabase/public";
import type { Database } from "@/types/database";

import { catalogQueryError } from "./errors";
import type { SortOrder } from "./filters";

type SaleType = Database["public"]["Enums"]["sale_type"];
type ProductUnit = Database["public"]["Enums"]["product_unit"];
type CatalogRow = Database["public"]["Views"]["catalog_items"]["Row"];

export type CatalogProduct = {
  /** id de branch_products: el producto dentro de una sucursal. */
  id: string;
  branchId: string;
  productId: string;
  name: string;
  slug: string;
  brandName: string | null;
  brandSlug: string | null;
  presentation: string | null;
  saleType: SaleType;
  /** Unidad del precio en venta por peso ("kg"); null en venta por pieza. */
  priceUnit: string | null;
  imagePath: string | null;
  isFeatured: boolean;
  isAvailable: boolean;
  price: number;
  /** Precio promocional visible (RLS ya filtra vigencia); null si no hay oferta. */
  promoPrice: number | null;
  category: { name: string; slug: string };
  subcategory: { name: string; slug: string };
};

/**
 * 24 = múltiplo de 2, 3, 4 y 6 columnas: filas completas en todos los anchos.
 * QA_CATALOG_PAGE_SIZE (solo pruebas, 1–100) permite probar varias páginas con el
 * catálogo semilla en una instancia local; nunca se define en Vercel.
 */
export const CATALOG_PAGE_SIZE = (() => {
  const override = Number(process.env.QA_CATALOG_PAGE_SIZE);
  return Number.isInteger(override) && override >= 1 && override <= 100 ? override : 24;
})();

// Todo sale de la vista public.catalog_items (migración …20261107000100): una fila por
// producto de la sucursal, con RLS de quien consulta (security_invoker) y el precio
// efectivo calculado en la base. Así filtro, orden GLOBAL, conteo y paginación ocurren
// en PostgreSQL y nunca se descarga el catálogo completo.
const CATALOG_SELECT =
  "id, branch_id, product_id, price, is_available, name, slug, presentation, unit, sale_type, image_path, is_featured, brand_name, brand_slug, subcategory_name, subcategory_slug, category_name, category_slug, promo_price";


export type CatalogQuery = {
  categorySlug?: string;
  subcategoryId?: string;
  brandId?: string;
  /**
   * Cada término (normalizado: minúsculas, sin acentos) debe coincidir al inicio de una
   * palabra del nombre del producto, o con su marca o su subcategoría/categoría
   * (ids resueltos por el llamador).
   */
  search?: { term: string; brandIds: string[]; subcategoryIds: string[] }[];
  /** Solo productos con promoción vigente (home: Ofertas). */
  onSale?: boolean;
  /** Solo destacados (home). */
  featured?: boolean;
  order?: SortOrder;
  /** Página 1-based. */
  page?: number;
  pageSize?: number;
};

export type CatalogPage = {
  items: CatalogProduct[];
  /** Total real de resultados (count exact de PostgreSQL). */
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

function filtered(branchId: string, filters: CatalogQuery, head = false) {
  let query = getPublicSupabase()
    .from("catalog_items")
    .select(CATALOG_SELECT, { count: "exact", head })
    .eq("branch_id", branchId);

  if (filters.categorySlug) query = query.eq("category_slug", filters.categorySlug);
  if (filters.subcategoryId) query = query.eq("subcategory_id", filters.subcategoryId);
  if (filters.brandId) query = query.eq("brand_id", filters.brandId);
  if (filters.onSale) query = query.not("promo_price", "is", null);
  if (filters.featured) query = query.eq("is_featured", true);

  // search_name = nombre en minúsculas y sin acentos (columna generada con unaccent), así
  // "jabon" encuentra "Jabón". Cada término (AND entre términos) debe aparecer al inicio de
  // una palabra del nombre ("cola" encuentra "Refresco de cola" y "Coca-Cola", nunca
  // "chocolate"), o ser una marca/subcategoría/categoría que coincide.
  // Los términos ya vienen saneados (sin comas, paréntesis ni comodines).
  for (const { term, brandIds, subcategoryIds } of filters.search ?? []) {
    const conditions = [
      `search_name.ilike.${term}*`,
      `search_name.ilike.* ${term}*`,
      `search_name.ilike.*-${term}*`,
    ];
    if (brandIds.length > 0) conditions.push(`brand_id.in.(${brandIds.join(",")})`);
    if (subcategoryIds.length > 0) conditions.push(`subcategory_id.in.(${subcategoryIds.join(",")})`);
    query = query.or(conditions.join(","));
  }
  return query;
}

// Una página del catálogo con el total real. Orden SIEMPRE global (antes de paginar) y
// estable (id como último desempate) para que las páginas no repitan ni salten productos.
export const queryCatalog = cache(async (branchId: string, filters: CatalogQuery = {}): Promise<CatalogPage> => {
  const pageSize = filters.pageSize ?? CATALOG_PAGE_SIZE;
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const from = (page - 1) * pageSize;

  let query = filtered(branchId, filters);
  if (filters.order) {
    query = query.order("effective_price", { ascending: filters.order === "precio-asc" });
  } else {
    query = query.order("category_sort_order").order("subcategory_sort_order");
  }
  query = query.order("name").order("presentation", { nullsFirst: true }).order("id");

  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) {
    // Página más allá del final (PGRST103): no es un error; se informa el total real.
    if (error.code === "PGRST103") {
      const total = await countCatalog(branchId, filters);
      return { items: [], total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
    }
    throw catalogQueryError("los productos", error);
  }
  const total = count ?? 0;
  return { items: data.map(toCatalogProduct), total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
});

async function countCatalog(branchId: string, filters: CatalogQuery) {
  const { count, error } = await filtered(branchId, filters, true);
  if (error) throw catalogQueryError("los productos", error);
  return count ?? 0;
}

// Productos concretos (carrito): solo los pedidos, en una consulta.
export async function getBranchProductsByIds(branchId: string, productIds: string[]): Promise<CatalogProduct[]> {
  if (productIds.length === 0) return [];
  const { data, error } = await getPublicSupabase()
    .from("catalog_items")
    .select(CATALOG_SELECT)
    .eq("branch_id", branchId)
    .in("product_id", productIds);
  if (error) throw catalogQueryError("los productos", error);
  return data.map(toCatalogProduct);
}

// Pares marca/subcategoría de los productos visibles de la sucursal (dos uuid por
// producto, solo en el servidor). Sirven para ofrecer solo subcategorías y marcas con
// productos.
export const getBranchFacets = cache(async (branchId: string) => {
  const { data, error } = await getPublicSupabase()
    .from("catalog_items")
    .select("brand_id, subcategory_id")
    .eq("branch_id", branchId);

  if (error) throw catalogQueryError("los filtros", error);
  return data.map((row) => ({ brandId: row.brand_id, subcategoryId: row.subcategory_id }));
});

type CatalogSelected = Pick<
  CatalogRow,
  | "id"
  | "branch_id"
  | "product_id"
  | "price"
  | "is_available"
  | "name"
  | "slug"
  | "presentation"
  | "unit"
  | "sale_type"
  | "image_path"
  | "is_featured"
  | "brand_name"
  | "brand_slug"
  | "subcategory_name"
  | "subcategory_slug"
  | "category_name"
  | "category_slug"
  | "promo_price"
>;

function toCatalogProduct(row: CatalogSelected): CatalogProduct {
  return {
    id: row.id,
    branchId: row.branch_id,
    productId: row.product_id,
    name: row.name,
    slug: row.slug,
    brandName: row.brand_name,
    brandSlug: row.brand_slug,
    presentation: formatPresentation(row.presentation, row.unit),
    saleType: row.sale_type,
    priceUnit: priceUnitFor(row.sale_type, row.unit),
    imagePath: row.image_path,
    isFeatured: row.is_featured,
    isAvailable: row.is_available,
    price: row.price,
    // La vista ya aplica la regla: promoción vigente más baja solo si es menor al precio.
    promoPrice: row.promo_price,
    category: { name: row.category_name, slug: row.category_slug },
    subcategory: { name: row.subcategory_name, slug: row.subcategory_slug },
  };
}

function priceUnitFor(saleType: SaleType, unit: ProductUnit | null) {
  return saleType === "weight" && unit ? formatUnit(unit) : null;
}
