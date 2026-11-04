"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ADMIN_NAV, isAdminNavActive } from "@/lib/admin/navigation";
import { cn } from "@/lib/utils";

// Lista de navegación del panel con el módulo activo según la ruta actual.
// Client Component mínimo: solo necesita usePathname.
export function AdminNavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="space-y-4">
      {ADMIN_NAV.map((group, index) => (
        <div key={group.label ?? index}>
          {group.label && (
            <p className="mb-1 px-3 text-xs font-medium tracking-wide text-subtle-foreground uppercase">
              {group.label}
            </p>
          )}
          <ul className="space-y-0.5">
            {group.items.map(({ label, href, icon: Icon }) => {
              const active = isAdminNavActive(href, pathname);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-10 items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors duration-150",
                      active
                        ? "bg-primary-soft text-primary-dark"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <Icon className={cn("size-4", active ? "text-primary" : "text-subtle-foreground")} aria-hidden="true" />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
