"use client";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cartCount } from "@/lib/cart/reducer";
import {
  announceCart,
  countLabel,
  dispatchCart,
  getCartSnapshot,
  useCartQuantity,
} from "@/lib/cart/store";
import { cn } from "@/lib/utils";

import { QuantityStepper } from "./quantity-stepper";

type AddToCartProps = {
  productId: string;
  branchId: string;
  /** Nombre + presentación, para etiquetas y anuncios. */
  label: string;
  className?: string;
};

// Acción de la tarjeta de producto. Solo se usa con productos disponibles; los
// agotados muestran un botón deshabilitado del lado del servidor.
// "Agregar" se transforma en [−] n [+] (feedback visible) y se anuncia el cambio.
export function AddToCart({ productId, branchId, label, className }: AddToCartProps) {
  const quantity = useCartQuantity(productId);

  function announce(message: string) {
    announceCart(`${message} Tu carrito tiene ${countLabel(cartCount(getCartSnapshot()))}.`);
  }

  function add() {
    if (dispatchCart({ type: "add", productId, branchId, available: true })) {
      announce(`${label} agregado al carrito.`);
    }
  }

  // Antes de hidratar (null) se muestra "Agregar": misma altura que el stepper,
  // así la tarjeta no salta cuando el producto ya estaba en el carrito.
  if (!quantity) {
    return (
      <Button className={cn("w-full", className)} onClick={add} aria-label={`Agregar ${label}`}>
        <Plus aria-hidden="true" />
        Agregar
      </Button>
    );
  }

  return (
    <QuantityStepper
      className={className}
      tone="brand"
      quantity={quantity}
      label={label}
      onIncrement={() => {
        if (dispatchCart({ type: "increment", productId, available: true })) {
          announce(`${label}: ${quantity + 1} en el carrito.`);
        }
      }}
      onDecrement={() => {
        if (dispatchCart({ type: "decrement", productId })) {
          announce(`${label}: ${quantity - 1} en el carrito.`);
        }
      }}
      onRemove={() => {
        if (dispatchCart({ type: "remove", productId })) {
          announce(`${label} quitado del carrito.`);
        }
      }}
    />
  );
}
