import { Suspense } from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/lib/auth/session";

// Panel protegido. La verificación ocurre en el servidor antes de renderizar el
// contenido: el fallback no contiene datos y el panel nunca se muestra a quien no es admin.
export default function AdminPanelLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<PanelSkeleton />}>
      <ProtectedShell>{children}</ProtectedShell>
    </Suspense>
  );
}

async function ProtectedShell({ children }: { children: React.ReactNode }) {
  const context = await requireAdmin();
  return <AdminShell context={context}>{children}</AdminShell>;
}

function PanelSkeleton() {
  return (
    <div role="status" aria-label="Cargando panel" className="flex min-h-full flex-1 bg-background-secondary">
      <div className="hidden w-64 border-r bg-background lg:block" />
      <div className="flex-1 p-8">
        <div className="h-8 w-56 animate-pulse rounded-md bg-muted" />
      </div>
    </div>
  );
}
