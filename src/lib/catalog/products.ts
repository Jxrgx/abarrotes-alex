import { cache } from "react";

import { formatPresentation, formatUnit } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

import { catalogQueryError } from "./errors";

type SaleType = Database["public"]["Enums"]["sale_type"];
type ProductUnit = Database["public"]["Enums"]["product_unit"];

export type CatalogProduct = {
  /** id de branch_products: el producto dentro de una sucursal. */
  id: string;
  productId: string;
  name: string;
  slug: string;
  brandName: string | null;
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
};

// Una sola consulta por sucursal con todo lo necesario para la tarjeta:
// - products/subcategories/categories con !inner: RLS ya oculta inactivos.
// - brands SIN !inner: brand_id es opcional y no debe excluir productos.
// - promotions: RLS solo devuelve las activas y vigentes.
const BRANCH_PRODUCT_SELECT = `
  id,
  price,
  is_available,
  product:products!inner (
    id, name, slug, presentation, unit, sale_type, image_path, is_featured,
    brand:brands ( name ),
    subcategory:subcategories!inner (
      sort_order,
      category:categories!inner ( name, slug, sort_order )
    )
  ),
  promotions ( promotional_price )
`;

export type ProductQuery = {
  categorySlug?: string;
  subcategoryId?: string;
  brandId?: string;
  /** Cada término debe coincidir en el nombre del producto o en su marca. */
  search?: { term: string; brandIds: string[] }[];
};

// Los filtros se aplican en PostgreSQL sobre el embed `product` (con !inner,
// filtrar el embed filtra las filas de branch_products).
export const getBranchProducts = cache(
  async (branchId: string, filters: ProductQuery = {}): Promise<CatalogProduct[]> => {
    const supabase = await createClient();
    let query = supabase
      .from("branch_products")
      .select(BRANCH_PRODUCT_SELECT)
      .eq("branch_id", branchId);

    if (filters.categorySlug) {
      query = query.eq("product.subcategory.category.slug", filters.categorySlug);
    }
    if (filters.subcategoryId) {
      query = query.eq("product.subcategory_id", filters.subcategoryId);
    }
    if (filters.brandId) {
      query = query.eq("product.brand_id", filters.brandId);
    }
    // ILIKE es insensible a mayúsculas (incluidas las acentuadas). Cada término debe
    // aparecer al inicio de una palabra del nombre (o ser una marca que coincide).
    // Los términos ya vienen saneados (sin comas, paréntesis ni comodines).
    for (const { term, brandIds } of filters.search ?? []) {
      const conditions = [`name.ilike.${term}*`, `name.ilike.* ${term}*`, `name.ilike.*-${term}*`];
      if (brandIds.length > 0) conditions.push(`brand_id.in.(${brandIds.join(",")})`);
      query = query.or(conditions.join(","), { referencedTable: "product" });
    }

    const { data, error } = await query;
    if (error) throw catalogQueryError("los productos", error);

    return data
      .map((row) => {
        const { product } = row;
        const { subcategory } = product;
        return {
          sortKey: [subcategory.category.sort_order, subcategory.sort_order] as const,
          item: {
            id: row.id,
            productId: product.id,
            name: product.name,
            slug: product.slug,
            brandName: product.brand?.name ?? null,
            presentation: formatPresentation(product.presentation, product.unit),
            saleType: product.sale_type,
            priceUnit: priceUnitFor(product.sale_type, product.unit),
            imagePath: product.image_path,
            isFeatured: product.is_featured,
            isAvailable: row.is_available,
            price: row.price,
            promoPrice: bestPromoPrice(row.price, row.promotions),
            category: { name: subcategory.category.name, slug: subcategory.category.slug },
          } satisfies CatalogProduct,
        };
      })
      .sort(
        (a, b) =>
          a.sortKey[0] - b.sortKey[0] ||
          a.sortKey[1] - b.sortKey[1] ||
          a.item.name.localeCompare(b.item.name, "es") ||
          (a.item.presentation ?? "").localeCompare(b.item.presentation ?? "", "es"),
      )
      .map(({ item }) => item);
  },
);

// Pares marca/subcategoría de todos los productos visibles de la sucursal.
// Sirven para ofrecer solo subcategorías y marcas que tienen productos.
export const getBranchFacets = cache(async (branchId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("branch_products")
    .select("product:products!inner ( brand_id, subcategory_id )")
    .eq("branch_id", branchId);

  if (error) throw catalogQueryError("los filtros", error);
  return data.map((row) => ({
    brandId: row.product.brand_id,
    subcategoryId: row.product.subcategory_id,
  }));
});

// Precio que ve el cliente: el promocional si hay oferta visible.
export function effectivePrice(product: CatalogProduct) {
  return product.promoPrice ?? product.price;
}

// El orden por precio efectivo se hace en el servidor de Next.js: el precio
// promocional sale de otra tabla y, con cientos de productos, ordenar en memoria
// es más simple que una vista o función SQL. Desempate estable por nombre.
export function sortProducts(products: CatalogProduct[], order: "precio-asc" | "precio-desc" | undefined) {
  if (!order) return products;
  const direction = order === "precio-asc" ? 1 : -1;
  return [...products].sort(
    (a, b) =>
      direction * (effectivePrice(a) - effectivePrice(b)) || a.name.localeCompare(b.name, "es"),
  );
}

// No es un motor de promociones: la BD decide qué promociones son visibles.
// Solo se elige la más baja y se ignora una que no sea realmente menor al precio.
function bestPromoPrice(price: number, promotions: { promotional_price: number }[]) {
  const lowest = Math.min(...promotions.map((promotion) => promotion.promotional_price));
  return Number.isFinite(lowest) && lowest < price ? lowest : null;
}

function priceUnitFor(saleType: SaleType, unit: ProductUnit | null) {
  return saleType === "weight" && unit ? formatUnit(unit) : null;
}
