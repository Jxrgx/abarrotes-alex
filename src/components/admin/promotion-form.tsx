"use client";

import { Search, X } from "lucide-react";
import { type ReactNode, useState } from "react";

import { ProductImage } from "@/components/store/product-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { controlClassName, Field, fieldDescribedBy } from "@/components/ui/field";
import type { FieldErrors } from "@/lib/admin/catalog-forms";
import { matchesProductSearch, priceToCents } from "@/lib/admin/product-forms";
import { PROMOTION_MESSAGES, promotionSavings } from "@/lib/admin/promotion-forms";
import type { AdminPromotion } from "@/lib/admin/promotions";
import { isoToBusinessLocal } from "@/lib/datetime";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";

import { ActiveField, WarningNote } from "./catalog-form";

// Producto + sucursal que se pueden promocionar (un branch_product).
export type PromotableOption = {
  branchProductId: string;
  productName: string;
  presentation: string | null;
  brandName: string | null;
  categoryName: string;
  subcategoryName: string;
  branchName: string;
  priceCents: number;
  isAvailable: boolean;
  imagePath: string | null;
};

const MAX_RESULTS = 8;

export function PromotionFields({ promotion, options, showBranch, fieldErrors }: {
  /** null = nueva promoción. */
  promotion: AdminPromotion | null;
  options: PromotableOption[];
  showBranch: boolean;
  fieldErrors: FieldErrors;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [price, setPrice] = useState(promotion?.promotionalPrice ?? "");
  // El error del último envío se oculta en cuanto el admin corrige el precio (cada envío
  // trae un objeto fieldErrors nuevo, así que un error nuevo vuelve a mostrarse).
  const [priceEditedAfter, setPriceEditedAfter] = useState<FieldErrors | null>(null);
  const selected = promotion
    ? {
        branchProductId: promotion.branchProductId,
        productName: promotion.productName,
        presentation: promotion.presentation,
        brandName: promotion.brandName,
        categoryName: promotion.categoryName,
        subcategoryName: promotion.subcategoryName,
        branchName: promotion.branchName,
        priceCents: promotion.priceCents,
        isAvailable: promotion.isAvailable,
        imagePath: promotion.imagePath,
      }
    : (options.find((option) => option.branchProductId === selectedId) ?? null);
  const normalCents = selected?.priceCents ?? null;
  const promoCents = priceToCents(price);
  const savings = normalCents !== null && promoCents !== null ? promotionSavings(normalCents, promoCents) : null;
  const tooHigh = normalCents !== null && promoCents !== null && promoCents >= normalCents;
  const submittedPriceError = priceEditedAfter === fieldErrors ? undefined : fieldErrors.promotionalPrice;
  const priceError = tooHigh ? PROMOTION_MESSAGES.priceNotLower : submittedPriceError;

  return (
    <>
      {/* Solo para validar en el navegador; el servidor y la base no confían en él. */}
      {normalCents !== null && <input type="hidden" name="normalPriceCents" value={normalCents} />}

      <section className="space-y-3">
        <h3 className="text-base font-semibold">Producto</h3>
        {selected ? (
          <SelectedProduct
            option={selected}
            showBranch={showBranch}
            productInactive={promotion ? !promotion.productActive : false}
            onChange={
              promotion
                ? undefined
                : () => {
                    setSelectedId(null);
                    requestAnimationFrame(() => document.getElementById("promo-producto")?.focus());
                  }
            }
          />
        ) : (
          <ProductPicker
            options={options}
            showBranch={showBranch}
            onSelect={(branchProductId) => {
              setSelectedId(branchProductId);
              // El buscador desaparece: el foco pasa al siguiente paso (precio).
              requestAnimationFrame(() => document.getElementById("promo-precio")?.focus());
            }}
            error={fieldErrors.branchProductId}
          />
        )}
        {!promotion && <input type="hidden" name="branchProductId" value={selected?.branchProductId ?? ""} />}
      </section>

      <section className="space-y-4 border-t border-border-subtle pt-4">
        <h3 className="text-base font-semibold">Precio</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[10rem_12rem]">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Precio normal</p>
            <p className="flex h-11 items-center rounded-lg bg-background-secondary px-3 text-base font-semibold tabular-nums" aria-live="polite">
              {normalCents === null ? <span className="text-sm font-normal text-subtle-foreground">Elige un producto</span> : formatCents(normalCents)}
            </p>
          </div>
          <Field id="promo-precio" label="Precio promocional" required error={priceError}>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-subtle-foreground" aria-hidden="true">
                $
              </span>
              <input
                id="promo-precio"
                name="promotionalPrice"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={price}
                onChange={(event) => {
                  setPrice(event.target.value);
                  setPriceEditedAfter(fieldErrors);
                }}
                data-autofocus={promotion ? true : undefined}
                aria-invalid={priceError ? true : undefined}
                aria-describedby={fieldDescribedBy("promo-precio", { error: priceError })}
                className={cn(controlClassName, "h-11 pr-14 pl-7 tabular-nums")}
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-subtle-foreground" aria-hidden="true">
                MXN
              </span>
            </div>
          </Field>
        </div>
        {savings && (
          <p className="text-sm text-success-strong" aria-live="polite">
            Ahorro para el cliente: <span className="font-semibold tabular-nums">{formatCents(savings.cents)}</span> ({savings.percent}%)
          </p>
        )}
      </section>

      <section className="space-y-4 border-t border-border-subtle pt-4">
        <div>
          <h3 className="text-base font-semibold">Vigencia</h3>
          <p className="text-sm text-subtle-foreground">
            Horario de la sucursal (Mérida). Sin fechas, la promoción se aplica de inmediato hasta que la desactives.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <DateTimeField id="promo-inicio" name="startsAt" label="Inicio" hint="Opcional. Desde este momento." defaultIso={promotion?.startsAt ?? null} error={fieldErrors.startsAt} />
          <DateTimeField id="promo-fin" name="endsAt" label="Fin" hint="Opcional. Deja de aplicarse en este momento." defaultIso={promotion?.endsAt ?? null} error={fieldErrors.endsAt} />
        </div>
      </section>

      <section className="border-t border-border-subtle pt-4">
        <ActiveField
          id="promo-activa"
          label="Activa"
          description="Desactivada no se aplica, aunque esté dentro de sus fechas."
          defaultChecked={promotion?.isActive ?? true}
          deactivationWarning={promotion ? <p>Esta promoción dejará de aplicarse inmediatamente.</p> : undefined}
        />
      </section>
    </>
  );
}

function DateTimeField({ id, name, label, hint, defaultIso, error }: {
  id: string;
  name: string;
  label: string;
  hint: string;
  defaultIso: string | null;
  error?: string;
}) {
  const [value, setValue] = useState(defaultIso ? isoToBusinessLocal(defaultIso) : "");
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <div className="flex gap-2">
        <input
          id={id}
          name={name}
          type="datetime-local"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={fieldDescribedBy(id, { hint, error })}
          className={cn(controlClassName, "h-11 min-w-0 flex-1 tabular-nums")}
        />
        {value && (
          <Button variant="ghost" size="icon" onClick={() => setValue("")} aria-label={`Quitar fecha de ${label.toLowerCase()}`} className="size-11 shrink-0">
            <X className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    </Field>
  );
}

// Buscador de productos para promocionar (100–500 productos): campo de búsqueda +
// resultados como opciones de radio (teclado nativo, lector de pantalla). Sin Fuse.
function ProductPicker({ options, showBranch, onSelect, error }: {
  options: PromotableOption[];
  showBranch: boolean;
  onSelect: (branchProductId: string) => void;
  error?: string;
}) {
  const [query, setQuery] = useState("");
  const matches = options.filter((option) => matchesProductSearch({ ...option, name: option.productName }, query));
  const shown = matches.slice(0, MAX_RESULTS);
  const id = "promo-producto";
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        Producto <span className="text-destructive-strong" aria-hidden="true">*</span>
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground" aria-hidden="true" />
        <input
          id={id}
          type="search"
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Nombre, marca o categoría"
          data-autofocus
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-resultados${error ? ` ${id}-error` : ""}`}
          className={cn(controlClassName, "h-11 pl-9")}
        />
      </div>
      <p id={`${id}-resultados`} className="text-sm text-subtle-foreground" aria-live="polite">
        {matches.length === 0
          ? "No hay productos activos con ese nombre."
          : matches.length > MAX_RESULTS
            ? `Mostrando ${MAX_RESULTS} de ${matches.length}. Escribe para afinar la búsqueda.`
            : `${matches.length} ${matches.length === 1 ? "producto" : "productos"}`}
      </p>
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive-strong">
          {error}
        </p>
      )}
      {shown.length > 0 && (
        <ul aria-label="Resultados de productos" className="divide-y divide-border-subtle overflow-hidden rounded-lg border">
          {shown.map((option) => (
            <li key={option.branchProductId}>
              <button
                type="button"
                onClick={() => onSelect(option.branchProductId)}
                aria-label={`Elegir ${option.productName}${option.presentation ? ` ${option.presentation}` : ""}, precio normal ${formatCents(option.priceCents)}`}
                className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-background-secondary focus-visible:bg-primary-subtle"
              >
                <ProductImage imagePath={option.imagePath} alt="" variant="thumb" className="size-10 shrink-0 overflow-hidden rounded-md" />
                <OptionText option={option} showBranch={showBranch} />
                <span className="shrink-0 text-sm font-semibold tabular-nums">{formatCents(option.priceCents)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SelectedProduct({ option, showBranch, productInactive, onChange }: {
  option: PromotableOption;
  showBranch: boolean;
  productInactive: boolean;
  onChange?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <ProductImage imagePath={option.imagePath} alt="" variant="thumb" className="size-12 shrink-0 overflow-hidden rounded-md" />
      <div className="min-w-0 flex-1 space-y-1">
        <OptionText option={option} showBranch={showBranch} />
        <ProductFlags productInactive={productInactive} soldOut={!option.isAvailable} />
      </div>
      {onChange && (
        <Button variant="secondary" onClick={onChange} aria-label={`Cambiar producto (${option.productName})`}>
          Cambiar
        </Button>
      )}
    </div>
  );
}

function OptionText({ option, showBranch }: { option: PromotableOption; showBranch: boolean }) {
  const details = [option.presentation, option.brandName, showBranch ? option.branchName : null].filter(Boolean).join(" · ");
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium">{option.productName}</span>
      <span className="block truncate text-xs text-subtle-foreground">{details || `${option.categoryName} › ${option.subcategoryName}`}</span>
    </span>
  );
}

// Avisos del producto: no bloquean la promoción, pero el admin debe saberlo.
export function ProductFlags({ productInactive, soldOut }: { productInactive: boolean; soldOut: boolean }): ReactNode {
  if (!productInactive && !soldOut) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {productInactive && <Badge variant="neutral">Producto inactivo</Badge>}
      {soldOut && <Badge variant="warning">Agotado</Badge>}
    </span>
  );
}

export function PromotionReviewNote() {
  return (
    <WarningNote>
      <p>El precio normal bajó y esta promoción ya no es un descuento: la tienda la ignora. Corrige el precio promocional o desactívala.</p>
    </WarningNote>
  );
}
