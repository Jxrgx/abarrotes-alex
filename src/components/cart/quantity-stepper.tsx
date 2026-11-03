"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { type KeyboardEvent, useState } from "react";

import { MAX_QUANTITY, normalizeQuantity } from "@/lib/cart/schema";
import { cn } from "@/lib/utils";

type QuantityStepperProps = {
  quantity: number;
  /** Nombre del producto para las etiquetas accesibles ("Refresco de cola 600 ml"). */
  label: string;
  onIncrement: () => void;
  onDecrement: () => void;
  /** Si se pasa, en cantidad 1 el botón "−" se convierte en "Quitar" (icono de basura). */
  onRemove?: () => void;
  /** Si se pasa, la cantidad es un campo editable (Enter o al salir aplica). */
  onSetQuantity?: (quantity: number) => void;
  canIncrement?: boolean;
  tone?: "neutral" | "brand";
  className?: string;
};

// [−] cantidad [+] con objetivos de 40px. Nunca baja de 1 por sí solo: quitar
// un producto siempre es un botón con su propia etiqueta.
export function QuantityStepper({
  quantity,
  label,
  onIncrement,
  onDecrement,
  onRemove,
  onSetQuantity,
  canIncrement = true,
  tone = "neutral",
  className,
}: QuantityStepperProps) {
  const atMin = quantity <= 1;
  const removeMode = atMin && Boolean(onRemove);
  const atMax = quantity >= MAX_QUANTITY;

  const buttonClass = cn(
    "flex size-10 shrink-0 items-center justify-center rounded-[calc(var(--radius)-1px)] transition-colors duration-150",
    "disabled:cursor-not-allowed disabled:text-subtle-foreground/60",
    tone === "brand"
      ? "text-primary-dark hover:bg-primary/10 active:bg-primary/15 disabled:hover:bg-transparent"
      : "text-foreground hover:bg-accent active:bg-secondary disabled:hover:bg-transparent",
  );

  return (
    <div
      role="group"
      aria-label={`Cantidad de ${label}`}
      className={cn(
        "flex h-10 items-center justify-between rounded-lg border",
        tone === "brand" ? "border-primary/40 bg-primary-soft" : "border-input bg-background",
        className,
      )}
    >
      <button
        type="button"
        className={buttonClass}
        onClick={removeMode ? onRemove : onDecrement}
        disabled={atMin && !removeMode}
        aria-label={removeMode ? `Quitar ${label} del carrito` : `Disminuir cantidad de ${label}`}
      >
        {removeMode ? (
          <Trash2 className="size-4" aria-hidden="true" />
        ) : (
          <Minus className="size-4" aria-hidden="true" />
        )}
      </button>

      {onSetQuantity ? (
        <QuantityInput quantity={quantity} label={label} onSetQuantity={onSetQuantity} />
      ) : (
        <span
          className={cn(
            "min-w-6 text-center text-sm font-semibold tabular-nums",
            tone === "brand" ? "text-primary-dark" : "text-foreground",
          )}
        >
          <span className="sr-only">Cantidad: </span>
          {quantity}
        </span>
      )}

      <button
        type="button"
        className={buttonClass}
        onClick={onIncrement}
        disabled={atMax || !canIncrement}
        aria-label={`Aumentar cantidad de ${label}`}
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function QuantityInput({
  quantity,
  label,
  onSetQuantity,
}: {
  quantity: number;
  label: string;
  onSetQuantity: (quantity: number) => void;
}) {
  // Borrador mientras se escribe; se sincroniza cuando la cantidad cambia desde fuera.
  const [draft, setDraft] = useState(String(quantity));
  const [synced, setSynced] = useState(quantity);
  if (synced !== quantity) {
    setSynced(quantity);
    setDraft(String(quantity));
  }

  function commit() {
    const value = normalizeQuantity(Number(draft));
    if (value === null || value === quantity) {
      setDraft(String(quantity));
      return;
    }
    setDraft(String(value));
    onSetQuantity(value);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
      // El número queda seleccionado: escribir de nuevo lo reemplaza.
      const input = event.currentTarget;
      requestAnimationFrame(() => input.select());
    }
    if (event.key === "Escape") setDraft(String(quantity));
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={2}
      value={draft}
      onChange={(event) => setDraft(event.target.value.replace(/\D/g, ""))}
      // Al enfocar se selecciona el número: escribir lo reemplaza.
      onFocus={(event) => event.currentTarget.select()}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      aria-label={`Cantidad de ${label} (1 a ${MAX_QUANTITY})`}
      className="h-8 w-10 rounded-md bg-transparent text-center text-base font-semibold tabular-nums text-foreground md:text-sm"
    />
  );
}
