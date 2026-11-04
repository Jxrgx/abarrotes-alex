"use client";

import { Badge } from "@/components/ui/badge";
import type { LiveSearchItem } from "@/lib/catalog/live-search";
import { effectivePrice } from "@/lib/catalog/pricing";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";

import { ProductImage } from "./product-image";

type LiveSearchOptionProps = {
  id: string;
  item: LiveSearchItem;
  active: boolean;
  onHover: () => void;
  onChoose: () => void;
};

// Resultado compacto (no es una tarjeta de producto): miniatura, nombre,
// presentación, marca y precio efectivo. Sin acciones de carrito.
export function LiveSearchOption({ id, item, active, onHover, onChoose }: LiveSearchOptionProps) {
  const priceCents = effectivePrice({ price: item.priceCents, promoPrice: item.promoPriceCents });
  const hasOffer = item.promoPriceCents !== null;
  const label = [item.name, item.presentation].filter(Boolean).join(" ");

  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      // mousedown sin perder el foco del campo; la navegación ocurre en click (mouse y touch).
      onMouseDown={(event) => event.preventDefault()}
      onClick={onChoose}
      onMouseMove={onHover}
      className={cn(
        "mx-1 flex min-h-14 cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5",
        active ? "bg-primary-subtle" : "hover:bg-background-secondary",
      )}
    >
      <ProductImage
        variant="thumb"
        imagePath={item.imagePath}
        alt=""
        className={cn("size-10 shrink-0 overflow-hidden rounded-md", !item.isAvailable && "opacity-60")}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{label}</span>
        <span className="block truncate text-xs text-subtle-foreground">{item.brand ?? item.category}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5 text-right tabular-nums">
        {item.isAvailable ? (
          <span className={cn("text-sm font-semibold", hasOffer ? "text-destructive-strong" : "text-foreground")}>
            {hasOffer && <span className="sr-only">Precio de oferta: </span>}
            {formatCents(priceCents)}
          </span>
        ) : (
          <Badge variant="soldOut">Agotado</Badge>
        )}
        {item.isAvailable && hasOffer ? (
          <s className="text-xs text-subtle-foreground">
            <span className="sr-only">Precio anterior: </span>
            {formatCents(item.priceCents)}
          </s>
        ) : !item.isAvailable ? (
          <span className="text-xs text-subtle-foreground">{formatCents(priceCents)}</span>
        ) : null}
      </span>
    </li>
  );
}
