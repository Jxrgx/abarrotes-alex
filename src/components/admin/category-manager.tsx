"use client";

import { FolderTree, Plus, Power, PowerOff } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { AdminCategory } from "@/lib/admin/catalog";
import { saveCategory, setCategoryActive } from "@/lib/admin/catalog-actions";
import { categoryFormSchema, parseCatalogForm, deactivationConsequence, matchesAdminSearch, nextSortOrder, plural } from "@/lib/admin/catalog-forms";

import { DeactivateDialog, useActiveToggle } from "./active-toggle";
import { ActiveBadge, AdminCard, AdminCardList, AdminTable, EmptyState, ListSummary, MetaList, NameCell, NoResults, SearchInput } from "./admin-list";
import { ActiveField, CatalogFormDialog, NameField, SortOrderField } from "./catalog-form";
import { RowActions } from "./row-actions";
import { useToast } from "./toast";

export function CategoryManager({ categories }: { categories: AdminCategory[] }) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<AdminCategory | "new" | null>(null);
  const toggle = useActiveToggle<AdminCategory>(setCategoryActive);

  const visible = categories.filter((category) => matchesAdminSearch(category.name, query));
  const current = editing === "new" ? null : editing;
  const create = () => setEditing("new");

  const actions = (category: AdminCategory) => (
    <RowActions
      name={category.name}
      onEdit={() => setEditing(category)}
      disabled={toggle.busyId === category.id}
      items={[
        category.isActive
          ? { label: "Desactivar", icon: PowerOff, onSelect: () => toggle.toggle(category) }
          : { label: "Activar", icon: Power, onSelect: () => toggle.toggle(category) },
      ]}
    />
  );

  return (
    <>
      {categories.length === 0 ? (
        <EmptyState
          icon={FolderTree}
          title="Aún no hay categorías."
          description="Las categorías son los pasillos de la tienda: Bebidas, Lácteos, Limpieza…"
          action={
            <Button onClick={create}>
              <Plus aria-hidden="true" />
              Crear primera categoría
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex gap-3">
            <SearchInput
              id="buscar-categorias"
              label="Buscar categorías"
              placeholder="Buscar por nombre"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="flex-1 sm:max-w-sm"
            />
            <Button onClick={create} className="ml-auto">
              <Plus aria-hidden="true" />
              <span>
                Nueva<span className="sr-only sm:not-sr-only"> categoría</span>
              </span>
            </Button>
          </div>

          <ListSummary total={categories.length} visible={visible.length} inactive={categories.filter((item) => !item.isActive).length} singular="categoría" plural="categorías" filtered={query.trim() !== ""} />

          {visible.length === 0 ? (
            <NoResults query={query} onClear={() => setQuery("")} />
          ) : (
            <>
              <AdminTable
                caption="Categorías"
                head={
                  <>
                    <th scope="col">Nombre</th>
                    <th scope="col" className="text-right">Subcategorías</th>
                    <th scope="col" className="text-right">Productos</th>
                    <th scope="col" className="text-right">Orden</th>
                    <th scope="col">Estado</th>
                    <th scope="col" className="text-right">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </>
                }
              >
                {visible.map((category) => (
                  <tr key={category.id} aria-busy={toggle.busyId === category.id} className="aria-busy:opacity-60">
                    <td className="max-w-72">
                      <NameCell name={category.name} slug={category.slug} muted={!category.isActive} />
                    </td>
                    <td className="text-right tabular-nums">{category.subcategoryCount}</td>
                    <td className="text-right tabular-nums">{category.productCount}</td>
                    <td className="text-right text-muted-foreground tabular-nums">{category.sortOrder}</td>
                    <td>
                      <ActiveBadge active={category.isActive} />
                    </td>
                    <td className="w-px">{actions(category)}</td>
                  </tr>
                ))}
              </AdminTable>

              <AdminCardList label="Categorías">
                {visible.map((category) => (
                  <AdminCard
                    key={category.id}
                    busy={toggle.busyId === category.id}
                    title={<NameCell name={category.name} slug={category.slug} muted={!category.isActive} />}
                    actions={actions(category)}
                  >
                    <MetaList>
                      <ActiveBadge active={category.isActive} />
                      <span>{plural(category.subcategoryCount, "subcategoría", "subcategorías")}</span>
                      <span>{plural(category.productCount, "producto", "productos")}</span>
                      <span className="tabular-nums">Orden {category.sortOrder}</span>
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
        title={current ? "Editar categoría" : "Nueva categoría"}
        submitLabel={current ? "Guardar cambios" : "Crear categoría"}
        action={saveCategory}
        validate={(formData) => parseCatalogForm(categoryFormSchema, formData)}
        hidden={current ? { id: current.id } : undefined}
      >
        {({ fieldErrors }) => (
          <>
            <NameField id="categoria-nombre" defaultValue={current?.name} currentSlug={current?.slug} error={fieldErrors.name} />
            <SortOrderField
              id="categoria-orden"
              defaultValue={current?.sortOrder ?? nextSortOrder(categories.map((item) => item.sortOrder))}
              error={fieldErrors.sortOrder}
            />
            <ActiveField
              id="categoria-activa"
              label="Activa"
              description="Visible en la tienda junto con sus subcategorías y productos."
              defaultChecked={current?.isActive ?? true}
              deactivationWarning={
                current &&
                deactivationConsequence("category", { subcategories: current.subcategoryCount, products: current.productCount }).map((line) => <p key={line}>{line}</p>)
              }
            />
          </>
        )}
      </CatalogFormDialog>

      <DeactivateDialog
        open={toggle.target !== null}
        title={`¿Desactivar “${toggle.target?.name ?? ""}”?`}
        confirmLabel="Desactivar categoría"
        pending={toggle.pending}
        error={toggle.error}
        onConfirm={toggle.confirm}
        onCancel={toggle.cancel}
      >
        {toggle.target &&
          deactivationConsequence("category", { subcategories: toggle.target.subcategoryCount, products: toggle.target.productCount }).map((line) => <p key={line}>{line}</p>)}
      </DeactivateDialog>
    </>
  );
}
