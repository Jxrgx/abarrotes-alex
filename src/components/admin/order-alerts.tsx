"use client";

import { BellRing, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { createSeenOrders, parseOrderEvent } from "@/lib/notifications/dedupe";
import { getServiceWorkerRegistration, isPushSupported, isSoundEnabled } from "@/lib/notifications/browser";
import { createClient } from "@/lib/supabase/client";

// Pedidos nuevos con el panel ABIERTO (sin F5 ni polling):
// - Realtime Broadcast privado "admin:orders" (solo admins, RLS): evento mínimo
//   { order_id, folio }; los datos se revalidan con la sesión (router.refresh()).
// - Mensajes del Service Worker cuando llega un push con el panel abierto.
// El mismo pedido avisa y suena una sola vez (deduplicación por order_id).
// Ver docs/notifications.md.

type Alert = { orderId: string; folio: string | null };

export function OrderAlerts() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const seen = useRef(createSeenOrders());
  const audio = useRef<AudioContext | null>(null);

  const handle = useCallback(
    (payload: unknown) => {
      const event = parseOrderEvent(payload);
      if (!event || !seen.current.markNew(event.orderId)) return;
      setAlerts((current) => [...current.slice(-2), event]);
      router.refresh(); // dashboard, lista y pendientes se vuelven a consultar con la sesión
      // Solo la pestaña visible suena (evita sonidos repetidos con varias pestañas).
      if (document.visibilityState === "visible" && isSoundEnabled()) playChime(audio.current);
    },
    [router],
  );

  // Desbloqueo de audio: los navegadores solo permiten sonido después de una
  // interacción. Si nunca la hay, el aviso es solo visual.
  useEffect(() => {
    function unlock() {
      const AudioContextClass = window.AudioContext;
      if (!AudioContextClass) return;
      audio.current ??= new AudioContextClass();
      void audio.current.resume().catch(() => {});
    }
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // Realtime: canal privado; el token de la sesión lo aporta supabase-js (setAuth()).
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;
      channel = supabase
        .channel("admin:orders", { config: { private: true } })
        .on("broadcast", { event: "order_created" }, ({ payload }) => handle(payload))
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [handle]);

  // Service Worker: registro silencioso (no pide permisos) y mensajes del push.
  useEffect(() => {
    if (!isPushSupported()) return;
    void getServiceWorkerRegistration().catch(() => {});
    function onMessage(event: MessageEvent) {
      const data = event.data as { type?: string; path?: string } | null;
      if (data?.type === "order-push") handle(data);
      if (data?.type === "navigate" && typeof data.path === "string" && data.path.startsWith("/admin/")) router.push(data.path);
    }
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [handle, router]);

  const dismiss = (orderId: string) => setAlerts((current) => current.filter((alert) => alert.orderId !== orderId));

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 top-4 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:top-6 sm:right-6 sm:items-end"
    >
      {alerts.map((alert) => (
        <div
          key={alert.orderId}
          className="pointer-events-auto flex w-full max-w-sm animate-in items-center gap-3 rounded-xl border border-primary-soft bg-popover py-2 pr-2 pl-4 text-sm shadow-overlay fade-in-0 slide-in-from-top-2 duration-200"
        >
          <BellRing className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="flex-1 font-medium">Nuevo pedido{alert.folio ? ` ${alert.folio}` : ""}</span>
          <Link
            href={`/admin/pedidos/${alert.orderId}`}
            onClick={() => dismiss(alert.orderId)}
            className="inline-flex h-10 items-center rounded-lg px-3 font-medium text-primary hover:bg-accent"
          >
            Ver pedido
          </Link>
          <button
            type="button"
            onClick={() => dismiss(alert.orderId)}
            aria-label="Cerrar aviso"
            className="flex size-10 shrink-0 items-center justify-center rounded-lg text-subtle-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}

// Dos tonos suaves y cortos (~0.3 s, volumen bajo). Sin archivo de audio.
function playChime(context: AudioContext | null) {
  if (!context || context.state !== "running") return;
  const now = context.currentTime;
  [880, 1320].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    const start = now + index * 0.15;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.08, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.15);
  });
}
