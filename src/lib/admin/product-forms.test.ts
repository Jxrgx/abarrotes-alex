import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  matchesProductSearch,
  normalizePresentation,
  normalizePrice,
  parseProductForm,
  PRODUCT_UNITS,
  productMutationError,
  promotionWarning,
  SALE_TYPES,
} from "./product-forms";

const SUB = "11111111-1111-4111-8111-111111111111";
const BRAND = "22222222-2222-4222-8222-222222222222";
const BRANCH = "33333333-3333-4333-8333-333333333333";
const BRANCH2 = "44444444-4444-4444-8444-444444444444";

const form = (values: Record<string, string>) => {
  const data = new FormData();
  const base = { name: "Refresco de cola", categoryId: SUB, subcategoryId: SUB, brandId: BRAND, presentation: "600", unit: "ml", saleType: "unit", isActive: "on", [`price:${BRANCH}`]: "18.50", [`available:${BRANCH}`]: "true" };
  for (const [key, value] of Object.entries({ ...base, ...values })) if (value !== "__omit") data.set(key, value);
  return data;
};

describe("enums de la base", () => {
  test("unidades y tipos de venta salen de los tipos generados", () => {
    assert.deepEqual([...PRODUCT_UNITS], ["ml", "L", "g", "kg", "pieza"]);
    assert.deepEqual([...SALE_TYPES], ["unit", "weight"]);
  });
});

describe("precio", () => {
  test("normaliza a texto decimal de 2 cifras sin float", () => {
    assert.equal(normalizePrice("18.5"), "18.50");
    assert.equal(normalizePrice(" $1,234.5 "), "1234.50");
    assert.equal(normalizePrice("0"), "0.00");
    assert.equal(normalizePrice("007"), "7.00");
    assert.equal(normalizePrice("99999.99"), "99999.99");
  });
  test("rechaza negativos, 3 decimales, exponentes y montos > 99,999.99", () => {
    for (const bad of ["-1", "18.505", "1e3", "abc", "", "100000", "18,50", "1,23"]) assert.equal(normalizePrice(bad), null, bad);
  });
});

describe("presentación", () => {
  test("cantidad > 0 con hasta 3 decimales", () => {
    assert.equal(normalizePresentation("1.500"), "1.5");
    assert.equal(normalizePresentation("600"), "600");
    assert.equal(normalizePresentation("0"), null);
    assert.equal(normalizePresentation("1.2345"), null);
  });
});

describe("parseProductForm", () => {
  test("producto normal", () => {
    const result = parseProductForm(form({}));
    assert.ok(result.ok);
    assert.deepEqual(result.data, {
      id: undefined, name: "Refresco de cola", subcategoryId: SUB, brandId: BRAND, presentation: "600", unit: "ml",
      saleType: "unit", isFeatured: false, isActive: true, branches: [{ branchId: BRANCH, price: "18.50", isAvailable: true }],
    });
  });
  test("sin marca → brandId null; sin presentación → ambas null", () => {
    const result = parseProductForm(form({ brandId: "", unit: "", presentation: "__omit" }));
    assert.ok(result.ok);
    assert.equal(result.data.brandId, null);
    assert.equal(result.data.unit, null);
    assert.equal(result.data.presentation, null);
  });
  test("cada unidad del enum con su cantidad", () => {
    for (const [unit, presentation] of [["ml", "600"], ["L", "1.5"], ["g", "250"], ["kg", "1"], ["pieza", "12"]]) {
      const result = parseProductForm(form({ unit, presentation }));
      assert.ok(result.ok, unit);
      assert.equal(result.data.unit, unit);
    }
  });
  test("unidad sin cantidad y unidad inexistente", () => {
    let result = parseProductForm(form({ presentation: "" }));
    assert.ok(!result.ok);
    assert.equal(result.fieldErrors.presentation, "Escribe la cantidad (p. ej. 600).");
    result = parseProductForm(form({ unit: "litros" }));
    assert.ok(!result.ok);
    assert.ok(result.fieldErrors.unit);
  });
  test("venta por peso: sin restricción de unidad propia de la aplicación", () => {
    for (const [unit, presentation] of [["kg", "1"], ["g", "500"], ["ml", "600"], ["L", "1"], ["pieza", "12"], ["", "__omit"]]) {
      const result = parseProductForm(form({ saleType: "weight", unit, presentation }));
      assert.ok(result.ok, unit || "sin presentación");
      assert.equal(result.data.saleType, "weight");
    }
  });
  test("precio 0 permitido; disponibilidad agotado; destacado", () => {
    const result = parseProductForm(form({ [`price:${BRANCH}`]: "0", [`available:${BRANCH}`]: "false", isFeatured: "on" }));
    assert.ok(result.ok);
    assert.deepEqual(result.data.branches, [{ branchId: BRANCH, price: "0.00", isAvailable: false }]);
    assert.equal(result.data.isFeatured, true);
  });
  test("varias sucursales (multisucursal)", () => {
    const result = parseProductForm(form({ [`price:${BRANCH2}`]: "20", [`available:${BRANCH2}`]: "false" }));
    assert.ok(result.ok);
    assert.equal(result.data.branches.length, 2);
  });
  test("errores inline en español", () => {
    const result = parseProductForm(form({ name: "", subcategoryId: "", categoryId: "", [`price:${BRANCH}`]: "-3", isActive: "__omit" }));
    assert.ok(!result.ok);
    assert.equal(result.fieldErrors.name, "Escribe un nombre.");
    assert.equal(result.fieldErrors.subcategoryId, "Elige una subcategoría.");
    assert.equal(result.fieldErrors.categoryId, "Elige una categoría.");
    assert.match(result.fieldErrors[`price:${BRANCH}`] ?? "", /precio válido/);
    assert.equal(parseProductForm(form({ [`price:${BRANCH}`]: "" })).ok, false);
  });
  test("sin sucursales y con id malicioso", () => {
    assert.ok(!parseProductForm(form({ [`price:${BRANCH}`]: "__omit" })).ok);
    assert.ok(!parseProductForm(form({ id: "x' or 1=1" })).ok);
  });
});

describe("errores y avisos", () => {
  test("slug duplicado sin SQL", () => {
    assert.deepEqual(productMutationError("23505").fieldErrors, { name: "Ya existe un producto con ese nombre." });
    assert.equal(productMutationError(undefined).message, "No pudimos guardar los cambios. Inténtalo de nuevo.");
    assert.equal(productMutationError("42501").message, "No tienes permiso para realizar esta acción.");
  });
  test("promoción que deja de aplicar", () => {
    assert.equal(promotionWarning(1500, "14"), "Existe una promoción de $15.00. Con el nuevo precio de $14.00, esa promoción dejará de aplicarse.");
    assert.match(promotionWarning(1500, "15.00") ?? "", /dejará de aplicarse/);
    assert.equal(promotionWarning(1500, "18.50"), null);
    assert.equal(promotionWarning(null, "1"), null);
    assert.equal(promotionWarning(1500, "abc"), null);
  });
  test("búsqueda por nombre, marca, categoría y subcategoría (todas las palabras)", () => {
    const product = { name: "Leche entera", brandName: "Rancho Lindo", categoryName: "Lácteos", subcategoryName: "Leche" };
    assert.ok(matchesProductSearch(product, "lacteos"));
    assert.ok(matchesProductSearch(product, "rancho leche"));
    assert.ok(!matchesProductSearch(product, "rancho jugo"));
    assert.ok(matchesProductSearch({ ...product, brandName: null }, "entera"));
  });
});
