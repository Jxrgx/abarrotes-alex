// Helpers del navegador para Web Push (solo Client Components). Detección por
// capacidades, nunca por user-agent: funciona en Chrome Android y en desktop.

export const SOUND_STORAGE_KEY = "abarrotes-alex:order-sound";

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Registra (o reutiliza) el Service Worker de notificaciones. No pide permisos. */
export async function getServiceWorkerRegistration() {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

/** Clave pública VAPID (base64url) → bytes para PushManager.subscribe. */
export function vapidKeyToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

/** true si la app corre instalada (PWA en pantalla de inicio). */
export function isStandalone() {
  return typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches;
}

export function isSoundEnabled() {
  try {
    return window.localStorage.getItem(SOUND_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(SOUND_STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Sin storage: se queda la preferencia por defecto.
  }
}
