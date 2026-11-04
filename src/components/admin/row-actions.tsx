"use client";

import { Menu } from "@base-ui/react/menu";
import { type LucideIcon, MoreHorizontal, Pencil } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type RowMenuItem = { label: string; icon: LucideIcon; onSelect: () => void };

// Acciones de una fila: "Editar" visible + menú secundario (⋯) para el resto
// (activar/desactivar y, en el futuro, más acciones). Evita varios botones grandes
// por fila en móvil. Menú accesible de Base UI (teclado, foco, Esc).
export function RowActions({ name, onEdit, items, disabled = false }: {
  name: string;
  onEdit: () => void;
  items: RowMenuItem[];
  disabled?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center justify-end gap-1">
      <Button variant="ghost" onClick={onEdit} disabled={disabled} className="px-3" aria-label={`Editar ${name}`}>
        <Pencil aria-hidden="true" />
        <span aria-hidden="true">Editar</span>
      </Button>
      <Menu.Root>
        <Menu.Trigger
          disabled={disabled}
          aria-label={`Más acciones para ${name}`}
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "data-popup-open:bg-accent")}
        >
          <MoreHorizontal className="size-5" aria-hidden="true" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner sideOffset={4} align="end" className="z-50 outline-hidden">
            <Menu.Popup className="min-w-48 origin-(--transform-origin) rounded-xl border bg-popover p-1 text-sm text-foreground shadow-overlay outline-hidden transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
              {items.map((item) => (
                <Menu.Item
                  key={item.label}
                  onClick={item.onSelect}
                  className="flex h-10 cursor-default items-center gap-2.5 rounded-lg px-3 font-medium outline-hidden select-none data-highlighted:bg-accent"
                >
                  <item.icon className="size-4 text-muted-foreground" aria-hidden="true" />
                  {item.label}
                </Menu.Item>
              ))}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}
