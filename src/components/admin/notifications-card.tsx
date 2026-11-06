"use client";

import { BellOff, BellRing, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { deletePushSubscription, savePushSubscription } from "@/lib/notifications/actions";
import {
  getServiceWorkerRegistration,
  isPushSupported,
  isSoundEnabled,
  isStandalone,
  setSoundEnabled,
  vapidKeyToBytes,
} from "@/lib/notifications/browser";

// Activación EXPLÍCITA por dispositivo: el permiso del navegador solo se pide al
// pulsar "Activar notificaciones de pedidos" (nunca al abrir la página). Cada admin
// decide en cada dispositivo; sin activarlo, ese dispositivo no recibe nada.

type State = "checking" | "unsupported" | "unconfigured" | "off" | "working" | "on" | "blocked";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export function NotificationsCard() {
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState<string | null>(null);
  const [sound, setSound] = useState(true);
  const [installed, setInstalled] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await currentState();
      if (cancelled) return;
      setSound(isSoundEnabled());
      setInstalled(isStandalone());
      setState(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setError(null);
    setState("working");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const subscription = await subscribe();
      const result = await savePushSubscription(subscription.toJSON());
      if (!result.ok) {
        await subscription.unsubscribe().catch(() => {});
        setError(result.message);
        setState("off");
        return;
      }
      setState("on");
    } catch {
      setError("No pudimos activar las notificaciones en este dispositivo. Inténtalo de nuevo.");
      setState("off");
    }
  }

  async function disable() {
    setError(null);
    setState("working");
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const result = await deletePushSubscription(subscription.endpoint);
        if (!result.ok) {
          setError(result.message);
          setState("on");
          return;
        }
        await subscription.unsubscribe();
      }
      setState("off");
    } catch {
      setError("No pudimos desactivar las notificaciones. Inténtalo de nuevo.");
      setState("on");
    }
  }

  return (
    <section aria-labelledby="notificaciones-titulo" className="mb-5 rounded-xl border bg-card p-4 md:p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
          {state === "on" ? <BellRing className="size-5" aria-hidden="true" /> : <BellOff className="size-5" aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="notificaciones-titulo" className="text-base font-semibold">
            Notificaciones de pedidos
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground" aria-live="polite">
            {DESCRIPTIONS[state]}
          </p>
          {error && <p className="mt-1 text-sm text-destructive-strong">{error}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {(state === "off" || state === "working") && (
              <Button
                onClick={enable}
                disabled={state === "working"}
                aria-busy={state === "working"}
                // A 320 px el texto no cabe en una línea: ancho completo y salto de línea.
                className="h-auto min-h-10 w-full py-2 whitespace-normal sm:w-auto"
              >
                {state === "working" ? "Activando…" : "Activar notificaciones de pedidos"}
              </Button>
            )}
            {state === "on" && (
              <Button variant="secondary" onClick={disable} className="h-auto min-h-10 w-full py-2 whitespace-normal sm:w-auto">
                Desactivar en este dispositivo
              </Button>
            )}
            {state !== "checking" && state !== "unsupported" && (
              <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={sound}
                  onChange={(event) => {
                    setSound(event.target.checked);
                    setSoundEnabled(event.target.checked);
                  }}
                />
                Sonido con el panel abierto
              </label>
            )}
          </div>

          {!installed && state !== "checking" && (
            <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
              <Smartphone className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Instala Abarrotes Alex en tu teléfono para recibir pedidos: en Chrome, menú ⋮ → «Instalar aplicación».
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

const DESCRIPTIONS: Record<State, string> = {
  checking: "Revisando este dispositivo…",
  unsupported: "Este navegador no permite notificaciones push. En Android usa Chrome.",
  unconfigured: "Las notificaciones todavía no están configuradas en el servidor.",
  off: "Recibe un aviso en este dispositivo cuando llegue un pedido, aunque el panel esté cerrado.",
  working: "Activando…",
  on: "Activadas en este dispositivo ✓",
  blocked:
    "El navegador bloqueó las notificaciones de este sitio. Permítelas en la configuración del sitio (candado junto a la dirección) y vuelve a intentarlo.",
};

async function currentState(): Promise<State> {
  if (!isPushSupported()) return "unsupported";
  if (!VAPID_PUBLIC_KEY) return "unconfigured";
  if (Notification.permission === "denied") return "blocked";
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription || Notification.permission !== "granted") return "off";
  // Se vuelve a guardar (idempotente): si la base la borró (404/410) o este navegador
  // ahora tiene otra cuenta de admin, queda vinculada al usuario actual.
  const result = await savePushSubscription(subscription.toJSON()).catch(() => null);
  return result?.ok ? "on" : "off";
}

async function subscribe() {
  const registration = await getServiceWorkerRegistration();
  await navigator.serviceWorker.ready;
  const options = { userVisibleOnly: true, applicationServerKey: vapidKeyToBytes(VAPID_PUBLIC_KEY) };
  try {
    return (await registration.pushManager.getSubscription()) ?? (await registration.pushManager.subscribe(options));
  } catch {
    // Suscripción previa con otra clave VAPID (rotación): se reemplaza.
    await (await registration.pushManager.getSubscription())?.unsubscribe();
    return registration.pushManager.subscribe(options);
  }
}
