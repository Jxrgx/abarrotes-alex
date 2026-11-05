import { ChevronLeft, ChevronRight, ClipboardList } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminCardList, AdminLoadError, AdminPageHeader, AdminTable, EmptyState, ListSkeleton } from "@/components/admin/admin-list";
import { OrderFiltersForm } from "@/components/admin/order-filters-form";
import { OrderStatusBadge } from "@/components/admin/order-status-badge";
import { hasActiveFilters, ORDER_PAGE_SIZE, ordersHref, parseOrderFilters } from "@/lib/admin/order-filters";
import { listAdminOrders } from "@/lib/admin/orders";
import { loadAdminSection } from "@/lib/admin/load";
import { formatBusinessDateTime } from "@/lib/datetime";
import { formatCents } from "@/lib/format";
import { DELIVERY_TYPE_LABELS } from "@/lib/orders/status";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Pedidos" };

export default function OrdersPage({ searchParams }: PageProps<"/admin/pedidos">) {
  return (
    <div className="mx-auto max-w-6xl">
      <AdminPageHeader title="Pedidos" description="Más recientes primero. Abre un pedido para ver sus datos y cambiar su estado." />
      <AdminGuard fallback={<ListSkeleton label="Cargando pedidos" filters={3} />}>
        <OrdersSection searchParams={searchParams} />
      </AdminGuard>
    </div>
  );
}

async function OrdersSection({ searchParams }: Pick<PageProps<"/admin/pedidos">, "searchParams">) {
  const filters = parseOrderFilters(await searchParams);
  const result = await loadAdminSection(() => listAdminOrders(filters));
  if (!result.ok) return <AdminLoadError title="No pudimos cargar los pedidos." retryHref={ordersHref(filters)} />;
  const { rows, total, todayStart } = result.data;
  const active = hasActiveFilters(filters);
  const pages = Math.max(1, Math.ceil(total / ORDER_PAGE_SIZE));

  if (total === 0 && !active && filters.page === 1) {
    return <EmptyState icon={ClipboardList} title="Aún no hay pedidos." description="Los pedidos que hagan los clientes desde la tienda aparecerán aquí." />;
  }

  return (
    <div className="space-y-4">
      <OrderFiltersForm filters={filters} active={active} />
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {total} {total === 1 ? "pedido" : "pedidos"}
        {pages > 1 && ` · página ${Math.min(filters.page, pages)} de ${pages}`}
      </p>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-card px-6 py-10 text-center">
          {total > 0 ? (
            <>
              <p className="font-medium">Esta página no tiene pedidos.</p>
              <Link href={ordersHref({ ...filters, page: 1 })} className="inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium text-primary hover:bg-primary-soft hover:text-primary-dark">
                Ir a la primera página
              </Link>
            </>
          ) : (
            <>
              <p className="font-medium">No encontramos pedidos con estos filtros.</p>
              <Link href="/admin/pedidos" className="inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium text-primary hover:bg-primary-soft hover:text-primary-dark">
                Limpiar filtros
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          <AdminTable
            caption="Pedidos"
            head={
              <>
                <th scope="col">Folio</th>
                <th scope="col">Cliente</th>
                <th scope="col">Entrega</th>
                <th scope="col" className="text-right">Total</th>
                <th scope="col">Estado</th>
                <th scope="col">Fecha</th>
                <th scope="col" className="text-right">
                  <span className="sr-only">Acciones</span>
                </th>
              </>
            }
          >
            {rows.map((order) => (
              <tr key={order.id}>
                <td className="font-semibold tabular-nums">{order.folio}</td>
                <td className="max-w-56 truncate">{order.customerName}</td>
                <td className="text-muted-foreground">{DELIVERY_TYPE_LABELS[order.deliveryType]}</td>
                <td className="text-right tabular-nums">
                  {formatCents(order.totalCents)}
                  {order.shippingPending && <span className="block text-xs text-subtle-foreground">+ envío</span>}
                </td>
                <td>
                  <OrderStatusBadge status={order.status} />
                </td>
                <td className="whitespace-nowrap text-muted-foreground tabular-nums">{formatBusinessDateTime(order.createdAt, todayStart)}</td>
                <td className="w-px">
                  <Link
                    href={`/admin/pedidos/${order.id}`}
                    aria-label={`Ver pedido ${order.folio}`}
                    className="inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium whitespace-nowrap text-primary hover:bg-primary-soft hover:text-primary-dark"
                  >
                    Ver pedido
                  </Link>
                </td>
              </tr>
            ))}
          </AdminTable>

          <AdminCardList label="Pedidos">
            {rows.map((order) => (
              <li key={order.id}>
                <Link href={`/admin/pedidos/${order.id}`} aria-label={`Pedido ${order.folio}, ${order.customerName}`} className="flex items-center gap-3 px-4 py-3 hover:bg-background-secondary">
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold tabular-nums">{order.folio}</span>
                      <OrderStatusBadge status={order.status} />
                    </span>
                    <span className="block truncate text-sm">{order.customerName}</span>
                    <span className="block text-xs text-subtle-foreground">
                      {DELIVERY_TYPE_LABELS[order.deliveryType]} · {formatBusinessDateTime(order.createdAt, todayStart)}
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
          </AdminCardList>

          {pages > 1 && (
            <nav aria-label="Páginas de pedidos" className="flex items-center justify-between gap-3">
              <PageLink href={ordersHref({ ...filters, page: filters.page - 1 })} disabled={filters.page <= 1}>
                <ChevronLeft aria-hidden="true" className="size-4" />
                Anterior
              </PageLink>
              <span className="text-sm text-muted-foreground tabular-nums">
                {(filters.page - 1) * ORDER_PAGE_SIZE + 1}–{Math.min(total, filters.page * ORDER_PAGE_SIZE)} de {total}
              </span>
              <PageLink href={ordersHref({ ...filters, page: filters.page + 1 })} disabled={filters.page >= pages}>
                Siguiente
                <ChevronRight aria-hidden="true" className="size-4" />
              </PageLink>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function PageLink({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  const className = "inline-flex h-10 items-center gap-1.5 rounded-lg border border-input bg-background px-4 text-sm font-medium";
  if (disabled) {
    return (
      <span aria-disabled="true" className={cn(className, "text-subtle-foreground opacity-60")}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={cn(className, "hover:bg-accent")}>
      {children}
    </Link>
  );
}
