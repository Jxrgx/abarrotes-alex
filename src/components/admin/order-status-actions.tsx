"use client";

import { LoaderCircle, XCircle } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { changeOrderStatus } from "@/lib/admin/order-actions";
import { type DeliveryType, isFinalStatus, nextOrderStatus, ORDER_ACTION_LABELS, type OrderStatus } from "@/lib/orders/status";
import { cn } from "@/lib/utils";

import { AdminDialog, DialogBody, DialogFooter } from "./admin-dialog";
import { WarningNote } from "./catalog-form";
import { useToast } from "./toast";

// Acciones de estado del detalle. Solo ofrece la transición siguiente válida (espejo de
// la máquina de estados) y "Cancelar pedido"; la base vuelve a validarlo todo y además
// rechaza si el estado cambió mientras se revisaba (se envía el estado esperado).
//   - variant "panel": tarjeta en la parte superior (desktop).
//   - variant "bar": barra fija inferior en móvil (respeta safe-area).
export function OrderStatusActions({ orderId, folio, status, deliveryType, variant }: {
  orderId: string;
  folio: string;
  status: OrderStatus;
  deliveryType: DeliveryType;
  variant: "panel" | "bar";
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<OrderStatus | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = nextOrderStatus(deliveryType, status);

  function run(to: OrderStatus) {
    setTarget(to);
    setError(null);
    startTransition(async () => {
      try {
        const result = await changeOrderStatus(orderId, status, to);
        // Junto con los datos revalidados (ver CatalogFormDialog).
        startTransition(() => {
          setConfirmCancel(false);
          if (result.ok) toast(result.message);
          else if (to === "cancelled" && !result.stale) setError(result.message);
          else toast(result.message, "error");
        });
      } catch {
        setError("No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.");
      }
    });
  }

  if (isFinalStatus(status)) {
    return variant === "panel" ? (
      <p className="rounded-lg bg-background-secondary px-3 py-2 text-sm text-muted-foreground">Estado final: ya no se puede cambiar.</p>
    ) : null;
  }

  const buttons = (
    <>
      {next && (
        <Button onClick={() => run(next)} disabled={pending} aria-busy={pending && target === next} size={variant === "bar" ? "lg" : "default"} className="flex-1 sm:flex-none">
          {pending && target === next ? (
            <>
              <LoaderCircle className="animate-spin" aria-hidden="true" />
              Guardando…
            </>
          ) : (
            ORDER_ACTION_LABELS[next]
          )}
        </Button>
      )}
      <Button
        variant="secondary"
        onClick={() => {
          setError(null);
          setConfirmCancel(true);
        }}
        disabled={pending}
        size={variant === "bar" ? "lg" : "default"}
        aria-label={`Cancelar el pedido ${folio}`}
        className={cn(variant === "bar" && "px-4")}
      >
        <XCircle aria-hidden="true" />
        {variant === "bar" ? "Cancelar" : "Cancelar pedido"}
      </Button>
    </>
  );

  return (
    <>
      {variant === "panel" ? (
        <div className="flex flex-wrap gap-2">{buttons}</div>
      ) : (
        <div className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-overlay lg:hidden">
          {buttons}
        </div>
      )}

      <AdminDialog open={confirmCancel} onClose={() => !pending && setConfirmCancel(false)} title={`¿Cancelar el pedido ${folio}?`} busy={pending}>
        <DialogBody>
          <WarningNote>
            <p>El pedido quedará como cancelado y no podrá reactivarse.</p>
          </WarningNote>
          {error && (
            <p role="alert" className="rounded-lg bg-destructive-soft p-3 text-sm text-destructive-strong">
              {error}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setConfirmCancel(false)} disabled={pending} data-autofocus>
            No, volver
          </Button>
          <Button variant="destructive" onClick={() => run("cancelled")} disabled={pending} aria-busy={pending}>
            {pending ? (
              <>
                <LoaderCircle className="animate-spin" aria-hidden="true" />
                Cancelando…
              </>
            ) : (
              "Sí, cancelar pedido"
            )}
          </Button>
        </DialogFooter>
      </AdminDialog>
    </>
  );
}
