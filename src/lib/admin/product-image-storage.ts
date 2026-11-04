import "server-only";

import { randomUUID } from "node:crypto";

import { PRODUCT_IMAGES_BUCKET } from "@/lib/catalog/images";
import type { createClient } from "@/lib/supabase/server";

import { IMAGE_MESSAGES, isProductImagePath, productImagePath } from "./image-rules";
import type { ProcessedImage } from "./product-image";

// Storage + products.image_path (Fase 8C.2). No hay una transacción única entre
// PostgreSQL y Storage, así que el orden minimiza inconsistencias:
//
//   REEMPLAZAR / NUEVA:  subir path NUEVO → UPDATE image_path → borrar el anterior
//     - falla la subida → la BD no cambia (sigue la imagen anterior o el placeholder).
//     - falla el UPDATE  → se borra el objeto nuevo (compensación); sigue la anterior.
//     - falla borrar la anterior → queda un objeto huérfano (se registra, sin detalles);
//       la BD ya apunta a la nueva, nunca a un objeto borrado.
//   ELIMINAR:            UPDATE image_path = NULL → borrar el objeto
//     - si falla el borrado, queda huérfano (registrado); la tienda ya muestra placeholder.
//
// Todo con el cliente AUTENTICADO del admin: políticas de storage.objects con
// private.is_admin(). Nunca service_role.

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Outcome = { ok: true } | { ok: false; message: string };

// Caché de 1 año: cada versión tiene path propio (uuid), nunca se sobrescribe.
const CACHE_SECONDS = "31536000";

function log(step: string, code: string | undefined) {
  console.error(`[admin] product-images ${step}: ${code ?? "sin código"}`); // nunca detalles ni paths
}

async function currentImagePath(supabase: Supabase, productId: string) {
  const { data, error } = await supabase.from("products").select("image_path").eq("id", productId).maybeSingle();
  if (error) log("leer image_path", error.code);
  return { error: Boolean(error) || !data, path: data?.image_path ?? null };
}

async function removeObject(supabase: Supabase, path: string, step: string) {
  const { error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([path]);
  if (error) log(step, (error as { statusCode?: string }).statusCode ?? error.name);
}

export async function replaceProductImage(supabase: Supabase, productId: string, image: ProcessedImage): Promise<Outcome> {
  const previous = await currentImagePath(supabase, productId);
  if (previous.error) return { ok: false, message: IMAGE_MESSAGES.saveFailed };

  const path = productImagePath(productId, randomUUID());
  const upload = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).upload(path, image.data, {
    contentType: "image/webp",
    cacheControl: CACHE_SECONDS,
    upsert: false,
  });
  if (upload.error) {
    log("subir", (upload.error as { statusCode?: string }).statusCode ?? upload.error.name);
    return { ok: false, message: IMAGE_MESSAGES.saveFailed };
  }

  const { data, error } = await supabase.from("products").update({ image_path: path }).eq("id", productId).select("id");
  if (error || data.length === 0) {
    log("actualizar image_path", error?.code ?? "0 filas");
    await removeObject(supabase, path, "compensación (borrar nueva)");
    return { ok: false, message: IMAGE_MESSAGES.saveFailed };
  }

  // La nueva ya es la referencia: ahora sí se puede borrar la anterior.
  if (isProductImagePath(previous.path, productId) && previous.path !== path) {
    await removeObject(supabase, previous.path, "borrar anterior (huérfano)");
  }
  return { ok: true };
}

export async function removeProductImage(supabase: Supabase, productId: string): Promise<Outcome> {
  const previous = await currentImagePath(supabase, productId);
  if (previous.error) return { ok: false, message: IMAGE_MESSAGES.saveFailed };
  if (!previous.path) return { ok: true };

  const { data, error } = await supabase.from("products").update({ image_path: null }).eq("id", productId).select("id");
  if (error || data.length === 0) {
    log("quitar image_path", error?.code ?? "0 filas");
    return { ok: false, message: "No pudimos eliminar la imagen. Intenta de nuevo." };
  }
  // Solo se borran objetos con el formato de la aplicación (nunca paths ajenos).
  if (isProductImagePath(previous.path, productId)) await removeObject(supabase, previous.path, "borrar eliminada (huérfano)");
  return { ok: true };
}
