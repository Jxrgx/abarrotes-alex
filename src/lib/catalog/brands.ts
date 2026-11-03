import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

import { catalogQueryError } from "./errors";

export type Brand = {
  id: string;
  name: string;
  slug: string;
};

export const getActiveBrands = cache(async (): Promise<Brand[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brands")
    .select("id, name, slug")
    .eq("is_active", true)
    .order("name");

  if (error) throw catalogQueryError("las marcas", error);
  return data;
});
