// Slugs del catálogo (categorías, subcategorías, marcas y, después, productos).
// Mismo formato que el CHECK de la base: ^[a-z0-9]+(-[a-z0-9]+)*$
//   "Lácteos" → "lacteos" · "Refrescos y bebidas" → "refrescos-y-bebidas" · "Doña María" → "dona-maria"
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // á → a, ñ → n, ü → u
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // espacios, signos y cualquier otro carácter → un guion
    .replace(/^-+|-+$/g, ""); // sin guiones al inicio ni al final
}
