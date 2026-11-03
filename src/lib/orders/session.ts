"use client";

import type { OrderReceipt } from "./schema";
import type { OrderContact } from "./whatsapp";

// Estado temporal del checkout en sessionStorage (solo esta pestaña, se borra al
// cerrarla). No se usa localStorage para no conservar datos personales.

const ATTEMPT_KEY = "abarrotes-alex:checkout-attempt";
const CONFIRMATIONS_KEY = "abarrotes-alex:order-confirmations";
const MAX_CONFIRMATIONS = 5;

function read<T>(key: string): T | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sin sessionStorage: el flujo sigue funcionando sin persistencia temporal.
  }
}

// ---------------------------------------------------------------------------
// Intento de pedido (clientRequestId)
// ---------------------------------------------------------------------------

// Mismo carrito -> mismo id: cubre doble clic, reintentos tras error de red y
// recargas de la página. Si cambia el carrito (huella distinta) -> id nuevo.
export function getCheckoutAttemptId(fingerprint: string): string {
  const stored = read<{ id: string; fingerprint: string }>(ATTEMPT_KEY);
  if (stored?.fingerprint === fingerprint && typeof stored.id === "string") return stored.id;
  const id = crypto.randomUUID();
  write(ATTEMPT_KEY, { id, fingerprint });
  return id;
}

// Se llama tras un pedido creado o tras PRICE_CHANGED (el siguiente envío es un intento nuevo).
export function resetCheckoutAttempt() {
  try {
    window.sessionStorage.removeItem(ATTEMPT_KEY);
  } catch {
    // Nada que limpiar.
  }
}

// ---------------------------------------------------------------------------
// Comprobantes para /pedido/[folio]
// ---------------------------------------------------------------------------

export type StoredConfirmation = { receipt: OrderReceipt; contact: OrderContact; savedAt: number };

export function saveOrderConfirmation(confirmation: Omit<StoredConfirmation, "savedAt">) {
  const all = read<Record<string, StoredConfirmation>>(CONFIRMATIONS_KEY) ?? {};
  all[confirmation.receipt.folio] = { ...confirmation, savedAt: Date.now() };
  // Solo los más recientes.
  const recent = Object.entries(all)
    .sort(([, a], [, b]) => b.savedAt - a.savedAt)
    .slice(0, MAX_CONFIRMATIONS);
  write(CONFIRMATIONS_KEY, Object.fromEntries(recent));
}

/** Texto crudo (estable para useSyncExternalStore); se interpreta con parseConfirmation. */
export function readConfirmationsRaw(): string | null {
  try {
    return window.sessionStorage.getItem(CONFIRMATIONS_KEY);
  } catch {
    return null;
  }
}

export function parseConfirmation(raw: string | null, folio: string): StoredConfirmation | null {
  if (!raw) return null;
  try {
    const confirmation = (JSON.parse(raw) as Record<string, StoredConfirmation>)[folio];
    const valid =
      confirmation?.receipt?.folio === folio &&
      Array.isArray(confirmation.receipt.items) &&
      typeof confirmation.receipt.totalCents === "number" &&
      typeof confirmation.contact?.name === "string";
    return valid ? confirmation : null;
  } catch {
    return null;
  }
}
