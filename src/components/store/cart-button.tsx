import { ShoppingCart } from "lucide-react";

import { cn } from "@/lib/utils";

// Acceso visual al carrito. La lógica del carrito llega en la Fase 5.
export function CartButton({ count = 0 }: { count?: number }) {
  const label = count === 1 ? "1 producto" : `${count} productos`;

  return (
    <button
      type="button"
      aria-label={`Carrito, ${label}`}
      className="relative inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-input bg-background px-2.5 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-accent active:bg-secondary md:px-3"
    >
      <ShoppingCart className="size-5" aria-hidden="true" />
      <span className="hidden md:inline">Carrito</span>
      <span
        className={cn(
          "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums",
          count > 0 ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground",
        )}
        aria-hidden="true"
      >
        {count}
      </span>
    </button>
  );
}
