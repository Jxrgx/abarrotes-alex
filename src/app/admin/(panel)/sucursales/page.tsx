import type { Metadata } from "next";

import { AdminGuard } from "@/components/admin/admin-guard";
import { ModulePlaceholder, ModulePlaceholderSkeleton } from "@/components/admin/module-placeholder";

export const metadata: Metadata = { title: "Sucursales" };

export default function Page() {
  return (
    <AdminGuard fallback={<ModulePlaceholderSkeleton title="Sucursales" />}>
      <ModulePlaceholder title="Sucursales" description="Aquí podrás editar los datos y horarios de la sucursal." />
    </AdminGuard>
  );
}
