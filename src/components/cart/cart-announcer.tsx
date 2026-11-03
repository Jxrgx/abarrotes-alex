"use client";

import { useCartAnnouncement } from "@/lib/cart/store";

// Única región aria-live para cambios del carrito (agregar, quitar, cantidades).
export function CartAnnouncer() {
  const { id, message } = useCartAnnouncement();
  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {/* key: el mismo mensaje dos veces seguidas también se anuncia. */}
      <span key={id}>{message}</span>
    </div>
  );
}
