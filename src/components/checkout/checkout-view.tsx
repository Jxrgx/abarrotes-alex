"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Banknote, Clock, LoaderCircle, MapPin, RefreshCw, Send, ShoppingCart, Store, Truck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useId, useMemo, useRef, useState } from "react";
import { type Resolver, useForm, useWatch } from "react-hook-form";

import { useCartResolution } from "@/components/cart/use-cart-resolution";
import { EmptyState } from "@/components/store/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { controlClassName, Field, fieldDescribedBy } from "@/components/ui/field";
import type { HoursGroup } from "@/lib/catalog/hours";
import { type CartResolution, resolveCartLines } from "@/lib/cart/lines";
import type { CartState } from "@/lib/cart/schema";
import { countLabel, dispatchCart, useCart } from "@/lib/cart/store";
import { formatCents } from "@/lib/format";
import {
  buildCheckoutRequest,
  cartFingerprint,
  type CheckoutFormValues,
  DELIVERY_ONLY_FIELDS,
  EMPTY_CHECKOUT_FORM,
  makeCheckoutFormSchema,
  NOTES_MAX_LENGTH,
  parseMoneyToCents,
  SERVER_FIELD_TO_FORM,
} from "@/lib/orders/checkout-form";
import type { OrderError, OrderReceipt } from "@/lib/orders/schema";
import { getCheckoutAttemptId, resetCheckoutAttempt, saveOrderConfirmation } from "@/lib/orders/session";
import type { OrderContact } from "@/lib/orders/whatsapp";
import { cn } from "@/lib/utils";

export type PickupBranch = {
  name: string;
  address: string | null;
  phone: string | null;
  hours: HoursGroup[];
};

export function CheckoutView({ pickupBranch }: { pickupBranch: PickupBranch | null }) {
  const cart = useCart();
  const { resolution, failed, retry, refresh, loading } = useCartResolution(cart);
  // Folio recién creado: evita mostrar "carrito vacío" mientras se navega a la confirmación.
  const [completedFolio, setCompletedFolio] = useState<string | null>(null);

  if (completedFolio) {
    return (
      <p role="status" className="flex items-center gap-2 py-12 text-muted-foreground">
        <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
        Pedido {completedFolio} registrado. Abriendo tu confirmación…
      </p>
    );
  }
  if (cart === null) return <CheckoutSkeleton />;
  if (cart.items.length === 0) {
    return (
      <EmptyState
        icon={ShoppingCart}
        title="Tu carrito está vacío"
        description="Agrega productos para hacer tu pedido."
        action={
          <Link href="/productos" className={buttonVariants()}>
            Ver productos
          </Link>
        }
      />
    );
  }
  if (!resolution && failed) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="No pudimos cargar tu pedido"
        description="Tus productos siguen guardados. Revisa tu conexión e inténtalo de nuevo."
        action={
          <Button onClick={retry}>
            <RefreshCw aria-hidden="true" />
            Reintentar
          </Button>
        }
      />
    );
  }
  if (!resolution) return <CheckoutSkeleton />;

  return (
    <CheckoutForm
      cart={cart}
      resolution={resolution}
      refreshing={loading}
      refresh={refresh}
      pickupBranch={pickupBranch}
      onCompleted={setCompletedFolio}
    />
  );
}

// ---------------------------------------------------------------------------

type SubmitStatus =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "network" }
  | { kind: "server" }
  | { kind: "priceChanged"; subtotalCents?: number }
  | { kind: "products"; code: "PRODUCT_UNAVAILABLE" | "PRODUCT_OUT_OF_STOCK"; names: string[] }
  | { kind: "branch" }
  | { kind: "cart"; message: string }
  | { kind: "data" };

const FIELD_MESSAGES: Partial<Record<keyof CheckoutFormValues, string>> = {
  name: "Revisa tu nombre (de 2 a 120 caracteres).",
  phone: "Revisa tu teléfono (10 dígitos).",
  address: "Revisa tu dirección.",
  neighborhood: "Revisa tu colonia.",
  references: "Revisa las referencias (máximo 300 caracteres).",
  cashAmount: "Debe ser al menos el total parcial.",
  notes: `Usa máximo ${NOTES_MAX_LENGTH} caracteres.`,
};

