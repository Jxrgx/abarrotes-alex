import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { canTransition, isFinalStatus, nextOrderStatus, ORDER_ACTION_LABELS } from "../orders/status";
import { hasActiveFilters, normalizeOrderSearch, orderSearchCondition, ordersHref, parseOrderFilters, periodStart, sanitizeOrderSearch } from "./order-filters";

describe("filtros de pedidos desde la URL", () => {
  test("valores válidos", () => {
    assert.deepEqual(parseOrderFilters({ estado: "new", entrega: "pickup", periodo: "7d", q: "ALEX-000123", page: "3" }), {
      status: "new", delivery: "pickup", period: "7d", q: "ALEX-000123", page: 3,
    });
    assert.equal(parseOrderFilters({ estado: "pendientes" }).status, "pendientes");
  });
  test("valores inválidos se ignoran (sin redirigir)", () => {
    assert.deepEqual(parseOrderFilters({ estado: "borrado", entrega: "dron", periodo: "ayer", page: "-2" }), {
      status: null, delivery: null, period: "todos", q: "", page: 1,
    });
    assert.equal(parseOrderFilters({ estado: ["new", "cancelled"] }).status, "new");
  });
  test("búsqueda saneada para PostgREST (sin , . ( ) * %)", () => {
    assert.equal(sanitizeOrderSearch("  María,(López)*% "), "María López");
    assert.equal(sanitizeOrderSearch("ALEX-000123"), "ALEX-000123");
    assert.equal(orderSearchCondition("ALEX-000123"), "folio.ilike.*ALEX-000123*,customer_name_search.ilike.*alex-000123*", "un folio no busca en teléfonos");
    assert.equal(orderSearchCondition("Ana"), "folio.ilike.*Ana*,customer_name_search.ilike.*ana*");
    assert.equal(orderSearchCondition("María"), "folio.ilike.*María*,customer_name_search.ilike.*maria*");
    assert.equal(orderSearchCondition("999 123 4567"), "folio.ilike.*999 123 4567*,customer_name_search.ilike.*999 123 4567*,customer_phone.ilike.*9991234567*");
    assert.equal(orderSearchCondition(""), null);
  });
  test("enlaces conservan filtros y omiten valores por defecto", () => {
    assert.equal(ordersHref({ status: "new", period: "hoy", q: "Ana", page: 2 }), "/admin/pedidos?estado=new&periodo=hoy&q=Ana&page=2");
    assert.equal(ordersHref({ period: "todos", page: 1 }), "/admin/pedidos");
    assert.equal(hasActiveFilters(parseOrderFilters({})), false);
    assert.equal(hasActiveFilters(parseOrderFilters({ periodo: "hoy" })), true);
  });
});

describe("búsqueda sin acentos, conservando la ñ (espejo de private.order_search_normalize)", () => {
  test("acentos y mayúsculas", () => {
    for (const [input, expected] of [["María", "maria"], ["JOSÉ", "jose"], ["Ángel", "angel"], ["Martín", "martin"], ["Güero", "guero"], ["Zoë", "zoe"]]) {
      assert.equal(normalizeOrderSearch(input), expected, input);
    }
  });
  test("la ñ es otra letra (Peña ≠ Pena)", () => {
    assert.equal(normalizeOrderSearch("Peña"), "peña");
    assert.equal(normalizeOrderSearch("ÑANDÚ"), "ñandu");
    assert.notEqual(normalizeOrderSearch("Peña"), normalizeOrderSearch("Pena"));
  });
  test("forma descompuesta (NFD) se trata igual que la compuesta", () => {
    assert.equal(normalizeOrderSearch("María"), "maria");
    assert.equal(normalizeOrderSearch("Peña"), "peña");
  });
});

describe("periodos en el día de negocio de Mérida (UTC−6)", () => {
  // 2026-11-10 01:30 UTC = 2026-11-09 19:30 en Mérida: "hoy" es el 9 de noviembre.
  const now = Date.parse("2026-11-10T01:30:00.000Z");
  test("hoy empieza a las 00:00 de Mérida, no de UTC", () => {
    assert.equal(periodStart("hoy", now), "2026-11-09T06:00:00.000Z");
  });
  test("7 y 30 días incluyen hoy", () => {
    assert.equal(periodStart("7d", now), "2026-11-03T06:00:00.000Z");
    assert.equal(periodStart("30d", now), "2026-10-11T06:00:00.000Z");
    assert.equal(periodStart("todos", now), null);
  });
});

describe("máquina de estados (espejo de la base)", () => {
  test("delivery y pickup se bifurcan en ready", () => {
    assert.equal(nextOrderStatus("delivery", "ready"), "on_the_way");
    assert.equal(nextOrderStatus("pickup", "ready"), "ready_for_pickup");
    assert.equal(nextOrderStatus("delivery", "on_the_way"), "delivered");
    assert.equal(nextOrderStatus("pickup", "ready_for_pickup"), "delivered");
  });
  test("sin saltos; finales sin salida; cancelar antes de entregar", () => {
    assert.equal(canTransition("delivery", "new", "delivered"), false);
    assert.equal(canTransition("delivery", "new", "preparing"), false);
    assert.equal(canTransition("delivery", "ready", "ready_for_pickup"), false);
    assert.equal(canTransition("pickup", "ready", "on_the_way"), false);
    assert.equal(canTransition("pickup", "preparing", "cancelled"), true);
    assert.equal(canTransition("delivery", "delivered", "cancelled"), false);
    assert.equal(canTransition("pickup", "cancelled", "new"), false);
    assert.ok(isFinalStatus("delivered") && isFinalStatus("cancelled"));
    assert.equal(nextOrderStatus("pickup", "delivered"), null);
  });
  test("cada acción tiene texto", () => {
    assert.equal(ORDER_ACTION_LABELS.confirmed, "Confirmar pedido");
    assert.equal(ORDER_ACTION_LABELS.ready, "Marcar listo");
  });
});
