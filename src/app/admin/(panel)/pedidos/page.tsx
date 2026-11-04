import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/admin/module-placeholder";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Pedidos" };

export default async function Page() {
  await requireAdmin();
  return <ModulePlaceholder title="Pedidos" description="Aquí podrás consultar los pedidos y cambiar su estado." />;
}
