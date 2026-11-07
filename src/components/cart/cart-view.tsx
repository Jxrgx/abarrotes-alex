"use client";

import { AlertCircle, ArrowRight, RefreshCw, ShoppingCart, Tag, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { EmptyState } from "@/components/store/empty-state";
import { ProductImage } from "@/components/store/product-image";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { type PricingType, wholesaleCartText, wholesaleHint } from "@/lib/catalog/pricing";
import { type CartLineStatus, priceRules, resolveCartLines } from "@/lib/cart/lines";
import type { CartProductInfo, CartState } from "@/lib/cart/schema";
import { announceCart, countLabel, dispatchCart, useCart } from "@/lib/cart/store";
import { formatCents } from "@/lib/format";

import { QuantityStepper } from "./quantity-stepper";
import { useCartResolution } from "./use-cart-resolution";

export function CartView() {
  const cart = useCart();
  const { resolution, loading, failed, retry } = useCartResolution(cart);

  if (cart === null) return <CartSkeleton lines={2} />;
  if (cart.items.length === 0) {
    return (
      <EmptyState
        icon={ShoppingCart}
        title="Tu carrito está vacío"
        description="Explora nuestros productos y agrega lo que necesites."
        action={
          <Link href="/productos" className={buttonVariants()}>
            Ver productos
          </Link>
        }
      />
    );
  }
  if (!resolution && failed) return <CartError onRetry={retry} />;
  if (!resolution) return <CartSkeleton lines={Math.min(cart.items.length, 4)} />;

  const { lines, subtotalCents, payableCount, blocked, branchUnavailable } = resolveCartLines(cart, resolution);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8">
      <section aria-labelledby="carrito-productos">
        <div className="flex items-center justify-between gap-3 border-b pb-3">
          <h2 id="carrito-productos" className="text-sm text-muted-foreground">
            {countLabel(cart.items.reduce((total, item) => total + item.quantity, 0))}
          </h2>
          <ClearCart />
        </div>

        {branchUnavailable && (
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-warning-soft p-3 text-sm text-warning-strong">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            La sucursal de este carrito ya no está disponible. Quita los productos para empezar de nuevo.
          </p>
        )}
        {failed && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-warning-soft p-3 text-sm text-warning-strong">
            <span>No pudimos actualizar algunos productos.</span>
            <Button variant="secondary" onClick={retry}>
              <RefreshCw aria-hidden="true" />
              Reintentar
            </Button>
          </div>
        )}

        <ul className="divide-y" aria-busy={loading}>
          {lines.map((line) => (
            <CartLine key={line.item.productId} {...line} />
          ))}
        </ul>
      </section>

      <CartSummary
        subtotalCents={subtotalCents}
        payableCount={payableCount}
        blocked={blocked}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function CartLine({
  item,
  info,
  status,
  unitCents,
  pricingType,
}: {
  item: CartState["items"][number];
  info: CartProductInfo | undefined;
  status: CartLineStatus;
  /** Precio para la cantidad de esta línea (resolveCartLines). */
  unitCents: number;
  pricingType: PricingType;
}) {
  if (status === "loading") return <LineSkeleton />;

  const label = info ? [info.name, info.presentation].filter(Boolean).join(" ") : "Producto";
  const discounted = pricingType !== "normal";
  const inactive = status !== "ok";
  // "Agrega N más para obtener $X c/u" (siguiente nivel de mayoreo que mejora el precio).
  const hint = info && status === "ok" ? wholesaleHint(priceRules(info), item.quantity) : null;
  const nextTierText = hint ? wholesaleCartText(hint, formatCents) : null;

  function remove() {
    if (dispatchCart({ type: "remove", productId: item.productId })) {
      announceCart(`${label} eliminado del carrito.`);
    }
  }

  return (
    <li className="flex gap-3 py-4 sm:gap-4">
      <div className="w-20 shrink-0 self-start overflow-hidden rounded-lg border sm:w-24">
        <ProductImage
          imagePath={info?.imagePath ?? null}
          alt={label}
          className={inactive ? "opacity-60" : undefined}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {info?.brandName && <p className="truncate text-xs text-subtle-foreground">{info.brandName}</p>}
            <h3 className="line-clamp-2 text-sm leading-5 font-medium">
              {info ? info.name : "Producto no disponible"}
            </h3>
            {info?.presentation && (
              <p className="text-sm text-muted-foreground">
                {info.priceUnit ? `Venta por ${info.priceUnit}` : info.presentation}
              </p>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              {status === "ok" && info && (
                <p className="text-sm text-muted-foreground tabular-nums">
                  <span className="sr-only">{pricingType === "wholesale" ? "Precio mayoreo: " : "Precio unitario: "}</span>
                  {formatCents(unitCents)}
                  {info.priceUnit ? `/${info.priceUnit}` : " c/u"}
                  {discounted && (
                    <s className="ml-1.5 text-subtle-foreground">
                      <span className="sr-only">Precio normal: </span>
                      {formatCents(info.priceCents)}
                    </s>
                  )}
                </p>
              )}
              {status === "ok" && pricingType === "promotion" && <Badge variant="offer">Oferta</Badge>}
              {status === "ok" && pricingType === "wholesale" && (
                <Badge variant="brand">
                  <Tag aria-hidden="true" />
                  Mayoreo
                </Badge>
              )}
              {status === "soldOut" && <Badge variant="soldOut">Agotado</Badge>}
              {status === "unavailable" && <Badge variant="soldOut">Ya no disponible</Badge>}
            </div>
          </div>
          {status === "ok" && (
            <p className="shrink-0 text-right text-base font-semibold tabular-nums">
              <span className="sr-only">Subtotal: </span>
              {formatCents(unitCents * item.quantity)}
            </p>
          )}
        </div>

        {nextTierText && (
          <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-4 text-primary-dark">
            <Tag className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
            {nextTierText}
          </p>
        )}

        {inactive && (
          <p className="mt-2 text-sm text-destructive-strong">
            {status === "soldOut"
              ? "Este producto está agotado. Quítalo para continuar con tu pedido."
              : "Este producto ya no está disponible en la tienda. Quítalo para continuar."}
          </p>
        )}

        <div className="mt-3 flex items-center justify-between gap-2">
          {status === "ok" ? (
            <QuantityStepper
              className="w-32"
              quantity={item.quantity}
              label={label}
              onIncrement={() => {
                if (dispatchCart({ type: "increment", productId: item.productId, available: true })) {
                  announceCart(`${label}: ${item.quantity + 1} en el carrito.`);
                }
              }}
              onDecrement={() => {
                if (dispatchCart({ type: "decrement", productId: item.productId })) {
                  announceCart(`${label}: ${item.quantity - 1} en el carrito.`);
                }
              }}
              onSetQuantity={(quantity) => {
                if (dispatchCart({ type: "setQuantity", productId: item.productId, quantity })) {
                  announceCart(`${label}: ${quantity} en el carrito.`);
                }
              }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Cantidad: <span className="tabular-nums">{item.quantity}</span>
            </p>
          )}
          <Button variant="ghost" className="px-3 text-muted-foreground" onClick={remove} aria-label={`Eliminar ${label}`}>
            <Trash2 aria-hidden="true" />
            Eliminar
          </Button>
        </div>
      </div>
    </li>
  );
}

function CartSummary({
  subtotalCents,
  payableCount,
  blocked,
}: {
  subtotalCents: number;
  payableCount: number;
  blocked: boolean;
}) {
  return (
    <section
      aria-labelledby="carrito-resumen"
      className="rounded-xl border bg-card p-4 md:p-5 lg:sticky lg:top-24"
    >
      <h2 id="carrito-resumen" className="text-lg font-semibold">
        Resumen
      </h2>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-foreground">Subtotal ({countLabel(payableCount)})</dt>
          <dd className="text-xl font-semibold text-foreground tabular-nums">{formatCents(subtotalCents)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-foreground">Envío</dt>
          <dd>Por confirmar</dd>
        </div>
      </dl>
      <p className="mt-2 text-sm text-muted-foreground">
        Si eliges entrega a domicilio, la tienda te confirma el costo de envío. Recoger en sucursal no tiene costo.
        {blocked && " El subtotal no incluye productos agotados o no disponibles."}
      </p>

      {blocked && (
        <p className="mt-3 text-sm text-destructive-strong">
          Quita los productos agotados o no disponibles para continuar.
        </p>
      )}
      {blocked ? (
        <Button size="lg" className="mt-4 w-full" disabled>
          Continuar pedido
        </Button>
      ) : (
        <Link href="/checkout" className={buttonVariants({ size: "lg", className: "mt-4 w-full" })}>
          Continuar pedido
          <ArrowRight aria-hidden="true" />
        </Link>
      )}
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Después eliges cómo recibirlo y confirmas tu pedido.
      </p>
    </section>
  );
}

// Vaciar pide una confirmación en línea (sin modal ni window.confirm).
function ClearCart() {
  const [confirming, setConfirming] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  if (!confirming) {
    return (
      <Button variant="ghost" className="px-3 text-muted-foreground" onClick={() => setConfirming(true)}>
        Vaciar carrito
      </Button>
    );
  }

  return (
    <div role="group" aria-label="Confirmar vaciar carrito" className="flex flex-wrap items-center justify-end gap-2">
      <span className="text-sm text-foreground">¿Vaciar el carrito?</span>
      <Button ref={cancelRef} variant="secondary" onClick={() => setConfirming(false)}>
        Cancelar
      </Button>
      <Button
        variant="destructive"
        onClick={() => {
          if (dispatchCart({ type: "clear" })) announceCart("Carrito vaciado.");
          setConfirming(false);
        }}
      >
        Sí, vaciar
      </Button>
    </div>
  );
}

function CartError({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      icon={AlertCircle}
      title="No pudimos cargar tu carrito"
      description="Tus productos siguen guardados en este dispositivo. Revisa tu conexión e inténtalo de nuevo."
      action={
        <Button onClick={onRetry}>
          <RefreshCw aria-hidden="true" />
          Reintentar
        </Button>
      }
    />
  );
}

function LineSkeleton() {
  return (
    <li className="flex gap-3 py-4 sm:gap-4" aria-hidden="true">
      <div className="size-20 shrink-0 animate-pulse rounded-lg bg-muted sm:size-24" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-3/5 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-1/3 animate-pulse rounded-md bg-muted" />
        <div className="mt-3 h-10 w-32 animate-pulse rounded-lg bg-muted" />
      </div>
    </li>
  );
}

function CartSkeleton({ lines }: { lines: number }) {
  return (
    <div
      role="status"
      aria-label="Cargando carrito"
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8"
    >
      <ul className="divide-y border-t">
        {Array.from({ length: lines }, (_, index) => (
          <LineSkeleton key={index} />
        ))}
      </ul>
      <div className="h-56 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
