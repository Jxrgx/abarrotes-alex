"use client";

import { ChevronLeft, ChevronRight, Copy, PackageCheck, PackageX, Plus, Power, PowerOff, ShoppingBasket, Star } from "lucide-react";
import { useState, useTransition } from "react";

import { ProductImage } from "@/components/store/product-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { controlClassName } from "@/components/ui/field";
import { setProductActive, setProductAvailability, saveProduct } from "@/lib/admin/product-actions";
import { matchesProductSearch, validateProductSubmission } from "@/lib/admin/product-forms";
import type { AdminProduct, ProductFormOptions } from "@/lib/admin/products";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";

import { DeactivateDialog, useActiveToggle } from "./active-toggle";
import { ActiveBadge, AdminCard, AdminCardList, AdminTable, EmptyState, MetaList, NoResults, SearchInput } from "./admin-list";
import { CatalogFormDialog } from "./catalog-form";
import { type ProductFormMode, ProductFields } from "./product-form";
import { RowActions, type RowMenuItem } from "./row-actions";
import { useToast } from "./toast";

// Con 100–500 productos todo llega en una consulta y se filtra en memoria; solo se
// pagina lo que se RENDERIZA (50 filas) para que la tabla siga ligera.
export const PAGE_SIZE = 50;

type Editing = { mode: ProductFormMode; product: AdminProduct | null } | null;
type StatusFilter = "" | "active" | "inactive";
type AvailabilityFilter = "" | "available" | "soldout";

