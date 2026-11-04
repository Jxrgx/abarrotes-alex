import type { Metadata } from "next";

import { AdminGuard } from "@/components/admin/admin-guard";
import { ModulePlaceholder, ModulePlaceholderSkeleton } from "@/components/admin/module-placeholder";

export const metadata: Metadata = { title: "Pedidos" };

export default function Page() {
  return (
    <AdminGuard fallback={<ModulePlaceholderSkeleton title="Pedidos" />}>
      <ModulePlaceholder title="Pedidos" description="Aquí podrás consultar los pedidos y cambiar su estado." />
    </AdminGuard>
  );
}
