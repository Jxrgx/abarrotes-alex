import { ArrowLeft, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminLoadError } from "@/components/admin/admin-list";
import { OrderStatusActions } from "@/components/admin/order-status-actions";
import { OrderStatusBadge } from "@/components/admin/order-status-badge";
import { Badge } from "@/components/ui/badge";
import { loadAdminSection } from "@/lib/admin/load";
import { type AdminOrderDetail, getAdminOrder } from "@/lib/admin/orders";
import { requireAdmin } from "@/lib/auth/session";
import { formatBusinessDateTimeFull } from "@/lib/datetime";
import { formatCents, formatPhone } from "@/lib/format";
import { DELIVERY_TYPE_LABELS, isFinalStatus, ORDER_STATUS_LABELS } from "@/lib/orders/status";

export const metadata: Metadata = { title: "Detalle de pedido" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function OrderDetailPage({ params }: PageProps<"/admin/pedidos/[id]">) {
  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/admin/pedidos" className="mb-3 inline-flex h-10 items-center gap-1.5 rounded-lg pr-3 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Pedidos
      </Link>
      <AdminGuard fallback={<OrderDetailSkeleton />}>
        <OrderDetail params={params} />
      </AdminGuard>
    </div>
  );
}

async function OrderDetail({ params }: Pick<PageProps<"/admin/pedidos/[id]">, "params">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const admin = await requireAdmin(); // ya verificado por AdminGuard (cache por request)
  const result = await loadAdminSection(() => getAdminOrder(id));
  if (!result.ok) return <AdminLoadError title="No pudimos cargar el pedido." retryHref={`/admin/pedidos/${id}`} />;
  const order = result.data;
  // Inexistente o fuera de permisos: misma respuesta (no revela nada).
  if (!order) notFound();

  const pending = !isFinalStatus(order.status);
  return (
    <article aria-labelledby="pedido-folio" className={pending ? "pb-24 lg:pb-0" : undefined}>
      {/* Lo operativo primero: folio, estado, cliente, entrega y la acción siguiente. */}
      <header className="space-y-3 rounded-xl border bg-card p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 id="pedido-folio" className="text-2xl font-semibold tracking-tight tabular-nums md:text-3xl">
            {order.folio}
          </h1>
          <OrderStatusBadge status={order.status} />
          <Badge variant="neutral">{DELIVERY_TYPE_LABELS[order.deliveryType]}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {order.customerName} · {formatBusinessDateTimeFull(order.createdAt)} · {order.branchName}
        </p>
        <div className="hidden lg:block">
          <OrderStatusActions orderId={order.id} folio={order.folio} status={order.status} deliveryType={order.deliveryType} variant="panel" />
        </div>
        {!pending && (
          <p className="text-sm text-muted-foreground lg:hidden">Estado final: ya no se puede cambiar.</p>
        )}
      </header>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Section title="Cliente">
          <p className="font-medium">{order.customerName}</p>
          <p className="tabular-nums">
            <a href={`tel:${order.customerPhone}`} className="inline-flex min-h-10 items-center text-primary underline-offset-4 hover:underline">
              {formatPhone(order.customerPhone)}
            </a>
          </p>
          <a
            href={`https://wa.me/${whatsappNumber(order.customerPhone)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-input px-3 text-sm font-medium hover:bg-accent"
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            Escribir al cliente por WhatsApp
          </a>
        </Section>

        <Section title="Entrega">
          <p className="font-medium">{order.deliveryType === "delivery" ? "Entrega a domicilio" : "Recoger en sucursal"}</p>
          {order.deliveryType === "delivery" ? (
            <dl className="space-y-1 text-sm">
              <Row label="Dirección">{order.address}</Row>
              {order.neighborhood && <Row label="Colonia">{order.neighborhood}</Row>}
              {order.addressReferences && <Row label="Referencias">{order.addressReferences}</Row>}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">{order.branchName}</p>
          )}
        </Section>

        <Section title="Pago">
          <Payment order={order} />
        </Section>

        {order.customerNotes && (
          <Section title="Notas del cliente">
            <p className="text-sm whitespace-pre-line">{order.customerNotes}</p>
          </Section>
        )}
      </div>

      <Section title="Productos" className="mt-4">
        <ul className="divide-y divide-border-subtle">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 py-2.5">
              <span className="min-w-12 shrink-0 font-semibold tabular-nums">{formatQuantity(item.quantity)} ×</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{item.name}</span>
                {item.presentation && <span className="block text-xs text-subtle-foreground">{item.presentation}</span>}
                <span className="block text-xs text-subtle-foreground tabular-nums">{formatCents(item.unitPriceCents)} c/u</span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{formatCents(item.subtotalCents)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1.5 border-t pt-3 text-sm">
          <SummaryRow label="Subtotal">{formatCents(order.subtotalCents)}</SummaryRow>
          <SummaryRow label="Envío">{order.shippingCents === null ? <span className="text-warning-strong">Por confirmar</span> : formatCents(order.shippingCents)}</SummaryRow>
          <SummaryRow label={order.shippingCents === null ? "Total sin envío" : "Total"} strong>
            {formatCents(order.totalCents)}
          </SummaryRow>
          {order.shippingCents === null && <p className="text-xs text-subtle-foreground">El total final se completa al confirmar el costo de envío.</p>}
        </dl>
      </Section>

      <Section title="Historial" className="mt-4">
        <ol className="space-y-3 border-l-2 border-border pl-4">
          {order.history.map((entry) => (
            <li key={entry.id} className="relative">
              <span className="absolute top-1.5 -left-[1.4rem] size-2.5 rounded-full bg-primary" aria-hidden="true" />
              <p className="text-sm font-medium">{ORDER_STATUS_LABELS[entry.newStatus]}</p>
              <p className="text-xs text-subtle-foreground">
                <time dateTime={entry.createdAt}>{formatBusinessDateTimeFull(entry.createdAt)}</time> · {changedByLabel(entry.changedBy, admin.userId, admin.fullName)}
              </p>
            </li>
          ))}
        </ol>
      </Section>

      {pending && <OrderStatusActions orderId={order.id} folio={order.folio} status={order.status} deliveryType={order.deliveryType} variant="bar" />}
    </article>
  );
}

// changed_by: NULL = Sistema (create_order). La RLS de profiles solo deja leer el propio
// perfil, así que otros administradores se muestran sin nombre (nunca el UUID).
function changedByLabel(changedBy: string | null, currentUserId: string, currentName: string | null) {
  if (changedBy === null) return "Sistema";
  if (changedBy === currentUserId) return currentName ? `Tú (${currentName})` : "Tú";
  return "Otro administrador";
}

function Payment({ order }: { order: AdminOrderDetail }) {
  const method = order.paymentMethod === "cash" ? "Efectivo" : order.paymentMethod;
  const change = order.cashAmountCents === null ? null : order.cashAmountCents - order.totalCents;
  return (
    <dl className="space-y-1 text-sm">
      <Row label="Método">{method}</Row>
      {order.cashAmountCents !== null && <Row label="Paga con">{formatCents(order.cashAmountCents)}</Row>}
      {change !== null && change >= 0 && (
        <Row label="Cambio aproximado">
          {formatCents(change)}
          {order.shippingCents === null && <span className="block text-xs text-subtle-foreground">Sin contar el envío, que está por confirmar.</span>}
        </Row>
      )}
      {change !== null && change < 0 && <p className="text-xs text-warning-strong">El monto con el que paga es menor que el total.</p>}
    </dl>
  );
}

// Teléfonos de 10 dígitos son de México (52); los demás ya traen la lada del país.
function whatsappNumber(phone: string) {
  return phone.length === 10 ? `52${phone}` : phone;
}

function formatQuantity(quantity: number) {
  return Number.isInteger(quantity) ? String(quantity) : quantity.toLocaleString("es-MX", { maximumFractionDigits: 3 });
}

function Section({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className={`space-y-2 rounded-xl border bg-card p-4 md:p-5 ${className ?? ""}`}>
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-subtle-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function SummaryRow({ label, strong = false, children }: { label: string; strong?: boolean; children: ReactNode }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${strong ? "text-base font-semibold" : ""}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  );
}

function OrderDetailSkeleton() {
  return (
    <div role="status" aria-label="Cargando pedido" className="space-y-4">
      <div className="h-32 animate-pulse rounded-xl bg-muted" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-36 animate-pulse rounded-xl bg-muted" />
        <div className="h-36 animate-pulse rounded-xl bg-muted" />
      </div>
      <div className="h-64 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
