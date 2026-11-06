import type { Metadata } from "next";
import { Suspense } from "react";

import { CheckoutSkeleton, CheckoutView } from "@/components/checkout/checkout-view";
import { getBranchHours, getCurrentBranch } from "@/lib/catalog/branches";
import { groupBranchHours } from "@/lib/catalog/hours";

export const metadata: Metadata = {
  title: "Completa tu pedido",
  description: "Elige cómo recibir tu pedido, completa tus datos y confírmalo en Abarrotes Alex.",
  robots: { index: false },
};

export default function CheckoutPage() {
  return (
    <div className="page-container py-6 md:py-8">
      <h1 className="mb-4 text-3xl font-semibold tracking-tight md:mb-6 md:text-4xl">Completa tu pedido</h1>
      <Suspense fallback={<CheckoutSkeleton />}>
        <CheckoutLoader />
      </Suspense>
    </div>
  );
}

// Datos públicos de la sucursal para "Recoger en sucursal". Los precios del
// carrito se resuelven en el cliente (POST /api/carrito) y el pedido se crea en
// POST /api/pedidos, que recalcula todo en la base.
async function CheckoutLoader() {
  const branch = await getCurrentBranch();
  const hours = branch ? groupBranchHours(await getBranchHours(branch.id)) : [];
  return (
    <CheckoutView
      pickupBranch={branch && { name: branch.name, address: branch.address, phone: branch.phone, hours }}
    />
  );
}
