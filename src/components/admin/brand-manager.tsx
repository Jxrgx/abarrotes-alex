"use client";

import { Plus, Power, PowerOff, Tag } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { AdminBrand } from "@/lib/admin/catalog";
import { saveBrand, setBrandActive } from "@/lib/admin/catalog-actions";
import { brandFormSchema, parseCatalogForm, deactivationConsequence, matchesAdminSearch, plural } from "@/lib/admin/catalog-forms";

import { DeactivateDialog, useActiveToggle } from "./active-toggle";
import { ActiveBadge, AdminCard, AdminCardList, AdminTable, EmptyState, ListSummary, MetaList, NameCell, NoResults, SearchInput } from "./admin-list";
import { ActiveField, CatalogFormDialog, NameField } from "./catalog-form";
import { RowActions } from "./row-actions";
import { useToast } from "./toast";

// Marcas: catálogo global, sin orden. La marca es OPCIONAL en los productos
// (no existe "Sin marca"); desactivarla no oculta productos (ver docs/admin.md).
export function BrandManager({ brands }: { brands: AdminBrand[] }) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<AdminBrand | "new" | null>(null);
  const toggle = useActiveToggle<AdminBrand>(setBrandActive);

  const visible = brands.filter((brand) => matchesAdminSearch(brand.name, query));
  const current = editing === "new" ? null : editing;
  const create = () => setEditing("new");

  const actions = (brand: AdminBrand) => (
    <RowActions
      name={brand.name}
      onEdit={() => setEditing(brand)}
      disabled={toggle.busyId === brand.id}
      items={[
        brand.isActive
          ? { label: "Desactivar", icon: PowerOff, onSelect: () => toggle.toggle(brand) }
          : { label: "Activar", icon: Power, onSelect: () => toggle.toggle(brand) },
      ]}
    />
  );

  return (
    <>
      {brands.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="Aún no hay marcas."
          description="La marca es opcional: los productos a granel o locales pueden no tenerla."
          action={
            <Button onClick={create}>
              <Plus aria-hidden="true" />
              Crear primera marca
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex gap-3">
            <SearchInput
              id="buscar-marcas"
              label="Buscar marcas"
              placeholder="Buscar por nombre"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="flex-1 sm:max-w-sm"
            />
            <Button onClick={create} className="ml-auto">
              <Plus aria-hidden="true" />
              <span>
                Nueva<span className="sr-only sm:not-sr-only"> marca</span>
              </span>
            </Button>
          </div>

          <ListSummary total={brands.length} visible={visible.length} inactive={brands.filter((item) => !item.isActive).length} singular="marca" plural="marcas" filtered={query.trim() !== ""} />

          {visible.length === 0 ? (
            <NoResults query={query} onClear={() => setQuery("")} />
          ) : (
            <>
              <AdminTable
                caption="Marcas"
                head={
                  <>
                    <th scope="col">Nombre</th>
                    <th scope="col" className="text-right">Productos</th>
                    <th scope="col">Estado</th>
                    <th scope="col" className="text-right">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </>
                }
              >
                {visible.map((brand) => (
                  <tr key={brand.id} aria-busy={toggle.busyId === brand.id} className="aria-busy:opacity-60">
                    <td className="max-w-80">
                      <NameCell name={brand.name} slug={brand.slug} muted={!brand.isActive} />
                    </td>
                    <td className="text-right tabular-nums">{brand.productCount}</td>
                    <td>
                      <ActiveBadge active={brand.isActive} />
                    </td>
                    <td className="w-px">{actions(brand)}</td>
                  </tr>
                ))}
              </AdminTable>

              <AdminCardList label="Marcas">
                {visible.map((brand) => (
                  <AdminCard
                    key={brand.id}
                    busy={toggle.busyId === brand.id}
                    title={<NameCell name={brand.name} slug={brand.slug} muted={!brand.isActive} />}
                    actions={actions(brand)}
                  >
                    <MetaList>
                      <ActiveBadge active={brand.isActive} />
                      <span>{plural(brand.productCount, "producto", "productos")}</span>
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
        title={current ? "Editar marca" : "Nueva marca"}
        submitLabel={current ? "Guardar cambios" : "Crear marca"}
        action={saveBrand}
        validate={(formData) => parseCatalogForm(brandFormSchema, formData)}
        hidden={current ? { id: current.id } : undefined}
      >
        {({ fieldErrors }) => (
          <>
            <NameField id="marca-nombre" defaultValue={current?.name} currentSlug={current?.slug} error={fieldErrors.name} />
            <ActiveField
              id="marca-activa"
              label="Activa"
              description="Aparece en el filtro de marcas y en las tarjetas de sus productos."
              defaultChecked={current?.isActive ?? true}
              deactivationWarning={current && deactivationConsequence("brand", { products: current.productCount }).map((line) => <p key={line}>{line}</p>)}
            />
          </>
        )}
      </CatalogFormDialog>

      <DeactivateDialog
        open={toggle.target !== null}
        title={`¿Desactivar “${toggle.target?.name ?? ""}”?`}
        confirmLabel="Desactivar marca"
        pending={toggle.pending}
        error={toggle.error}
        onConfirm={toggle.confirm}
        onCancel={toggle.cancel}
      >
        {toggle.target && deactivationConsequence("brand", { products: toggle.target.productCount }).map((line) => <p key={line}>{line}</p>)}
      </DeactivateDialog>
    </>
  );
}
