"use client";

import { useEffect } from "react";

const HIGHLIGHT_MS = 2400;

// /productos?producto=<id>: lleva a la tarjeta del producto elegido en la
// búsqueda instantánea y la resalta un momento. Solo ayuda visual: no filtra
// ni cambia precios, disponibilidad o el carrito. Si no está en la página, no hace nada.
export function ProductFocus({ productId }: { productId: string }) {
  useEffect(() => {
    // productId ya está validado como UUID en el servidor (seguro como selector).
    const card = document.querySelector<HTMLElement>(`article[data-product-id="${productId}"]`);
    if (!card || !card.checkVisibility()) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    card.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
    // Foco programático (sin tabulación) para que teclado y lector de pantalla continúen desde aquí.
    card.tabIndex = -1;
    card.focus({ preventScroll: true });
    card.dataset.highlight = "true";

    const timer = window.setTimeout(() => {
      delete card.dataset.highlight;
    }, HIGHLIGHT_MS);
    return () => {
      window.clearTimeout(timer);
      delete card.dataset.highlight;
    };
  }, [productId]);

  return null;
}
