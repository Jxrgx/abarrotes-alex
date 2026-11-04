"use client";

import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from "react";

import { cn } from "@/lib/utils";

// Avisos ligeros del panel ("Categoría creada"). Sin dependencias: una región
// aria-live que existe desde el inicio (los lectores de pantalla solo anuncian
// cambios dentro de una región ya presente). Se cierran solos a los 5 s o con ×.

type Tone = "success" | "error";
type Toast = { id: number; message: string; tone: Tone };
type ShowToast = (message: string, tone?: Tone) => void;

const ToastContext = createContext<ShowToast>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);

  const show = useCallback<ShowToast>(
    (message, tone = "success") => {
      const id = ++nextId.current;
      setToasts((current) => [...current.slice(-2), { id, message, tone }]);
      setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );

  return (
    <ToastContext value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto flex w-full max-w-sm animate-in items-center gap-3 rounded-xl border bg-popover py-2 pr-2 pl-4 text-sm font-medium text-foreground shadow-overlay fade-in-0 slide-in-from-bottom-2 duration-200"
          >
            {toast.tone === "success" ? (
              <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden="true" />
            ) : (
              <AlertCircle className="size-5 shrink-0 text-destructive" aria-hidden="true" />
            )}
            <span className={cn("flex-1", toast.tone === "error" && "text-destructive-strong")}>{toast.message}</span>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Cerrar aviso"
              className="flex size-10 shrink-0 items-center justify-center rounded-lg text-subtle-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}
