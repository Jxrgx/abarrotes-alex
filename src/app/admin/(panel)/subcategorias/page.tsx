import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/admin/module-placeholder";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Subcategorías" };

export default async function Page() {
  await requireAdmin();
  return <ModulePlaceholder title="Subcategorías" description="Aquí podrás administrar las subcategorías de cada categoría." />;
}
