import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/admin/module-placeholder";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sucursales" };

export default async function Page() {
  await requireAdmin();
  return <ModulePlaceholder title="Sucursales" description="Aquí podrás editar los datos y horarios de la sucursal." />;
}
