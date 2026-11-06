import type { Metadata } from "next";
import { Suspense } from "react";

import { OrderConfirmation } from "@/components/checkout/order-confirmation";

export const metadata: Metadata = {
  title: "Pedido registrado",
  robots: { index: false, follow: false },
};

// No consulta la base: el detalle sale del comprobante guardado en esta sesión.
// Cualquier folio en la URL produce la misma respuesta del servidor (no hay enumeración).
export default function OrderPage({ params }: PageProps<"/pedido/[folio]">) {
  return (
    <div className="page-container py-8 md:py-12">
      <Suspense fallback={<div className="mx-auto h-96 max-w-2xl animate-pulse rounded-xl bg-muted" />}>
        <OrderContent params={params} />
      </Suspense>
    </div>
  );
}

async function OrderContent({ params }: { params: PageProps<"/pedido/[folio]">["params"] }) {
  const { folio } = await params;
  return <OrderConfirmation folio={safeDecode(folio).toUpperCase()} />;
}

// Un "%" malformado en la URL (p. ej. /pedido/%E0%A4%A) hace lanzar a decodeURIComponent;
// se usa el texto tal cual: no coincide con ningún folio y se muestra sin comprobante.
function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
