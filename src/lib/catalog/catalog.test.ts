import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { catalogHref, matchesWordStart, parseCatalogPage, parseCatalogParams, sanitizeSearch, searchTerms } from "./filters";
import { paginationItems } from "./pagination";

const render = (current: number, total: number) =>
  paginationItems(current, total)
    .map((item) => (item.type === "page" ? String(item.page) : "…"))
    .join(" ");

describe("paginationItems (escritorio)", () => {
  test("una página o ninguna → sin paginación", () => {
    assert.deepEqual(paginationItems(1, 0), []);
    assert.deepEqual(paginationItems(1, 1), []);
  });
  test("7 páginas o menos → todas", () => {
    assert.equal(render(3, 7), "1 2 3 4 5 6 7");
  });
  test("muchas páginas → ventana con elipsis (nunca 42 botones)", () => {
    assert.equal(render(1, 42), "1 2 3 4 5 … 42");
    assert.equal(render(4, 42), "1 2 3 4 5 … 42");
    assert.equal(render(8, 42), "1 … 7 8 9 … 42");
    assert.equal(render(39, 42), "1 … 38 39 40 41 42");
    assert.equal(render(42, 42), "1 … 38 39 40 41 42");
  });
  test("página fuera de rango se acota", () => {
    assert.equal(render(99, 10), "1 … 6 7 8 9 10");
  });
});

describe("?page=", () => {
  test("entero ≥ 1; inválido → 1; repetido → el primero", () => {
    assert.equal(parseCatalogPage("3"), 3);
    assert.equal(parseCatalogPage(["2", "9"]), 2);
    for (const value of [undefined, "", "0", "-2", "1.5", "abc", "2e3", "9999999", " "]) {
      assert.equal(parseCatalogPage(value), 1, String(value));
    }
  });
  test("catalogHref: page solo si > 1 y al final; filtros sin page vuelven a la 1", () => {
    const filters = { q: "coca", categoria: "bebidas", orden: "precio-asc" as const };
    assert.equal(catalogHref(filters, 2), "/productos?q=coca&categoria=bebidas&orden=precio-asc&page=2");
    assert.equal(catalogHref(filters, 1), "/productos?q=coca&categoria=bebidas&orden=precio-asc");
    assert.equal(catalogHref(filters), "/productos?q=coca&categoria=bebidas&orden=precio-asc");
  });
  test("page no forma parte de los filtros (cambiar búsqueda/filtro resetea la página)", () => {
    const parsed = parseCatalogParams({ q: "leche", page: "8" });
    assert.equal("page" in parsed, false);
    assert.equal(catalogHref({ ...parsed, q: "agua" }), "/productos?q=agua");
  });
});

describe("semántica de búsqueda (misma regla que el ILIKE de la vista)", () => {
  test("prefijo de palabra, sin acentos ni mayúsculas", () => {
    assert.ok(matchesWordStart("Refresco de cola 600 ml", "cola"));
    assert.ok(matchesWordStart("Coca-Cola", "cola"));
    assert.ok(matchesWordStart("Coca-Cola", "coca"));
    assert.ok(matchesWordStart("Jabón de barra", "jabon"));
    assert.ok(matchesWordStart("Lácteos", "lacteos"));
    assert.equal(matchesWordStart("Galletas de chocolate", "cola"), false, "cola NO encuentra chocolate");
  });
  test("términos normalizados, sin repetidos ni caracteres de PostgREST", () => {
    assert.deepEqual(searchTerms(sanitizeSearch("Coca  COCA, (cola)*")), ["coca", "cola"]);
    assert.equal(sanitizeSearch("   "), undefined);
  });
});
