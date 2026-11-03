"use client";

import { ShoppingCart } from "lucide-react";
import Link from "next/link";

import { countLabel, useCartCount } from "@/lib/cart/store";
import { cn } from "@/lib/utils";

// Enlace al carrito con la suma de cantidades. Antes de leer el carrito del
// navegador (count null) el número se reserva invisible para no hacer saltar el header.
export function CartButton() {
  const count = useCartCount();

  return (
    <Link
      href="/carrito"
      aria-label={count === null ? "Carrito" : `Carrito, ${countLabel(count)}`}
      className="relative inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-input bg-background px-2.5 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-accent active:bg-secondary md:px-3"
    >
      <ShoppingCart className="size-5" aria-hidden="true" />
      <span className="hidden md:inline">Carrito</span>
      <span
        className={cn(
          "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums transition-colors duration-150",
          count ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground",
          count === null && "invisible",
        )}
        aria-hidden="true"
      >
        {count ?? 0}
      </span>
    </Link>
  );
}
