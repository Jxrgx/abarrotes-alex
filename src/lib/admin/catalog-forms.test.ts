import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { SLUG_PATTERN, slugify } from "../slug";
import {
  brandFormSchema,
  catalogMutationError,
  categoryFormSchema,
  deactivationConsequence,
  matchesAdminSearch,
  nextSortOrder,
  parseCatalogForm,
  subcategoryFormSchema,
  successMessage,
} from "./catalog-forms";

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
const CATEGORY_ID = "11111111-1111-4111-8111-111111111111";

describe("slugify", () => {
  test("ejemplos del negocio", () => {
    assert.equal(slugify("Lácteos"), "lacteos");
    assert.equal(slugify("Refrescos y bebidas"), "refrescos-y-bebidas");
    assert.equal(slugify("Doña María"), "dona-maria");
  });
  test("minúsculas, sin diacríticos, sin guiones repetidos ni en los extremos", () => {
    assert.equal(slugify("  PINGÜINOS  "), "pinguinos");
    assert.equal(slugify("Café & Té -- 100%"), "cafe-te-100");
    assert.equal(slugify("--Coca-Cola--"), "coca-cola");
    assert.equal(slugify("Jugos/Néctares (1.5 L)"), "jugos-nectares-1-5-l");
    assert.equal(slugify("!!!"), "");
  });
  test("siempre cumple el formato del CHECK de la base", () => {
    for (const name of ["Lácteos", "Ñoños 2", "a  b", "Ü-ber", "Botanas y dulces!"]) {
      assert.match(slugify(name), SLUG_PATTERN, name);
    }
  });
});

describe("validación de formularios", () => {
  test("categoría válida: nombre normalizado, orden entero, activa por checkbox", () => {
    const result = parseCatalogForm(categoryFormSchema, form({ name: "  Frutas   y verduras ", sortOrder: "30", isActive: "on" }));
    assert.ok(result.ok);
    assert.deepEqual(result.data, { id: undefined, name: "Frutas y verduras", sortOrder: 30, isActive: true });
  });
  test("checkbox ausente = inactiva; orden vacío = 0", () => {
    const result = parseCatalogForm(categoryFormSchema, form({ name: "Limpieza", sortOrder: "" }));
    assert.ok(result.ok);
    assert.equal(result.data.isActive, false);
    assert.equal(result.data.sortOrder, 0);
  });
  test("errores en español por campo", () => {
    let result = parseCatalogForm(categoryFormSchema, form({ name: "", sortOrder: "1.5" }));
    assert.ok(!result.ok);
    assert.equal(result.fieldErrors.name, "Escribe un nombre.");
    assert.equal(result.fieldErrors.sortOrder, "Escribe un número entero sin decimales.");
    result = parseCatalogForm(categoryFormSchema, form({ name: "x".repeat(61), sortOrder: "10000" }));
    assert.ok(!result.ok);
    assert.match(result.fieldErrors.name ?? "", /como máximo 60/);
    assert.match(result.fieldErrors.sortOrder ?? "", /entre 0 y 9999/);
    result = parseCatalogForm(categoryFormSchema, form({ name: "¿¡!?", sortOrder: "-5" }));
    assert.ok(!result.ok);
    assert.equal(result.fieldErrors.name, "El nombre debe incluir letras o números.");
    assert.ok(result.fieldErrors.sortOrder);
  });
  test("subcategoría: la categoría es obligatoria y debe ser un id válido", () => {
    let result = parseCatalogForm(subcategoryFormSchema, form({ name: "Refrescos", sortOrder: "10" }));
    assert.ok(!result.ok);
    assert.equal(result.fieldErrors.categoryId, "Elige una categoría.");
    result = parseCatalogForm(subcategoryFormSchema, form({ name: "Refrescos", categoryId: "bebidas" }));
    assert.ok(!result.ok);
    assert.equal(result.fieldErrors.categoryId, "Elige una categoría.");
    const ok = parseCatalogForm(subcategoryFormSchema, form({ name: "Refrescos", categoryId: CATEGORY_ID, confirmMove: "on", isActive: "on" }));
    assert.ok(ok.ok);
    assert.equal(ok.data.confirmMove, true);
    assert.equal(ok.data.categoryId, CATEGORY_ID);
  });
  test("id: vacío = alta; si viene debe ser UUID", () => {
    assert.ok(parseCatalogForm(brandFormSchema, form({ name: "Burbuja", id: "" })).ok);
    const invalid = parseCatalogForm(brandFormSchema, form({ name: "Burbuja", id: "1 or 1=1" }));
    assert.ok(!invalid.ok);
  });
  test("marca: sin orden ni categoría", () => {
    const result = parseCatalogForm(brandFormSchema, form({ name: "Doña María", isActive: "on" }));
    assert.ok(result.ok);
    assert.deepEqual(result.data, { id: undefined, name: "Doña María", isActive: true });
  });
});