export function ProductManager({ products, options, branchId }: {
  products: AdminProduct[];
  options: ProductFormOptions;
  /** Sucursal cuyo precio y disponibilidad se muestran en el listado. */
  branchId: string | null;
}) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [availability, setAvailability] = useState<AvailabilityFilter>("");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Editing>(null);
  const toggle = useActiveToggle<AdminProduct>(setProductActive);
  const [, startAvailability] = useTransition();
  const [availabilityBusy, setAvailabilityBusy] = useState<string | null>(null);

  const priceOf = (product: AdminProduct) => (branchId ? product.prices[branchId] : undefined);
  const filtered = products.filter((product) => {
    const price = priceOf(product);
    return (
      matchesProductSearch(product, query) &&
      (!categoryFilter || product.categoryId === categoryFilter) &&
      (!status || (status === "active") === product.isActive) &&
      (!availability || (price !== undefined && (availability === "available") === price.isAvailable))
    );
  });
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const filtering = query.trim() !== "" || categoryFilter !== "" || status !== "" || availability !== "";
  const changeFilter = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(0);
  };

  function quickAvailability(product: AdminProduct) {
    const price = priceOf(product);
    if (!price) return;
    setAvailabilityBusy(product.id);
    startAvailability(async () => {
      try {
        const result = await setProductAvailability(price.id, !price.isAvailable);
        // Junto con los datos nuevos de la acción (ver CatalogFormDialog).
        startAvailability(() => toast(result.message, result.ok ? "success" : "error"));
      } catch {
        toast("No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.", "error");
      } finally {
        setAvailabilityBusy(null);
      }
    });
  }

  const busy = (product: AdminProduct) => toggle.busyId === product.id || availabilityBusy === product.id;
  const actions = (product: AdminProduct) => {
    const price = priceOf(product);
    const items: RowMenuItem[] = [{ label: "Duplicar", icon: Copy, onSelect: () => setEditing({ mode: "duplicate", product }) }];
    if (price) {
      items.push(
        price.isAvailable
          ? { label: "Marcar agotado", icon: PackageX, onSelect: () => quickAvailability(product) }
          : { label: "Marcar disponible", icon: PackageCheck, onSelect: () => quickAvailability(product) },
      );
    }
    items.push(
      product.isActive
        ? { label: "Desactivar", icon: PowerOff, onSelect: () => toggle.toggle(product) }
        : { label: "Activar", icon: Power, onSelect: () => toggle.toggle(product) },
    );
    return <RowActions name={product.name} onEdit={() => setEditing({ mode: "edit", product })} disabled={busy(product)} items={items} />;
  };

  const create = () => setEditing({ mode: "create", product: null });
  const source = editing?.product ?? null;
  const formTitle = { create: "Nuevo producto", edit: "Editar producto", duplicate: "Duplicar producto" }[editing?.mode ?? "create"];

  return (
    <>
      {products.length === 0 ? (
        <EmptyState
          icon={ShoppingBasket}
          title="Aún no hay productos."
          description="Cada producto tiene su precio y disponibilidad por sucursal."
          action={
            <Button onClick={create}>
              <Plus aria-hidden="true" />
              Crear primer producto
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 xl:flex-row">
            <div className="flex flex-1 gap-3">
              <SearchInput
                id="buscar-productos"
                label="Buscar productos"
                placeholder="Nombre, marca o categoría"
                value={query}
                onChange={(event) => changeFilter(setQuery)(event.target.value)}
                className="flex-1"
              />
              <Button onClick={create} className="xl:hidden">
                <Plus aria-hidden="true" />
                <span>
                  Nuevo<span className="sr-only sm:not-sr-only"> producto</span>
                </span>
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:flex">
              <FilterSelect id="filtro-categoria" label="Categoría" value={categoryFilter} onChange={changeFilter(setCategoryFilter)} className="col-span-2 sm:col-span-1 xl:w-48">
                <option value="">Todas las categorías</option>
                {options.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                    {category.isActive ? "" : " (inactiva)"}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect id="filtro-estado" label="Estado" value={status} onChange={changeFilter((value: string) => setStatus(value as StatusFilter))} className="xl:w-44">
                <option value="">Todos los estados</option>
                <option value="active">Solo activos</option>
                <option value="inactive">Solo inactivos</option>
              </FilterSelect>
              <FilterSelect id="filtro-disponibilidad" label="Disponibilidad" value={availability} onChange={changeFilter((value: string) => setAvailability(value as AvailabilityFilter))} className="xl:w-52">
                <option value="">Disponibilidad</option>
                <option value="available">Solo disponibles</option>
                <option value="soldout">Solo agotados</option>
              </FilterSelect>
            </div>
            <Button onClick={create} className="hidden xl:inline-flex">
              <Plus aria-hidden="true" />
              Nuevo producto
            </Button>
          </div>

          <p className="text-sm text-muted-foreground" aria-live="polite">
            {filtering ? `${filtered.length} de ${products.length} productos` : `${products.length} ${products.length === 1 ? "producto" : "productos"}`}
            {pages > 1 && ` · página ${currentPage + 1} de ${pages}`}
          </p>

          {filtered.length === 0 ? (
            <NoResults
              query={query}
              onClear={() => {
                setQuery("");
                setCategoryFilter("");
                setStatus("");
                setAvailability("");
                setPage(0);
              }}
            />
          ) : (
            <>
              <AdminTable
                caption="Productos"
                head={
                  <>
                    <th scope="col">Producto</th>
                    <th scope="col">Categoría</th>
                    <th scope="col" className="text-right">Precio</th>
                    <th scope="col">Disponibilidad</th>
                    <th scope="col">Estado</th>
                    <th scope="col" className="text-right">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </>
                }
              >
                {visible.map((product) => (
                  <tr key={product.id} aria-busy={busy(product)} className="aria-busy:opacity-60">
                    <td className="max-w-80">
                      <ProductCell product={product} />
                    </td>
                    <td className="max-w-48">
                      <span className="block truncate">{product.categoryName}</span>
                      <span className="block truncate text-xs text-subtle-foreground">{product.subcategoryName}</span>
                    </td>
                    <td className="text-right">
                      <PriceCell price={priceOf(product)} />
                    </td>
                    <td>
                      <AvailabilityBadge price={priceOf(product)} />
                    </td>
                    <td>
                      <ActiveBadge active={product.isActive} gender="m" />
                    </td>
                    <td className="w-px">{actions(product)}</td>
                  </tr>
                ))}
              </AdminTable>

              <AdminCardList label="Productos">
                {visible.map((product) => (
                  <AdminCard key={product.id} busy={busy(product)} title={<ProductCell product={product} />} actions={actions(product)}>
                    <div className="flex items-end justify-between gap-3 pl-[3.25rem]">
                      <div className="min-w-0 space-y-1.5">
                        <p className="truncate text-xs text-muted-foreground">
                          {product.categoryName} › {product.subcategoryName}
                        </p>
                        <MetaList>
                          <AvailabilityBadge price={priceOf(product)} />
                          <ActiveBadge active={product.isActive} gender="m" />
                        </MetaList>
                      </div>
                      <PriceCell price={priceOf(product)} />
                    </div>
                  </AdminCard>
                ))}
              </AdminCardList>

              {pages > 1 && (
                <nav aria-label="Páginas de productos" className="flex items-center justify-between gap-3">
                  <Button variant="secondary" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 0}>
                    <ChevronLeft aria-hidden="true" />
                    Anterior
                  </Button>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {currentPage * PAGE_SIZE + 1}–{Math.min(filtered.length, (currentPage + 1) * PAGE_SIZE)} de {filtered.length}
                  </span>
                  <Button variant="secondary" onClick={() => setPage(currentPage + 1)} disabled={currentPage >= pages - 1}>
                    Siguiente
                    <ChevronRight aria-hidden="true" />
                  </Button>
                </nav>
              )}
            </>
          )}
        </div>
      )}

      <CatalogFormDialog
        open={editing !== null}
        size="lg"
        onClose={() => setEditing(null)}
        onSaved={(message, warning) => {
          setEditing(null);
          toast(message);
          if (warning) toast(warning, "error");
        }}
        title={formTitle}
        description={editing?.mode === "duplicate" && source ? `Basado en «${source.name}». No se guarda hasta que pulses «Crear producto».` : undefined}
        submitLabel={editing?.mode === "edit" ? "Guardar cambios" : "Crear producto"}
        action={saveProduct}
        validate={validateProductSubmission}
        hidden={editing?.mode === "edit" && source ? { id: source.id } : editing?.mode === "duplicate" ? { mode: "duplicate" } : undefined}
      >
        {({ fieldErrors, pending }) => editing && <ProductFields mode={editing.mode} source={source} options={options} fieldErrors={fieldErrors} pending={pending} />}
      </CatalogFormDialog>

      <DeactivateDialog
        open={toggle.target !== null}
        title={`¿Desactivar “${toggle.target?.name ?? ""}”?`}
        confirmLabel="Desactivar producto"
        pending={toggle.pending}
        error={toggle.error}
        onConfirm={toggle.confirm}
        onCancel={toggle.cancel}
        note="Podrás reactivarlo en cualquier momento. No se borra ningún dato."
      >
        <p>El producto dejará de mostrarse en la tienda. Los pedidos anteriores conservarán su información.</p>
      </DeactivateDialog>
    </>
  );
}

