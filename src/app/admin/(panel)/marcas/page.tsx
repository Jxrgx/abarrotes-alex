import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/admin/module-placeholder";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Marcas" };

export default async function Page() {
  await requireAdmin();
  return <ModulePlaceholder title="Marcas" description="Aquí podrás administrar las marcas del catálogo." />;
}
