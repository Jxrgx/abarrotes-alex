import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { crc32, deflateSync } from "node:zlib";

import sharp from "sharp";

import { IMAGE_MESSAGES, isProductImagePath, parseImageIntent, productImagePath, validateImageFile } from "./image-rules";
import { processProductImage } from "./product-image";

// Imágenes generadas por código (sin archivos externos ni contenido con copyright).
async function makeImage(width: number, height: number, format: "jpeg" | "png" | "webp", options: { noisy?: boolean; orientation?: number } = {}) {
  const channels = 3;
  const raw = Buffer.alloc(width * height * channels);
  for (let i = 0; i < raw.length; i += channels) {
    const pixel = i / channels;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    // Degradado + ruido: simula una foto (difícil de comprimir, como las de un teléfono).
    const noise = options.noisy ? (pixel * 2654435761) % 64 : 0;
    raw[i] = (x * 255) / width + noise;
    raw[i + 1] = (y * 255) / height + noise;
    raw[i + 2] = 120 + noise;
  }
  let image = sharp(raw, { raw: { width, height, channels } });
  if (options.orientation) image = image.withMetadata({ orientation: options.orientation });
  return image[format]({ quality: 95 }).toBuffer();
}
const asFile = (data: Uint8Array, name: string, type: string) => new File([new Uint8Array(data)], name, { type });
const SIZE_LOG: string[] = [];

describe("validación rápida (navegador y servidor)", () => {
  test("acepta JPG, PNG y WebP; rechaza otros MIME, vacío y > 10 MB", () => {
    assert.equal(validateImageFile({ type: "image/jpeg", size: 1000 }), null);
    assert.equal(validateImageFile({ type: "image/png", size: 1000 }), null);
    assert.equal(validateImageFile({ type: "image/webp", size: 1000 }), null);
    assert.equal(validateImageFile({ type: "image/heic", size: 1000 }), IMAGE_MESSAGES.type);
    assert.equal(validateImageFile({ type: "image/gif", size: 1000 }), IMAGE_MESSAGES.type);
    assert.equal(validateImageFile({ type: "application/pdf", size: 1000 }), IMAGE_MESSAGES.type);
    assert.equal(validateImageFile({ type: "image/jpeg", size: 0 }), IMAGE_MESSAGES.unprocessable);
    assert.equal(validateImageFile({ type: "image/jpeg", size: 10 * 1024 * 1024 + 1 }), IMAGE_MESSAGES.tooLarge);
  });
  test("intención del formulario", () => {
    const form = new FormData();
    assert.deepEqual(parseImageIntent(form), { ok: true, action: "keep", file: null });
    form.set("imageAction", "remove");
    assert.deepEqual(parseImageIntent(form), { ok: true, action: "remove", file: null });
    form.set("imageAction", "replace");
    assert.equal(parseImageIntent(form).ok, false); // replace sin archivo
  });
  test("path versionado controlado por la aplicación", () => {
    const product = "11111111-1111-4111-8111-111111111111";
    const version = "22222222-2222-4222-8222-222222222222";
    assert.equal(productImagePath(product, version), `products/${product}/${version}.webp`);
    assert.ok(isProductImagePath(productImagePath(product, version), product));
    assert.ok(!isProductImagePath(productImagePath(product, version), "33333333-3333-4333-8333-333333333333"));
    for (const bad of ["products/x/main.webp", "otro/archivo.webp", "../products/a.webp", null]) assert.ok(!isProductImagePath(bad));
  });
});

