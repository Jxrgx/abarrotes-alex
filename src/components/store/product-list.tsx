import type { CatalogProduct } from "@/lib/catalog/products";

import { ProductCard } from "./product-card";

type ProductListProps = {
  products: CatalogProduct[];
  headingLevel?: "h2" | "h3";
};

// Grid del catálogo: 2 columnas en móvil, 3 en tablet, 4–5 en desktop.
export function ProductGrid({ products, headingLevel }: ProductListProps) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5">
      {products.map((product) => (
        <li key={product.id}>
          <ProductCard product={product} headingLevel={headingLevel} />
        </li>
      ))}
    </ul>
  );
}

// Fila horizontal en móvil (deja ver la siguiente tarjeta para indicar scroll)
// y grid normal desde md. Para secciones cortas como Ofertas o Destacados.
export function ProductRail({ products, headingLevel }: ProductListProps) {
  // Con 2 o menos caben completos en el grid; el scroll solo dejaría un hueco.
  if (products.length <= 2) return <ProductGrid products={products} headingLevel={headingLevel} />;

  return (
    <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:snap-none md:grid-cols-3 md:gap-4 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-4 xl:grid-cols-5">
      {products.map((product) => (
        // relative: los elementos absolutos de la tarjeta (p. ej. el texto sr-only
        // "Precio anterior") quedan dentro del carrusel y su overflow los recorta; sin
        // esto se ubicaban respecto a la página y causaban scroll horizontal en móvil.
        <li
          key={product.id}
          className="relative w-[calc((100%-0.75rem)/2.2)] shrink-0 snap-start md:w-auto"
        >
          <ProductCard product={product} headingLevel={headingLevel} />
        </li>
      ))}
    </ul>
  );
}
