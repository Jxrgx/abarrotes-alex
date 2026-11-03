"use client";

import { useSyncExternalStore } from "react";

import { type CartAction, cartCount, cartReducer } from "./reducer";
import { CART_STORAGE_KEY, type CartState, emptyCart, parseStoredCart } from "./schema";

// Store externo del carrito sobre localStorage, leído con useSyncExternalStore:
// - En el servidor y durante la hidratación el snapshot es null ("cargando"),
//   así el HTML del servidor y el primer render del cliente coinciden.
// - Después React toma el snapshot real del navegador.
// - El evento `storage` sincroniza el carrito entre pestañas.

let snapshot: CartState | undefined;
const listeners = new Set<() => void>();

function readStorage(): CartState {
  try {
    return parseStoredCart(window.localStorage.getItem(CART_STORAGE_KEY));
  } catch {
    // localStorage bloqueado (modo privado estricto, cookies deshabilitadas…).
    return emptyCart();
  }
}

function writeStorage(state: CartState) {
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Sin storage el carrito funciona en memoria durante la visita.
  }
}

function emit() {
  for (const listener of listeners) listener();
}

function handleStorage(event: StorageEvent) {
  // key null = localStorage.clear() en otra pestaña.
  if (event.key !== CART_STORAGE_KEY && event.key !== null) return;
  snapshot = readStorage();
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener("storage", handleStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", handleStorage);
  };
}

export function getCartSnapshot(): CartState {
  snapshot ??= readStorage();
  return snapshot;
}

function getServerSnapshot(): CartState | null {
  return null;
}

/** Aplica una acción. Devuelve false si no cambió nada (p. ej. agotado o ya en 99). */
export function dispatchCart(action: CartAction): boolean {
  const current = getCartSnapshot();
  const next = cartReducer(current, action);
  if (next === current) return false;
  snapshot = next;
  writeStorage(next);
  emit();
  return true;
}

/** null mientras el carrito no se ha leído del navegador. */
export function useCart(): CartState | null {
  return useSyncExternalStore<CartState | null>(subscribe, getCartSnapshot, getServerSnapshot);
}

/** Suma de cantidades (no productos distintos). null antes de hidratar. */
export function useCartCount(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => cartCount(getCartSnapshot()),
    () => null,
  );
}

export function useCartQuantity(productId: string): number | null {
  return useSyncExternalStore(
    subscribe,
    () => getCartSnapshot().items.find((item) => item.productId === productId)?.quantity ?? 0,
    () => null,
  );
}

// ---------------------------------------------------------------------------
// Anuncios para lectores de pantalla (una sola región aria-live en el layout).
// ---------------------------------------------------------------------------

let announcement = { id: 0, message: "" };
const announcementListeners = new Set<() => void>();

export function announceCart(message: string) {
  announcement = { id: announcement.id + 1, message };
  for (const listener of announcementListeners) listener();
}

export function useCartAnnouncement() {
  return useSyncExternalStore(
    (listener) => {
      announcementListeners.add(listener);
      return () => announcementListeners.delete(listener);
    },
    () => announcement,
    () => announcement,
  );
}

export function countLabel(count: number) {
  return count === 1 ? "1 producto" : `${count} productos`;
}
