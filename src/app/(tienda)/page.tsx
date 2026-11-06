import { PackageSearch, Store } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { CategoryNav } from "@/components/store/category-nav";
import { EmptyState } from "@/components/store/empty-state";
import { Faq } from "@/components/store/faq";
import { Hero } from "@/components/store/hero";
import { ProductGrid, ProductRail } from "@/components/store/product-list";
import { SectionHeader } from "@/components/store/section-header";
import { CatalogSkeleton, StoreInfoSkeleton } from "@/components/store/skeletons";
import { StoreInfo } from "@/components/store/store-info";
import { getBranchHours, getCurrentBranch } from "@/lib/catalog/branches";
import { getActiveCategories } from "@/lib/catalog/categories";
import { groupBranchHours } from "@/lib/catalog/hours";
import { getBranchProducts } from "@/lib/catalog/products";

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

  const products = await getBranchProducts(branch.id);
  const offers = products.filter((product) => product.promoPrice !== null);
  const featured = products.filter((product) => product.isFeatured);

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
          <ProductGrid products={products} />
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
