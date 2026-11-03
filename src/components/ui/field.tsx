import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// Estilo base de inputs/textarea: 44px de alto, borde `input`, error con borde y
// texto (no solo color). text-base en móvil evita el zoom automático de iOS.
export const controlClassName = cn(
  "w-full rounded-lg border border-input bg-background px-3 text-base text-foreground",
  "transition-colors duration-150 placeholder:text-subtle-foreground hover:border-subtle-foreground/50",
  "aria-invalid:border-destructive aria-invalid:hover:border-destructive md:text-sm",
);

export function fieldDescribedBy(id: string, options: { hint?: ReactNode; error?: string }) {
  const ids = [options.hint ? `${id}-ayuda` : null, options.error ? `${id}-error` : null].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

type FieldProps = {
  id: string;
  label: string;
  required?: boolean;
  hint?: ReactNode;
  error?: string;
  className?: string;
  children: ReactNode;
};

// Etiqueta + control + ayuda + error. El control debe usar el mismo `id`,
// `aria-invalid` y `aria-describedby={fieldDescribedBy(id, …)}`.
export function Field({ id, label, required = false, hint, error, className, children }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
        {required ? (
          <span className="text-destructive-strong" aria-hidden="true">
            {" "}
            *
          </span>
        ) : (
          <span className="font-normal text-subtle-foreground"> (opcional)</span>
        )}
      </label>
      {children}
      {hint && (
        <p id={`${id}-ayuda`} className="text-sm text-subtle-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="flex items-start gap-1.5 text-sm text-destructive-strong">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
