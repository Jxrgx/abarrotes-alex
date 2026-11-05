import "server-only";

import { toCents } from "@/lib/catalog/pricing";
import { formatPresentation } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

// Listado administrativo de promociones (Fase 8D). Cliente AUTENTICADO (RLS del admin:
// todas las promociones, activas e inactivas). Promoción + branch_product (precio normal
// ACTUAL y disponibilidad) + sucursal + producto + marca + clasificación en UNA consulta.

export type AdminPromotion = {
  id: string;
  branchProductId: string;
  promoCents: number;
  /** Texto para el formulario ("18.00"). */
  promotionalPrice: string;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  priceCents: number;
  isAvailable: boolean;
  branchId: string;
  branchName: string;
  productId: string;
  productName: string;
  productActive: boolean;
  presentation: string | null;
  imagePath: string | null;
  brandName: string | null;
  categoryName: string;
  subcategoryName: string;
};

export async function listAdminPromotions(): Promise<AdminPromotion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("promotions")
    .select(
      `id, promotional_price, starts_at, ends_at, is_active, branch_product_id, created_at,
       branch_product:branch_products!inner ( price, is_available, branch_id,
         branch:branches!inner ( name ),
         product:products!inner ( id, name, is_active, presentation, unit, image_path,
           brand:brands ( name ),
           subcategory:subcategories!inner ( name, category:categories!inner ( name ) ) ) )`,
    )
    .order("created_at", { ascending: false });
  if (error) {
    console.error(`[admin] promociones: ${error.code}`); // solo el código
    throw new Error("No se pudieron cargar las promociones.");
  }

  return data.map((row) => {
    const bp = row.branch_product;
    const product = bp.product;
    return {
      id: row.id,
      branchProductId: row.branch_product_id,
      promoCents: toCents(row.promotional_price),
      promotionalPrice: (toCents(row.promotional_price) / 100).toFixed(2),
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      isActive: row.is_active,
      priceCents: toCents(bp.price),
      isAvailable: bp.is_available,
      branchId: bp.branch_id,
      branchName: bp.branch.name,
      productId: product.id,
      productName: product.name,
      productActive: product.is_active,
      presentation: formatPresentation(product.presentation, product.unit),
      imagePath: product.image_path,
      brandName: product.brand?.name ?? null,
      categoryName: product.subcategory.category.name,
      subcategoryName: product.subcategory.name,
    };
  });
}