function CheckoutForm({
  cart,
  resolution,
  refreshing,
  refresh,
  pickupBranch,
  onCompleted,
}: {
  cart: CartState;
  resolution: CartResolution;
  refreshing: boolean;
  refresh: () => void;
  pickupBranch: PickupBranch | null;
  onCompleted: (folio: string) => void;
}) {
  const router = useRouter();
  const summary = resolveCartLines(cart, resolution);
  const [status, setStatus] = useState<SubmitStatus>({ kind: "idle" });
  const inFlight = useRef(false);

  // El efectivo se valida contra el subtotal ACTUAL (puede cambiar tras revalidar);
  // React Hook Form toma el resolver vigente en cada render.
  const resolver = useMemo<Resolver<CheckoutFormValues>>(
    () => zodResolver(makeCheckoutFormSchema(summary.subtotalCents)),
    [summary.subtotalCents],
  );

  const form = useForm<CheckoutFormValues>({
    resolver,
    defaultValues: EMPTY_CHECKOUT_FORM,
    mode: "onTouched",
  });
  const { register, formState, setError, clearErrors, control } = form;
  const errors = formState.errors;
  const [deliveryType, cashAmount, notes] = useWatch({ control, name: ["deliveryType", "cashAmount", "notes"] });

  const submitting = status.kind === "submitting";
  const cannotSubmit =
    summary.blocked || summary.pending || summary.branchUnavailable || status.kind === "branch" || refreshing;

  const cashCents = cashAmount.trim() ? parseMoneyToCents(cashAmount) : null;
  const changeCents = cashCents !== null && cashCents >= summary.subtotalCents ? cashCents - summary.subtotalCents : null;

  async function submit(values: CheckoutFormValues) {
    // Doble clic: un solo envío a la vez. La idempotencia del servidor es la garantía final.
    if (inFlight.current || cannotSubmit || !cart.branchId) return;
    inFlight.current = true;
    setStatus({ kind: "submitting" });

    const items = cart.items.map(({ productId, quantity }) => ({ productId, quantity }));
    const clientRequestId = getCheckoutAttemptId(cartFingerprint(cart.branchId, items));
    const body = buildCheckoutRequest(values, {
      clientRequestId,
      branchId: cart.branchId,
      items,
      expectedSubtotalCents: summary.subtotalCents,
    });

    let response: Response;
    let json: { order?: OrderReceipt; error?: OrderError } | null = null;
    try {
      response = await fetch("/api/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      json = await response.json().catch(() => null);
    } catch {
      // No sabemos si el servidor lo recibió: se conserva el mismo clientRequestId.
      inFlight.current = false;
      setStatus({ kind: "network" });
      return;
    }

    if (response.ok && json?.order) {
      const order = json.order;
      const contact: OrderContact = {
        name: body.customer.name,
        ...(body.delivery.type === "delivery" && {
          address: body.delivery.address,
          neighborhood: body.delivery.neighborhood,
          references: body.delivery.references,
        }),
        cashAmountCents: body.payment.cashAmountCents,
        notes: body.notes,
      };
      // Orden importante: guardar comprobante -> vaciar carrito -> navegar.
      saveOrderConfirmation({ receipt: order, contact });
      resetCheckoutAttempt();
      onCompleted(order.folio);
      dispatchCart({ type: "clear" });
      router.replace(`/pedido/${encodeURIComponent(order.folio)}`);
      return;
    }

    inFlight.current = false;
    const error = json?.error;
    if (!error) {
      setStatus({ kind: "network" });
      return;
    }

    switch (error.code) {
      case "PRICE_CHANGED":
        // Nuevo intento: el usuario debe volver a confirmar con los precios actuales.
        resetCheckoutAttempt();
        refresh();
        setStatus({ kind: "priceChanged", subtotalCents: error.subtotalCents });
        break;
      case "PRODUCT_UNAVAILABLE":
      case "PRODUCT_OUT_OF_STOCK": {
        refresh();
        const names = (error.productIds ?? []).map((id) => {
          const info = summary.lines.find((line) => line.item.productId === id)?.info;
          return info ? [info.name, info.presentation].filter(Boolean).join(" ") : "Un producto de tu carrito";
        });
        setStatus({ kind: "products", code: error.code, names });
        break;
      }
      case "BRANCH_UNAVAILABLE":
        setStatus({ kind: "branch" });
        break;
      case "INVALID_CHECKOUT_DATA": {
        const fields = (error.fields ?? [])
          .map((path) => SERVER_FIELD_TO_FORM[path])
          .filter((field): field is keyof CheckoutFormValues => Boolean(field));
        fields.forEach((field, index) =>
          setError(field, { type: "server", message: FIELD_MESSAGES[field] ?? "Revisa este dato." }, { shouldFocus: index === 0 }),
        );
        setStatus(fields.length ? { kind: "idle" } : { kind: "data" });
        break;
      }
      case "CART_EMPTY":
      case "INVALID_CART":
      case "INVALID_QUANTITY":
        refresh();
        setStatus({ kind: "cart", message: error.message });
        break;
      default:
        setStatus({ kind: "server" });
    }
  }

  // handleSubmit se invoca al enviar (no durante el render): valida y luego llama a submit.
  function onSubmit(event?: FormEvent<HTMLFormElement>) {
    void form.handleSubmit(submit)(event);
  }

  const delivering = deliveryType === "delivery";
  // Orientación, no navegación: los pasos se numeran según la entrega elegida.
  // Recoger es el flujo más corto: solo Entrega y Tus datos (nombre y teléfono).
  const steps = delivering ? ["delivery", "contact", "address", "payment", "comments"] : ["delivery", "contact"];
  const stepOf = (key: string) => steps.indexOf(key) + 1;
  // Al cambiar a recoger se quitan los errores de los campos que dejan de existir. Lo
  // escrito se conserva en el formulario por si vuelve a domicilio, pero nunca se envía
  // en un pedido para recoger (buildCheckoutRequest).
  const deliveryTypeField = register("deliveryType", {
    onChange: (event: { target: { value: string } }) => {
      if (event.target.value === "pickup") clearErrors([...DELIVERY_ONLY_FIELDS]);
    },
  });

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      // scroll-mt: al enfocar un campo con error, no queda bajo el header fijo.
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-8 [&_:is(input,textarea)]:scroll-mt-36 md:[&_:is(input,textarea)]:scroll-mt-24"
    >
      <div className="space-y-6">
        <OrderGlance summary={summary} />
        <p className="text-sm text-muted-foreground">
          Los campos con <span className="text-destructive-strong">*</span> son obligatorios.
        </p>

        <Section step={stepOf("delivery")} title="Entrega">
          <fieldset>
            <legend className="mb-3 text-sm text-muted-foreground">¿Cómo quieres recibir tu pedido?</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <ChoiceCard
                icon={Truck}
                title="Entrega a domicilio"
                description="Te lo llevamos. La tienda te confirma el costo de envío."
                checked={deliveryType === "delivery"}
                input={<input type="radio" value="delivery" className="size-4 accent-primary" {...deliveryTypeField} />}
              />
              <ChoiceCard
                icon={Store}
                title="Recoger en sucursal"
                description="Pasa por tu pedido sin costo de envío."
                checked={deliveryType === "pickup"}
                input={<input type="radio" value="pickup" className="size-4 accent-primary" {...deliveryTypeField} />}
              />
            </div>
          </fieldset>
          {deliveryType === "pickup" && <PickupInfo branch={pickupBranch} />}
        </Section>

        <Section step={stepOf("contact")} title="Tus datos">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="checkout-nombre" label="Nombre" required error={errors.name?.message}>
              <input
                id="checkout-nombre"
                type="text"
                autoComplete="name"
                autoCapitalize="words"
                maxLength={120}
                aria-required="true"
                aria-invalid={Boolean(errors.name)}
                aria-describedby={fieldDescribedBy("checkout-nombre", { error: errors.name?.message })}
                className={cn(controlClassName, "h-11")}
                {...register("name")}
              />
            </Field>
            <Field
              id="checkout-telefono"
              label="Teléfono"
              required
              hint="10 dígitos. Te contactaremos si hay dudas con tu pedido."
              error={errors.phone?.message}
            >
              <input
                id="checkout-telefono"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="55 1234 5678"
                maxLength={20}
                aria-required="true"
                aria-invalid={Boolean(errors.phone)}
                aria-describedby={fieldDescribedBy("checkout-telefono", { hint: true, error: errors.phone?.message })}
                className={cn(controlClassName, "h-11")}
                {...register("phone")}
              />
            </Field>
          </div>
        </Section>

        {delivering && (
          <Section step={stepOf("address")} title="Dirección de entrega">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="checkout-direccion" label="Dirección" required className="sm:col-span-2" hint="Calle, número exterior e interior." error={errors.address?.message}>
                <input
                  id="checkout-direccion"
                  type="text"
                  autoComplete="address-line1"
                  maxLength={300}
                  aria-required="true"
                  aria-invalid={Boolean(errors.address)}
                  aria-describedby={fieldDescribedBy("checkout-direccion", { hint: true, error: errors.address?.message })}
                  className={cn(controlClassName, "h-11")}
                  {...register("address")}
                />
              </Field>
              <Field id="checkout-colonia" label="Colonia" required error={errors.neighborhood?.message}>
                <input
                  id="checkout-colonia"
                  type="text"
                  autoComplete="address-level3"
                  maxLength={120}
                  aria-required="true"
                  aria-invalid={Boolean(errors.neighborhood)}
                  aria-describedby={fieldDescribedBy("checkout-colonia", { error: errors.neighborhood?.message })}
                  className={cn(controlClassName, "h-11")}
                  {...register("neighborhood")}
                />
              </Field>
              <Field id="checkout-referencias" label="Referencias" hint="Ej. portón café, entre calles…" error={errors.references?.message}>
                <input
                  id="checkout-referencias"
                  type="text"
                  autoComplete="off"
                  maxLength={300}
                  aria-invalid={Boolean(errors.references)}
                  aria-describedby={fieldDescribedBy("checkout-referencias", { hint: true, error: errors.references?.message })}
                  className={cn(controlClassName, "h-11")}
                  {...register("references")}
                />
              </Field>
            </div>
          </Section>
        )}

        {/* Recoger: sin pago ni comentarios (paga en efectivo al recoger). */}
        {delivering && (
        <>
        <Section step={stepOf("payment")} title="Pago">
          <p className="flex items-start gap-2 text-sm">
            <Banknote className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <span>
              <span className="font-medium">Efectivo.</span>{" "}
              <span className="text-muted-foreground">
                Pagas al recibir tu pedido.
              </span>
            </span>
          </p>
          <Field
            id="checkout-efectivo"
            label="¿Con cuánto pagarás?"
            className="mt-4 sm:max-w-xs"
            hint={changeCents !== null ? `Cambio aproximado: ${formatCents(changeCents)}` : "Ej. $500, así preparamos tu cambio."}
            error={errors.cashAmount?.message}
          >
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-base text-muted-foreground md:text-sm" aria-hidden="true">
                $
              </span>
              <input
                id="checkout-efectivo"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="500"
                maxLength={12}
                aria-invalid={Boolean(errors.cashAmount)}
                aria-describedby={fieldDescribedBy("checkout-efectivo", { hint: true, error: errors.cashAmount?.message })}
                className={cn(controlClassName, "h-11 pl-7 tabular-nums")}
                {...register("cashAmount")}
              />
            </div>
          </Field>
        </Section>

        <Section step={stepOf("comments")} title="Comentarios">
          <Field
            id="checkout-notas"
            label="Indicaciones para la tienda"
            hint={`${notes.length}/${NOTES_MAX_LENGTH} caracteres`}
            error={errors.notes?.message}
          >
            <textarea
              id="checkout-notas"
              rows={2}
              maxLength={NOTES_MAX_LENGTH + 50}
              placeholder="Ej. Si no hay Coca-Cola normal, puede ser sin azúcar."
              aria-invalid={Boolean(errors.notes)}
              aria-describedby={fieldDescribedBy("checkout-notas", { hint: true, error: errors.notes?.message })}
              className={cn(controlClassName, "min-h-20 resize-y py-2.5")}
              {...register("notes")}
            />
          </Field>
        </Section>
        </>
        )}
      </div>

      <CheckoutSummary summary={summary} refreshing={refreshing} pickupBranch={delivering ? null : pickupBranch}>
        <StatusMessage status={status} summary={summary} onRetry={() => onSubmit()} />
        <Button
          type="submit"
          size="lg"
          className="mt-4 w-full"
          disabled={submitting || cannotSubmit}
          aria-busy={submitting}
          aria-describedby="checkout-siguiente-paso"
        >
          {submitting ? (
            <>
              <LoaderCircle className="animate-spin" aria-hidden="true" />
              Confirmando pedido…
            </>
          ) : (
            "Confirmar pedido"
          )}
        </Button>
        <p id="checkout-siguiente-paso" className="mt-3 text-center text-sm text-muted-foreground">
          <Send className="mr-1 inline size-4 align-[-3px]" aria-hidden="true" />
          Tu pedido se envía directamente a Abarrotes Alex.
        </p>
      </CheckoutSummary>
    </form>
  );
}

