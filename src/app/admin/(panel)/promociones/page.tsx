import type { Metadata } from "next";

import { AdminGuard } from "@/components/admin/admin-guard";
import { ModulePlaceholder, ModulePlaceholderSkeleton } from "@/components/admin/module-placeholder";

export const metadata: Metadata = { title: "Promociones" };

export default function Page() {
  return (
    <AdminGuard fallback={<ModulePlaceholderSkeleton title="Promociones" />}>
      <ModulePlaceholder title="Promociones" description="Aquí podrás crear y desactivar precios promocionales." />
    </AdminGuard>
  );
}