// Miniatura + nombre; debajo presentación · marca y el indicador de destacado.
function ProductCell({ product }: { product: AdminProduct }) {
  const details = [product.presentation, product.brandName ?? "Sin marca"].filter(Boolean).join(" · ");
  return (
    <span className="flex min-w-0 items-center gap-3">
      <ProductImage imagePath={product.imagePath} alt="" variant="thumb" className="size-10 shrink-0 overflow-hidden rounded-lg" />
      <span className="min-w-0">
        <span className={cn("line-clamp-2 font-medium lg:block lg:truncate", !product.isActive && "text-muted-foreground")}>{product.name}</span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-subtle-foreground lg:flex-nowrap">
          <span className="lg:truncate">{details}</span>
          {product.isFeatured && (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-warning-strong">
              <Star className="size-3 fill-current" aria-hidden="true" />
              Destacado
            </span>
          )}
        </span>
      </span>
    </span>
  );
}

function PriceCell({ price }: { price: AdminProduct["prices"][string] | undefined }) {
  if (!price) return <span className="text-sm text-subtle-foreground">Sin precio</span>;
  const offer = price.promoCents !== null && price.promoCents < price.priceCents;
  return (
    <span className="block text-right whitespace-nowrap">
      <span className={cn("block font-semibold tabular-nums", offer && "text-sm font-medium text-subtle-foreground line-through")}>
        {offer && <span className="sr-only">Precio normal </span>}
        {formatCents(price.priceCents)}
      </span>
      {offer && (
        <span className="block font-semibold text-destructive-strong tabular-nums">
          <span className="text-xs font-medium">Oferta </span>
          {formatCents(price.promoCents!)}
        </span>
      )}
    </span>
  );
}

// Disponibilidad ≠ estado: "Agotado" se ve en la tienda pero no se puede comprar.
function AvailabilityBadge({ price }: { price: AdminProduct["prices"][string] | undefined }) {
  if (!price) return null;
  return price.isAvailable ? (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <PackageCheck className="size-3.5" aria-hidden="true" />
      Disponible
    </span>
  ) : (
    <Badge variant="warning">
      <PackageX aria-hidden="true" />
      Agotado
    </Badge>
  );
}

function FilterSelect({ id, label, value, onChange, className, children }: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className={cn(controlClassName, "h-10")}>
        {children}
      </select>
    </div>
  );
}
