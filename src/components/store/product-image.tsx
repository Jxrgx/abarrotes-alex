import { Package } from "lucide-react";
import Image from "next/image";

import { productImageUrl } from "@/lib/catalog/images";
import { cn } from "@/lib/utils";

type ProductImageProps = {
  imagePath: string | null;
  alt: string;
  className?: string;
};

// Proporción cuadrada fija, object-contain y fondo neutro (docs/design-system.md §9).
export function ProductImage({ imagePath, alt, className }: ProductImageProps) {
  return (
    <div className={cn("relative aspect-square bg-background-secondary", className)}>
      {imagePath ? (
        <Image
          src={productImageUrl(imagePath)}
          alt={alt}
          fill
          sizes="(min-width: 1280px) 240px, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
          className="object-contain p-4"
        />
      ) : (
        // Placeholder decorativo: el nombre del producto ya es visible en la tarjeta.
        <div className="flex size-full items-center justify-center" aria-hidden="true">
          <Package className="size-10 text-subtle-foreground/70" strokeWidth={1.5} />
        </div>
      )}
    </div>
  );
}