// ---------------------------------------------------------------------------

function StatusMessage({
  status,
  summary,
  onRetry,
}: {
  status: SubmitStatus;
  summary: ReturnType<typeof resolveCartLines>;
  onRetry: () => void;
}) {
  let content: ReactNode = null;
  let action: ReactNode = null;
  const reviewCart = (
    <Link href="/carrito" className={buttonVariants({ variant: "secondary", className: "w-full" })}>
      Revisar carrito
    </Link>
  );

  if (status.kind === "network") {
    content = "No pudimos confirmar si tu pedido se registró. Revisa tu conexión e inténtalo de nuevo; no se duplicará.";
    action = (
      <Button type="button" variant="secondary" className="w-full" onClick={onRetry}>
        <RefreshCw aria-hidden="true" />
        Intentar de nuevo
      </Button>
    );
  } else if (status.kind === "server") {
    content = "No pudimos registrar tu pedido. Inténtalo de nuevo en unos momentos.";
  } else if (status.kind === "priceChanged") {
    content = (
      <>
        Los precios de tu carrito cambiaron.
        {status.subtotalCents !== undefined && ` El nuevo total parcial es ${formatCents(status.subtotalCents)}.`} Revisa
        el resumen y confirma de nuevo.
      </>
    );
  } else if (status.kind === "products") {
    content = (
      <>
        {status.code === "PRODUCT_OUT_OF_STOCK"
          ? "Algunos productos se agotaron:"
          : "Algunos productos ya no están disponibles:"}
        <ul className="mt-1 list-disc pl-5">
          {status.names.map((name, index) => (
            <li key={`${name}-${index}`}>{name}</li>
          ))}
        </ul>
        Quítalos de tu carrito para continuar.
      </>
    );
    action = reviewCart;
  } else if (status.kind === "branch") {
    content = "La sucursal seleccionada no está disponible en este momento.";
  } else if (status.kind === "cart") {
    content = status.message;
    action = reviewCart;
  } else if (status.kind === "data") {
    content = "Revisa los datos del formulario e inténtalo de nuevo.";
  } else if (summary.blocked) {
    content = "Hay productos agotados o no disponibles en tu carrito. Quítalos para continuar.";
    action = reviewCart;
  } else if (summary.branchUnavailable) {
    content = "La sucursal seleccionada no está disponible en este momento.";
  }

  if (!content) return null;
  return (
    <div role="alert" className="mt-4 space-y-3 rounded-lg bg-warning-soft p-3 text-sm text-warning-strong">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div>{content}</div>
      </div>
      {action}
    </div>
  );
}

