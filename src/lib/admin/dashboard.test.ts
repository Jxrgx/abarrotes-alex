import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { businessDayKey, formatBusinessDateTime, formatBusinessTime } from "../datetime";
import { isPendingStatus, ORDER_STATUS_LABELS, ORDER_STATUS_TONES, PENDING_ORDER_STATUSES } from "../orders/status";
import { isAdminNavActive } from "./navigation";
import { toDashboardData } from "./dashboard-data";

describe("estados de pedido", () => {
  test("pendientes: todo excepto entregado y cancelado", () => {
    assert.deepEqual(PENDING_ORDER_STATUSES, ["new", "confirmed", "preparing", "ready", "on_the_way", "ready_for_pickup"]);
    assert.equal(isPendingStatus("delivered"), false);
    assert.equal(isPendingStatus("cancelled"), false);
  });
  test("cada estado tiene etiqueta en español y tono", () => {
    assert.equal(ORDER_STATUS_LABELS.ready_for_pickup, "Listo para recoger");
    assert.equal(ORDER_STATUS_LABELS.on_the_way, "En camino");
    assert.equal(Object.keys(ORDER_STATUS_TONES).length, 8);
  });
});

describe("fechas en America/Merida", () => {
  test("hora local, no UTC", () => {
    // 2026-11-04 03:30 UTC = 2026-11-03 21:30 en Mérida (UTC-6).
    assert.match(formatBusinessTime("2026-11-04T03:30:00Z"), /^9:30\sp\.\s?m\.$/);
    assert.equal(businessDayKey("2026-11-04T03:30:00Z"), "2026-11-03");
  });
  test("'Hoy' según el inicio de día calculado por la base", () => {
    const todayStart = "2026-11-03T06:00:00+00:00"; // medianoche en Mérida
    assert.match(formatBusinessDateTime("2026-11-04T03:30:00Z", todayStart), /^Hoy, 9:30/);
    assert.match(formatBusinessDateTime("2026-11-03T05:59:00Z", todayStart), /^2 nov\.?, 11:59/);
  });
});

describe("datos del dashboard", () => {
  test("convierte montos a centavos sin punto flotante", () => {
    const data = toDashboardData({
      today_start: "2026-11-03T06:00:00+00:00",
      today: { orders: 3, cancelled: 1, amount: "94.50", average_ticket: "47.25" },
      pending: 2,
      recent: [
        { id: "x", folio: "ALEX-000001", customer_name: "C", delivery_type: "pickup", total: "57.50", shipping_pending: true, status: "new", created_at: "2026-11-03T07:00:00Z" },
      ],
      top_products: [{ product_id: "p", name: "Leche entera", presentation: "1 L", quantity: 4, orders: 2 }],
    });
    assert.equal(data.amountTodayCents, 9450);
    assert.equal(data.averageTicketCents, 4725);
    assert.equal(data.recent[0].totalCents, 5750);
    assert.equal(data.topProducts[0].quantity, 4);
  });
  test("vacío", () => {
    const data = toDashboardData({
      today_start: "2026-11-03T06:00:00+00:00",
      today: { orders: 0, cancelled: 0, amount: "0.00", average_ticket: "0.00" },
      pending: 0,
      recent: [],
      top_products: [],
    });
    assert.deepEqual([data.ordersToday, data.amountTodayCents, data.averageTicketCents, data.pending], [0, 0, 0, 0]);
  });
});

describe("navegación activa", () => {
  test("Inicio solo exactamente en /admin", () => {
    assert.equal(isAdminNavActive("/admin", "/admin"), true);
    assert.equal(isAdminNavActive("/admin", "/admin/pedidos"), false);
  });
  test("módulos activos en su ruta y subrutas", () => {
    assert.equal(isAdminNavActive("/admin/pedidos", "/admin/pedidos"), true);
    assert.equal(isAdminNavActive("/admin/pedidos", "/admin/pedidos/123"), true);
    assert.equal(isAdminNavActive("/admin/pedidos", "/admin/pedidosx"), false);
    assert.equal(isAdminNavActive("/admin/productos", "/admin/pedidos"), false);
  });
});
