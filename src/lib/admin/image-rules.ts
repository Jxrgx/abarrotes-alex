// Reglas de imágenes de producto (Fase 8C.2). Puras: las usa el navegador (UX,
// antes de enviar) y el servidor (autoridad, junto con la decodificación real).

export const IMAGE_MAX_BYTES = 10 * 1024 * 1024; // archivo original: 10 MB
export const IMAGE_ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/** Formatos que sharp debe DETECTAR al decodificar (no se confía en el MIME). */
export const IMAGE_ACCEPTED_FORMATS = ["jpeg", "png", "webp"] as const;
export const IMAGE_MAX_DIMENSION = 1200; // lado mayor de la imagen guardada
export const IMAGE_WEBP_QUALITY = 82;
/**
 * Límites contra "bombas de descompresión" (archivo pequeño que se expande a una imagen
 * gigantesca en memoria). Se comprueban con la cabecera ANTES de decodificar.
 * 40 MP cubre fotos de teléfono de hasta ~48 MP recortadas, y 12 000 px por lado.
 */
export const IMAGE_MAX_INPUT_PIXELS = 40_000_000;
export const IMAGE_MAX_INPUT_SIDE = 12_000;

export const IMAGE_MESSAGES = {
  tooLarge: "El archivo es demasiado grande. Máximo 10 MB.",
  type: "Usa una imagen JPG, PNG o WebP.",
  unprocessable: "No pudimos procesar la imagen.",
  dimensions: "La imagen es demasiado grande (dimensiones). Usa una foto de menor resolución.",
  saveFailed: "No pudimos guardar la imagen. Intenta de nuevo.",
} as const;

export type ImageAction = "keep" | "replace" | "remove";

type FileLike = { size: number; type: string; name?: string };

// Validación rápida (sin decodificar). El servidor además decodifica con sharp.
export function validateImageFile(file: FileLike): string | null {
  if (!(IMAGE_ACCEPTED_TYPES as readonly string[]).includes(file.type)) return IMAGE_MESSAGES.type;
  if (file.size === 0) return IMAGE_MESSAGES.unprocessable;
  if (file.size > IMAGE_MAX_BYTES) return IMAGE_MESSAGES.tooLarge;
  return null;
}

// Campos del formulario: imageAction = keep | replace | remove; image = File (si replace).
export function parseImageIntent(formData: FormData):
  | { ok: true; action: ImageAction; file: File | null }
  | { ok: false; message: string } {
  const raw = formData.get("imageAction");
  const action: ImageAction = raw === "replace" || raw === "remove" ? raw : "keep";
  if (action !== "replace") return { ok: true, action, file: null };
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Selecciona una imagen." };
  const error = validateImageFile(file);
  return error ? { ok: false, message: error } : { ok: true, action, file };
}

// Path versionado controlado por la aplicación: products/<productId>/<uuid>.webp
// (nunca el nombre original del archivo). Cada versión tiene su propia URL, así que
// la caché larga del CDN/navegador nunca sirve una imagen vieja.
export function productImagePath(productId: string, versionId: string) {
  return `products/${productId}/${versionId}.webp`;
}

// Solo objetos creados por la aplicación (protege de borrar paths ajenos).
export function isProductImagePath(path: string | null | undefined, productId?: string): path is string {
  if (!path) return false;
  const match = /^products\/([0-9a-f-]{36})\/[0-9a-f-]{36}\.webp$/.exec(path);
  return Boolean(match) && (productId === undefined || match![1] === productId);
}
