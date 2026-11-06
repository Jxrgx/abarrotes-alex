// Genera los assets de marca a partir del logo original de Abarrotes Alex (JPG cuadrado,
// círculo azul sobre fondo blanco). Solo adaptaciones técnicas: recorte del margen blanco,
// máscara circular (transparencia fuera del círculo), resize y conversión de formato.
// No se recolorea, redibuja ni vectoriza. Ver docs/production.md §17.
// Uso: node scripts/brand-assets.mjs "<ruta al logo original .jpg>"
import { writeFileSync } from "node:fs";

import sharp from "sharp";

const source = process.argv[2];
if (!source) throw new Error('Uso: node scripts/brand-assets.mjs "<logo original>"');

// Límites del círculo medidos en el original de 1080×1080: diámetro 1046 px desde (19, 8).
const CROP = { left: 19, top: 8, width: 1046, height: 1046 };
// Radio de la máscara ~3 px menor que el círculo para quitar el halo blanco del JPEG.
const MASK_RADIUS = 520;

const size = CROP.width;
const mask = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${MASK_RADIUS}" fill="#fff"/></svg>`,
);
const circle = await sharp(source).extract(CROP).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
const resized = (px) => sharp(circle).resize(px, px, { kernel: "lanczos3" });

// UI (header, panel, login): círculo con transparencia; next/image genera los tamaños.
await resized(512).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile("public/brand/logo.webp");

// PWA del panel (public/admin.webmanifest): 192 y 512 "any" (círculo transparente) y
// 512 "maskable": el círculo al 78 % sobre fondo blanco, dentro de la zona segura
// (círculo de radio 40 %) para que Android pueda recortarlo sin cortar el texto.
await resized(192).png({ compressionLevel: 9, palette: true }).toFile("public/brand/icon-192.png");
await resized(512).png({ compressionLevel: 9, palette: true }).toFile("public/brand/icon-512.png");
await sharp({ create: { width: 512, height: 512, channels: 4, background: "#ffffff" } })
  .composite([{ input: await resized(400).png().toBuffer(), gravity: "center" }])
  .png({ compressionLevel: 9, palette: true })
  .toFile("public/brand/icon-maskable-512.png");

// Ícono PNG para navegadores que piden más resolución que el .ico.
await resized(192).png({ compressionLevel: 9, palette: true }).toFile("src/app/icon.png");

// Apple touch icon: iOS no admite transparencia (las esquinas saldrían negras), así que
// se usa el original cuadrado (círculo sobre su fondo blanco), con resize.
await sharp(source).resize(180, 180, { kernel: "lanczos3" }).png({ compressionLevel: 9, palette: true }).toFile("src/app/apple-icon.png");

// favicon.ico con PNG de 16, 32 y 48 px (formato ICO con imágenes PNG embebidas).
const entries = await Promise.all([16, 32, 48].map(async (px) => ({ px, png: await resized(px).png({ compressionLevel: 9 }).toBuffer() })));
const header = Buffer.alloc(6 + 16 * entries.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(entries.length, 4);
let offset = header.length;
entries.forEach(({ px, png }, i) => {
  const at = 6 + 16 * i;
  header.writeUInt8(px, at);
  header.writeUInt8(px, at + 1);
  header.writeUInt16LE(1, at + 4); // planos
  header.writeUInt16LE(32, at + 6); // bits por pixel
  header.writeUInt32LE(png.length, at + 8);
  header.writeUInt32LE(offset, at + 12);
  offset += png.length;
});
writeFileSync("src/app/favicon.ico", Buffer.concat([header, ...entries.map((entry) => entry.png)]));

console.log("Assets de marca generados: public/brand/{logo.webp,icon-192.png,icon-512.png,icon-maskable-512.png}, src/app/{favicon.ico,icon.png,apple-icon.png}");
