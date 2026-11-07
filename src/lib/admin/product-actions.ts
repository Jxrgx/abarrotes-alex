"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/session";
import { slugify } from "@/lib/slug";
import { createClient } from "@/lib/supabase/server";

import type { MutationResult } from "./catalog-forms";
import { parseImageIntent } from "./image-rules";
import { type ProcessedImage, processProductImage } from "./product-image";
import { removeProductImage, replaceProductImage } from "./product-image-storage";
import { parseProductForm, productMutationError } from "./product-forms";

// Mutaciones de productos (Fase 8C.1). Igual que en 8B: requireAdmin() →
// Zod en el servidor → cliente autenticado (RLS) → revalidar.
//
// Alta/edición: UNA llamada a public.admin_save_product (products + branch_products
// en la misma transacción; ver migración …000800). Nunca dos escrituras sueltas.
// Acciones rápidas (activo, disponibilidad): un UPDATE de una sola tabla.

// Panel + tienda: inicio (destacados), catálogo y conteos del catálogo admin. La
// tienda no usa caché; revalidar limpia además la caché del router del navegador.
function revalidateProducts() {
  revalidatePath("/admin/productos");
  revalidatePath("/admin/categorias");
  revalidatePath("/admin/subcategorias");
  revalidatePath("/admin/marcas");
  revalidatePath("/");
  revalidatePath("/productos");
}

function failure(code: string | undefined): MutationResult {
  console.error(`[admin] products: ${code ?? "sin código"}`); // solo el código
  return { ok: false, ...productMutationError(code) };
}

// Los parámetros sin DEFAULT se generan como no-null aunque la función acepte NULL.
const nullable = <T,>(value: T | null) => value as T;

export async function saveProduct(formData: FormData): Promise<MutationResult> {
  await requireAdmin();
  const parsed = parseProductForm(formData);
  if (!parsed.ok) return parsed;
  const input = parsed.data;

  // Imagen: se valida y PROCESA antes de guardar nada. Un archivo inválido no deja
  // ni producto ni objeto en Storage.
  const intent = parseImageIntent(formData);
  if (!intent.ok) return { ok: false, message: "Revisa los campos marcados.", fieldErrors: { image: intent.message } };
  let processed: ProcessedImage | null = null;
  if (intent.action === "replace" && intent.file) {
    const result = await processProductImage(intent.file);
    if (!result.ok) return { ok: false, message: "Revisa los campos marcados.", fieldErrors: { image: result.message } };
    processed = result.image;
  }

  const supabase = await createClient();
  const { data: productId, error } = await supabase.rpc("admin_save_product", {
    p_product_id: nullable(input.id ?? null),
    p_name: input.name,
    p_slug: slugify(input.name),
    p_subcategory_id: input.subcategoryId,
    p_brand_id: nullable(input.brandId),
    // Texto decimal normalizado ("1.5"): JSON lo envía como número exacto para numeric.
    p_presentation: nullable(input.presentation === null ? null : Number(input.presentation)),
    p_unit: nullable(input.unit),
    p_sale_type: input.saleType,
    p_is_featured: input.isFeatured,
    p_is_active: input.isActive,
    // Precios como texto ("18.50"): la función valida el formato y convierte a numeric.
    p_branches: input.branches.map((branch) => ({
      branch_id: branch.branchId,
      price: branch.price,
      is_available: branch.isAvailable,
      // Conjunto COMPLETO de niveles: los no enviados se borran en la misma transacción.
      wholesale: branch.wholesale.map((tier) => ({
        id: tier.id,
        min_quantity: tier.minQuantity,
        max_quantity: tier.maxQuantity,
        unit_price: tier.unitPrice,
      })),
    })),
  });
  if (error) return failure(error.code);

  // Producto + precios ya están guardados (transacción propia). La imagen va después
  // y por separado: si falla, NO se revierte el producto; se informa al admin.
  let warning: string | undefined;
  if (processed) {
    const outcome = await replaceProductImage(supabase, productId, processed);
    if (!outcome.ok) warning = `El producto se guardó, pero la imagen no. ${outcome.message}`;
  } else if (intent.action === "remove" && input.id) {
    const outcome = await removeProductImage(supabase, productId);
    if (!outcome.ok) warning = `El producto se guardó, pero la imagen no se eliminó. ${outcome.message}`;
  }

  revalidateProducts();
  const mode = formData.get("mode");
  const message = input.id ? "Producto actualizado" : mode === "duplicate" ? "Producto duplicado" : "Producto creado";
  return { ok: true, message, warning };
}

const idSchema = z.uuid();

export async function setProductActive(id: string, isActive: boolean): Promise<MutationResult> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success || typeof isActive !== "boolean") {
    return { ok: false, message: "No encontramos este producto. Recarga la página." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("products").update({ is_active: isActive }).eq("id", id).select("id");
  if (error) return failure(error.code);
  if (data.length === 0) return { ok: false, message: "No encontramos este producto. Recarga la página." };
  revalidateProducts();
  return { ok: true, message: isActive ? "Producto activado" : "Producto desactivado" };
}

// Disponible / Agotado en una sucursal (id de branch_products).
export async function setProductAvailability(branchProductId: string, isAvailable: boolean): Promise<MutationResult> {
  await requireAdmin();
  if (!idSchema.safeParse(branchProductId).success || typeof isAvailable !== "boolean") {
    return { ok: false, message: "No encontramos este producto. Recarga la página." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("branch_products")
    .update({ is_available: isAvailable })
    .eq("id", branchProductId)
    .select("id");
  if (error) return failure(error.code);
  if (data.length === 0) return { ok: false, message: "No encontramos este producto. Recarga la página." };
  revalidateProducts();
  return { ok: true, message: isAvailable ? "Marcado como disponible" : "Marcado como agotado" };
}
