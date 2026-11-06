"use client";

import { ArrowRight, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { countLabel, useCartCount } from "@/lib/cart/store";

// Rutas de compra donde el siguiente paso ("Ver mi pedido") no es evidente. En /carrito,
// /checkout y /pedido/* ya hay una acción propia.
const ROUTES = new Set(["/", "/productos"]);

// Móvil: barra inferior con el siguiente paso cuando el carrito tiene productos.
// - Lee el mismo store del carrito (localStorage, sin peticiones ni precios: el
//   subtotal real se calcula en /carrito con los precios actuales).
// - Barra fija a todo el ancho (no flotante), respeta safe-area y deja un espacio al
//   final de la página para no tapar el footer.
// - Se oculta mientras se escribe (teclado abierto, búsqueda instantánea). Los diálogos
//   modales (filtros) la cubren con su fondo: viven en el top layer.
// - En md+ no se muestra: el carrito del header ya es visible con su contador.
export function CartBar() {
  const pathname = usePathname();
  const count = useCartCount();
  if (!count || !ROUTES.has(pathname)) return null;

  return (
    <>
      <div aria-hidden="true" className="h-[calc(4.75rem+env(safe-area-inset-bottom))] md:hidden" />
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-overlay animate-in fade-in-0 slide-in-from-bottom-2 duration-200 md:hidden [body:has(:is(input,textarea,select):focus)_&]:hidden">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
          <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
            <ShoppingCart className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <span className="truncate tabular-nums">{countLabel(count)}</span>
          </p>
          <Link
            href="/carrito"
            aria-label={`Ver mi pedido, ${countLabel(count)}`}
            className={buttonVariants({ size: "lg", className: "shrink-0" })}
          >
            Ver mi pedido
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </div>
    </>
  );
}
