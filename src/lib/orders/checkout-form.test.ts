import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildCheckoutRequest,
  cartFingerprint,
  EMPTY_CHECKOUT_FORM,
  makeCheckoutFormSchema,
  normalizeMxPhone,
  parseMoneyToCents,
} from "./checkout-form";
import { checkoutRequestSchema } from "./schema";

const SUBTOTAL = 10000; // $100.00
const valid = {
  ...EMPTY_CHECKOUT_FORM,
  name: "José Peña",
  phone: "55 1234 5678",
  address: "Calle 1 #2",
  neighborhood: "Centro",
};

function errorsOf(values: Partial<typeof valid>, subtotal = SUBTOTAL) {
  const result = makeCheckoutFormSchema(subtotal).safeParse({ ...valid, ...values });
  if (result.success) return {};
  // Como React Hook Form: el primer error de cada campo.
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) errors[issue.path.join(".")] ??= issue.message;
  return errors;
}

describe("normalizeMxPhone", () => {
  test("acepta formatos comunes y devuelve 10 dígitos", () => {
    for (const input of ["5512345678", "55 1234 5678", "(55) 1234-5678", "+52 55 1234 5678", "52 5512345678", "+521 55 1234 5678"]) {
      assert.equal(normalizeMxPhone(input), "5512345678", input);
    }
  });
  test("rechaza números incompletos o extranjeros", () => {
    for (const input of ["", "55-12", "551234567", "+1 555 123 4567 8", "abc"]) {
      assert.equal(normalizeMxPhone(input), null, input);
    }
  });
});

describe("parseMoneyToCents", () => {
  test("cantidades válidas", () => {
    assert.equal(parseMoneyToCents("500"), 50000);
    assert.equal(parseMoneyToCents("$500"), 50000);
    assert.equal(parseMoneyToCents(" $ 1,250.5 "), 125050);
    assert.equal(parseMoneyToCents("0.10"), 10);
    assert.equal(parseMoneyToCents("19.99"), 1999);
  });
  test("cantidades inválidas", () => {
    for (const input of ["", "abc", "-5", "1.999", "5e2", "1.2.3"]) {
      assert.equal(parseMoneyToCents(input), null, input);
    }
  });
});

describe("makeCheckoutFormSchema", () => {
  test("formulario válido (domicilio)", () => {
    assert.deepEqual(errorsOf({}), {});
  });
  test("formulario vacío", () => {
    const errors = errorsOf({ ...EMPTY_CHECKOUT_FORM });
    assert.equal(errors.name, "Escribe tu nombre.");
    assert.equal(errors.phone, "Escribe tu teléfono.");
    assert.equal(errors.address, "Escribe tu dirección.");
    assert.equal(errors.neighborhood, "Escribe tu colonia.");
  });
  test("nombre inválido", () => {
    assert.equal(errorsOf({ name: "A" }).name, "Escribe tu nombre (al menos 2 letras).");
    assert.equal(errorsOf({ name: "x".repeat(121) }).name, "Usa máximo 120 caracteres.");
  });
  test("teléfono inválido", () => {
    assert.equal(errorsOf({ phone: "55-12" }).phone, "Escribe un teléfono de 10 dígitos.");
  });
  test("domicilio sin dirección o sin colonia", () => {
    assert.equal(errorsOf({ address: "  " }).address, "Escribe tu dirección.");
    assert.equal(errorsOf({ neighborhood: "" }).neighborhood, "Escribe tu colonia.");
  });
  test("recoger en sucursal no exige dirección", () => {
    assert.deepEqual(errorsOf({ deliveryType: "pickup", address: "", neighborhood: "" }), {});
  });
  test("efectivo opcional", () => {
    assert.deepEqual(errorsOf({ cashAmount: "" }), {});
    assert.deepEqual(errorsOf({ cashAmount: "$100" }), {});
  });
  test("efectivo menor al subtotal o inválido", () => {
    assert.equal(errorsOf({ cashAmount: "99.99" }).cashAmount, "Debe ser al menos el total parcial ($100.00).");
    assert.equal(errorsOf({ cashAmount: "cien" }).cashAmount, "Escribe una cantidad válida, por ejemplo 500.");
    assert.equal(errorsOf({ cashAmount: "0" }).cashAmount, "Escribe una cantidad válida, por ejemplo 500.");
  });
  test("notas de más de 500 caracteres", () => {
    assert.equal(errorsOf({ notes: "x".repeat(501) }).notes, "Usa máximo 500 caracteres.");
    assert.deepEqual(errorsOf({ notes: "x".repeat(500) }), {});
  });
});

describe("buildCheckoutRequest", () => {
  const context = {
    clientRequestId: "6c9d3a7e-1111-4111-8111-111111111111",
    branchId: "00000000-0000-4000-8000-000000000001",
    items: [{ productId: "2d76820a-017f-4eee-a8ec-e8b61bb35afe", quantity: 3 }],
    expectedSubtotalCents: 4500,
  };

  test("domicilio: normaliza teléfono y efectivo; pasa la validación del servidor", () => {
    const body = buildCheckoutRequest({ ...valid, cashAmount: "$500", notes: "  hola " }, context);
    assert.equal(body.customer.phone, "5512345678");
    assert.deepEqual(body.payment, { method: "cash", cashAmountCents: 50000 });
    assert.equal(body.notes, "hola");
    assert.equal(body.expectedSubtotalCents, 4500);
    assert.ok(checkoutRequestSchema.safeParse(body).success);
  });

  test("recoger en sucursal: no envía datos de domicilio", () => {
    const body = buildCheckoutRequest({ ...valid, deliveryType: "pickup" }, context);
    assert.deepEqual(body.delivery, { type: "pickup" });
    assert.doesNotMatch(JSON.stringify(body), /Calle 1|Centro/);
  });

  test("no envía precios como autoridad", () => {
    const body = buildCheckoutRequest(valid, context);
    assert.deepEqual(Object.keys(body.items[0]).sort(), ["productId", "quantity"]);
    assert.doesNotMatch(JSON.stringify(body), /unitPrice|"subtotal"|"total"/);
  });
});

describe("cartFingerprint", () => {
  const branch = "b";
  test("no depende del orden de los productos", () => {
    assert.equal(
      cartFingerprint(branch, [{ productId: "a", quantity: 1 }, { productId: "c", quantity: 2 }]),
      cartFingerprint(branch, [{ productId: "c", quantity: 2 }, { productId: "a", quantity: 1 }]),
    );
  });
  test("cambia con cantidad, producto o sucursal", () => {
    const base = cartFingerprint(branch, [{ productId: "a", quantity: 1 }]);
    assert.notEqual(base, cartFingerprint(branch, [{ productId: "a", quantity: 2 }]));
    assert.notEqual(base, cartFingerprint(branch, [{ productId: "z", quantity: 1 }]));
    assert.notEqual(base, cartFingerprint("otra", [{ productId: "a", quantity: 1 }]));
  });
});
