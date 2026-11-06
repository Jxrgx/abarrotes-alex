import { AlertCircle, type LucideIcon, Search } from "lucide-react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { controlClassName } from "@/components/ui/field";
import { cn } from "@/lib/utils";

// Piezas de listados administrativos (Fase 8B). Presentacionales: sirven en
// Server y Client Components y se reutilizarán en productos, promociones y sucursales.

export function AdminPageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
      {description && <p className="mt-1 max-w-prose text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

// Estado activo/inactivo: siempre con texto (no solo color).
export function ActiveBadge({ active, gender = "f" }: { active: boolean; gender?: "f" | "m" }) {
  const label = active ? (gender === "f" ? "Activa" : "Activo") : gender === "f" ? "Inactiva" : "Inactivo";
  return (
    <Badge variant={active ? "success" : "neutral"}>
      <span className={cn("size-1.5 rounded-full", active ? "bg-success" : "bg-subtle-foreground")} aria-hidden="true" />
      {label}
    </Badge>
  );
}

export function SearchInput({ label, className, ...props }: ComponentProps<"input"> & { label: string }) {
  return (
    <div className={cn("relative", className)}>
      <label htmlFor={props.id} className="sr-only">
        {label}
      </label>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground" aria-hidden="true" />
      <input type="search" autoComplete="off" className={cn(controlClassName, "h-10 pl-9")} {...props} />
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card px-6 py-10 text-center">
      <span className="flex size-11 items-center justify-center rounded-xl bg-background-secondary">
        <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
      </span>
      <div>
        <p className="font-medium">{title}</p>
        {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

// Error de consulta: mensaje amigable + reintentar. No cierra la sesión.
export function AdminLoadError({ title, retryHref }: { title: string; retryHref: string }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border bg-card p-5">
      <p className="flex items-center gap-2 font-medium">
        <AlertCircle className="size-5 text-destructive-strong" aria-hidden="true" />
        {title}
      </p>
      <p className="text-sm text-muted-foreground">Tu sesión sigue activa. Vuelve a intentarlo en unos momentos.</p>
      <Link
        href={retryHref}
        className="inline-flex h-10 items-center rounded-lg border border-input bg-background px-4 text-sm font-medium hover:bg-accent"
      >
        Reintentar
      </Link>
    </div>
  );
}

export function ListSkeleton({ label, filters = 0 }: { label: string; filters?: number }) {
  const bone = "animate-pulse rounded-lg bg-muted";
  return (
    <div role="status" aria-label={label} className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className={cn(bone, "h-10 flex-1")} />
        {Array.from({ length: filters }, (_, index) => (
          <div key={index} className={cn(bone, "h-10 sm:w-56")} />
        ))}
        <div className={cn(bone, "hidden h-10 w-40 sm:block")} />
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex items-center gap-4 border-b border-border-subtle px-4 py-4 last:border-0">
            <div className="flex-1 space-y-2">
              <div className="h-4 w-40 animate-pulse rounded-md bg-muted" />
              <div className="h-3 w-24 animate-pulse rounded-md bg-muted" />
            </div>
            <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Tabla compacta (lg+). Columnas explícitas en cada módulo: sin configuración dinámica.
// Con la barra lateral, a 1024–1280 px el área útil puede ser menor que la tabla: se desplaza
// horizontalmente (overflow-x-auto) en lugar de recortar las columnas de acciones.
// `relative`: contiene los sr-only (absolutos) para que no ensanchen el documento.
export function AdminTable({ caption, head, children }: { caption: string; head: ReactNode; children: ReactNode }) {
  return (
    <div className="relative hidden overflow-x-auto rounded-xl border bg-card lg:block">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b bg-background-secondary text-xs text-muted-foreground">
          <tr className="[&>th]:px-4 [&>th]:py-2.5 [&>th]:font-medium">{head}</tr>
        </thead>
        <tbody className="divide-y divide-border-subtle [&_td]:px-4 [&_td]:py-2.5">{children}</tbody>
      </table>
    </div>
  );
}

// Lista de tarjetas (móvil y tablet): sin tabla comprimida ni scroll horizontal.
export function AdminCardList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ul aria-label={label} className="divide-y divide-border-subtle overflow-hidden rounded-xl border bg-card lg:hidden">
      {children}
    </ul>
  );
}

// "5 categorías · 1 inactiva" o, filtrando, "2 de 5 categorías". Anunciado al cambiar.
export function ListSummary({ total, visible, inactive, singular, plural, filtered }: {
  total: number;
  visible: number;
  inactive: number;
  singular: string;
  plural: string;
  filtered: boolean;
}) {
  const noun = total === 1 ? singular : plural;
  return (
    <p className="text-sm text-muted-foreground" aria-live="polite">
      {filtered ? `${visible} de ${total} ${noun}` : `${total} ${noun}`}
      {!filtered && inactive > 0 && ` · ${inactive} ${inactive === 1 ? "inactiva" : "inactivas"}`}
    </p>
  );
}

export function NoResults({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-card px-6 py-10 text-center">
      <p className="font-medium">{query.trim() ? `No hay resultados para “${query.trim()}”.` : "No hay resultados con estos filtros."}</p>
      <button
        type="button"
        onClick={onClear}
        className="inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium text-primary hover:bg-primary-soft hover:text-primary-dark"
      >
        {query.trim() ? "Limpiar búsqueda" : "Quitar filtros"}
      </button>
    </div>
  );
}

// Tarjeta de la lista móvil: nombre + acciones arriba y datos a todo el ancho debajo
// (así los datos no compiten por espacio con los botones).
export function AdminCard({ busy = false, title, actions, children }: {
  busy?: boolean;
  title: ReactNode;
  actions: ReactNode;
  children: ReactNode;
}) {
  return (
    <li aria-busy={busy} className="space-y-2 py-3 pr-2 pl-4 aria-busy:opacity-60">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 pt-0.5">{title}</div>
        {actions}
      </div>
      <div className="space-y-1.5 pr-2 text-sm">{children}</div>
    </li>
  );
}

// Datos secundarios (estado, conteos, orden) separados por espacio: al partir línea
// no quedan separadores colgando.
export function MetaList({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">{children}</div>;
}

// Nombre + slug secundario (el slug es parte de la URL pública).
export function NameCell({ name, slug, muted = false }: { name: string; slug: string; muted?: boolean }) {
  return (
    <span className="block min-w-0">
      <span className={cn("block truncate font-medium", muted && "text-muted-foreground")}>{name}</span>
      <span className="block truncate text-xs text-subtle-foreground">{slug}</span>
    </span>
  );
}
