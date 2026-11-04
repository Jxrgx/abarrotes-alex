"use client";

import { Package } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { productImageUrl } from "@/lib/catalog/images";
import { cn } from "@/lib/utils";

type ProductImageProps = {
  imagePath: string | null;
  alt: string;
  className?: string;
  /** "card" (tarjetas del catálogo) o "thumb" (miniatura de 40px, p. ej. búsqueda). */
  variant?: "card" | "thumb";
};

const SIZES = {
  card: "(min-width: 1280px) 240px, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw",
  thumb: "96px",
};

// Proporción cuadrada fija, object-contain y fondo neutro (docs/design-system.md §9).
// Client Component solo por el fallback: si la imagen no carga (objeto borrado, red),
// se muestra el mismo placeholder en lugar de un ícono roto.
export function ProductImage({ imagePath, alt, className, variant = "card" }: ProductImageProps) {
  const thumb = variant === "thumb";
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const showImage = imagePath !== null && failedPath !== imagePath;
  return (
    <div className={cn("relative aspect-square bg-background-secondary", className)}>
      {showImage ? (
        <Image
          src={productImageUrl(imagePath)}
          alt={alt}
          fill
          sizes={SIZES[variant]}
          className={cn("object-contain", thumb ? "p-1" : "p-4")}
          onError={() => setFailedPath(imagePath)}
        />
      ) : (
        // Placeholder decorativo: el nombre del producto ya es visible junto a la imagen.
        <div className="flex size-full items-center justify-center" aria-hidden="true">
          <Package
            className={cn("text-subtle-foreground/70", thumb ? "size-5" : "size-10")}
            strokeWidth={1.5}
          />
        </div>
      )}
    </div>
  );
}
