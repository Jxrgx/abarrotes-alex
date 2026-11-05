import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { businessLocalToIso, isoToBusinessLocal } from "../datetime";
import { PROMOTION_MESSAGES, parsePromotionForm, promotionMutationError, promotionSavings, promotionStatus } from "./promotion-forms";

const NOW = Date.parse("2026-11-10T18:00:00.000Z"); // 12:00 en Mérida
const iso = (offsetMinutes: number) => new Date(NOW + offsetMinutes * 60_000).toISOString();
const base = { isActive: true, startsAt: null, endsAt: null, promoCents: 1500, priceCents: 1800 };
const BP = "11111111-1111-4111-8111-111111111111";
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries({ branchProductId: BP, promotionalPrice: "15", isActive: "on", ...values })) data.set(key, value);
  return data;
};

describe("zona horaria del negocio (America/Merida, UTC−6)", () => {
  test("datetime-local se interpreta en Mérida, no en UTC ni en la zona del equipo", () => {
    assert.equal(businessLocalToIso("2026-11-10T08:00"), "2026-11-10T14:00:00.000Z");
    assert.equal(businessLocalToIso("2026-12-31T23:30"), "2027-01-01T05:30:00.000Z");
    assert.equal(businessLocalToIso("2026-02-31T10:00"), null);
    assert.equal(businessLocalToIso("10/11/2026 08:00"), null);
  });
  test("ida y vuelta para precargar el formulario", () => {
    assert.equal(isoToBusinessLocal("2026-11-10T14:00:00.000Z"), "2026-11-10T08:00");
    assert.equal(isoToBusinessLocal(businessLocalToIso("2027-03-01T00:05")!), "2027-03-01T00:05");
  });
});

describe("estado de una promoción (misma semántica que RLS y create_order)", () => {
  test("sin fechas y activa → vigente", () => assert.equal(promotionStatus(base, NOW), "active"));
  test("desactivada sin importar fechas", () => assert.equal(promotionStatus({ ...base, isActive: false, startsAt: iso(-60) }, NOW), "disabled"));
  test("inicio futuro → programada; inicio = ahora → vigente (inclusivo)", () => {
    assert.equal(promotionStatus({ ...base, startsAt: iso(1) }, NOW), "scheduled");
    assert.equal(promotionStatus({ ...base, startsAt: iso(0) }, NOW), "active");
  });
  test("fin = ahora → vencida (exclusivo); fin futuro → vigente", () => {
    assert.equal(promotionStatus({ ...base, endsAt: iso(0) }, NOW), "expired");
    assert.equal(promotionStatus({ ...base, endsAt: iso(1) }, NOW), "active");
  });
  test("precio normal ≤ promoción → requiere revisión (salvo vencida/desactivada)", () => {
    assert.equal(promotionStatus({ ...base, priceCents: 1500 }, NOW), "review");
    assert.equal(promotionStatus({ ...base, priceCents: 1400, startsAt: iso(60) }, NOW), "review");
    assert.equal(promotionStatus({ ...base, priceCents: 1400, endsAt: iso(-1) }, NOW), "expired");
    assert.equal(promotionStatus({ ...base, priceCents: 1400, isActive: false }, NOW), "disabled");
  });
  test("ahorro", () => {
    assert.deepEqual(promotionSavings(2800, 2300), { cents: 500, percent: 18 });
    assert.equal(promotionSavings(1500, 1500), null);
  });
});

describe("formulario", () => {
  test("promoción sin fechas (el caso más común)", () => {
    const result = parsePromotionForm(form({}), 1800);
    assert.ok(result.ok);
    assert.deepEqual(result.data, { id: undefined, branchProductId: BP, promotionalPrice: "15.00", startsAt: null, endsAt: null, isActive: true });
  });
  test("fechas en hora de Mérida → ISO", () => {
    const result = parsePromotionForm(form({ startsAt: "2026-11-10T08:00", endsAt: "2026-11-20T08:00" }), 1800);
    assert.ok(result.ok);
    assert.equal(result.data.startsAt, "2026-11-10T14:00:00.000Z");
    assert.equal(result.data.endsAt, "2026-11-20T14:00:00.000Z");
  });
  test("solo inicio y solo fin", () => {
    assert.ok(parsePromotionForm(form({ startsAt: "2026-11-10T08:00" }), 1800).ok);
    assert.ok(parsePromotionForm(form({ endsAt: "2026-11-10T08:00" }), 1800).ok);
  });
  test("fin no posterior al inicio", () => {
    const result = parsePromotionForm(form({ startsAt: "2026-11-10T08:00", endsAt: "2026-11-10T08:00" }), 1800);
    assert.ok(!result.ok);
    assert.equal(result.fieldErrors.endsAt, PROMOTION_MESSAGES.endBeforeStart);
  });
  test("precio ≥ normal (validación del navegador)", () => {
    const result = parsePromotionForm(form({ promotionalPrice: "18.00" }), 1800);
    assert.ok(!result.ok);
    assert.equal(result.fieldErrors.promotionalPrice, PROMOTION_MESSAGES.priceNotLower);
  });
  test("producto obligatorio al crear; no al editar", () => {
    assert.equal(parsePromotionForm(form({ branchProductId: "" }), null).ok, false);
    const edit = parsePromotionForm(form({ id: "22222222-2222-4222-8222-222222222222", branchProductId: "" }), null);
    assert.ok(edit.ok);
    assert.equal(edit.data.branchProductId, undefined);
  });
  test("checkbox ausente = desactivada; precio inválido", () => {
    const off = parsePromotionForm(form({ isActive: "" }), 1800);
    assert.ok(off.ok && off.data.isActive === false);
    assert.equal(parsePromotionForm(form({ promotionalPrice: "18,50" }), 1800).ok, false);
  });
});

describe("errores de la base → mensajes", () => {
  test("solapamiento, precio y producto fijo", () => {
    assert.equal(promotionMutationError("23P01").message, "Ya existe una promoción activa que se cruza con estas fechas.");
    assert.equal(promotionMutationError("PRM01").message, "El precio promocional debe ser menor que el precio normal.");
    assert.match(promotionMutationError("PRM02").message, /no se puede cambiar/);
    assert.equal(promotionMutationError(undefined).message, "No pudimos guardar la promoción. Inténtalo de nuevo.");
  });
});
