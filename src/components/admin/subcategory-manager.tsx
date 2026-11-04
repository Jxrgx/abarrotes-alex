"use client";

import { FolderTree, Layers, Plus, Power, PowerOff } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { controlClassName, Field, fieldDescribedBy } from "@/components/ui/field";
import type { AdminSubcategory, CategoryOption } from "@/lib/admin/catalog";
import { saveSubcategory, setSubcategoryActive } from "@/lib/admin/catalog-actions";
import { deactivationConsequence, matchesAdminSearch, nextSortOrder, parseCatalogForm, plural, subcategoryFormSchema } from "@/lib/admin/catalog-forms";
import { cn } from "@/lib/utils";

import { DeactivateDialog, useActiveToggle } from "./active-toggle";
import { ActiveBadge, AdminCard, AdminCardList, AdminTable, EmptyState, ListSummary, MetaList, NameCell, NoResults, SearchInput } from "./admin-list";
import { ActiveField, CatalogFormDialog, type FailedResult, NameField, SortOrderField, WarningNote } from "./catalog-form";
import { RowActions } from "./row-actions";
import { useToast } from "./toast";

export function SubcategoryManager({ subcategories, categories }: { subcategories: AdminSubcategory[]; categories: CategoryOption[] }) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [editing, setEditing] = useState<AdminSubcategory | "new" | null>(null);
  const toggle = useActiveToggle<AdminSubcategory>(setSubcategoryActive);

  const visible = subcategories.filter(
    (item) => (!categoryFilter || item.categoryId === categoryFilter) && matchesAdminSearch(item.name, query),
  );
  const current = editing === "new" ? null : editing;
  const create = () => setEditing("new");

  const actions = (item: AdminSubcategory) => (
    <RowActions
      name={item.name}
      onEdit={() => setEditing(item)}
      disabled={toggle.busyId === item.id}
      items={[
        item.isActive
          ? { label: "Desactivar", icon: PowerOff, onSelect: () => toggle.toggle(item) }
          : { label: "Activar", icon: Power, onSelect: () => toggle.toggle(item) },
      ]}
    />
  );

  if (categories.length === 0) {
    return (
      <EmptyState
        icon={FolderTree}
        title="Primero crea una categoría."
        description="Cada subcategoría pertenece a una categoría."
        action={
          <Link href="/admin/categorias" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover">
            Ir a Categorías
          </Link>
        }
      />
    );
  }

  // Orden sugerido: siguiente decena dentro de la categoría elegida en el filtro (o global).
  const suggestedOrder = nextSortOrder(
    subcategories.filter((item) => !categoryFilter || item.categoryId === categoryFilter).map((item) => item.sortOrder),
  );

  return (
    <>
      {subcategories.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Aún no hay subcategorías."
          description="Las subcategorías dividen cada categoría: Refrescos, Aguas, Jugos…"
          action={
            <Button onClick={create}>
              <Plus aria-hidden="true" />
              Crear primera subcategoría
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex flex-1 gap-3">
              <SearchInput
                id="buscar-subcategorias"
                label="Buscar subcategorías"
                placeholder="Buscar por nombre"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="flex-1 sm:max-w-sm"
              />
              <Button onClick={create} className="sm:hidden">
                <Plus aria-hidden="true" />
                Nueva<span className="sr-only"> subcategoría</span>
              </Button>
            </div>
            <div>
              <label htmlFor="filtro-categoria" className="sr-only">
                Filtrar por categoría
              </label>
              <select
                id="filtro-categoria"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className={cn(controlClassName, "h-10 sm:w-56")}
              >
                <option value="">Todas las categorías</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                    {category.isActive ? "" : " (inactiva)"}
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={create} className="hidden sm:inline-flex">
              <Plus aria-hidden="true" />
              Nueva subcategoría
            </Button>
          </div>

          <ListSummary
            total={subcategories.length}
            visible={visible.length}
            inactive={subcategories.filter((item) => !item.isActive).length}
            singular="subcategoría"
            plural="subcategorías"
            filtered={query.trim() !== "" || categoryFilter !== ""}
          />

          {visible.length === 0 ? (
            <NoResults
              query={query}
              onClear={() => {
                setQuery("");
                setCategoryFilter("");
              }}
            />
          ) : (
            <>
              <AdminTable
                caption="Subcategorías"
                head={
                  <>
                    <th scope="col">Nombre</th>
                    <th scope="col">Categoría</th>
                    <th scope="col" className="text-right">Productos</th>
                    <th scope="col" className="text-right">Orden</th>
                    <th scope="col">Estado</th>
                    <th scope="col" className="text-right">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </>
                }
              >
                {visible.map((item) => (
                  <tr key={item.id} aria-busy={toggle.busyId === item.id} className="aria-busy:opacity-60">
                    <td className="max-w-64">
                      <NameCell name={item.name} slug={item.slug} muted={!item.isActive} />
                    </td>
                    <td>
                      <ParentCategory item={item} />
                    </td>
                    <td className="text-right tabular-nums">{item.productCount}</td>
                    <td className="text-right text-muted-foreground tabular-nums">{item.sortOrder}</td>
                    <td>
                      <ActiveBadge active={item.isActive} />
                    </td>
                    <td className="w-px">{actions(item)}</td>
                  </tr>
                ))}
              </AdminTable>

              <AdminCardList label="Subcategorías">
                {visible.map((item) => (
                  <AdminCard
                    key={item.id}
                    busy={toggle.busyId === item.id}
                    title={<NameCell name={item.name} slug={item.slug} muted={!item.isActive} />}
                    actions={actions(item)}
                  >
                    <ParentCategory item={item} />
                    <MetaList>
                      <ActiveBadge active={item.isActive} />
                      <span>{plural(item.productCount, "producto", "productos")}</span>
                      <span className="tabular-nums">Orden {item.sortOrder}</span>
                    </MetaList>
                  </AdminCard>
                ))}
              </AdminCardList>
            </>
          )}
        </div>
      )}

      <CatalogFormDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSaved={(message) => {
          setEditing(null);
          toast(message);
        }}
        title={current ? "Editar subcategoría" : "Nueva subcategoría"}
        submitLabel={current ? "Guardar cambios" : "Crear subcategoría"}
        action={saveSubcategory}
        validate={(formData) => parseCatalogForm(subcategoryFormSchema, formData)}
        hidden={current ? { id: current.id } : undefined}
      >
        {({ fieldErrors, result }) => (
          <>
            <NameField id="subcategoria-nombre" defaultValue={current?.name} currentSlug={current?.slug} error={fieldErrors.name} />
            <CategoryField
              categories={categories}
              current={current}
              defaultCategoryId={current?.categoryId ?? categoryFilter}
              error={fieldErrors.categoryId}
              result={result}
            />
            <SortOrderField id="subcategoria-orden" defaultValue={current?.sortOrder ?? suggestedOrder} error={fieldErrors.sortOrder} />
            <ActiveField
              id="subcategoria-activa"
              label="Activa"
              description="Visible en la tienda (si su categoría también está activa)."
              defaultChecked={current?.isActive ?? true}
              deactivationWarning={
                current && deactivationConsequence("subcategory", { products: current.productCount }).map((line) => <p key={line}>{line}</p>)
              }
            />
          </>
        )}
      </CatalogFormDialog>

      <DeactivateDialog
        open={toggle.target !== null}
        title={`¿Desactivar “${toggle.target?.name ?? ""}”?`}
        confirmLabel="Desactivar subcategoría"
        pending={toggle.pending}
        error={toggle.error}
        onConfirm={toggle.confirm}
        onCancel={toggle.cancel}
      >
        {toggle.target && deactivationConsequence("subcategory", { products: toggle.target.productCount }).map((line) => <p key={line}>{line}</p>)}
      </DeactivateDialog>
    </>
  );
}