function CheckoutSummary({
  summary,
  refreshing,
  pickupBranch,
  children,
}: {
  summary: ReturnType<typeof resolveCartLines>;
  refreshing: boolean;
  /** Solo con "Recoger en sucursal": dónde y cuándo recoger. */
  pickupBranch: PickupBranch | null;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby="checkout-resumen" className="rounded-xl border bg-card p-4 md:p-5 lg:sticky lg:top-24">
      <div className="flex items-center justify-between gap-2">
        <h2 id="checkout-resumen" className="text-lg font-semibold">
          Tu pedido
        </h2>
        <Link href="/carrito" className="inline-flex h-10 items-center text-sm font-medium text-primary hover:text-primary-hover">
          Editar
        </Link>
      </div>

      <ul className="mt-2 divide-y divide-border-subtle text-sm" aria-busy={refreshing}>
        {summary.lines.map((line) => {
          const name = line.info
            ? [line.info.name, line.info.presentation].filter(Boolean).join(" ")
            : "Producto no disponible";
          return (
            <li key={line.item.productId} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className={cn(line.status !== "ok" && "text-muted-foreground")}>
                  <span className="tabular-nums">{line.item.quantity} ×</span> {name}
                </p>
                {line.status === "soldOut" && <Badge variant="soldOut" className="mt-1">Agotado</Badge>}
                {line.status === "unavailable" && <Badge variant="soldOut" className="mt-1">Ya no disponible</Badge>}
                {/* Misma regla que el carrito y create_order: la etiqueta es la que fija el precio. */}
                {line.status === "ok" && line.pricingType === "promotion" && (
                  <Badge variant="offer" className="mt-1">Oferta</Badge>
                )}
                {line.status === "ok" && line.pricingType === "wholesale" && (
                  <Badge variant="brand" className="mt-1">
                    Mayoreo · {formatCents(line.unitCents)} c/u
                  </Badge>
                )}
              </div>
              {line.status === "ok" && (
                <span className="shrink-0 tabular-nums">{formatCents(line.unitCents * line.item.quantity)}</span>
              )}
            </li>
          );
        })}
      </ul>

      <dl className="mt-2 space-y-2 border-t pt-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="tabular-nums">{formatCents(summary.subtotalCents)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Envío</dt>
          <dd>Por confirmar</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 border-t pt-2">
          <dt className="font-medium">Total parcial</dt>
          <dd className="text-xl font-semibold tabular-nums">{formatCents(summary.subtotalCents)}</dd>
        </div>
      </dl>
      <p className="mt-1 text-xs text-subtle-foreground">El envío se suma cuando la sucursal lo confirme.</p>

      {pickupBranch && (
        <dl className="mt-3 space-y-1 border-t pt-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Recoger en</dt>
            <dd className="font-medium">{pickupBranch.name}</dd>
          </div>
          {pickupBranch.address && (
            <div>
              <dt className="text-muted-foreground">Dirección</dt>
              <dd>{pickupBranch.address}</dd>
            </div>
          )}
          {pickupBranch.hours.length > 0 && (
            <div>
              <dt className="text-muted-foreground">Horario</dt>
              <dd>
                {pickupBranch.hours.map((group) => (
                  <span key={group.days} className="block tabular-nums">
                    {group.days}: {group.hours}
                  </span>
                ))}
              </dd>
            </div>
          )}
        </dl>
      )}

      {children}
    </section>
  );
}

