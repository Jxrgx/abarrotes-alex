import type { ReactNode } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { Badge } from "@/components/ui/badge";
import { type AdminContext, ROLE_LABELS } from "@/lib/auth/session";

import { AdminNavList } from "./admin-nav";
import { MobileAdminNav } from "./mobile-admin-nav";
import { SignOutButton } from "./sign-out-button";
import { ToastProvider } from "./toast";

// Estructura del panel: barra lateral en desktop (lg+) y barra superior con
// botón "Menú" en móvil/tablet. La navegación viene de src/lib/admin/navigation.ts.
export function AdminShell({ context, children }: { context: AdminContext; children: ReactNode }) {
  const userName = context.fullName ?? context.email ?? "Usuario";
  const roleLabel = context.role ? ROLE_LABELS[context.role] : null;

  return (
    <div className="min-h-full flex-1 bg-background-secondary lg:flex">
      <a
        href="#contenido"
        className="sr-only rounded-lg bg-background px-4 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
      >
        Saltar al contenido
      </a>

      {/* Desktop: barra lateral fija */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-background lg:flex">
        <div className="flex h-16 items-center border-b px-5">
          <BrandMark />
        </div>
        <nav aria-label="Panel administrativo" className="flex-1 overflow-y-auto p-3">
          <AdminNavList />
        </nav>
        <div className="border-t p-3">
          <div className="px-3 py-1">
            <p className="truncate text-sm font-medium" title={context.email ?? undefined}>
              {userName}
            </p>
            {roleLabel && (
              <Badge variant="brand" className="mt-1">
                {roleLabel}
              </Badge>
            )}
          </div>
          <SignOutButton className="mt-2" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Móvil y tablet: barra superior con menú */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b bg-background px-4 lg:hidden">
          <BrandMark />
          <MobileAdminNav userName={userName} roleLabel={roleLabel} />
        </header>

        <main id="contenido" className="flex-1 px-4 py-6 md:px-6 lg:px-8 lg:py-8">
          <ToastProvider>{children}</ToastProvider>
        </main>
      </div>
    </div>
  );
}

function BrandMark() {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <BrandLogo size={36} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-semibold">Abarrotes Alex</span>
        <span className="truncate text-xs text-muted-foreground">Panel administrativo</span>
      </span>
    </span>
  );
}
