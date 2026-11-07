import { AddToCart } from "@/components/cart/add-to-cart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CatalogProduct } from "@/lib/catalog/products";
import { cn } from "@/lib/utils";

import { ProductImage } from "./product-image";
import { ProductPrice } from "./product-price";

type ProductCardProps = {
  product: CatalogProduct;
  headingLevel?: "h2" | "h3";
};

// Jerarquía (docs/design-system.md §9): imagen · marca · nombre · presentación · precio · acción.
export function ProductCard({ product, headingLevel: Heading = "h3" }: ProductCardProps) {
  const soldOut = !product.isAvailable;
  const hasOffer = product.promoPrice !== null;
  const imageAlt = [product.name, product.presentation].filter(Boolean).join(" ");

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border bg-card transition-shadow duration-200 ease-out hover:shadow-card-hover">
      <div className="relative">
        <ProductImage
          imagePath={product.imagePath}
          alt={imageAlt}
          className={cn(soldOut && "opacity-60")}
        />
        {(hasOffer || soldOut) && (
          <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
            {soldOut ? (
              <Badge variant="soldOut">Agotado</Badge>
            ) : (
              <Badge variant="offer">Oferta</Badge>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3">
        {product.brandName && (
          <p className="truncate text-xs text-subtle-foreground">{product.brandName}</p>
        )}
        <Heading className="mt-0.5 line-clamp-2 text-sm leading-5 font-medium text-foreground">
          {product.name}
        </Heading>
        {product.presentation && (
          <p className="mt-0.5 text-sm text-muted-foreground">
            {product.priceUnit ? `Venta por ${product.priceUnit}` : product.presentation}
          </p>
        )}

        <div className="mt-auto pt-2">
          <ProductPrice
            price={product.price}
            promoPrice={product.promoPrice}
            priceUnit={product.priceUnit}
            muted={soldOut}
          />
        </div>

        {soldOut ? (
          <Button disabled className="mt-3 w-full">
            Agotado
          </Button>
        ) : (
          <AddToCart
            className="mt-3"
            productId={product.productId}
            branchId={product.branchId}
            label={imageAlt}
          />
        )}
      </div>
    </article>
  );
}
