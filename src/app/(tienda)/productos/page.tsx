import { Info, PackageSearch, SearchX, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { type ActiveFilterChip, ActiveFilters, SubcategoryNav } from "@/components/store/catalog-chips";
import { DesktopFilterControls, MobileFilterButton } from "@/components/store/catalog-filters";
import { CategoryNav } from "@/components/store/category-nav";
import { EmptyState } from "@/components/store/empty-state";
import { ProductGrid } from "@/components/store/product-list";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentBranch } from "@/lib/catalog/branches";
import { getActiveBrands } from "@/lib/catalog/brands";
import { getActiveCategories, getActiveSubcategories } from "@/lib/catalog/categories";
import {
  type CatalogFilters,
  catalogHref,
  matchesWordStart,
  parseCatalogParams,
  resolveCatalogFilters,
  searchTerms,
  subcategoriesInScope,
} from "@/lib/catalog/filters";
import { getBranchFacets, getBranchProducts, sortProducts } from "@/lib/catalog/products";

const DESCRIPTION =
  "Catálogo de Abarrotes Alex: busca y filtra bebidas, galletas, lácteos, botanas y limpieza con precios de la sucursal.";

// "Productos | Abarrotes Alex" o "Bebidas | Abarrotes Alex".
export async function generateMetadata({ searchParams }: PageProps<"/productos">): Promise<Metadata> {
  const { categoria } = parseCatalogParams(await searchParams);
  const category = categoria
    ? (await getActiveCategories()).find((item) => item.slug === categoria)
    : undefined;
  return { title: category?.name ?? "Productos", description: DESCRIPTION };
}

export default async function ProductsPage({ searchParams }: PageProps<"/productos">) {
  const raw = parseCatalogParams(await searchParams);
  const [branch, categories, subcategories, brands] = await Promise.all([
    getCurrentBranch(),
    getActiveCategories(),
    getActiveSubcategories(),
    getActiveBrands(),
  ]);

  if (!branch) {
    return (
      <div className="page-container py-6 md:py-8">
        <EmptyState
          icon={Store}
          title="La tienda no está disponible por ahora"
          description="Estamos preparando nuestro catálogo. Vuelve pronto."
        />
      </div>
    );
  }

  const { filters, category, subcategory, brand, ignored } = resolveCatalogFilters(raw, {
    categories,
    subcategories,
    brands,
  });

  // Un término coincide con el nombre del producto o con su marca (al inicio de palabra).
  const search = searchTerms(filters.q).map((term) => ({
    term,
    brandIds: brands.filter((item) => matchesWordStart(item.name, term)).map((item) => item.id),
  }));

  const [products, facets] = await Promise.all([
    getBranchProducts(branch.id, {
      categorySlug: category?.slug,
      subcategoryId: subcategory?.id,
      brandId: brand?.id,
      search,
    }),
    getBranchFacets(branch.id),
  ]);
  const results = sortProducts(products, filters.orden);

  const href = (changes: Partial<CatalogFilters>) => catalogHref({ ...filters, ...changes });
  const clearHref = catalogHref({ orden: filters.orden });

  const chips: ActiveFilterChip[] = [];
  if (filters.q) {
    chips.push({ key: "q", label: `“${filters.q}”`, removeLabel: `Quitar búsqueda ${filters.q}`, href: href({ q: undefined }) });
  }
  if (category) {
    chips.push({
      key: "categoria",
      label: category.name,
      removeLabel: `Quitar filtro ${category.name}`,
      href: href({ categoria: undefined, subcategoria: undefined }),
    });
  }
  if (subcategory) {
    chips.push({
      key: "subcategoria",
      label: subcategory.name,
      removeLabel: `Quitar filtro ${subcategory.name}`,
      href: href({ subcategoria: undefined }),
    });
  }
  if (brand) {
    chips.push({ key: "marca", label: brand.name, removeLabel: `Quitar filtro ${brand.name}`, href: href({ marca: undefined }) });
  }

  const title = filters.q ? `Resultados para “${filters.q}”` : (category?.name ?? "Todos los productos");
  const scopeName = subcategory?.name ?? (filters.q ? category?.name : undefined);
  const count = results.length === 1 ? "1 producto" : `${results.length} productos`;
  const hasNonSearchFilters = Boolean(category || brand);
  const filterProps = { filters, categories, subcategories, brands, facets };

  return (
    <div className="page-container py-6 md:py-8">
      <div className="mb-4 md:mb-6">
        <h1 className="text-3xl font-semibold tracking-tight break-words md:text-4xl">{title}</h1>
        {/* Móvil: el botón Filtros comparte fila con el conteo para no apilar controles. */}
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground" role="status">
            {count}
            {scopeName && ` en ${scopeName}`}
          </p>
          <div className="md:hidden">
            <MobileFilterButton {...filterProps} />
          </div>
        </div>
      </div>

      <div className="mb-6 space-y-3">
        <CategoryNav
          categories={categories}
          activeSlug={category?.slug ?? null}
          showAll
          label="Filtrar por categoría"
          // Cambiar de categoría descarta la subcategoría; conserva búsqueda, marca y orden.
          getHref={(slug) => href({ categoria: slug ?? undefined, subcategoria: undefined })}
        />
        {category && (
          <SubcategoryNav
            categoryName={category.name}
            subcategories={subcategoriesInScope(subcategories, facets, category.id)}
            activeSlug={subcategory?.slug}
            getHref={(slug) => href({ subcategoria: slug ?? undefined })}
          />
        )}

        <div
          className={
            chips.length > 0 ? "flex items-center justify-between gap-4" : "hidden items-center md:flex"
          }
        >
          <ActiveFilters chips={chips} clearHref={clearHref} />
          <div className="ml-auto hidden md:block">
            <DesktopFilterControls {...filterProps} />
          </div>
        </div>

        {ignored.length > 0 && (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Omitimos filtros no válidos: {ignored.join(", ")}.
          </p>
        )}
      </div>

      {results.length > 0 ? (
        <section aria-labelledby="lista-productos">
          <h2 id="lista-productos" className="sr-only">
            Lista de productos
          </h2>
          <ProductGrid products={results} />
        </section>
      ) : filters.q ? (
        <EmptyState
          icon={SearchX}
          title={`No encontramos productos para “${filters.q}”`}
          description={
            hasNonSearchFilters
              ? "Prueba buscar en todos los productos o quitar algunos filtros."
              : "Revisa cómo está escrito o intenta con otra palabra."
          }
          action={
            <div className="flex flex-col gap-3 sm:flex-row">
              {hasNonSearchFilters && (
                <Link href={catalogHref({ q: filters.q })} className={buttonVariants()}>
                  Buscar en todos los productos
                </Link>
              )}
              <Link href={clearHref} className={buttonVariants({ variant: "secondary" })}>
                Limpiar filtros
              </Link>
            </div>
          }
        />
      ) : (
        <EmptyState
          icon={PackageSearch}
          title="No encontramos productos con estos filtros."
          description="Quita algún filtro o explora todas las categorías."
          action={
            <Link href={clearHref} className={buttonVariants({ variant: "secondary" })}>
              Limpiar filtros
            </Link>
          }
        />
      )}
    </div>
  );
}
