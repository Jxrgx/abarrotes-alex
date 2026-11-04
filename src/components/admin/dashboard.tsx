import { Banknote, ChevronRight, ClipboardList, Clock, type LucideIcon, Receipt, Store } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { DashboardData } from "@/lib/admin/dashboard-data";
import { formatBusinessDateTime } from "@/lib/datetime";
import { formatCents } from "@/lib/format";
import { DELIVERY_TYPE_LABELS } from "@/lib/orders/status";

import { AdminLoadError } from "./admin-list";
import { OrderStatusBadge } from "./order-status-badge";

// Resumen del día. Presentacional: los datos llegan ya calculados por la base.
export function DashboardView({ data, branchName }: { data: DashboardData; branchName: string }) {
  return (
    <div className="space-y-6">
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Store className="size-4" aria-hidden="true" />
        {branchName}
      </p>

      <section aria-labelledby="kpis-titulo">
        <h2 id="kpis-titulo" className="sr-only">
          Indicadores de hoy
        </h2>
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            icon={ClipboardList}
            label="Pedidos hoy"
            value={String(data.ordersToday)}
            hint={data.cancelledToday > 0 ? `Incluye ${data.cancelledToday} cancelado${data.cancelledToday === 1 ? "" : "s"}` : "Recibidos hoy"}
          />
          <Kpi icon={Banknote} label="Importe de pedidos" value={formatCents(data.amountTodayCents)} hint="Hoy, sin cancelados" />
          <Kpi icon={Clock} label="Pedidos pendientes" value={String(data.pending)} hint="Por atender" />
          <Kpi icon={Receipt} label="Ticket promedio" value={formatCents(data.averageTicketCents)} hint="Hoy, sin cancelados" />
        </ul>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel id="recientes-titulo" title="Pedidos recientes">
          {data.recent.length === 0 ? (
            <Empty>Aún no hay pedidos.</Empty>
          ) : (
            <RecentOrders data={data} />
          )}
        </Panel>

        <Panel id="mas-pedidos-titulo" title="Productos más pedidos" subtitle="Últimos 30 días, sin cancelados">
          {data.topProducts.length === 0 ? (
            <Empty>Aún no hay suficiente información.</Empty>
          ) : (
            <ol className="divide-y divide-border-subtle">
              {data.topProducts.map((product, index) => (
                <li key={product.productId} className="flex items-center gap-3 py-2.5">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-background-secondary text-xs font-semibold text-muted-foreground tabular-nums">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {[product.name, product.presentation].filter(Boolean).join(" ")}
                    </span>
                    <span className="block text-xs text-subtle-foreground">
                      En {product.orders} {product.orders === 1 ? "pedido" : "pedidos"}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    <span className="sr-only">Cantidad pedida: </span>×{product.quantity}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  );
}

function RecentOrders({ data }: { data: DashboardData }) {
  return (
    <>
      {/* Desktop: tabla */}
      <div className="hidden md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Pedidos más recientes de la sucursal</caption>
          <thead className="border-b text-xs text-subtle-foreground">
            <tr>
              <th scope="col" className="py-2 pr-3 font-medium">Folio</th>
              <th scope="col" className="py-2 pr-3 font-medium">Cliente</th>
              <th scope="col" className="py-2 pr-3 font-medium">Entrega</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Total</th>
              <th scope="col" className="py-2 pr-3 font-medium">Estado</th>
              <th scope="col" className="py-2 font-medium">Hora</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {data.recent.map((order) => (
              <tr key={order.id}>
                <td className="py-2.5 pr-3">
                  <Link
                    href={`/admin/pedidos/${order.id}`}
                    className="inline-flex min-h-10 items-center font-medium text-primary underline-offset-4 tabular-nums hover:text-primary-hover hover:underline"
                  >
                    {order.folio}
                  </Link>
                </td>
                <td className="max-w-48 truncate py-2.5 pr-3">{order.customerName}</td>
                <td className="py-2.5 pr-3 text-muted-foreground">{DELIVERY_TYPE_LABELS[order.deliveryType]}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums">
                  {formatCents(order.totalCents)}
                  {order.shippingPending && <span className="block text-xs text-subtle-foreground">+ envío</span>}
                </td>
                <td className="py-2.5 pr-3">
                  <OrderStatusBadge status={order.status} />
                </td>
                <td className="py-2.5 whitespace-nowrap text-muted-foreground tabular-nums">
                  {formatBusinessDateTime(order.createdAt, data.todayStart)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Móvil: lista (sin tabla con scroll horizontal) */}
      <ul className="divide-y divide-border-subtle md:hidden">
        {data.recent.map((order) => (
          <li key={order.id}>
            <Link
              href={`/admin/pedidos/${order.id}`}
              aria-label={`Pedido ${order.folio}, ${order.customerName}`}
              className="flex items-center gap-3 py-3"
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold tabular-nums">{order.folio}</span>
                  <OrderStatusBadge status={order.status} />
                </span>
                <span className="mt-0.5 block truncate text-sm">{order.customerName}</span>
                <span className="block text-xs text-subtle-foreground">
                  {DELIVERY_TYPE_LABELS[order.deliveryType]} · {formatBusinessDateTime(order.createdAt, data.todayStart)}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-semibold tabular-nums">{formatCents(order.totalCents)}</span>
                {order.shippingPending && <span className="block text-xs text-subtle-foreground">+ envío</span>}
              </span>
              <ChevronRight className="size-4 shrink-0 text-subtle-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

function Kpi({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: string; hint: string }) {
  return (
    <li className="rounded-xl border bg-card p-4">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4 shrink-0 text-subtle-foreground" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums md:text-3xl">{value}</p>
      <p className="mt-0.5 text-xs text-subtle-foreground">{hint}</p>
    </li>
  );
}

function Panel({ id, title, subtitle, children }: { id: string; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-xl border bg-card p-4 md:p-5">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {subtitle && <p className="text-xs text-subtle-foreground">{subtitle}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-background-secondary px-4 py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

export function DashboardSkeleton() {
  const bone = "animate-pulse rounded-md bg-muted";
  return (
    <div role="status" aria-label="Cargando resumen" className="space-y-6">
      <div className={`${bone} h-5 w-40`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="h-28 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="h-80 animate-pulse rounded-xl bg-muted" />
        <div className="h-80 animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  );
}

export function DashboardError() {
  return <AdminLoadError title="No pudimos cargar el resumen." retryHref="/admin" />;
}
