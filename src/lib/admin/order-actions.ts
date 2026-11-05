"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/session";
import { ORDER_STATUS_TOASTS } from "@/lib/orders/status";
import { createClient } from "@/lib/supabase/server";
import { Constants } from "@/types/database";

// Cambio de estado de un pedido (Fase 8E). La autoridad es la base:
// public.update_order_status(pedido, estado_esperado, estado_nuevo) exige admin,
// bloquea la fila, rechaza si el estado cambió mientras se revisaba (ORD01) y si la
// transición no es válida (ORD02). El historial lo escribe el trigger existente.

export type OrderStatusResult = { ok: true; message: string } | { ok: false; message: string; stale?: boolean };

const status = z.enum(Constants.public.Enums.order_status);
const input = z.object({ orderId: z.uuid(), expected: status, next: status });

function revalidateOrder(orderId: string) {
  revalidatePath("/admin"); // dashboard: pendientes y recientes
  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);
}

export async function changeOrderStatus(orderId: string, expected: string, next: string): Promise<OrderStatusResult> {
  await requireAdmin();
  const parsed = input.safeParse({ orderId, expected, next });
  if (!parsed.success) return { ok: false, message: "No pudimos cambiar el estado. Recarga la página." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_order_status", {
    p_order_id: parsed.data.orderId,
    p_expected_status: parsed.data.expected,
    p_new_status: parsed.data.next,
  });

  if (error) {
    console.error(`[admin] update_order_status: ${error.code}`); // solo el código
    switch (error.code) {
      case "ORD01":
        // Otro admin lo cambió: se refresca para mostrar el estado actual.
        revalidateOrder(parsed.data.orderId);
        return { ok: false, stale: true, message: "El pedido cambió mientras lo estabas revisando. Actualizamos la información." };
      case "ORD02":
        revalidateOrder(parsed.data.orderId);
        return { ok: false, message: "Este cambio de estado no está permitido para el pedido." };
      case "P0002":
        return { ok: false, message: "No encontramos este pedido." };
      case "42501":
        return { ok: false, message: "No tienes permiso para realizar esta acción." };
      default:
        return { ok: false, message: "No pudimos cambiar el estado. Inténtalo de nuevo." };
    }
  }

  revalidateOrder(parsed.data.orderId);
  return { ok: true, message: ORDER_STATUS_TOASTS[parsed.data.next] };
}
