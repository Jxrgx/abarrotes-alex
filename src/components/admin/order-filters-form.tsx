"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { controlClassName } from "@/components/ui/field";
import { ORDER_PERIOD_LABELS, ORDER_PERIODS, type OrderFilters } from "@/lib/admin/order-filters";
import { DELIVERY_TYPE_LABELS, ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/orders/status";
import { cn } from "@/lib/utils";

const STATUSES = Object.keys(ORDER_STATUS_LABELS) as OrderStatus[];

// Filtros como formulario GET normal: la URL es la fuente de verdad (refresh, atrás/
// adelante y enlaces funcionan). Cambiar un select envía el formulario; buscar, con
// Enter o el botón. Cambiar cualquier filtro vuelve a la página 1.
export function OrderFiltersForm({ filters, active }: { filters: OrderFilters; active: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const submit = () => formRef.current?.requestSubmit();

  return (
    <form ref={formRef} method="get" action="/admin/pedidos" role="search" aria-label="Filtrar pedidos" className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <label htmlFor="pedidos-q" className="sr-only">
            Buscar por folio, nombre o teléfono
          </label>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground" aria-hidden="true" />
          <input
            id="pedidos-q"
            name="q"
            type="search"
            defaultValue={filters.q}
            placeholder="Folio, nombre o teléfono"
            autoComplete="off"
            maxLength={60}
            className={cn(controlClassName, "h-10 pl-9")}
          />
        </div>
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex">
        <FilterSelect id="pedidos-estado" name="estado" label="Estado" defaultValue={filters.status ?? ""} onChange={submit} className="col-span-2 sm:col-span-1 lg:w-52">
          <option value="">Todos los estados</option>
          <option value="pendientes">Pendientes</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {ORDER_STATUS_LABELS[status]}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect id="pedidos-entrega" name="entrega" label="Entrega" defaultValue={filters.delivery ?? ""} onChange={submit} className="lg:w-44">
          <option value="">Toda entrega</option>
          <option value="delivery">{DELIVERY_TYPE_LABELS.delivery}</option>
          <option value="pickup">{DELIVERY_TYPE_LABELS.pickup}</option>
        </FilterSelect>
        <FilterSelect id="pedidos-periodo" name="periodo" label="Fecha" defaultValue={filters.period} onChange={submit} className="lg:w-48">
          {ORDER_PERIODS.map((period) => (
            <option key={period} value={period}>
              {ORDER_PERIOD_LABELS[period]}
            </option>
          ))}
        </FilterSelect>
        {active && (
          <Link
            href="/admin/pedidos"
            className="col-span-2 inline-flex h-10 items-center justify-center rounded-lg px-3 text-sm font-medium text-primary hover:bg-primary-soft hover:text-primary-dark sm:col-span-3 lg:col-auto"
          >
            Limpiar filtros
          </Link>
        )}
      </div>
    </form>
  );
}

function FilterSelect({ id, name, label, defaultValue, onChange, className, children }: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
  onChange: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select id={id} name={name} defaultValue={defaultValue} onChange={onChange} className={cn(controlClassName, "h-10")}>
        {children}
      </select>
    </div>
  );
}
