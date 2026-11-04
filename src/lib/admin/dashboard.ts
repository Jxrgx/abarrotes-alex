import "server-only";

import { BUSINESS_TIME_ZONE } from "@/lib/business";
import { PENDING_ORDER_STATUSES } from "@/lib/orders/status";
import { createClient } from "@/lib/supabase/server";

import { type DashboardData, type RawDashboard, toDashboardData } from "./dashboard-data";

// Datos del dashboard: una sola llamada a public.admin_dashboard con el cliente
// AUTENTICADO (cookies → RLS del admin). Nunca el cliente público ni service_role.
// Las métricas se calculan en PostgreSQL; aquí solo se tipan y convierten a centavos.
export async function getDashboardData(branchId: string): Promise<DashboardData> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_dashboard", {
    p_branch_id: branchId,
    p_time_zone: BUSINESS_TIME_ZONE,
    p_pending_statuses: PENDING_ORDER_STATUSES,
  });

  if (error) {
    // Solo el código: el mensaje podría incluir detalles internos.
    console.error(`[admin] admin_dashboard falló: ${error.code}`);
    throw new Error("No se pudo cargar el resumen.");
  }
  return toDashboardData(data as unknown as RawDashboard);
}

export type AdminBranch = { id: string; name: string };

// Sucursal del dashboard. Con una sola sucursal se usa esa; preparado para que
// después llegue la elegida por el usuario. Cliente autenticado (el admin ve
// también sucursales inactivas).
export async function getAdminBranch(preferredId?: string): Promise<AdminBranch | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("branches")
    .select("id, name, is_active")
    .order("is_active", { ascending: false })
    .order("name");

  if (error) {
    console.error(`[admin] sucursales: ${error.code}`);
    throw new Error("No se pudo cargar la sucursal.");
  }
  const branch = data.find((item) => item.id === preferredId) ?? data[0];
  return branch ? { id: branch.id, name: branch.name } : null;
}
