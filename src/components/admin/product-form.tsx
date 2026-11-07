"use client";

import { ImagePlus, Info, RefreshCw, Trash2, Undo2 } from "lucide-react";
import { type ChangeEvent, type ReactNode, useEffect, useRef, useState } from "react";

import { ProductImage } from "@/components/store/product-image";
import { controlClassName, Field, fieldDescribedBy } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import type { FieldErrors } from "@/lib/admin/catalog-forms";
import { IMAGE_ACCEPTED_TYPES, type ImageAction, validateImageFile } from "@/lib/admin/image-rules";
import {
  normalizePresentation,
  PRODUCT_NAME_MAX,
  PRODUCT_UNITS,
  type ProductUnit,
  priceToCents,
  promotionWarning,
  SALE_TYPE_LABELS,
  SALE_TYPES,
  type SaleType,
  UNIT_LABELS,
} from "@/lib/admin/product-forms";
import type { AdminProduct, ProductFormOptions } from "@/lib/admin/products";
import { formatPresentation } from "@/lib/format";
import { slugify } from "@/lib/slug";
import { cn } from "@/lib/utils";

import { WHOLESALE_MESSAGES } from "@/lib/admin/wholesale-forms";

import { ActiveField, WarningNote } from "./catalog-form";
import { WholesaleEditor } from "./wholesale-editor";

export type ProductFormMode = "create" | "edit" | "duplicate";

const WEIGHT_NOTE =
  "Actualmente la tienda vende este producto por unidades completas de su presentación. Las cantidades fraccionarias se habilitarán en una fase futura.";

