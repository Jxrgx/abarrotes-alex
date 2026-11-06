"use client";

import { Menu, X } from "lucide-react";
import { useRef } from "react";

import { Button } from "@/components/ui/button";

import { AdminNavList } from "./admin-nav";
import { SignOutButton } from "./sign-out-button";

type MobileAdminNavProps = { userName: string; roleLabel: string | null };

// Móvil: botón "Menú" que abre un panel lateral (<dialog> nativo: foco atrapado,
// Esc cierra y el foco vuelve al botón). Elegir un módulo cierra el panel.
export function MobileAdminNav({ userName, roleLabel }: MobileAdminNavProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const close = () => dialogRef.current?.close();

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => dialogRef.current?.showModal()}
        aria-haspopup="dialog"
        className="px-3"
      >
        <Menu aria-hidden="true" />
        Menú
      </Button>

      <dialog
        ref={dialogRef}
        aria-label="Menú del panel administrativo"
        // Alto: el anclaje nativo del <dialog> modal (top 0 / bottom 0) con height auto llena
        // exactamente el área visible; h-dvh puede medir más en iOS 26 y esconder "Cerrar sesión".
        className="m-0 h-auto max-h-none w-[min(20rem,85vw)] max-w-none flex-col border-0 border-r bg-background p-0 text-foreground shadow-overlay backdrop:bg-foreground/40 open:flex open:animate-in open:slide-in-from-left-8 open:fade-in-0 open:duration-200"
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
          <span className="text-sm font-semibold">Panel administrativo</span>
          <Button variant="ghost" size="icon" onClick={close} aria-label="Cerrar menú">
            <X className="size-5" aria-hidden="true" />
          </Button>
        </div>
        <nav aria-label="Panel administrativo" className="min-h-0 flex-auto overflow-y-auto overscroll-contain p-3">
          <AdminNavList onNavigate={close} />
        </nav>
        <div className="shrink-0 border-t p-3">
          <div className="px-3 py-1">
            <p className="truncate text-sm font-medium">{userName}</p>
            {roleLabel && <p className="text-xs text-subtle-foreground">{roleLabel}</p>}
          </div>
          <SignOutButton className="mt-2" />
        </div>
      </dialog>
    </>
  );
}
