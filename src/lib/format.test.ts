import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { formatPhone } from "./format";

describe("formatPhone", () => {
  test("LADA de 3 dígitos -> 3 3 4", () => {
    assert.equal(formatPhone("9844710604"), "984 471 0604");
  });

  test("LADA de 2 dígitos (CDMX, Guadalajara, Monterrey) -> 2 4 4", () => {
    assert.equal(formatPhone("5500000000"), "55 0000 0000");
    assert.equal(formatPhone("3312345678"), "33 1234 5678");
    assert.equal(formatPhone("8112345678"), "81 1234 5678");
  });

  test("ignora separadores al agrupar", () => {
    assert.equal(formatPhone("984-471-0604"), "984 471 0604");
  });

  test("otros largos se muestran tal cual", () => {
    assert.equal(formatPhone("529821041154"), "529821041154");
    assert.equal(formatPhone("12345"), "12345");
  });
});
