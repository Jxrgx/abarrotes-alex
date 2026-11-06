import Image from "next/image";

import { cn } from "@/lib/utils";

// Logo real de Abarrotes Alex (círculo con fondo transparente, generado con
// scripts/brand-assets.mjs). Siempre va junto al texto "Abarrotes Alex", así que es
// decorativo (alt vacío) para que el lector de pantalla no anuncie la marca dos veces.
// `size` es el tamaño mostrado en px; next/image sirve 1x/2x de ese tamaño.
export function BrandLogo({ size, className }: { size: number; className?: string }) {
  return (
    <Image
      src="/brand/logo.webp"
      alt=""
      width={size}
      height={size}
      loading="eager"
      className={cn("shrink-0 select-none", className)}
      style={{ width: size, height: size }}
    />
  );
}
