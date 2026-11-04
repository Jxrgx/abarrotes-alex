import type { Metadata } from "next";

import { AdminGuard } from "@/components/admin/admin-guard";
import { ModulePlaceholder, ModulePlaceholderSkeleton } from "@/components/admin/module-placeholder";

export const metadata: Metadata = { title: "Detalle de pedido" };

// Placeholder: no consulta datos del pedido todavía (Fase 8E).
export default function OrderDetailPage() {
  return (
    <AdminGuard fallback={<ModulePlaceholderSkeleton title="Detalle de pedido" />}>
      <ModulePlaceholder
      title="Detalle de pedido"
      description="Detalle de pedido — se implementará en Fase 8E. Por ahora los pedidos recientes se consultan desde el inicio."
    />
    </AdminGuard>
  );
}
