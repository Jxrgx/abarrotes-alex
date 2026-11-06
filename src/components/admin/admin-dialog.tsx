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
      const target = dialog.querySelector<HTMLElement>("[data-autofocus]");
      // En pantallas táctiles no se enfoca un campo de texto al abrir: este efecto corre
      // dentro del toque del usuario, así que iOS abriría el teclado de inmediato y
      // desplazaría la hoja (el campo quedaba solo, abajo, y el resto oculto). El foco
      // entra al diálogo (lectores de pantalla anuncian el título) y el teclado aparece
      // cuando el usuario toca un campo. Con ratón/teclado se conserva el autofocus.
      if (target && isTouchDevice() && isTextEntry(target)) dialog.focus();
      else target?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      const target = returnFocus.current;
      returnFocus.current = null;
      if (target?.isConnected) target.focus();
    }
  }, [open]);

  // Móvil: la hoja se ancla al viewport VISUAL, no al de layout. En iOS Safari el
  // teclado virtual (y la barra dinámica) reducen solo el viewport visual: `dvh` y
  // `bottom: 0` siguen midiendo el de layout, así que la hoja quedaba detrás del
  // teclado. Aquí se publica la distancia al borde visible y la altura real disponible
  // (--sheet-bottom / --sheet-max-h); en sm+ las clases del modal centrado las ignoran.
  useEffect(() => {
    const dialog = ref.current;
    const viewport = window.visualViewport;
    if (!open || !dialog || !viewport) return;
    let frame = 0;
    const reset = () => {
      dialog.style.removeProperty("--sheet-bottom");
      dialog.style.removeProperty("--sheet-max-h");
    };
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Con zoom de pellizco el viewport visual no representa el área de la hoja.
        if (Math.abs(viewport.scale - 1) > 0.01) return reset();
        const bottom = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
        dialog.style.setProperty("--sheet-bottom", `${bottom}px`);
        dialog.style.setProperty("--sheet-max-h", `${Math.floor(viewport.height * 0.92)}px`);
        // Con el teclado abierto, el campo enfocado sigue visible dentro del cuerpo desplazable.
        const active = document.activeElement;
        if (bottom > 0 && active instanceof HTMLElement && dialog.contains(active) && isTextEntry(active)) {
          active.scrollIntoView({ block: "nearest" });
        }
      });
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      reset();
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      // Destino del foco inicial en pantallas táctiles (sin entrar al orden de tabulación).
      tabIndex={-1}
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
        // Móvil: hoja inferior. Sin JS (o sin visualViewport) cae a bottom 0 / 92dvh.
        // overflow-hidden: la única zona de scroll es DialogBody (no el <dialog> entero).
        "fixed inset-x-0 top-auto bottom-[var(--sheet-bottom,0px)] m-0 max-h-[var(--sheet-max-h,92dvh)] w-full max-w-none flex-col overflow-hidden rounded-t-xl border-0 bg-background p-0 text-foreground shadow-overlay outline-none",
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
// overscroll-contain: al llegar al final, el gesto no arrastra la página de fondo.
export function DialogBody({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5", className)}>
      {children}
    </div>
  );
}

// Pantalla táctil principal (teléfonos y tablets): el foco en un campo abre el teclado.
function isTouchDevice() {
  return window.matchMedia("(pointer: coarse)").matches;
}

const NON_TEXT_INPUTS = new Set(["checkbox", "radio", "button", "submit", "reset", "file", "range", "color", "hidden", "image"]);

// Controles que abren el teclado virtual al recibir el foco.
function isTextEntry(element: HTMLElement) {
  if (element instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(element.type);
  return element instanceof HTMLTextAreaElement || element.isContentEditable;
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col-reverse gap-2 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-5 sm:pb-3 [&>button]:h-11 sm:[&>button]:h-10">
      {children}
    </div>
  );
}
