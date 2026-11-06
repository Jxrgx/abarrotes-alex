import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import type { PostgrestError } from "@supabase/supabase-js";

import { catalogQueryError, isPrerenderAbort } from "./errors";

// Forma en que postgrest-js devuelve el rechazo de fetch() de Next.js al terminar un prerender.
const prerenderAbort = {
  message: 'Error: During prerendering, fetch() rejects when the prerender is complete. Typically these errors are handled by React … This occurred at route "/productos".',
  code: "",
  details: "",
  hint: "",
} as unknown as PostgrestError;
const realError = { message: "permission denied for table products", code: "42501", details: "", hint: "" } as unknown as PostgrestError;

describe("catalogQueryError", () => {
  let logged: unknown[][];
  const original = console.error;
  beforeEach(() => {
    logged = [];
    console.error = (...args: unknown[]) => logged.push(args);
  });
  afterEach(() => {
    console.error = original;
  });

  test("reconoce el rechazo de fetch al terminar un prerender", () => {
    assert.equal(isPrerenderAbort(prerenderAbort), true);
    assert.equal(isPrerenderAbort(realError), false);
  });

  test("no registra el aborto de prerender, pero sigue lanzando un error genérico", () => {
    const error = catalogQueryError("las sucursales", prerenderAbort);
    assert.equal(error.message, "No se pudo cargar las sucursales.");
    assert.equal(logged.length, 0);
  });

  test("un error real se registra solo con el código (sin mensaje interno)", () => {
    catalogQueryError("los productos", realError);
    assert.deepEqual(logged, [["[catalog] los productos: 42501"]]);
  });
});
