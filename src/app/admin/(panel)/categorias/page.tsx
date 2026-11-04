import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/admin/module-placeholder";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Categorías" };

export default async function Page() {
  await requireAdmin();
  return <ModulePlaceholder title="Categorías" description="Aquí podrás crear, ordenar y desactivar categorías." />;
}
