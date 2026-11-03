import type { Metadata } from "next";

import { CartView } from "@/components/cart/cart-view";

export const metadata: Metadata = {
  title: "Tu carrito",
  description: "Revisa los productos de tu pedido en Abarrotes Alex.",
  // Contenido distinto en cada navegador: no aporta a buscadores.
  robots: { index: false },
};

// El contenido vive en el navegador (localStorage); los precios actuales se
// consultan en /api/carrito. El shell de la página es estático.
export default function CartPage() {
  return (
    <div className="page-container py-6 md:py-8">
      <h1 className="mb-4 text-3xl font-semibold tracking-tight md:mb-6 md:text-4xl">Tu carrito</h1>
      <CartView />
    </div>
  );
}
