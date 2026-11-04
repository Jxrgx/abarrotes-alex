import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { matchesWordStart, parseProductFocus, productFocusHref, searchTerms } from "./filters";
import {
  createLiveSearch,
  isLiveQuery,
  LIVE_SEARCH_MAX_RESULTS,
  liveResultHref,
  toSearchValue,
} from "./live-search";
import { LIVE_SEARCH_FIXTURE } from "./live-search.fixtures";
import { normalizeSearchText } from "./normalize";

const search = createLiveSearch(LIVE_SEARCH_FIXTURE);
const names = (query: string) => search(query).map((item) => [item.name, item.presentation].filter(Boolean).join(" "));

describe("normalización", () => {
  test("sin acentos ni mayúsculas, sin alterar el texto original", () => {
    const original = "Jabón Niño Pingüino";
    assert.equal(normalizeSearchText(original), "jabon nino pinguino");
    assert.equal(original, "Jabón Niño Pingüino");
  });
  test("puntuación como espacio para la búsqueda instantánea", () => {
    assert.equal(toSearchValue("Coca-Cola 1.75 L"), "coca cola 1 75 l");
  });
  test("mínimo 2 caracteres útiles", () => {
    assert.equal(isLiveQuery(""), false);
    assert.equal(isLiveQuery("c"), false);
    assert.equal(isLiveQuery(" c "), false);
    assert.equal(isLiveQuery("co"), true);
  });
});

describe("búsqueda instantánea (Fuse.js)", () => {
  test("vacío y 1 carácter no buscan", () => {
    assert.deepEqual(search(""), []);
    assert.deepEqual(search("c"), []);
  });
  test("2 caracteres ya buscan", () => {
    assert.ok(search("co").length > 0);
  });
  test("coca, cocacola, coca cola y cocacla encuentran Coca-Cola (sin ruido)", () => {
    for (const query of ["coca", "cocacola", "coca cola", "cocacla", "COCA-COLA"]) {
      const result = names(query);
      assert.ok(result.length >= 2, query);
      assert.ok(result.every((name) => name.startsWith("Coca-Cola")), `${query}: ${result.join(", ")}`);
    }
  });
  test("leche: productos de leche (máximo 6)", () => {
    const result = names("leche");
    assert.equal(result.length, LIVE_SEARCH_MAX_RESULTS);
    assert.ok(result.every((name) => name.startsWith("Leche")), result.join(", "));
  });
  test("por marca: lala", () => {
    assert.deepEqual(names("lala").sort(), ["Leche deslactosada 1 L", "Leche entera 1 L", "Yogur bebible de fresa 250 g"]);
  });
  test("sin acentos: jabon y JABÓN encuentran Jabón", () => {
    for (const query of ["jabon", "JABÓN"]) {
      assert.deepEqual(names(query), ["Jabón de tocador 150 g", "Jabón para trastes 750 ml"], query);
    }
  });
  test("japones y un error (japnes) encuentran Japonés", () => {
    assert.deepEqual(names("japones"), ["Cacahuate japonés a granel 1 kg"]);
    assert.deepEqual(names("japnes"), ["Cacahuate japonés a granel 1 kg"]);
  });
  test("por subcategoría: refrescos", () => {
    const result = search("refrescos");
    assert.ok(result.length >= 4 && result.every((item) => item.subcategory === "Refrescos"));
  });
  test("por categoría: lacteos encuentra Lácteos", () => {
    const result = search("lacteos");
    assert.ok(result.length > 0 && result.every((item) => item.category === "Lácteos"));
  });
  test("consultas cortas sin coincidencias lejanas", () => {
    assert.deepEqual(names("pan"), ["Pan blanco 680 g"]);
    assert.deepEqual(names("agua"), ["Agua natural 1.5 L"]);
  });
  test("sin resultados", () => {
    assert.deepEqual(search("xyz"), []);
  });
  test("incluye agotados y conserva precios de oferta", () => {
    assert.equal(search("mango")[0]?.isAvailable, false);
    const coca = search("coca").find((item) => item.presentation === "600 ml" && item.name === "Coca-Cola");
    assert.deepEqual([coca?.priceCents, coca?.promoPriceCents], [1800, 1500]);
  });
});

describe("navegación desde un resultado", () => {
  const coca = LIVE_SEARCH_FIXTURE[0];
  test("desde la home: solo el producto", () => {
    assert.equal(liveResultHref(coca, {}), `/productos?producto=${coca.id}`);
  });
  test("conserva filtros compatibles y el orden; descarta q", () => {
    assert.equal(
      liveResultHref(coca, { q: "coca", categoria: "bebidas", subcategoria: "refrescos", marca: "coca-cola", orden: "precio-asc" }),
      `/productos?categoria=bebidas&subcategoria=refrescos&marca=coca-cola&orden=precio-asc&producto=${coca.id}`,
    );
  });
  test("descarta filtros que excluirían al producto", () => {
    assert.equal(
      liveResultHref(coca, { categoria: "limpieza", subcategoria: "detergentes", marca: "brillex" }),
      `/productos?producto=${coca.id}`,
    );
    assert.equal(
      liveResultHref(coca, { categoria: "bebidas", subcategoria: "agua" }),
      `/productos?categoria=bebidas&producto=${coca.id}`,
    );
  });
  test("?producto solo acepta UUID", () => {
    assert.equal(parseProductFocus(coca.id.toUpperCase()), coca.id);
    assert.equal(parseProductFocus("no-es-uuid"), undefined);
    assert.equal(parseProductFocus(["x", coca.id]), undefined);
    assert.equal(productFocusHref({}, "abc"), "/productos?producto=abc");
  });
});

describe("búsqueda completa: términos sin acentos", () => {
  test("los términos se normalizan como products.search_name", () => {
    assert.deepEqual(searchTerms("JABÓN Japonés"), ["jabon", "japones"]);
  });
  test("categorías y marcas coinciden sin acentos, al inicio de palabra", () => {
    assert.ok(matchesWordStart("Lácteos", "lacteos"));
    assert.ok(matchesWordStart("Doña Galleta", "dona"));
    assert.ok(!matchesWordStart("Galletas de chocolate", "late"));
  });
});
