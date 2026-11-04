import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/admin/module-placeholder";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Promociones" };

export default async function Page() {
  await requireAdmin();
  return <ModulePlaceholder title="Promociones" description="Aquí podrás crear y desactivar precios promocionales." />;
}
