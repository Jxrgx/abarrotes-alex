import { PackageSearch, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CategoryNav } from "@/components/store/category-nav";
import { EmptyState } from "@/components/store/empty-state";
import { Faq } from "@/components/store/faq";
import { Hero } from "@/components/store/hero";
import { ProductGrid, ProductRail } from "@/components/store/product-list";
import { SectionHeader } from "@/components/store/section-header";
import { buttonVariants } from "@/components/ui/button";
import { CatalogSkeleton, StoreInfoSkeleton } from "@/components/store/skeletons";
import { StoreInfo } from "@/components/store/store-info";
import { getBranchHours, getCurrentBranch } from "@/lib/catalog/branches";
import { getActiveCategories } from "@/lib/catalog/categories";
import { groupBranchHours } from "@/lib/catalog/hours";
import { queryCatalog } from "@/lib/catalog/products";

export const metadata: Metadata = {
  title: { absolute: "Abarrotes Alex | Todo lo que necesitas, cerca de ti" },
  description:
    "Explora bebidas, galletas, lácteos, botanas y artículos de limpieza de Abarrotes Alex y haz tu pedido en línea.",
};

// Hero y FAQ son estáticos; el catálogo y la sucursal se consultan en cada visita.
export default function HomePage() {
  return (
    <>
      <Hero />
      <Suspense fallback={<CatalogSkeleton />}>
        <HomeCatalog />
      </Suspense>
      <section
        id="sucursal"
        aria-labelledby="sucursal-title"
        className="border-y bg-background-secondary"
      >
        <div className="page-container py-8 md:py-12">
          <SectionHeader id="sucursal-title" title="Visítanos" />
          <Suspense fallback={<StoreInfoSkeleton />}>
            <BranchDetails />
          </Suspense>
        </div>
      </section>
      <Faq />
    </>
  );
}

const HOME_RAIL_SIZE = 12;
const HOME_GRID_SIZE = 24;

async function HomeCatalog() {
  const [branch, categories] = await Promise.all([getCurrentBranch(), getActiveCategories()]);

  if (!branch) {
    return (
      <div className="page-container py-8">
        <EmptyState
          icon={Store}
          title="La tienda no está disponible por ahora"
          description="Estamos preparando nuestro catálogo. Vuelve pronto."
        />
      </div>
    );
  }

  // Escala con +1000 productos: cada sección pide solo lo que muestra (en paralelo).
  // El catálogo completo, con búsqueda y paginación, vive en /productos.
  const [offersPage, featuredPage, productsPage] = await Promise.all([
    queryCatalog(branch.id, { onSale: true, pageSize: HOME_RAIL_SIZE }),
    queryCatalog(branch.id, { featured: true, pageSize: HOME_RAIL_SIZE }),
    queryCatalog(branch.id, { pageSize: HOME_GRID_SIZE }),
  ]);
  const offers = offersPage.items;
  const featured = featuredPage.items;
  const products = productsPage.items;

  return (
    <div className="page-container space-y-10 py-8 md:space-y-12 md:py-10">
      {categories.length > 0 && (
        <section aria-labelledby="categorias-title">
          <SectionHeader
            id="categorias-title"
            title="Categorías"
            action={{ href: "/productos", label: "Ver todo" }}
          />
          <CategoryNav categories={categories} label="Categorías de productos" />
        </section>
      )}

      {offers.length > 0 && (
        <section aria-labelledby="ofertas-title">
          <SectionHeader id="ofertas-title" title="Ofertas" />
          <ProductRail products={offers} />
        </section>
      )}

      {featured.length > 0 && (
        <section aria-labelledby="destacados-title">
          <SectionHeader id="destacados-title" title="Productos destacados" />
          <ProductRail products={featured} />
        </section>
      )}

      <section id="productos" aria-labelledby="productos-title" className="scroll-mt-32 md:scroll-mt-20">
        <SectionHeader
          id="productos-title"
          title="Nuestros productos"
          action={products.length > 0 ? { href: "/productos", label: "Ver todo" } : undefined}
        />
        {products.length > 0 ? (
          <>
            <ProductGrid products={products} />
            {productsPage.total > products.length && (
              <div className="mt-8 flex justify-center">
                <Link href="/productos" className={buttonVariants({ variant: "secondary", size: "lg", className: "w-full sm:w-auto" })}>
                  Ver todos los productos ({productsPage.total})
                </Link>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            icon={PackageSearch}
            title="Aún no hay productos disponibles"
            description="Pronto agregaremos productos a esta sucursal."
          />
        )}
      </section>
    </div>
  );
}

async function BranchDetails() {
  const branch = await getCurrentBranch();
  if (!branch) return <p className="text-sm text-muted-foreground">Información no disponible por ahora.</p>;

  const hours = await getBranchHours(branch.id);
  return <StoreInfo branch={branch} hours={groupBranchHours(hours)} />;
}
