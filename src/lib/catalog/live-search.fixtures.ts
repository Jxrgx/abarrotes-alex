import type { LiveSearchItem } from "./live-search";

// Catálogo sintético para pruebas de la búsqueda instantánea (no son datos reales).
let next = 0;
function item(
  name: string,
  presentation: string | null,
  brand: string | null,
  category: string,
  subcategory: string,
  extra: Partial<LiveSearchItem> = {},
): LiveSearchItem {
  next += 1;
  const slug = (value: string) =>
    value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    id: `00000000-0000-4000-8000-${String(next).padStart(12, "0")}`,
    slug: slug(`${name} ${presentation ?? ""}`),
    name,
    presentation,
    brand,
    brandSlug: brand ? slug(brand) : null,
    category,
    categorySlug: slug(category),
    subcategory,
    subcategorySlug: slug(subcategory),
    imagePath: null,
    priceCents: 2000,
    promoPriceCents: null,
    isAvailable: true,
    ...extra,
  };
}

export const LIVE_SEARCH_FIXTURE: LiveSearchItem[] = [
  item("Coca-Cola", "600 ml", "Coca-Cola", "Bebidas", "Refrescos", { priceCents: 1800, promoPriceCents: 1500 }),
  item("Coca-Cola", "1.75 L", "Coca-Cola", "Bebidas", "Refrescos", { priceCents: 3200 }),
  item("Coca-Cola Sin Azúcar", "600 ml", "Coca-Cola", "Bebidas", "Refrescos"),
  item("Refresco de cola", "2 L", "Burbuja", "Bebidas", "Refrescos"),
  item("Agua natural", "1.5 L", "Manantial Claro", "Bebidas", "Agua"),
  item("Jugo de mango", "1 L", "Fruta Viva", "Bebidas", "Jugos", { isAvailable: false }),
  item("Leche entera", "1 L", "Lala", "Lácteos", "Leche"),
  item("Leche deslactosada", "1 L", "Lala", "Lácteos", "Leche"),
  item("Leche light", "1 L", "Alpura", "Lácteos", "Leche"),
  item("Leche semidescremada", "1 L", "Santa Clara", "Lácteos", "Leche"),
  item("Leche en polvo", "360 g", "Nido", "Lácteos", "Leche"),
  item("Leche de almendra", "946 ml", "Silk", "Lácteos", "Leche"),
  item("Leche condensada", "387 g", "La Lechera", "Lácteos", "Leche"),
  item("Yogur bebible de fresa", "250 g", "Lala", "Lácteos", "Yogur"),
  item("Jabón de tocador", "150 g", "Zest", "Limpieza", "Jabones"),
  item("Jabón para trastes", "750 ml", "Salvo", "Limpieza", "Lavatrastes"),
  item("Cacahuate japonés a granel", "1 kg", "Crujis", "Botanas", "Cacahuates"),
  item("Papas fritas con sal", "45 g", "Crujis", "Botanas", "Papas"),
  item("Galletas de chocolate", "250 g", "Doña Galleta", "Galletas", "Dulces"),
  item("Detergente en polvo", "1 kg", "Brillex", "Limpieza", "Detergentes"),
  item("Pan blanco", "680 g", null, "Panadería", "Pan de caja"),
];
