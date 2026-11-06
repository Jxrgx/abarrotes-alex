import type { Metadata } from "next";

import { CartView } from "@/components/cart/cart-view";

export const metadata: Metadata = {
  title: "Tu pedido",
  description: "Revisa los productos de tu pedido en Abarrotes Alex.",
  // Contenido distinto en cada navegador: no aporta a buscadores.
  robots: { index: false },
};

// El contenido vive en el navegador (localStorage); los precios actuales se
// consultan en /api/carrito. El shell de la página es estático.
export default function CartPage() {
  return (
    <div className="page-container py-6 md:py-8">
      <div className="mb-4 md:mb-6">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Tu pedido</h1>
        <p className="mt-1 text-muted-foreground">Revisa los productos y ajusta las cantidades antes de continuar.</p>
      </div>
      <CartView />
    </div>
  );
}