describe("procesamiento con sharp (servidor)", () => {
  for (const format of ["jpeg", "png", "webp"] as const) {
    test(`${format} válido → WebP ≤ 1200 px`, async () => {
      const input = await makeImage(2000, 1500, format, { noisy: true });
      const result = await processProductImage(asFile(input, `foto.${format}`, `image/${format}`));
      assert.ok(result.ok);
      const meta = await sharp(result.image.data).metadata();
      assert.equal(meta.format, "webp");
      assert.equal(Math.max(meta.width!, meta.height!), 1200);
      assert.equal(result.image.width / result.image.height, 2000 / 1500); // proporción, sin recorte
      SIZE_LOG.push(`${format} 2000×1500: ${(input.length / 1024).toFixed(0)} KB → ${(result.image.outputBytes / 1024).toFixed(0)} KB (${result.image.width}×${result.image.height})`);
    });
  }

  test("foto grande tipo teléfono (4032×3024) se reduce mucho", async () => {
    const input = await makeImage(4032, 3024, "jpeg", { noisy: true });
    const result = await processProductImage(asFile(input, "IMG_0001.jpg", "image/jpeg"));
    assert.ok(result.ok);
    assert.deepEqual([result.image.width, result.image.height], [1200, 900]);
    assert.ok(result.image.outputBytes < input.length / 4, `${result.image.outputBytes} vs ${input.length}`);
    SIZE_LOG.push(`jpeg 4032×3024: ${(input.length / 1024).toFixed(0)} KB → ${(result.image.outputBytes / 1024).toFixed(0)} KB (1200×900)`);
  });

  test("vertical conserva proporción (1200 de alto)", async () => {
    const result = await processProductImage(asFile(await makeImage(900, 1800, "jpeg"), "v.jpg", "image/jpeg"));
    assert.ok(result.ok);
    assert.deepEqual([result.image.width, result.image.height], [600, 1200]);
  });

  test("horizontal conserva proporción (1200 de ancho)", async () => {
    const result = await processProductImage(asFile(await makeImage(1800, 600, "png"), "h.png", "image/png"));
    assert.ok(result.ok);
    assert.deepEqual([result.image.width, result.image.height], [1200, 400]);
  });

  test("imagen pequeña no se agranda", async () => {
    const result = await processProductImage(asFile(await makeImage(320, 240, "png"), "chica.png", "image/png"));
    assert.ok(result.ok);
    assert.deepEqual([result.image.width, result.image.height], [320, 240]);
  });

  test("orientación EXIF corregida y metadatos eliminados", async () => {
    // 600×300 almacenada con orientación 6 (rotar 90°): debe quedar 300×600.
    const input = await makeImage(600, 300, "jpeg", { orientation: 6 });
    const result = await processProductImage(asFile(input, "rotada.jpg", "image/jpeg"));
    assert.ok(result.ok);
    assert.deepEqual([result.image.width, result.image.height], [300, 600]);
    const meta = await sharp(result.image.data).metadata();
    assert.equal(meta.exif, undefined);
    assert.equal(meta.orientation, undefined);
  });

  test("> 10 MB se rechaza antes de decodificar", async () => {
    const result = await processProductImage(asFile(Buffer.alloc(10 * 1024 * 1024 + 10), "enorme.jpg", "image/jpeg"));
    assert.deepEqual(result, { ok: false, message: IMAGE_MESSAGES.tooLarge });
  });

  test("MIME inválido", async () => {
    const result = await processProductImage(asFile(await makeImage(100, 100, "png"), "x.gif", "image/gif"));
    assert.deepEqual(result, { ok: false, message: IMAGE_MESSAGES.type });
  });

  test("ejecutable renombrado a .jpg con MIME image/jpeg", async () => {
    const fake = Buffer.concat([Buffer.from("MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff"), Buffer.alloc(4096, 7)]);
    const result = await processProductImage(asFile(fake, "producto.jpg", "image/jpeg"));
    assert.deepEqual(result, { ok: false, message: IMAGE_MESSAGES.unprocessable });
  });

  test("JPEG corrupto (truncado a la mitad)", async () => {
    const good = await makeImage(800, 600, "jpeg", { noisy: true });
    const result = await processProductImage(asFile(good.subarray(0, Math.floor(good.length / 2)), "rota.jpg", "image/jpeg"));
    assert.deepEqual(result, { ok: false, message: IMAGE_MESSAGES.unprocessable });
  });

  test("formato real distinto del permitido (GIF con MIME image/png)", async () => {
    const gif = await sharp({ create: { width: 50, height: 50, channels: 3, background: "#155EEF" } }).gif().toBuffer();
    const result = await processProductImage(asFile(gif, "logo.png", "image/png"));
    assert.deepEqual(result, { ok: false, message: IMAGE_MESSAGES.type });
  });

  test("bomba de descompresión: PNG diminuto que declara 30 000 × 30 000 px se rechaza sin decodificar", async () => {
    // Firma PNG + cabecera IHDR válida (30000×30000, RGB 8 bits) + IDAT mínimo: unos pocos
    // bytes que, decodificados, ocuparían ~2.7 GB en memoria.
    const chunk = (type: string, data: Buffer) => {
      const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
      const length = Buffer.alloc(4);
      length.writeUInt32BE(data.length);
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(crc32(body) >>> 0);
      return Buffer.concat([length, body, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(30_000, 0);
    ihdr.writeUInt32BE(30_000, 4);
    ihdr.set([8, 2, 0, 0, 0], 8);
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.alloc(1))), chunk("IEND", Buffer.alloc(0))]);
    assert.ok(png.length < 200, `${png.length} bytes`);
    const started = Date.now();
    const result = await processProductImage(asFile(png, "bomba.png", "image/png"));
    assert.equal(result.ok, false);
    assert.ok(!result.ok && (result.message === IMAGE_MESSAGES.dimensions || result.message === IMAGE_MESSAGES.unprocessable), !result.ok ? result.message : "");
    assert.ok(Date.now() - started < 2000, "se rechaza al instante (sin decodificar)");
  });

  test("dimensiones válidas pero absurdas (13 000 × 100) se rechazan", async () => {
    const wide = await sharp({ create: { width: 13_000, height: 100, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const result = await processProductImage(asFile(wide, "panoramica.png", "image/png"));
    assert.deepEqual(result, { ok: false, message: IMAGE_MESSAGES.dimensions });
  });

  test("resumen de tamaños", () => {
    console.log(`\n    ${SIZE_LOG.join("\n    ")}`);
    assert.ok(SIZE_LOG.length >= 4);
  });
});
