"use client";

import { BadgePercent, Plus, Power, PowerOff } from "lucide-react";
import { useState } from "react";

import { ProductImage } from "@/components/store/product-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { controlClassName } from "@/components/ui/field";
import { matchesProductSearch } from "@/lib/admin/product-forms";
import { setPromotionActive, savePromotion } from "@/lib/admin/promotion-actions";
import { parsePromotionForm, PROMOTION_STATUS, type PromotionStatus, promotionSavings, promotionStatus } from "@/lib/admin/promotion-forms";
import type { AdminPromotion } from "@/lib/admin/promotions";
import { formatBusinessDateTimeFull } from "@/lib/datetime";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";

import { DeactivateDialog, useActiveToggle } from "./active-toggle";
import { AdminCard, AdminCardList, AdminTable, EmptyState, MetaList, NoResults, SearchInput } from "./admin-list";
import { CatalogFormDialog } from "./catalog-form";
import { ProductFlags, type PromotableOption, PromotionFields, PromotionReviewNote } from "./promotion-form";
import { RowActions } from "./row-actions";
import { useToast } from "./toast";

type Row = AdminPromotion & { name: string; status: PromotionStatus };
type Editing = { promotion: AdminPromotion | null } | null;
const STATUS_FILTERS: { value: PromotionStatus | ""; label: string }[] = [
  { value: "", label: "Todos los estados" },
  { value: "active", label: "Vigentes" },
  { value: "scheduled", label: "Programadas" },
  { value: "expired", label: "Vencidas" },
  { value: "disabled", label: "Desactivadas" },
  { value: "review", label: "Requieren revisión" },
];