// Sección numerada del checkout. El número orienta (no bloquea ni navega); el
// encabezado h2 da la estructura semántica.
function Section({ step, title, children }: { step: number; title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="rounded-xl border bg-card p-4 md:p-5">
      <div className="mb-4 flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary tabular-nums"
        >
          {step}
        </span>
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

// Móvil: el resumen completo y el botón están al final; arriba se recuerda qué se pide.
function OrderGlance({ summary }: { summary: ReturnType<typeof resolveCartLines> }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-background-secondary px-3 py-1 text-sm lg:hidden">
      <p>
        {countLabel(summary.payableCount)} ·{" "}
        <span className="font-semibold tabular-nums">{formatCents(summary.subtotalCents)}</span>{" "}
        <span className="text-muted-foreground">+ envío</span>
      </p>
      <Link href="/carrito" className="inline-flex h-10 shrink-0 items-center font-medium text-primary hover:text-primary-hover">
        Editar
      </Link>
    </div>
  );
}

function ChoiceCard({
  icon: Icon,
  title,
  description,
  checked,
  input,
}: {
  icon: typeof Truck;
  title: string;
  description: string;
  checked: boolean;
  input: ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors duration-150",
        checked ? "border-primary bg-primary-subtle" : "hover:bg-background-secondary",
      )}
    >
      <span className="mt-0.5 flex shrink-0">{input}</span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Icon className={cn("size-4", checked ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
          {title}
        </span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

function PickupInfo({ branch }: { branch: PickupBranch | null }) {
  if (!branch) {
    return <p className="mt-4 text-sm text-muted-foreground">Información de la sucursal no disponible por ahora.</p>;
  }
  return (
    <div className="mt-4 rounded-lg border bg-background-secondary p-3 text-sm">
      <p className="text-muted-foreground">Recoges tu pedido en:</p>
      <p className="font-medium">{branch.name}</p>
      {branch.address && (
        <p className="mt-1 flex items-start gap-2 text-muted-foreground">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {branch.address}
        </p>
      )}
      {branch.hours.length > 0 && (
        <div className="mt-2 flex items-start gap-2 text-muted-foreground">
          <Clock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <dl className="space-y-0.5">
            {branch.hours.map((group) => (
              <div key={group.days} className="flex flex-wrap gap-x-2">
                <dt>{group.days}:</dt>
                <dd className="tabular-nums">{group.hours}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

export function CheckoutSkeleton() {
  return (
    <div role="status" aria-label="Cargando" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-8">
      <div className="space-y-6">
        {[0, 1, 2].map((index) => (
          <div key={index} className="h-40 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
