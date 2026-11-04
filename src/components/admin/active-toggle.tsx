"use client";

import { AlertCircle, LoaderCircle } from "lucide-react";
import { type ReactNode, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { MutationResult } from "@/lib/admin/catalog-forms";

import { AdminDialog, DialogBody, DialogFooter } from "./admin-dialog";
import { WarningNote } from "./catalog-form";
import { useToast } from "./toast";

type Item = { id: string; name: string; isActive: boolean };
type SetActive = (id: string, isActive: boolean) => Promise<MutationResult>;

const CONNECTION_ERROR = "No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.";

// Activar / desactivar desde el listado (borrado lógico, sin borrado físico):
//   - Desactivar pide confirmación (nunca por un clic accidental) y explica la consecuencia.
//   - Reactivar es directo: es la acción segura y debe ser fácil.
export function useActiveToggle<T extends Item>(setActive: SetActive) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function run(item: T, isActive: boolean, fromDialog: boolean) {
    setBusyId(item.id);
    setError(null);
    startTransition(async () => {
      try {
        const result = await setActive(item.id, isActive);
        if (result.ok) {
          // Junto con los datos nuevos de la acción (ver CatalogFormDialog).
          startTransition(() => {
            setTarget(null);
            toast(result.message);
          });
        } else if (fromDialog) {
          setError(result.message); // el diálogo sigue abierto con el error
        } else {
          toast(result.message, "error");
        }
      } catch {
        if (fromDialog) setError(CONNECTION_ERROR);
        else toast(CONNECTION_ERROR, "error");
      } finally {
        setBusyId(null);
      }
    });
  }

  return {
    /** Elemento por desactivar (abre la confirmación). */
    target,
    error,
    pending,
    busyId,
    toggle(item: T) {
      if (item.isActive) {
        setError(null);
        setTarget(item);
      } else {
        run(item, true, false);
      }
    },
    confirm() {
      if (target) run(target, false, true);
    },
    cancel() {
      if (!pending) setTarget(null);
    },
  };
}

export function DeactivateDialog({ open, title, confirmLabel, pending, error, onConfirm, onCancel, note = "Podrás reactivarla en cualquier momento. No se borra ningún dato.", children }: {
  open: boolean;
  title: string;
  confirmLabel: string;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  note?: string;
  /** Consecuencias de desactivar (qué deja de verse en la tienda). */
  children: ReactNode;
}) {
  return (
    <AdminDialog open={open} onClose={onCancel} title={title} busy={pending}>
      <DialogBody>
        <WarningNote>{children}</WarningNote>
        <p className="text-sm text-muted-foreground">{note}</p>
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive-soft p-3 text-sm text-destructive-strong">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onCancel} disabled={pending} data-autofocus>
          Cancelar
        </Button>
        <Button onClick={onConfirm} disabled={pending} aria-busy={pending} className="min-w-32">
          {pending ? (
            <>
              <LoaderCircle className="animate-spin" aria-hidden="true" />
              Desactivando…
            </>
          ) : (
            confirmLabel
          )}
        </Button>
      </DialogFooter>
    </AdminDialog>
  );
}