// Campos del formulario de producto. Solo estado de UX (selects dependientes,
// avisos); la validación real la repite la Server Action.
export function ProductFields({ mode, source, options, fieldErrors, pending = false }: {
  mode: ProductFormMode;
  /** Producto a editar o a duplicar; null en alta. */
  source: AdminProduct | null;
  options: ProductFormOptions;
  fieldErrors: FieldErrors;
  pending?: boolean;
}) {
  const editing = mode === "edit";
  const [name, setName] = useState(mode === "duplicate" && source ? `Copia de ${source.name}` : (source?.name ?? ""));
  const [categoryId, setCategoryId] = useState(source?.categoryId ?? "");
  const [subcategoryId, setSubcategoryId] = useState(source?.subcategoryId ?? "");
  const [unit, setUnit] = useState<ProductUnit | "">(source?.unit ?? "");
  const [presentation, setPresentation] = useState(source?.presentationValue ?? "");
  const [saleType, setSaleType] = useState<SaleType>(source?.saleType ?? "unit");

  // Activas, más la selección actual aunque hoy esté inactiva (no se pierde la relación).
  const categories = options.categories.filter((item) => item.isActive || item.id === source?.categoryId);
  const subcategories = options.subcategories.filter(
    (item) => item.categoryId === categoryId && (item.isActive || item.id === source?.subcategoryId),
  );
  const brands = options.brands.filter((item) => item.isActive || item.id === source?.brandId);
  // Sucursales activas y las que ya tienen precio para este producto (multisucursal).
  const branches = options.branches.filter((branch) => branch.isActive || source?.prices[branch.id]);
  // Precio normal por sucursal (lo comparten la fila de precio y el editor de mayoreo).
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(branches.map((branch) => [branch.id, source?.prices[branch.id]?.price ?? ""])),
  );
  const savedTiers = branches.reduce((total, branch) => total + (source?.prices[branch.id]?.wholesale.length ?? 0), 0);

  const slug = slugify(name);
  const slugChanges = editing && source && slug && slug !== source.slug;
  const normalizedPresentation = normalizePresentation(presentation);
  const preview = unit && normalizedPresentation ? formatPresentation(Number(normalizedPresentation), unit) : null;
  const nameHint = slug ? (
    slugChanges ? (
      <>
        El identificador en enlaces cambiará de <Strong>{source.slug}</Strong> a <Strong>{slug}</Strong>.
      </>
    ) : (
      <>
        Identificador en enlaces: <Strong>{slug}</Strong>
      </>
    )
  ) : (
    "El identificador para enlaces se genera a partir del nombre."
  );

  return (
    <>
      <Section title="Información">
        <Field id="producto-nombre" label="Nombre" required hint={nameHint} error={fieldErrors.name}>
          <input
            id="producto-nombre"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={PRODUCT_NAME_MAX}
            autoComplete="off"
            required
            data-autofocus
            aria-invalid={fieldErrors.name ? true : undefined}
            aria-describedby={fieldDescribedBy("producto-nombre", { hint: nameHint, error: fieldErrors.name })}
            className={cn(controlClassName, "h-11")}
          />
        </Field>
      </Section>

      <Section title="Imagen del producto">
        {/* Duplicar no copia la imagen: la copia empieza sin foto. */}
        <ProductImageField
          productName={name.trim() || "el producto"}
          currentPath={editing ? (source?.imagePath ?? null) : null}
          error={fieldErrors.image}
          pending={pending}
        />
      </Section>

      <Section title="Clasificación" description="La categoría se obtiene de la subcategoría.">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="producto-categoria"
            name="categoryId"
            label="Categoría"
            required
            value={categoryId}
            onChange={(value) => {
              setCategoryId(value);
              setSubcategoryId("");
            }}
            error={fieldErrors.categoryId}
            placeholder="Elige una categoría"
            options={categories.map((item) => ({ value: item.id, label: item.isActive ? item.name : `${item.name} (inactiva)` }))}
          />
          <SelectField
            id="producto-subcategoria"
            name="subcategoryId"
            label="Subcategoría"
            required
            value={subcategoryId}
            onChange={setSubcategoryId}
            error={fieldErrors.subcategoryId}
            placeholder={categoryId ? "Elige una subcategoría" : "Primero elige una categoría"}
            disabled={!categoryId}
            options={subcategories.map((item) => ({ value: item.id, label: item.isActive ? item.name : `${item.name} (inactiva)` }))}
          />
        </div>
        <SelectField
          id="producto-marca"
          name="brandId"
          label="Marca"
          defaultValue={source?.brandId ?? ""}
          error={fieldErrors.brandId}
          hint="Los productos a granel o locales pueden no tener marca."
          options={[
            { value: "", label: "Sin marca" },
            ...brands.map((item) => ({ value: item.id, label: item.isActive ? item.name : `${item.name} (inactiva)` })),
          ]}
        />
      </Section>

      <Section title="Presentación y venta">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 sm:grid-cols-[10rem_12rem]">
          <Field
            id="producto-cantidad"
            label="Cantidad"
            required={unit !== ""}
            error={fieldErrors.presentation}
          >
            <input
              id="producto-cantidad"
              name="presentation"
              inputMode="decimal"
              autoComplete="off"
              value={unit ? presentation : ""}
              onChange={(event) => setPresentation(event.target.value)}
              disabled={!unit}
              placeholder={unit ? "600" : "—"}
              aria-invalid={fieldErrors.presentation ? true : undefined}
              aria-describedby={fieldDescribedBy("producto-cantidad", { error: fieldErrors.presentation })}
              className={cn(controlClassName, "h-11 tabular-nums disabled:bg-background-secondary")}
            />
          </Field>
          <SelectField
            id="producto-unidad"
            name="unit"
            label="Unidad"
            required
            value={unit}
            onChange={(value) => setUnit(value as ProductUnit | "")}
            error={fieldErrors.unit}
            options={[{ value: "", label: "Sin presentación" }, ...PRODUCT_UNITS.map((value) => ({ value, label: UNIT_LABELS[value] }))]}
          />
        </div>
        <p className="-mt-2 text-sm text-subtle-foreground">
          {preview ? (
            <>
              Se mostrará como <Strong>{preview}</Strong>.
            </>
          ) : (
            "Ejemplos: 600 ml, 1.5 L, 250 g, 1 kg, 12 piezas."
          )}
        </p>

        <fieldset aria-describedby={saleType === "weight" ? "producto-venta-nota" : undefined}>
          <legend className="mb-1.5 text-sm font-medium">Tipo de venta</legend>
          <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
            {SALE_TYPES.map((value) => (
              <ChoiceCard key={value} name="saleType" value={value} checked={saleType === value} onChange={() => setSaleType(value)}>
                {SALE_TYPE_LABELS[value]}
              </ChoiceCard>
            ))}
          </div>
          {fieldErrors.saleType && <p className="mt-1.5 text-sm text-destructive-strong">{fieldErrors.saleType}</p>}
          {saleType === "weight" && (
            <div id="producto-venta-nota" className="mt-2 flex items-start gap-2 rounded-lg bg-background-secondary p-3 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>{WEIGHT_NOTE}</p>
            </div>
          )}
        </fieldset>
      </Section>

      <Section title="Precio y disponibilidad" description={editing ? "Los pedidos anteriores conservarán el precio con el que fueron realizados." : undefined}>
        {branches.length === 0 ? (
          <p className="text-sm text-destructive-strong">No hay sucursales activas. Activa una sucursal antes de crear productos.</p>
        ) : (
          <ul className="space-y-3">
            {branches.map((branch) => (
              <BranchPriceRow
                key={branch.id}
                branch={branch}
                price={source?.prices[branch.id]}
                value={prices[branch.id] ?? ""}
                onValueChange={(value) => setPrices((current) => ({ ...current, [branch.id]: value }))}
                error={fieldErrors[`price:${branch.id}`]}
              />
            ))}
          </ul>
        )}
        {fieldErrors.branches && <p className="text-sm text-destructive-strong">{fieldErrors.branches}</p>}
      </Section>

      <Section title="Precios por mayoreo" description="Define precios especiales según la cantidad comprada.">
        {saleType === "weight" ? (
          <>
            <div className="flex items-start gap-2 rounded-lg bg-background-secondary p-3 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>{WHOLESALE_MESSAGES.weight} La venta por peso tendrá sus propias reglas en una fase futura.</p>
            </div>
            {editing && savedTiers > 0 && (
              <WarningNote>
                Al guardar como venta por peso se eliminarán {savedTiers === 1 ? "el precio" : `los ${savedTiers} precios`} por mayoreo de este producto.
              </WarningNote>
            )}
          </>
        ) : (
          branches.map((branch) => (
            <WholesaleEditor
              key={branch.id}
              branchId={branch.id}
              branchName={branches.length > 1 ? branch.name : undefined}
              normalPrice={prices[branch.id] ?? ""}
              initial={mode === "create" ? [] : (source?.prices[branch.id]?.wholesale ?? [])}
              keepIds={editing}
              fieldErrors={fieldErrors}
            />
          ))
        )}
      </Section>

      <Section title="Visibilidad">
        <ActiveField
          id="producto-activo"
          label="Activo"
          description="Se muestra en la tienda. Si está agotado se ve, pero no se puede comprar."
          defaultChecked={mode === "duplicate" ? true : (source?.isActive ?? true)}
          deactivationWarning={editing ? <p>El producto dejará de mostrarse en la tienda. Los pedidos anteriores conservarán su información.</p> : undefined}
        />
        <ActiveField
          id="producto-destacado"
          name="isFeatured"
          label="Destacado"
          description="Aparece en «Productos destacados» del inicio de la tienda."
          defaultChecked={mode === "edit" ? (source?.isFeatured ?? false) : false}
        />
      </Section>
    </>
  );
}

