import type { Metadata } from "next";

import { ADMIN_NAV } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/badge";
import { requireAdmin, ROLE_LABELS } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Inicio" };

// requireAdmin también aquí: layouts y páginas se renderizan en paralelo, así que
// cada página protegida verifica por sí misma (la llamada se reutiliza por request).
export default async function AdminHomePage() {
  const context = await requireAdmin();
  const modules = ADMIN_NAV.filter((item) => !item.href);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
        Hola{context.fullName ? `, ${context.fullName}` : ""}
      </h1>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        Bienvenido a la herramienta de gestión de Abarrotes Alex.
        <span className="inline-flex items-center gap-1.5">
          Rol actual: <Badge variant="brand">{ROLE_LABELS[context.role]}</Badge>
        </span>
      </p>

      <section aria-labelledby="modulos" className="mt-8">
        <h2 id="modulos" className="text-lg font-semibold">
          Próximos módulos
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Se habilitarán en la siguiente fase. Por ahora el acceso y los permisos ya están configurados.
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map(({ label, icon: Icon }) => (
            <li key={label} className="flex items-center gap-3 rounded-xl border bg-card p-4">
              <span className="flex size-10 items-center justify-center rounded-lg bg-background-secondary">
                <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-medium">{label}</span>
                <span className="text-xs text-subtle-foreground">Próximamente</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
