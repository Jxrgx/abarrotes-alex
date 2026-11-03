import {
  ClipboardList,
  House,
  type LucideIcon,
  Package,
  Shapes,
  Store,
  Tag,
  Tags,
  Award,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { type AdminContext, ROLE_LABELS } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

import { SignOutButton } from "./sign-out-button";

type NavItem = { label: string; icon: LucideIcon; href?: string };

// Módulos del panel. Sin href = todavía no implementado (Fase 8).
export const ADMIN_NAV: NavItem[] = [
  { label: "Inicio", icon: House, href: "/admin" },
  { label: "Pedidos", icon: ClipboardList },
  { label: "Productos", icon: Package },
  { label: "Categorías", icon: Shapes },
  { label: "Subcategorías", icon: Tags },
  { label: "Marcas", icon: Award },
  { label: "Promociones", icon: Tag },
  { label: "Sucursales", icon: Store },
];

export function AdminShell({ context, children }: { context: AdminContext; children: ReactNode }) {
  return (
    <div className="min-h-full flex-1 bg-background-secondary lg:flex">
      {/* Desktop: barra lateral */}
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-background lg:flex">
        <div className="flex h-16 items-center gap-2.5 border-b px-5">
          <BrandMark />
        </div>
        <nav aria-label="Panel administrativo" className="flex-1 overflow-y-auto p-3">
          <ul className="space-y-1">
            {ADMIN_NAV.map((item) => (
              <li key={item.label}>
                <NavEntry item={item} />
              </li>
            ))}
          </ul>
        </nav>
        <div className="border-t p-3">
          <UserSummary context={context} />
          <SignOutButton className="mt-2" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Móvil y tablet: barra superior + navegación deslizable */}
        <header className="sticky top-0 z-30 border-b bg-background lg:hidden">
          <div className="flex h-14 items-center justify-between gap-3 px-4">
            <BrandMark />
            <SignOutButton compact />
          </div>
          <nav aria-label="Panel administrativo" className="border-t">
            <ul className="flex gap-1 overflow-x-auto px-2 py-1.5">
              {ADMIN_NAV.map((item) => (
                <li key={item.label} className="shrink-0">
                  <NavEntry item={item} compact />
                </li>
              ))}
            </ul>
          </nav>
        </header>

        <main id="contenido" className="flex-1 px-4 py-6 md:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function BrandMark() {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
        aria-hidden="true"
      >
        A
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-semibold">Abarrotes Alex</span>
        <span className="truncate text-xs text-muted-foreground">Panel administrativo</span>
      </span>
    </span>
  );
}

function NavEntry({ item, compact = false }: { item: NavItem; compact?: boolean }) {
  const { icon: Icon, label, href } = item;
  const base = cn(
    "flex h-10 items-center gap-2.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap",
    compact && "h-9",
  );

  if (!href) {
    return (
      <span className={cn(base, "cursor-default text-subtle-foreground")} aria-disabled="true">
        <Icon className="size-4" aria-hidden="true" />
        {label}
        {!compact && (
          <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            Pronto
          </span>
        )}
        <span className="sr-only"> (próximamente)</span>
      </span>
    );
  }

  // Solo existe "Inicio" por ahora; cuando haya más rutas, el activo se calculará por ruta.
  return (
    <Link href={href} aria-current="page" className={cn(base, "bg-primary-soft text-primary-dark")}>
      <Icon className="size-4" aria-hidden="true" />
      {label}
    </Link>
  );
}

function UserSummary({ context }: { context: AdminContext }) {
  return (
    <div className="px-3 py-1">
      <p className="truncate text-sm font-medium" title={context.email ?? undefined}>
        {context.fullName ?? context.email ?? "Usuario"}
      </p>
      {context.role && (
        <Badge variant="brand" className="mt-1">
          {ROLE_LABELS[context.role]}
        </Badge>
      )}
    </div>
  );
}