// Precio + Disponible/Agotado de una sucursal. Una fila por sucursal: hoy hay una.
function BranchPriceRow({ branch, price, value, onValueChange, error }: {
  branch: ProductFormOptions["branches"][number];
  price: AdminProduct["prices"][string] | undefined;
  value: string;
  onValueChange: (value: string) => void;
  error?: string;
}) {
  const [available, setAvailable] = useState(price?.isAvailable ?? true);
  const id = `precio-${branch.id}`;
  const cents = priceToCents(value);
  const promo = promotionWarning(price?.promoCents ?? null, value);

  return (
    <li className="space-y-3 rounded-lg border p-3">
      <p className="text-sm font-semibold">
        {branch.name}
        {!branch.isActive && <span className="font-normal text-subtle-foreground"> (inactiva)</span>}
      </p>
      <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <Field id={id} label="Precio" required error={error}>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-subtle-foreground" aria-hidden="true">
              $
            </span>
            <input
              id={id}
              name={`price:${branch.id}`}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={value}
              onChange={(event) => onValueChange(event.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={fieldDescribedBy(id, { error })}
              className={cn(controlClassName, "h-11 pr-14 pl-7 tabular-nums")}
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-subtle-foreground" aria-hidden="true">
              MXN
            </span>
          </div>
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Disponibilidad</legend>
          <div className="grid grid-cols-2 gap-2">
            <ChoiceCard name={`available:${branch.id}`} value="true" checked={available} onChange={() => setAvailable(true)}>
              Disponible
            </ChoiceCard>
            <ChoiceCard name={`available:${branch.id}`} value="false" checked={!available} onChange={() => setAvailable(false)}>
              Agotado
            </ChoiceCard>
          </div>
        </fieldset>
      </div>
      {!available && <p className="text-sm text-muted-foreground">Se muestra en la tienda como «Agotado» y no se puede agregar al carrito.</p>}
      {cents === 0 && <WarningNote>Este producto aparecerá con precio $0.00.</WarningNote>}
      {promo && <WarningNote>{promo}</WarningNote>}
    </li>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-4 border-b border-border-subtle pb-5 last:border-0 last:pb-0">
      <div>
        <h3 className="text-base font-semibold">{title}</h3>
        {description && <p className="text-sm text-subtle-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Strong({ children }: { children: ReactNode }) {
  return <span className="font-medium text-muted-foreground">{children}</span>;
}

// Opción tipo tarjeta (radio nativo): 44px, foco visible, seleccionada con borde de marca.
function ChoiceCard({ name, value, checked, onChange, children }: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors duration-150 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring",
        checked ? "border-primary bg-primary-soft text-primary-dark" : "border-input hover:bg-accent",
      )}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="size-4 accent-primary" />
      {children}
    </label>
  );
}

type SelectFieldProps = {
  id: string;
  name: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
  options: { value: string; label: string }[];
} & ({ value: string; onChange: (value: string) => void; defaultValue?: never } | { defaultValue: string; value?: never; onChange?: never });

function SelectField({ id, name, label, required = false, hint, error, placeholder, disabled, options, ...control }: SelectFieldProps) {
  return (
    <Field id={id} label={label} required={required} hint={hint} error={error}>
      <select
        id={id}
        name={name}
        disabled={disabled}
        {...("value" in control && control.value !== undefined
          ? { value: control.value, onChange: (event) => control.onChange?.(event.target.value) }
          : { defaultValue: control.defaultValue })}
        aria-invalid={error ? true : undefined}
        aria-describedby={fieldDescribedBy(id, { hint, error })}
        className={cn(controlClassName, "h-11 disabled:bg-background-secondary disabled:text-subtle-foreground")}
      >
        {placeholder !== undefined && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

// Imagen del producto: vista previa LOCAL (object URL, sin subir nada) y la
// intención (keep | replace | remove) viaja con el formulario. La subida ocurre solo
// al guardar el producto, en el servidor (sharp → Storage → image_path).
function ProductImageField({ productName, currentPath, error, pending }: {
  productName: string;
  currentPath: string | null;
  error?: string;
  pending: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Libera el object URL al cambiar de vista previa o al cerrar el formulario.
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const action: ImageAction = file ? "replace" : removed && currentPath ? "remove" : "keep";
  const hasImage = Boolean(file) || (Boolean(currentPath) && !removed);
  const message = localError ?? error;
  const id = "producto-imagen";

  function clearInput() {
    if (inputRef.current) inputRef.current.value = "";
  }

  function onSelect(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    const problem = validateImageFile(selected);
    if (problem) {
      setLocalError(problem);
      clearInput();
      return;
    }
    setLocalError(null);
    setFile(selected);
    setRemoved(false);
    setPreview(URL.createObjectURL(selected));
  }

  function onRemove() {
    setLocalError(null);
    if (file) {
      // Descarta la selección: vuelve a la imagen guardada (si hay).
      setFile(null);
      setPreview(null);
      clearInput();
    } else {
      setRemoved(true);
    }
  }

  const status = pending && action === "replace"
    ? "Guardando imagen…"
    : action === "replace"
      ? "Imagen nueva: se guardará al guardar el producto."
      : action === "remove"
        ? "La imagen se eliminará al guardar el producto."
        : currentPath
          ? "Imagen actual."
          : "Sin imagen: la tienda muestra un ícono genérico.";

  return (
    <div className="flex items-start gap-4">
      <div className="relative size-24 shrink-0 overflow-hidden rounded-lg border bg-background-secondary">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:), next/image no aplica
          <img src={preview} alt={`Vista previa de la nueva imagen de ${productName}`} className="size-full object-contain p-1" />
        ) : (
          <ProductImage
            imagePath={removed ? null : currentPath}
            alt={currentPath && !removed ? `Imagen actual de ${productName}` : ""}
            variant="thumb"
            className="size-24"
          />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <input
          ref={inputRef}
          id={id}
          name="image"
          type="file"
          accept={IMAGE_ACCEPTED_TYPES.join(",")}
          onChange={onSelect}
          disabled={pending}
          tabIndex={-1}
          aria-describedby={`${id}-estado${message ? ` ${id}-error` : ""}`}
          className="sr-only"
        />
        <input type="hidden" name="imageAction" value={action} />
        <p id={`${id}-estado`} className="text-sm text-muted-foreground" aria-live="polite">
          {status} <span className="text-subtle-foreground">JPG, PNG o WebP. Máximo 10 MB.</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {hasImage ? (
            <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={pending} aria-label={`Cambiar imagen de ${productName}`}>
              <RefreshCw aria-hidden="true" />
              Cambiar
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={pending}>
              <ImagePlus aria-hidden="true" />
              Seleccionar imagen
            </Button>
          )}
          {file ? (
            <Button variant="ghost" onClick={onRemove} disabled={pending} aria-label={`Descartar la imagen nueva de ${productName}`}>
              <Undo2 aria-hidden="true" />
              Descartar
            </Button>
          ) : (
            hasImage && (
              <Button variant="ghost" onClick={onRemove} disabled={pending} aria-label={`Eliminar imagen de ${productName}`}>
                <Trash2 aria-hidden="true" />
                Eliminar
              </Button>
            )
          )}
          {removed && !file && (
            <Button variant="ghost" onClick={() => setRemoved(false)} disabled={pending}>
              <Undo2 aria-hidden="true" />
              Deshacer
            </Button>
          )}
        </div>
        {message && (
          <p id={`${id}-error`} role="alert" className="text-sm text-destructive-strong">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
