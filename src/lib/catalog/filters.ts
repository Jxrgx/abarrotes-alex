// Estado del catálogo representado en la URL (/productos?q=&categoria=&subcategoria=&marca=&orden=).
// Módulo puro: lo usan tanto Server Components como los Client Components de filtros.

export const CATALOG_PATH = "/productos";

export const SORT_OPTIONS = [
  { value: "", label: "Predeterminado" },
  { value: "precio-asc", label: "Precio: menor a mayor" },
  { value: "precio-desc", label: "Precio: mayor a menor" },
] as const;

export type SortOrder = "precio-asc" | "precio-desc";

export type CatalogFilters = {
  q?: string;
  categoria?: string;
  subcategoria?: string;
  marca?: string;
  orden?: SortOrder;
};

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

const MAX_QUERY_LENGTH = 60;
const MAX_SEARCH_TERMS = 5;

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
}

// Conserva letras (con acentos), números, espacios, guion, punto y apóstrofo.
// Así "Coca-Cola", "Lácteos" o "1.5" funcionan y no llegan caracteres con
// significado especial para los filtros de PostgREST (comas, paréntesis, *, %).
export function sanitizeSearch(value: string | undefined) {
  if (!value) return undefined;
  const clean = value
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s.'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY_LENGTH)
    .trim();
  return clean || undefined;
}

// Cada palabra debe coincidir (en nombre o marca): "refresco cola" encuentra "Refresco de cola".
export function searchTerms(q: string | undefined) {
  if (!q) return [];
  return [...new Set(q.toLocaleLowerCase("es").split(" "))]
    .filter((term) => term.replace(/[.'-]/g, "").length > 0)
    .slice(0, MAX_SEARCH_TERMS);
}

// Coincidencia al inicio de palabra: "cola" encuentra "Refresco de cola" y
// "Coca-Cola", pero no "chocolate". Misma regla que los patrones ILIKE de products.ts.
export function matchesWordStart(text: string, term: string) {
  const haystack = text.toLocaleLowerCase("es");
  return (
    haystack.startsWith(term) || haystack.includes(` ${term}`) || haystack.includes(`-${term}`)
  );
}

function parseSort(value: string | undefined): SortOrder | undefined {
  return value === "precio-asc" || value === "precio-desc" ? value : undefined;
}

// Lectura sintáctica de la URL. La validación contra datos reales se hace en resolveCatalogFilters.
export function parseCatalogParams(params: SearchParamsRecord): CatalogFilters {
  return {
    q: sanitizeSearch(first(params.q)),
    categoria: first(params.categoria)?.toLowerCase(),
    subcategoria: first(params.subcategoria)?.toLowerCase(),
    marca: first(params.marca)?.toLowerCase(),
    orden: parseSort(first(params.orden)),
  };
}

// URL canónica con orden de parámetros estable. Valores vacíos se omiten.
export function catalogHref(filters: CatalogFilters) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.categoria) params.set("categoria", filters.categoria);
  // La subcategoría solo tiene sentido dentro de una categoría.
  if (filters.categoria && filters.subcategoria) params.set("subcategoria", filters.subcategoria);
  if (filters.marca) params.set("marca", filters.marca);
  if (filters.orden) params.set("orden", filters.orden);
  const query = params.toString();
  return query ? `${CATALOG_PATH}?${query}` : CATALOG_PATH;
}

// ---------------------------------------------------------------------------
// Resolución contra datos reales
// ---------------------------------------------------------------------------

export type FilterCategory = { id: string; name: string; slug: string };
export type FilterSubcategory = { id: string; categoryId: string; name: string; slug: string };
export type FilterBrand = { id: string; name: string; slug: string };
/** Par marca/subcategoría de cada producto de la sucursal (para opciones disponibles). */
export type CatalogFacet = { brandId: string | null; subcategoryId: string };

export type ResolvedCatalogFilters = {
  /** Filtros válidos y normalizados: lo que realmente se aplica. */
  filters: CatalogFilters;
  category: FilterCategory | null;
  subcategory: FilterSubcategory | null;
  brand: FilterBrand | null;
  /** Mensajes de parámetros ignorados por no ser válidos. */
  ignored: string[];
};

// Reglas (documentadas en docs/catalog.md):
// - categoría o marca inexistente: se ignora.
// - subcategoría: se resuelve SOLO dentro de la categoría elegida (el slug no es
//   único globalmente). Sin categoría válida, o si no pertenece a ella, se ignora.
export function resolveCatalogFilters(
  raw: CatalogFilters,
  data: {
    categories: FilterCategory[];
    subcategories: FilterSubcategory[];
    brands: FilterBrand[];
  },
): ResolvedCatalogFilters {
  const ignored: string[] = [];

  const category = raw.categoria
    ? (data.categories.find((item) => item.slug === raw.categoria) ?? null)
    : null;
  if (raw.categoria && !category) ignored.push(`la categoría «${raw.categoria}»`);

  const subcategory =
    raw.subcategoria && category
      ? (data.subcategories.find(
          (item) => item.categoryId === category.id && item.slug === raw.subcategoria,
        ) ?? null)
      : null;
  if (raw.subcategoria && !subcategory) {
    ignored.push(
      category
        ? `la subcategoría «${raw.subcategoria}» en ${category.name}`
        : `la subcategoría «${raw.subcategoria}» (elige primero una categoría)`,
    );
  }

  const brand = raw.marca ? (data.brands.find((item) => item.slug === raw.marca) ?? null) : null;
  if (raw.marca && !brand) ignored.push(`la marca «${raw.marca}»`);

  return {
    filters: {
      q: raw.q,
      categoria: category?.slug,
      subcategoria: subcategory?.slug,
      marca: brand?.slug,
      orden: raw.orden,
    },
    category,
    subcategory,
    brand,
    ignored,
  };
}

// Subcategorías de una categoría que tienen productos en la sucursal.
export function subcategoriesInScope(
  subcategories: FilterSubcategory[],
  facets: CatalogFacet[],
  categoryId: string | undefined,
) {
  if (!categoryId) return [];
  const withProducts = new Set(facets.map((facet) => facet.subcategoryId));
  return subcategories.filter(
    (item) => item.categoryId === categoryId && withProducts.has(item.id),
  );
}

// Marcas con productos dentro de la categoría/subcategoría elegidas.
// La marca seleccionada siempre se incluye para que el control refleje la URL.
export function brandsInScope(
  data: { brands: FilterBrand[]; subcategories: FilterSubcategory[]; facets: CatalogFacet[] },
  scope: { categoryId?: string; subcategoryId?: string; selectedSlug?: string },
) {
  const categoryOf = new Map(data.subcategories.map((item) => [item.id, item.categoryId]));
  const brandIds = new Set(
    data.facets
      .filter(
        (facet) =>
          (!scope.subcategoryId || facet.subcategoryId === scope.subcategoryId) &&
          (!scope.categoryId || categoryOf.get(facet.subcategoryId) === scope.categoryId),
      )
      .map((facet) => facet.brandId),
  );
  return data.brands.filter((brand) => brandIds.has(brand.id) || brand.slug === scope.selectedSlug);
}
