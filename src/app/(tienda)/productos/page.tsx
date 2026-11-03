import { PackageSearch, SearchX, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CategoryNav } from "@/components/store/category-nav";
import { EmptyState } from "@/components/store/empty-state";
import { ProductGrid } from "@/components/store/product-list";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentBranch } from "@/lib/catalog/branches";
import { getActiveCategories } from "@/lib/catalog/categories";
import { getBranchProducts } from "@/lib/catalog/products";

export const metadata: Metadata = {
  title: "Productos",
  description:
    "Catálogo de Abarrotes Alex: bebidas, galletas, lácteos, botanas y limpieza con precios de la sucursal.",
};

export default async function ProductsPage({ searchParams }: PageProps<"/productos">) {
  const { categoria } = await searchParams;
  const requestedSlug = Array.isArray(categoria) ? categoria[0] : categoria;

  const [branch, categories] = await Promise.all([getCurrentBranch(), getActiveCategories()]);
  const category = requestedSlug
    ? (categories.find((item) => item.slug === requestedSlug) ?? null)
    : null;
  const unknownCategory = Boolean(requestedSlug) && !category;

  const title = category?.name ?? (unknownCategory ? "Categoría no encontrada" : "Todos los productos");
  const products =
    branch && !unknownCategory ? await getBranchProducts(branch.id, category?.slug) : [];

  return (
    <div className="page-container py-6 md:py-8">
      <div className="mb-4 md:mb-6">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
        {branch && !unknownCategory && (
          <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
            {products.length === 1 ? "1 producto" : `${products.length} productos`}
          </p>
        )}
      </div>

      {categories.length > 0 && (
        <div className="mb-6">
          <CategoryNav
            categories={categories}
            activeSlug={unknownCategory ? undefined : (category?.slug ?? null)}
            showAll
            label="Filtrar por categoría"
          />
        </div>
      )}

      {!branch ? (
        <EmptyState
          icon={Store}
          title="La tienda no está disponible por ahora"
          description="Estamos preparando nuestro catálogo. Vuelve pronto."
        />
      ) : unknownCategory ? (
        <EmptyState
          icon={SearchX}
          title="No encontramos esa categoría"
          description="Puede que ya no esté disponible. Elige otra categoría o revisa todos los productos."
          action={
            <Link href="/productos" className={buttonVariants({ variant: "secondary" })}>
              Ver todos los productos
            </Link>
          }
        />
      ) : products.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title="Aún no hay productos aquí"
          description="Pronto agregaremos productos a esta categoría."
          action={
            <Link href="/productos" className={buttonVariants({ variant: "secondary" })}>
              Ver todos los productos
            </Link>
          }
        />
      ) : (
        <section aria-labelledby="lista-productos">
          <h2 id="lista-productos" className="sr-only">
            Lista de productos
          </h2>
          <ProductGrid products={products} />
        </section>
      )}
    </div>
  );
}
