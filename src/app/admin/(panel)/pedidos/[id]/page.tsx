import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/admin/module-placeholder";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Detalle de pedido" };

// Placeholder: no consulta datos del pedido todavía (Fase 8E).
export default async function OrderDetailPage() {
  await requireAdmin();
  return (
    <ModulePlaceholder
      title="Detalle de pedido"
      description="Detalle de pedido — se implementará en Fase 8E. Por ahora los pedidos recientes se consultan desde el inicio."
    />
  );
}
