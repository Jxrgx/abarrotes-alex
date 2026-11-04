"use client";

import { X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AdminDialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  /** Mientras se guarda: Esc, × y el fondo no cierran (evita perder el resultado). */
  busy?: boolean;
  /** md: formularios cortos (max 512px). lg: formularios con secciones (max 672px). */
  size?: "md" | "lg";
  children: ReactNode;
};

// Diálogo adaptativo del panel con <dialog> nativo (foco atrapado, Esc, el foco
// vuelve al botón que lo abrió):
//   - móvil: hoja inferior a todo el ancho (el formulario no se comprime);
//   - sm+: modal centrado de ancho moderado.
// El contenido decide su foco inicial con `data-autofocus`.
export function AdminDialog({ open, onClose, title, description, busy = false, size = "md", children }: AdminDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  // Elemento al que vuelve el foco al cerrar. El navegador no puede restaurarlo solo:
  // el contenido se desmonta antes de close() y, si el diálogo se abrió desde un menú,
  // el elemento enfocado era un ítem que desaparece. En ese caso se usa el botón que
  // abrió el menú (aria-expanded="true").
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      returnFocus.current = active?.closest("[role=menu]")
        ? document.querySelector<HTMLElement>("[aria-haspopup][aria-expanded=true]")
        : active;
      dialog.showModal();
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      const target = returnFocus.current;
      returnFocus.current = null;
      if (target?.isConnected) target.focus();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault(); // Esc: el estado lo controla el padre
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
      className={cn(
        "fixed inset-x-0 top-auto bottom-0 m-0 max-h-[92dvh] w-full max-w-none flex-col rounded-t-xl border-0 bg-background p-0 text-foreground shadow-overlay",
        "backdrop:bg-foreground/40 open:flex open:animate-in open:fade-in-0 open:slide-in-from-bottom-6 open:duration-200",
        "sm:inset-0 sm:m-auto sm:h-fit sm:max-h-[85dvh] sm:w-[calc(100%-3rem)] sm:rounded-xl sm:border sm:open:slide-in-from-bottom-2",
        size === "lg" ? "sm:max-h-[90dvh] sm:max-w-2xl" : "sm:max-w-lg",
      )}
    >
      {open && (
        <>
          <div className="flex items-start gap-3 border-b px-4 py-3 sm:px-5">
            <div className="min-w-0 flex-1 py-1.5">
              <h2 id={titleId} className="text-lg font-semibold leading-tight">
                {title}
              </h2>
              {description && (
                <div id={descriptionId} className="mt-1 text-sm text-muted-foreground">
                  {description}
                </div>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} disabled={busy} aria-label="Cerrar" className="-mr-2">
              <X className="size-5" aria-hidden="true" />
            </Button>
          </div>
          {children}
        </>
      )}
    </dialog>
  );
}

// Cuerpo desplazable y pie fijo con las acciones (dentro del <form> si lo hay).
export function DialogBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5", className)}>{children}</div>;
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col-reverse gap-2 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-5 sm:pb-3 [&>button]:h-11 sm:[&>button]:h-10">
      {children}
    </div>
  );
}
