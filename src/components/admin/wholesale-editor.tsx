"use client";

import { AlertCircle, Plus, Tag, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { controlClassName } from "@/components/ui/field";
import type { FieldErrors } from "@/lib/admin/catalog-forms";
import { normalizePrice, priceToCents } from "@/lib/admin/price-input";
import type { AdminWholesaleTier } from "@/lib/admin/products";
import {
  tierField,
  tierGroupField,
  tierRangeLabel,
  tierSavings,
  WHOLESALE_MAX_QUANTITY,
  WHOLESALE_MAX_TIERS,
  WHOLESALE_MESSAGES,
  WHOLESALE_MIN_QUANTITY,
} from "@/lib/admin/wholesale-forms";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";

type Row = {
  key: number;
  /** id guardado (edición); null = nivel nuevo. */
  id: string | null;
  min: string;
  max: string;
  unlimited: boolean;
  price: string;
  /** Precio guardado: si no cambia, un nivel por encima del normal solo «requiere revisión». */
  original: string | null;
};

const toRow = (tier: AdminWholesaleTier, key: number, keepId: boolean): Row => ({
  key,
  id: keepId ? tier.id : null,
  min: String(tier.minQuantity),
  max: tier.maxQuantity === null ? "" : String(tier.maxQuantity),
  unlimited: tier.maxQuantity === null,
  price: tier.unitPrice,
  original: keepId ? tier.unitPrice : null,
});

// Niveles de mayoreo de UNA sucursal dentro del formulario de producto. Los nombres de
// campo los lee parseWholesaleTiers (wholesale:<sucursal>:<índice>:<campo>). La base
// valida todo de nuevo (rangos, solapamiento, orden de precios y precio < normal).
export function WholesaleEditor({ branchId, branchName, normalPrice, initial, keepIds, fieldErrors }: {
  branchId: string;
  /** Solo si hay varias sucursales. */
  branchName?: string;
  /** Precio normal escrito en el formulario (texto). */
  normalPrice: string;
  initial: AdminWholesaleTier[];
  /** Editar conserva los ids; duplicar crea niveles nuevos. */
  keepIds: boolean;
  fieldErrors: FieldErrors;
}) {
  const nextKey = useRef(initial.length);
  const [rows, setRows] = useState<Row[]>(() => initial.map((tier, index) => toRow(tier, index, keepIds)));
  const normalCents = priceToCents(normalPrice);
  const groupError = fieldErrors[tierGroupField(branchId)];

  function update(key: number, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function add() {
    setRows((current) => {
      const last = current.at(-1);
      // Sugerencia: empieza justo después del nivel anterior (si este tiene límite).
      const min = last && !last.unlimited && /^\d+$/.test(last.max) ? String(Math.min(Number(last.max) + 1, WHOLESALE_MAX_QUANTITY)) : "";
      return [...current, { key: nextKey.current++, id: null, min, max: "", unlimited: true, price: "", original: null }];
    });
  }

  return (
    <div className="space-y-3">
      {branchName && <p className="text-sm font-semibold">{branchName}</p>}
      {normalCents !== null && normalCents > 0 && (
        <p className="text-sm text-muted-foreground">
          Precio normal: <span className="font-medium text-foreground tabular-nums">{formatCents(normalCents)}</span>
        </p>
      )}

      {rows.length > 0 && (
        <ol className="space-y-3" aria-label="Precios por mayoreo">
          {rows.map((row, index) => (
            <TierRow
              key={row.key}
              row={row}
              index={index}
              branchId={branchId}
              normalCents={normalCents}
              fieldErrors={fieldErrors}
              onChange={(patch) => update(row.key, patch)}
              onRemove={() => setRows((current) => current.filter((item) => item.key !== row.key))}
            />
          ))}
        </ol>
      )}

      {groupError && (
        <p className="flex items-start gap-1.5 text-sm text-destructive-strong">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {groupError}
        </p>
      )}

      <Button type="button" variant="secondary" onClick={add} disabled={rows.length >= WHOLESALE_MAX_TIERS}>
        <Plus aria-hidden="true" />
        Agregar precio por mayoreo
      </Button>
      {rows.length >= WHOLESALE_MAX_TIERS && (
        <p className="text-sm text-subtle-foreground">Puedes definir como máximo {WHOLESALE_MAX_TIERS} precios por mayoreo.</p>
      )}
    </div>
  );
}

function TierRow({ row, index, branchId, normalCents, fieldErrors, onChange, onRemove }: {
  row: Row;
  index: number;
  branchId: string;
  normalCents: number | null;
  fieldErrors: FieldErrors;
  onChange: (patch: Partial<Row>) => void;
  onRemove: () => void;
}) {
  const name = (field: Parameters<typeof tierField>[2]) => tierField(branchId, index, field);
  const id = (field: string) => `mayoreo-${branchId}-${row.key}-${field}`;
  const errors = { min: fieldErrors[name("min")], max: fieldErrors[name("max")], price: fieldErrors[name("price")] };

  const min = /^\d{1,2}$/.test(row.min.trim()) ? Number(row.min) : null;
  const max = row.unlimited ? null : /^\d{1,2}$/.test(row.max.trim()) ? Number(row.max) : undefined;
  const cents = priceToCents(row.price);
  const unchanged = row.original !== null && normalizePrice(row.price) === normalizePrice(row.original);
  const range = min !== null && min >= WHOLESALE_MIN_QUANTITY && max !== undefined && (max === null || max >= min) ? tierRangeLabel(min, max) : null;
  const savings = cents !== null && normalCents !== null ? tierSavings(cents, normalCents) : null;
  const notLower = cents !== null && cents > 0 && normalCents !== null && cents >= normalCents;
  const title = range ? `Mayoreo ${range}` : `Precio por mayoreo ${index + 1}`;

  return (
    <li className="space-y-3 rounded-lg border p-3">
      {row.id && <input type="hidden" name={name("id")} value={row.id} />}
      {row.original !== null && <input type="hidden" name={name("original")} value={row.original} />}

      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Tag className="size-3.5 text-primary-dark" aria-hidden="true" />
          {title}
        </p>
        <Button type="button" variant="ghost" className="-my-1 -mr-2 px-3 text-muted-foreground" onClick={onRemove} aria-label={`Quitar ${title.toLowerCase()}`}>
          <Trash2 aria-hidden="true" />
          Quitar
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[7rem_9rem_minmax(0,12rem)]">
        <TierInput id={id("desde")} name={name("min")} label="Desde" suffix="pzas" value={row.min} error={errors.min}
          onChange={(value) => onChange({ min: value })} placeholder={String(WHOLESALE_MIN_QUANTITY)} />
        <div className="space-y-1.5">
          <TierInput id={id("hasta")} name={name("max")} label="Hasta" suffix="pzas" value={row.unlimited ? "" : row.max}
            error={row.unlimited ? undefined : errors.max} disabled={row.unlimited}
            placeholder={row.unlimited ? "Sin límite" : ""} onChange={(value) => onChange({ max: value })} />
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              name={name("unlimited")}
              className="size-4 accent-primary"
              checked={row.unlimited}
              onChange={(event) => onChange({ unlimited: event.target.checked })}
            />
            Sin límite
          </label>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <TierInput id={id("precio")} name={name("price")} label="Precio por pieza" prefix="$" inputMode="decimal"
            value={row.price} error={errors.price} placeholder="0.00" onChange={(value) => onChange({ price: value })} />
        </div>
      </div>

      {/* Retroalimentación en vivo (la validación definitiva ocurre al guardar). */}
      {range && savings && (
        <p className="text-sm text-muted-foreground tabular-nums">
          {range} → <span className="font-medium text-foreground">{formatCents(cents!)}</span> c/u · Ahorro{" "}
          {formatCents(savings.savingsCents)} por pieza ({savings.percent})
        </p>
      )}
      {notLower && unchanged && (
        <p className="rounded-lg bg-warning-soft p-3 text-sm text-warning-strong">
          Requiere revisión: ya no es menor que el precio normal y la tienda no lo aplica. Bájalo o quítalo.
        </p>
      )}
      {notLower && !unchanged && !errors.price && <p className="text-sm text-destructive-strong">{WHOLESALE_MESSAGES.notLower}</p>}
    </li>
  );
}

function TierInput({ id, name, label, value, onChange, error, prefix, suffix, placeholder, disabled = false, inputMode = "numeric" }: {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  disabled?: boolean;
  inputMode?: "numeric" | "decimal";
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-subtle-foreground" aria-hidden="true">
            {prefix}
          </span>
        )}
        <input
          id={id}
          name={name}
          inputMode={inputMode}
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn(controlClassName, "h-11 tabular-nums disabled:bg-background-secondary", prefix && "pl-7", suffix && "pr-12")}
        />
        {suffix && (
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-subtle-foreground" aria-hidden="true">
            {suffix}
          </span>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} className="flex items-start gap-1.5 text-sm text-destructive-strong">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
