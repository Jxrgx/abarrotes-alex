import Fuse, { type IFuseOptions } from "fuse.js";

import { type CatalogFilters, productFocusHref } from "./filters";
import { normalizeSearchText } from "./normalize";

// Búsqueda instantánea (autocomplete) con Fuse.js sobre un índice ligero de la
// sucursal. Es una mejora progresiva: la búsqueda completa sigue siendo
// /productos?q= (PostgreSQL, server-side). Ver docs/catalog.md.

/** Elemento del índice público (GET /api/busqueda). Montos en centavos. */
export type LiveSearchItem = {
  id: string;
  slug: string;
  name: string;
  presentation: string | null;
  brand: string | null;
  brandSlug: string | null;
  category: string;
  categorySlug: string;
  subcategory: string;
  subcategorySlug: string;
  imagePath: string | null;
  priceCents: number;
  promoPriceCents: number | null;
  isAvailable: boolean;
};

export const LIVE_SEARCH_MIN_CHARS = 2;
export const LIVE_SEARCH_MAX_RESULTS = 6;

// Texto de búsqueda: sin acentos, minúsculas y con la puntuación como espacio
// ("Coca-Cola" -> "coca cola"), para que "coca cola", "coca-cola" y "cocacola"
// queden a una edición de distancia.
export function toSearchValue(value: string) {
  return normalizeSearchText(value).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** true si la consulta tiene al menos LIVE_SEARCH_MIN_CHARS caracteres útiles. */
export function isLiveQuery(query: string) {
  return toSearchValue(query).replace(/\s/g, "").length >= LIVE_SEARCH_MIN_CHARS;
}

type IndexedItem = {
  item: LiveSearchItem;
  name: string;
  brand: string;
  subcategory: string;
  category: string;
};

// Pesos: el nombre manda; la marca ayuda ("lala"); subcategoría y categoría
// permiten buscar por tipo ("refrescos", "lacteos").
// threshold 0.4: red amplia para tolerar errores ("cocacla", "japnes").
// ignoreLocation: la palabra puede estar en cualquier parte del nombre.
// El ruido de esa red amplia ("coca" -> "Cacahuate") se elimina con
// RELATIVE_SCORE_WINDOW: solo se conservan resultados cercanos al mejor.
export const FUSE_OPTIONS: IFuseOptions<IndexedItem> = {
  keys: [
    { name: "name", weight: 0.55 },
    { name: "brand", weight: 0.25 },
    { name: "subcategory", weight: 0.15 },
    { name: "category", weight: 0.05 },
  ],
  threshold: 0.4,
  ignoreLocation: true,
  minMatchCharLength: LIVE_SEARCH_MIN_CHARS,
  shouldSort: true,
  includeScore: true,
};

// Score de Fuse: 0 = exacto, 1 = nada. Con datos reales las coincidencias
// legítimas quedan juntas (p. ej. "cocacla": 0.57–0.61) y el ruido muy por
// detrás del mejor ("coca": 0.04 vs. 0.60 de "Cacahuate").
export const RELATIVE_SCORE_WINDOW = 0.15;

export type LiveSearch = (query: string) => LiveSearchItem[];

// El índice Fuse se construye una sola vez por conjunto de productos.
export function createLiveSearch(items: LiveSearchItem[]): LiveSearch {
  const fuse = new Fuse(
    items.map(
      (item): IndexedItem => ({
        item,
        name: toSearchValue([item.name, item.presentation].filter(Boolean).join(" ")),
        brand: toSearchValue(item.brand ?? ""),
        subcategory: toSearchValue(item.subcategory),
        category: toSearchValue(item.category),
      }),
    ),
    FUSE_OPTIONS,
  );

  return (query) => {
    if (!isLiveQuery(query)) return [];
    const results = fuse.search(toSearchValue(query));
    const best = results[0]?.score ?? 0;
    return results
      .filter((result) => (result.score ?? 0) <= best + RELATIVE_SCORE_WINDOW)
      .slice(0, LIVE_SEARCH_MAX_RESULTS)
      .map((result) => result.item.item);
  };
}

// URL al elegir un resultado: /productos?producto=<id>. Se conservan solo los
// filtros actuales que no excluyen al producto (categoría, subcategoría y marca
// iguales) y el orden; la búsqueda `q` se descarta porque el resultado viene de
// Fuse (difuso) y la búsqueda completa podría no incluirlo.
export function liveResultHref(item: LiveSearchItem, current: CatalogFilters) {
  const sameCategory = current.categoria === item.categorySlug;
  return productFocusHref(
    {
      categoria: sameCategory ? current.categoria : undefined,
      subcategoria: sameCategory && current.subcategoria === item.subcategorySlug ? current.subcategoria : undefined,
      marca: current.marca && current.marca === item.brandSlug ? current.marca : undefined,
      orden: current.orden,
    },
    item.id,
  );
}
