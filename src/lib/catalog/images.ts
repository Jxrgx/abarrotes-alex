import { getSupabaseEnv } from "@/lib/supabase/env";

// Bucket público previsto para imágenes de producto (aún no creado; ver docs/database.md).
export const PRODUCT_IMAGES_BUCKET = "product-images";

// products.image_path guarda solo el object path; la URL pública se arma aquí.
export function productImageUrl(imagePath: string) {
  const { url } = getSupabaseEnv();
  const path = imagePath.split("/").map(encodeURIComponent).join("/");
  return `${url}/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/${path}`;
}
