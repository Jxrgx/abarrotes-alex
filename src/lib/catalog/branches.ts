import { cache } from "react";

import { getPublicSupabase } from "@/lib/supabase/public";

import { catalogQueryError } from "./errors";

export type Branch = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
};

export type BranchHours = {
  dayOfWeek: number;
  openingTime: string | null;
  closingTime: string | null;
  isClosed: boolean;
};

export const getActiveBranches = cache(async (): Promise<Branch[]> => {
  const supabase = getPublicSupabase();
  const { data, error } = await supabase
    .from("branches")
    .select("id, name, address, phone")
    .eq("is_active", true)
    .order("name");

  if (error) throw catalogQueryError("las sucursales", error);
  return data;
});

// Con una sola sucursal activa se selecciona automáticamente. Cuando existan
// varias, preferredId vendrá de la elección del cliente (p. ej. una cookie).
export function resolveCurrentBranch(branches: Branch[], preferredId?: string) {
  return branches.find((branch) => branch.id === preferredId) ?? branches[0] ?? null;
}

export const getCurrentBranch = cache(async () => {
  return resolveCurrentBranch(await getActiveBranches());
});

export const getBranchHours = cache(async (branchId: string): Promise<BranchHours[]> => {
  const supabase = getPublicSupabase();
  const { data, error } = await supabase
    .from("branch_hours")
    .select("day_of_week, opening_time, closing_time, is_closed")
    .eq("branch_id", branchId);

  if (error) throw catalogQueryError("los horarios", error);
  return data.map((row) => ({
    dayOfWeek: row.day_of_week,
    openingTime: row.opening_time,
    closingTime: row.closing_time,
    isClosed: row.is_closed,
  }));
});

// "Abarrotes Alex - Sucursal Principal" -> "Sucursal Principal" (evita repetir la marca).
export function branchShortName(name: string) {
  const short = name.replace(/^abarrotes alex\s*[-–—·:]\s*/i, "").trim();
  return short || name;
}
