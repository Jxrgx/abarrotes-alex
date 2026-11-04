import { getSupabaseEnv } from "@/lib/supabase/env";

// Bucket público de solo lectura para fotos de producto (migración …000900, docs/storage.md).
export const PRODUCT_IMAGES_BUCKET = "product-images";

// products.image_path guarda solo el object path; la URL pública se arma SOLO aquí
// (tienda, admin, búsqueda instantánea y carrito usan ProductImage → este helper).
export function productImageUrl(imagePath: string) {
  const { url } = getSupabaseEnv();
  const path = imagePath.split("/").map(encodeURIComponent).join("/");
  return `${url}/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/${path}`;
}
