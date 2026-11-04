import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/admin/module-placeholder";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Productos" };

export default async function Page() {
  await requireAdmin();
  return <ModulePlaceholder title="Productos" description="Aquí podrás crear y editar productos, precios por sucursal y disponibilidad." />;
}
