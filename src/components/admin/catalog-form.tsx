"use client";

import { AlertCircle, AlertTriangle, LoaderCircle } from "lucide-react";
import { type FormEvent, type ReactNode, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { controlClassName, Field, fieldDescribedBy } from "@/components/ui/field";
import { type FieldErrors, type MutationResult, NAME_MAX_LENGTH } from "@/lib/admin/catalog-forms";
import { slugify } from "@/lib/slug";
import { cn } from "@/lib/utils";

import { AdminDialog, DialogBody, DialogFooter } from "./admin-dialog";

type LocalValidation = { ok: true } | { ok: false; fieldErrors: FieldErrors; message: string };
export type FailedResult = Extract<MutationResult, { ok: false }>;

type CatalogFormDialogProps = {
  open: boolean;
  onClose: () => void;
  /** warning: guardado parcial (p. ej. el producto sí, la imagen no). */
  onSaved: (message: string, warning?: string) => void;
  title: string;
  description?: ReactNode;
  submitLabel: string;
  /** Server Action: valida de nuevo, verifica admin y guarda. */
  action: (formData: FormData) => Promise<MutationResult>;
  /** Misma validación que el servidor: errores inline sin viaje a la red (solo UX). */
  validate: (formData: FormData) => LocalValidation;
  /** "lg" para formularios con secciones (productos). */
  size?: "md" | "lg";
  hidden?: Record<string, string>;
  children: (state: { fieldErrors: FieldErrors; result: FailedResult | null; pending: boolean }) => ReactNode;
};

// Formulario de alta/edición en diálogo (patrón CRUD del panel):
//   - onSubmit + useTransition (como el login): los valores NO se reinician si
//     falla, el botón queda deshabilitado mientras guarda (sin doble envío) y el
//     diálogo no se cierra hasta que el servidor responde.
//   - Al guardar: la acción revalida la ruta, el diálogo se cierra y el padre muestra el aviso.
export function CatalogFormDialog({ open, onClose, onSaved, title, description, submitLabel, action, validate, size, hidden, children }: CatalogFormDialogProps) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<FailedResult | null>(null);

  function close() {
    setResult(null);
    onClose();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const focusFirstInvalid = () => requestAnimationFrame(() => form.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());

    const local = validate(formData);
    if (!local.ok) {
      setResult({ ok: false, message: local.message, fieldErrors: local.fieldErrors });
      focusFirstInvalid();
      return;
    }

    startTransition(async () => {
      try {
        const response = await action(formData);
        if (response.ok) {
          // Tras un await, las actualizaciones deben volver a marcarse como transición
          // (React 19): así el cierre y el aviso se aplican JUNTO con los datos nuevos
          // que trae la acción (revalidatePath) y no antes. Sin esto, reabrir "Editar"
          // de inmediato precargaba valores viejos.
          startTransition(() => {
            setResult(null);
            onSaved(response.message, response.warning);
          });
          return;
        }
        setResult(response);
        focusFirstInvalid();
      } catch {
        setResult({ ok: false, message: "No pudimos conectar. Revisa tu conexión e inténtalo de nuevo." });
      }
    });
  }

  const fieldErrors = result?.fieldErrors ?? {};
  // El banner solo cuando el error no está ya junto a un campo.
  const banner = result && Object.keys(fieldErrors).length === 0 && !result.confirmMove ? result.message : null;

  return (
    <AdminDialog open={open} onClose={close} title={title} description={description} busy={pending} size={size}>
      <form noValidate onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col" aria-busy={pending}>
        {hidden && Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
        <DialogBody>
          {banner && (
            <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive-soft p-3 text-sm text-destructive-strong">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {banner}
            </p>
          )}
          {children({ fieldErrors, result, pending })}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={close} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending} aria-busy={pending} className="min-w-32">
            {pending ? (
              <>
                <LoaderCircle className="animate-spin" aria-hidden="true" />
                Guardando…
              </>
            ) : (
              submitLabel
            )}
          </Button>
        </DialogFooter>
      </form>
    </AdminDialog>
  );
}

// Nombre + vista previa del identificador (slug) que se generará. Al editar, avisa
// si el identificador cambiará (afecta los enlaces públicos con ese filtro).
export function NameField({ id, defaultValue = "", currentSlug, error }: {
  id: string;
  defaultValue?: string;
  currentSlug?: string;
  error?: string;
}) {
  const [name, setName] = useState(defaultValue);
  const slug = slugify(name);
  const changes = currentSlug !== undefined && slug !== "" && slug !== currentSlug;
  const hint = slug ? (
    changes ? (
      <>
        El identificador en enlaces cambiará de <span className="font-medium text-muted-foreground">{currentSlug}</span> a{" "}
        <span className="font-medium text-muted-foreground">{slug}</span>.
      </>
    ) : (
      <>
        Identificador en enlaces: <span className="font-medium text-muted-foreground">{slug}</span>
      </>
    )
  ) : (
    "El identificador para enlaces se genera a partir del nombre."
  );

  return (
    <Field id={id} label="Nombre" required hint={hint} error={error}>
      <input
        id={id}
        name="name"
        defaultValue={defaultValue}
        onChange={(event) => setName(event.target.value)}
        maxLength={NAME_MAX_LENGTH}
        autoComplete="off"
        required
        data-autofocus
        aria-invalid={error ? true : undefined}
        aria-describedby={fieldDescribedBy(id, { hint, error })}
        className={cn(controlClassName, "h-11")}
      />
    </Field>
  );
}

export function SortOrderField({ id, defaultValue, error }: { id: string; defaultValue: number; error?: string }) {
  const hint = "Los números menores aparecen primero. Usa saltos de 10 para poder intercalar después.";
  return (
    <Field id={id} label="Orden" hint={hint} error={error}>
      <input
        id={id}
        name="sortOrder"
        defaultValue={String(defaultValue)}
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        aria-invalid={error ? true : undefined}
        aria-describedby={fieldDescribedBy(id, { hint, error })}
        className={cn(controlClassName, "h-11 w-32 tabular-nums")}
      />
    </Field>
  );
}

// Estado del registro. Si estaba activo y se desmarca, explica la consecuencia
// ANTES de guardar.
export function ActiveField({ id, name = "isActive", label, description, defaultChecked, deactivationWarning }: {
  id: string;
  name?: string;
  label: string;
  description: string;
  defaultChecked: boolean;
  deactivationWarning?: ReactNode;
}) {
  const [checked, setChecked] = useState(defaultChecked);
  const warn = defaultChecked && !checked && deactivationWarning;
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-background-secondary">
        <input
          id={id}
          name={name}
          type="checkbox"
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-primary"
        />
        <span>
          <span className="block text-sm font-medium">{label}</span>
          <span className="block text-sm text-muted-foreground">{description}</span>
        </span>
      </label>
      {warn && <WarningNote>{deactivationWarning}</WarningNote>}
    </div>
  );
}

export function WarningNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start gap-2 rounded-lg bg-warning-soft p-3 text-sm text-warning-strong", className)}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="space-y-2">{children}</div>
    </div>
  );
}