function ParentCategory({ item }: { item: AdminSubcategory }) {
  return (
    <span className="block text-sm">
      <span className="sr-only">Categoría: </span>
      {item.categoryName}
      {!item.categoryActive && <span className="block text-xs text-warning-strong">Categoría inactiva: no se ve en la tienda</span>}
    </span>
  );
}

// Categoría padre. Mover una subcategoría con productos mueve también sus productos
// (la categoría del producto se deriva): se advierte y se exige confirmación explícita.
// El servidor vuelve a comprobarlo con el conteo actual.
function CategoryField({ categories, current, defaultCategoryId, error, result }: {
  categories: CategoryOption[];
  current: AdminSubcategory | null;
  defaultCategoryId: string;
  error?: string;
  result: FailedResult | null;
}) {
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const id = "subcategoria-categoria";
  const selected = categories.find((category) => category.id === categoryId);
  const moving = current !== null && categoryId !== "" && categoryId !== current.categoryId;
  const productCount = result?.confirmMove?.productCount ?? current?.productCount ?? 0;
  const hint = selected && !selected.isActive ? "Esta categoría está inactiva: la subcategoría no se verá en la tienda hasta reactivarla." : undefined;

  return (
    <div className="space-y-2">
      <Field id={id} label="Categoría" required hint={hint} error={error}>
        <select
          id={id}
          name="categoryId"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={fieldDescribedBy(id, { hint, error })}
          className={cn(controlClassName, "h-11")}
        >
          <option value="" disabled>
            Elige una categoría
          </option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
              {category.isActive ? "" : " (inactiva)"}
            </option>
          ))}
        </select>
      </Field>

      {moving && productCount > 0 && (
        <WarningNote>
          <p>
            Esta subcategoría contiene {plural(productCount, "producto", "productos")}. Al cambiarla de categoría, {productCount === 1 ? "ese producto también pasará" : "esos productos también pasarán"} a{" "}
            <span className="font-semibold">{selected?.name}</span>.
          </p>
          <label className="flex cursor-pointer items-start gap-2.5 font-medium text-foreground">
            <input name="confirmMove" type="checkbox" className="mt-0.5 size-5 shrink-0 accent-primary" />
            <span>Sí, mover la subcategoría y sus productos</span>
          </label>
          {result?.confirmMove && (
            <p role="alert" className="font-medium text-destructive-strong">
              {result.message}
            </p>
          )}
        </WarningNote>
      )}
    </div>
  );
}