export function PromotionManager({ promotions, options, branches, nowIso }: {
  promotions: AdminPromotion[];
  /** Productos activos promocionables (branch_products). */
  options: PromotableOption[];
  branches: { id: string; name: string }[];
  /** "Ahora" del servidor: el estado se calcula igual para todos y sin desfase del navegador. */
  nowIso: string;
}) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<PromotionStatus | "">("");
  const [branch, setBranch] = useState("");
  const [editing, setEditing] = useState<Editing>(null);
  const toggle = useActiveToggle<Row>(setPromotionActive);
  const now = Date.parse(nowIso);
  const multiBranch = branches.length > 1;

  const rows: Row[] = promotions.map((promotion) => ({ ...promotion, name: promotion.productName, status: promotionStatus(promotion, now) }));
  const visible = rows.filter(
    (row) =>
      (!status || row.status === status) &&
      (!branch || row.branchId === branch) &&
      matchesProductSearch({ name: row.productName, brandName: row.brandName, categoryName: row.categoryName, subcategoryName: row.subcategoryName }, query),
  );
  const needReview = rows.filter((row) => row.status === "review").length;
  const create = () => setEditing({ promotion: null });

  const actions = (row: Row) => (
    <RowActions
      name={`la promoción de ${row.productName}`}
      onEdit={() => setEditing({ promotion: row })}
      disabled={toggle.busyId === row.id}
      items={[
        row.isActive
          ? { label: "Desactivar", icon: PowerOff, onSelect: () => toggle.toggle(row) }
          : { label: "Activar", icon: Power, onSelect: () => toggle.toggle(row) },
      ]}
    />
  );

  return (
    <>
      {promotions.length === 0 ? (
        <EmptyState
          icon={BadgePercent}
          title="Aún no hay promociones."
          description="Una promoción es un precio especial para un producto en una sucursal."
          action={
            <Button onClick={create}>
              <Plus aria-hidden="true" />
              Crear primera promoción
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex flex-1 gap-3">
              <SearchInput
                id="buscar-promociones"
                label="Buscar promociones"
                placeholder="Producto, marca o categoría"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="flex-1 sm:max-w-sm"
              />
              <Button onClick={create} className="sm:hidden">
                <Plus aria-hidden="true" />
                <span>
                  Nueva<span className="sr-only"> promoción</span>
                </span>
              </Button>
            </div>
            <div className={cn("grid gap-3", multiBranch ? "grid-cols-2 sm:flex" : "sm:flex")}>
              <FilterSelect id="filtro-estado-promo" label="Estado" value={status} onChange={(value) => setStatus(value as PromotionStatus | "")} className="sm:w-52">
                {STATUS_FILTERS.map((filter) => (
                  <option key={filter.value} value={filter.value}>
                    {filter.label}
                  </option>
                ))}
              </FilterSelect>
              {multiBranch && (
                <FilterSelect id="filtro-sucursal-promo" label="Sucursal" value={branch} onChange={setBranch} className="sm:w-48">
                  <option value="">Todas las sucursales</option>
                  {branches.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </FilterSelect>
              )}
            </div>
            <Button onClick={create} className="hidden sm:ml-auto sm:inline-flex">
              <Plus aria-hidden="true" />
              Nueva promoción
            </Button>
          </div>

          <p className="text-sm text-muted-foreground" aria-live="polite">
            {visible.length === rows.length ? `${rows.length} ${rows.length === 1 ? "promoción" : "promociones"}` : `${visible.length} de ${rows.length} promociones`}
            {needReview > 0 && (
              <>
                {" · "}
                <button type="button" onClick={() => setStatus("review")} className="inline-flex min-h-10 items-center font-medium text-warning-strong underline-offset-4 hover:underline">
                  {needReview} {needReview === 1 ? "requiere" : "requieren"} revisión
                </button>
              </>
            )}
          </p>

          {visible.length === 0 ? (
            <NoResults
              query={query}
              onClear={() => {
                setQuery("");
                setStatus("");
                setBranch("");
              }}
            />
          ) : (
            <>
              <AdminTable
                caption="Promociones"
                head={
                  <>
                    <th scope="col">Producto</th>
                    <th scope="col" className="text-right">Normal</th>
                    <th scope="col" className="text-right">Promoción</th>
                    <th scope="col" className="text-right">Ahorro</th>
                    <th scope="col">Vigencia</th>
                    <th scope="col">Estado</th>
                    <th scope="col" className="text-right">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </>
                }
              >
                {visible.map((row) => (
                  <tr key={row.id} aria-busy={toggle.busyId === row.id} className="aria-busy:opacity-60">
                    <td className="max-w-72">
                      <ProductCell row={row} multiBranch={multiBranch} />
                    </td>
                    <td className="text-right text-muted-foreground tabular-nums">{formatCents(row.priceCents)}</td>
                    <td className="text-right font-semibold tabular-nums">{formatCents(row.promoCents)}</td>
                    <td className="text-right tabular-nums">
                      <Savings row={row} />
                    </td>
                    <td className="max-w-56 text-xs text-muted-foreground">{formatWindow(row.startsAt, row.endsAt)}</td>
                    <td>
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="w-px">{actions(row)}</td>
                  </tr>
                ))}
              </AdminTable>

              <AdminCardList label="Promociones">
                {visible.map((row) => (
                  <AdminCard key={row.id} busy={toggle.busyId === row.id} title={<ProductCell row={row} multiBranch={multiBranch} />} actions={actions(row)}>
                    <div className="space-y-1.5 pl-[3.25rem]">
                      <p className="flex flex-wrap items-baseline gap-x-2 tabular-nums">
                        <span className="text-xs text-muted-foreground line-through">{formatCents(row.priceCents)}</span>
                        <span className="font-semibold">{formatCents(row.promoCents)}</span>
                        <Savings row={row} />
                      </p>
                      <p className="text-xs text-muted-foreground">{formatWindow(row.startsAt, row.endsAt)}</p>
                      <MetaList>
                        <StatusBadge status={row.status} />
                      </MetaList>
                    </div>
                  </AdminCard>
                ))}
              </AdminCardList>
            </>
          )}
        </div>
      )}

      <CatalogFormDialog
        open={editing !== null}
        size="lg"
        onClose={() => setEditing(null)}
        onSaved={(message) => {
          setEditing(null);
          toast(message);
        }}
        title={editing?.promotion ? "Editar promoción" : "Nueva promoción"}
        description={editing?.promotion ? "El producto no se puede cambiar: si te equivocaste, desactívala y crea otra." : undefined}
        submitLabel={editing?.promotion ? "Guardar cambios" : "Crear promoción"}
        action={savePromotion}
        validate={(formData) => parsePromotionForm(formData, Number(formData.get("normalPriceCents")) || null)}
        hidden={editing?.promotion ? { id: editing.promotion.id } : undefined}
      >
        {({ fieldErrors }) =>
          editing && (
            <>
              {editing.promotion && promotionStatus(editing.promotion, now) === "review" && <PromotionReviewNote />}
              <PromotionFields key={editing.promotion?.id ?? "nueva"} promotion={editing.promotion} options={options} showBranch={multiBranch} fieldErrors={fieldErrors} />
            </>
          )
        }
      </CatalogFormDialog>

      <DeactivateDialog
        open={toggle.target !== null}
        title="¿Desactivar la promoción?"
        confirmLabel="Desactivar promoción"
        pending={toggle.pending}
        error={toggle.error}
        onConfirm={toggle.confirm}
        onCancel={toggle.cancel}
        note="Podrás reactivarla después si sigue siendo un descuento y no se cruza con otra."
      >
        <p>
          Esta promoción dejará de aplicarse inmediatamente{toggle.target ? ` a ${toggle.target.productName}` : ""}.
        </p>
      </DeactivateDialog>
    </>
  );
}

function ProductCell({ row, multiBranch }: { row: Row; multiBranch: boolean }) {
  const details = [row.presentation, multiBranch ? row.branchName : null].filter(Boolean).join(" · ");
  return (
    <span className="flex min-w-0 items-center gap-3">
      <ProductImage imagePath={row.imagePath} alt="" variant="thumb" className="size-10 shrink-0 overflow-hidden rounded-lg" />
      <span className="min-w-0 space-y-1">
        <span className={cn("line-clamp-2 font-medium md:block md:truncate", !row.isActive && "text-muted-foreground")}>{row.productName}</span>
        {details && <span className="block truncate text-xs text-subtle-foreground">{details}</span>}
        <ProductFlags productInactive={!row.productActive} soldOut={!row.isAvailable} />
      </span>
    </span>
  );
}

function Savings({ row }: { row: Row }) {
  const savings = promotionSavings(row.priceCents, row.promoCents);
  if (!savings) return <span className="text-xs text-warning-strong">Sin descuento</span>;
  return (
    <span className="text-xs text-success-strong">
      −{formatCents(savings.cents)} <span className="text-subtle-foreground">({savings.percent}%)</span>
    </span>
  );
}

const STATUS_VARIANT = { success: "success", brand: "brand", neutral: "neutral", warning: "warning", danger: "danger" } as const;

function StatusBadge({ status }: { status: PromotionStatus }) {
  const info = PROMOTION_STATUS[status];
  return (
    <Badge variant={STATUS_VARIANT[info.tone]} title={info.help}>
      {info.label}
    </Badge>
  );
}

// "Sin fechas", "Desde …", "Hasta …" o "… – …" en hora de Mérida.
export function formatWindow(startsAt: string | null, endsAt: string | null) {
  if (!startsAt && !endsAt) return "Sin fechas (hasta desactivarla)";
  if (startsAt && !endsAt) return `Desde ${formatBusinessDateTimeFull(startsAt)}`;
  if (!startsAt && endsAt) return `Hasta ${formatBusinessDateTimeFull(endsAt)}`;
  return `${formatBusinessDateTimeFull(startsAt!)} – ${formatBusinessDateTimeFull(endsAt!)}`;
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