describe("errores de la base → mensajes amigables", () => {
  test("slug duplicado (23505) por entidad, junto al nombre", () => {
    assert.deepEqual(catalogMutationError("category", "23505"), {
      message: "Ya existe una categoría con ese nombre.",
      fieldErrors: { name: "Ya existe una categoría con ese nombre." },
    });
    assert.equal(catalogMutationError("brand", "23505").message, "Ya existe una marca con ese nombre.");
    assert.equal(catalogMutationError("subcategory", "23505").message, "Ya existe una subcategoría con ese nombre en esta categoría.");
  });
  test("RLS, FK y desconocidos sin detalles internos", () => {
    assert.equal(catalogMutationError("brand", "42501").message, "No tienes permiso para realizar esta acción.");
    assert.ok(catalogMutationError("subcategory", "23503").fieldErrors?.categoryId);
    for (const code of [undefined, "PGRST301", "XX000"]) {
      const { message } = catalogMutationError("category", code);
      assert.equal(message, "No pudimos guardar los cambios. Inténtalo de nuevo.");
    }
  });
  test("mensajes de éxito", () => {
    assert.equal(successMessage("category", "created"), "Categoría creada");
    assert.equal(successMessage("subcategory", "updated"), "Subcategoría actualizada");
    assert.equal(successMessage("brand", "deactivated"), "Marca desactivada");
    assert.equal(successMessage("brand", "activated"), "Marca activada");
  });
});

describe("consecuencias de desactivar", () => {
  test("categoría con contenido: se oculta todo, nada se desactiva en cascada", () => {
    const lines = deactivationConsequence("category", { subcategories: 3, products: 12 });
    assert.match(lines[0], /3 subcategorías y 12 productos/);
    assert.match(lines[1], /no se desactivan/);
    assert.equal(deactivationConsequence("category", { subcategories: 0, products: 0 }).length, 1);
  });
  test("subcategoría con productos", () => {
    assert.match(deactivationConsequence("subcategory", { products: 1 })[0], /1 producto\) dejarán de mostrarse públicamente/);
  });
  test("marca: los productos siguen a la venta (RLS no los oculta)", () => {
    assert.match(deactivationConsequence("brand", { products: 2 })[1], /2 productos seguirán a la venta/);
    assert.match(deactivationConsequence("brand", { products: 1 })[1], /Su producto seguirá a la venta/);
  });
});

describe("utilidades del listado", () => {
  test("orden sugerido: siguiente decena", () => {
    assert.equal(nextSortOrder([]), 10);
    assert.equal(nextSortOrder([10, 20, 30]), 40);
    assert.equal(nextSortOrder([15]), 20);
    assert.equal(nextSortOrder([9999]), 9999);
  });
  test("búsqueda por nombre sin acentos ni mayúsculas", () => {
    assert.ok(matchesAdminSearch("Lácteos", "lacte"));
    assert.ok(matchesAdminSearch("Doña Galleta", "DONA"));
    assert.ok(matchesAdminSearch("Bebidas", "  "));
    assert.ok(!matchesAdminSearch("Bebidas", "leche"));
  });
});
