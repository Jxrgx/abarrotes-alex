import "server-only";

import sharp from "sharp";

import {
  IMAGE_ACCEPTED_FORMATS,
  IMAGE_MAX_BYTES,
  IMAGE_MAX_DIMENSION,
  IMAGE_MESSAGES,
  IMAGE_WEBP_QUALITY,
  validateImageFile,
} from "./image-rules";

// Procesamiento de fotos de producto en el servidor con sharp (libvips).
// - Decodifica DE VERDAD el archivo: un .exe renombrado a .jpg falla aquí aunque
//   el navegador diga image/jpeg.
// - Corrige la orientación EXIF (rotate), reduce a ≤ 1200 px sin agrandar las
//   pequeñas, conserva la proporción (sin recortes) y la transparencia.
// - Salida WebP calidad 82. sharp no copia metadatos por defecto: se eliminan EXIF/GPS.
export type ProcessedImage = {
  data: Buffer;
  width: number;
  height: number;
  inputBytes: number;
  outputBytes: number;
};

const BUCKET_MAX_BYTES = 2 * 1024 * 1024; // file_size_limit del bucket

export async function processProductImage(file: File): Promise<{ ok: true; image: ProcessedImage } | { ok: false; message: string }> {
  const quick = validateImageFile(file);
  if (quick) return { ok: false, message: quick };

  const input = Buffer.from(await file.arrayBuffer());
  if (input.length > IMAGE_MAX_BYTES) return { ok: false, message: IMAGE_MESSAGES.tooLarge };

  try {
    // failOn "error": rechaza archivos truncados/corruptos sin ser demasiado estricto
    // con advertencias benignas de algunas cámaras. Límite de píxeles por defecto de sharp.
    const metadata = await sharp(input, { failOn: "error" }).metadata();
    if (!(IMAGE_ACCEPTED_FORMATS as readonly string[]).includes(metadata.format ?? "")) {
      return { ok: false, message: IMAGE_MESSAGES.type };
    }

    const { data, info } = await sharp(input, { failOn: "error" })
      .rotate()
      .resize({ width: IMAGE_MAX_DIMENSION, height: IMAGE_MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .webp({ quality: IMAGE_WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });

    if (data.length > BUCKET_MAX_BYTES) return { ok: false, message: IMAGE_MESSAGES.unprocessable };
    return { ok: true, image: { data, width: info.width, height: info.height, inputBytes: input.length, outputBytes: data.length } };
  } catch {
    return { ok: false, message: IMAGE_MESSAGES.unprocessable };
  }
}
