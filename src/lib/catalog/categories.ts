import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

import { catalogQueryError } from "./errors";

export type Category = {
  id: string;
  name: string;
  slug: string;
};

// RLS ya limita a categorías activas; el filtro explícito documenta la intención.
export const getActiveCategories = cache(async (): Promise<Category[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");

  if (error) throw catalogQueryError("las categorías", error);
  return data;
});
