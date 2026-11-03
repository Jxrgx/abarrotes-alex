import { cache } from "react";

import { getPublicSupabase } from "@/lib/supabase/public";

import { catalogQueryError } from "./errors";

export type Brand = {
  id: string;
  name: string;
  slug: string;
};

export const getActiveBrands = cache(async (): Promise<Brand[]> => {
  const supabase = getPublicSupabase();
  const { data, error } = await supabase
    .from("brands")
    .select("id, name, slug")
    .eq("is_active", true)
    .order("name");

  if (error) throw catalogQueryError("las marcas", error);
  return data;
});
