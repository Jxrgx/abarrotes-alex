"use client";

import { CircleCheck, MessageCircle, Store, Truck } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";

import { buttonVariants } from "@/components/ui/button";
import { formatCents } from "@/lib/format";
import { parseConfirmation, readConfirmationsRaw } from "@/lib/orders/session";
import { buildOrderWhatsAppMessage, buildWhatsAppUrl } from "@/lib/orders/whatsapp";

const FOLIO_PATTERN = /^ALEX-\d{6,}$/;
const noSubscribe = () => () => {};

// La confirmación NO consulta la base: orders no es legible públicamente. Solo
// se muestra el detalle si el comprobante está en sessionStorage de esta
// pestaña (prueba de posesión). Sin él, un mensaje genérico sin datos.
export function OrderConfirmation({ folio }: { folio: string }) {
  // undefined = servidor / hidratación; string | null = valor del navegador.
  const raw = useSyncExternalStore<string | null | undefined>(noSubscribe, readConfirmationsRaw, () => undefined);
  if (raw === undefined) {
    return <div role="status" aria-label="Cargando" className="mx-auto h-96 max-w-2xl animate-pulse rounded-xl bg-muted" />;
  }

  const confirmation = parseConfirmation(raw, folio);
  if (!confirmation) return <ConfirmationWithoutReceipt folio={folio} />;

  const { receipt, contact } = confirmation;
  const whatsappUrl = buildWhatsAppUrl(receipt.branch.whatsappNumber, buildOrderWhatsAppMessage(receipt, contact));
  const shippingKnown = receipt.shippingCents !== null;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success-soft">
          <CircleCheck className="size-8 text-success-strong" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">¡Pedido recibido!</h1>
        <p className="mt-2 text-muted-foreground">
          Folio <span className="font-semibold text-foreground tabular-nums">{receipt.folio}</span>
        </p>
        {/* El pedido ya está registrado en la base: no depende de WhatsApp ni de que la
            notificación al dueño llegue (Web Push no garantiza la entrega). */}
        <p className="mx-auto mt-4 max-w-md text-base">
          Tu pedido <span className="font-semibold tabular-nums">{receipt.folio}</span> fue enviado a Abarrotes Alex. En
          breve será procesado. Conserva tu folio.
        </p>
        {whatsappUrl && (
          <div className="mt-5">
            <p className="text-sm text-muted-foreground">¿Tienes alguna duda sobre tu pedido?</p>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "secondary", size: "lg", className: "mt-2 w-full sm:w-auto" })}
            >
              <MessageCircle aria-hidden="true" />
              Contactar por WhatsApp
              <span className="sr-only"> (se abre en otra pestaña)</span>
            </a>
          </div>
        )}
      </div>

      <section aria-labelledby="confirmacion-detalle" className="mt-8 rounded-xl border bg-card p-4 md:p-5">
        <h2 id="confirmacion-detalle" className="text-lg font-semibold">
          Detalle del pedido
        </h2>

        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Sucursal</dt>
            <dd className="mt-0.5 font-medium">{receipt.branch.name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Entrega</dt>
            <dd className="mt-0.5 flex items-center gap-1.5 font-medium">
              {receipt.deliveryType === "delivery" ? (
                <>
                  <Truck className="size-4 text-muted-foreground" aria-hidden="true" />A domicilio
                </>
              ) : (
                <>
                  <Store className="size-4 text-muted-foreground" aria-hidden="true" />
                  Recoger en sucursal
                </>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Pago</dt>
            <dd className="mt-0.5 font-medium">
              {receipt.deliveryType === "pickup" ? "Efectivo al recoger" : "Efectivo"}
              {contact.cashAmountCents ? (
                <span className="block font-normal text-muted-foreground">
                  Pagarás con {formatCents(contact.cashAmountCents)}
                </span>
              ) : null}
            </dd>
          </div>
        </dl>

        <ul className="mt-4 divide-y divide-border-subtle border-t text-sm">
          {receipt.items.map((item) => (
            <li key={item.productId} className="flex items-start justify-between gap-3 py-2.5">
              <span>
                <span className="tabular-nums">{item.quantity} ×</span>{" "}
                {[item.name, item.presentation].filter(Boolean).join(" ")}
                {/* Snapshot del pedido: no se consultan las reglas actuales. */}
                {item.pricingType === "wholesale" && (
                  <span className="block text-xs text-primary-dark">
                    Precio mayoreo · {formatCents(item.unitPriceCents)} c/u
                  </span>
                )}
              </span>
              <span className="shrink-0 tabular-nums">{formatCents(item.subtotalCents)}</span>
            </li>
          ))}
        </ul>

        <dl className="space-y-2 border-t pt-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tabular-nums">{formatCents(receipt.subtotalCents)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Envío</dt>
            <dd>{shippingKnown ? formatCents(receipt.shippingCents!) : "Por confirmar"}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-t pt-2">
            <dt className="font-medium">{shippingKnown ? "Total" : "Total parcial"}</dt>
            <dd className="text-xl font-semibold tabular-nums">{formatCents(receipt.totalCents)}</dd>
          </div>
        </dl>
      </section>

      <div className="mt-6 text-center">
        <Link href="/productos" className={buttonVariants({ variant: "secondary" })}>
          Seguir comprando
        </Link>
      </div>
    </div>
  );
}

function ConfirmationWithoutReceipt({ folio }: { folio: string }) {
  return (
    <div className="mx-auto max-w-md py-8 text-center">
      <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-background-secondary">
        <CircleCheck className="size-8 text-muted-foreground" aria-hidden="true" />
      </span>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight md:text-3xl">Tu pedido ya fue registrado.</h1>
      {FOLIO_PATTERN.test(folio) && (
        <p className="mt-2 text-muted-foreground">
          Folio <span className="font-semibold text-foreground tabular-nums">{folio}</span>
        </p>
      )}
      <p className="mt-3 text-sm text-muted-foreground">
        Conserva tu folio para cualquier aclaración. Por tu privacidad, el detalle solo se muestra en el dispositivo y la
        sesión donde hiciste el pedido.
      </p>
      <Link href="/productos" className={buttonVariants({ className: "mt-6" })}>
        Volver a la tienda
      </Link>
    </div>
  );
}
