// Datos SINTÉTICOS para el modo `fixture` de fault-injection.mjs (QA visual local con un
// catálogo de ejemplo cuando la base real está vacía). Nada de esto existe en la base:
// se sirve en memoria desde el proceso local de `next start`. Ver tests/README.md.
const BRANCH = "00000000-0000-4000-8000-000000000001";
const id = (prefix, n) => `${prefix}000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const CATEGORY = { id: id("fa", 1), name: "Abarrotes QA", slug: "abarrotes-qa", sort_order: 1, is_active: true };
const SUBCATEGORY = { id: id("fb", 1), name: "Varios QA", slug: "varios-qa", sort_order: 1, is_active: true, category_id: CATEGORY.id };
const BRAND = { id: id("fc", 1), name: "Marca QA", slug: "marca-qa", is_active: true };

// [nombre, presentación, unidad, venta, precio, promo, disponible, destacado, niveles [min, max, precio]]
const PRODUCTS = [
  ["Globito", 220, "g", "unit", 22, null, true, true, [[3, 5, 20], [6, 11, 18.5], [12, null, 17]]],
  ["Refresco de cola", 600, "ml", "unit", 22, 19, true, true, [[3, 5, 20], [6, null, 18]]],
  ["Agua natural", 1.5, "L", "unit", 15, null, true, false, [[3, 5, 13.5]]],
  ["Galletas de chocolate", 250, "g", "unit", 24.5, 21, true, true, []],
  ["Jabón de barra", 400, "g", "unit", 18, null, false, false, [[4, null, 16]]],
  ["Leche entera", 1, "L", "unit", 27.5, null, true, false, []],
  ["Cacahuate japonés a granel", 1, "kg", "weight", 120, null, true, false, []],
  ["Papas fritas con sal", 45, "g", "unit", 19, null, true, false, [[12, null, 15.5]]],
];

const slugify = (text) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export const CATALOG_ITEMS = PRODUCTS.map(([name, presentation, unit, saleType, price, promo, available, featured, tiers], index) => ({
  id: id("f1", index + 1),
  branch_id: BRANCH,
  product_id: id("f0", index + 1),
  price,
  is_available: available,
  name,
  slug: slugify(`${name} ${presentation} ${unit}`),
  presentation,
  unit,
  sale_type: saleType,
  image_path: null,
  is_featured: featured,
  search_name: slugify(name).replace(/-/g, " "),
  brand_id: BRAND.id,
  subcategory_id: SUBCATEGORY.id,
  brand_name: BRAND.name,
  brand_slug: BRAND.slug,
  subcategory_name: SUBCATEGORY.name,
  subcategory_slug: SUBCATEGORY.slug,
  subcategory_sort_order: 1,
  category_id: CATEGORY.id,
  category_name: CATEGORY.name,
  category_slug: CATEGORY.slug,
  category_sort_order: 1,
  promo_price: promo,
  effective_price: promo ?? price,
  wholesale_tiers: saleType === "unit" && tiers.length ? tiers.map(([min, max, tierPrice]) => ({ min, max, price: tierPrice })) : null,
}));

// Forma de listAdminProducts (products + embeds).
const ADMIN_PRODUCTS = CATALOG_ITEMS.map((item, index) => ({
  id: item.product_id,
  name: item.name,
  slug: item.slug,
  is_active: true,
  is_featured: item.is_featured,
  presentation: item.presentation,
  unit: item.unit,
  sale_type: item.sale_type,
  image_path: null,
  subcategory_id: SUBCATEGORY.id,
  brand_id: BRAND.id,
  subcategory: { name: SUBCATEGORY.name, is_active: true, sort_order: 1, category: { id: CATEGORY.id, name: CATEGORY.name, is_active: true, sort_order: 1 } },
  brand: { name: BRAND.name, is_active: true },
  branch_products: [
    {
      id: item.id,
      branch_id: BRANCH,
      price: item.price,
      is_available: item.is_available,
      promotions: item.promo_price === null ? [] : [{ promotional_price: item.promo_price, starts_at: null, ends_at: null, is_active: true }],
      wholesale_prices: (PRODUCTS[index][8] ?? []).map(([min, max, price], n) => ({ id: id("f2", index * 10 + n + 1), min_quantity: min, max_quantity: max, unit_price: price })),
    },
  ],
}));

export const FIXTURE_ORDER_ID = id("f9", 1);
const ORDER = {
  id: FIXTURE_ORDER_ID,
  folio: "ALEX-QA0001",
  status: "new",
  delivery_type: "pickup",
  created_at: new Date().toISOString(),
  customer_name: "Cliente Sintético QA",
  customer_phone: "5500000000",
  address: null,
  neighborhood: null,
  address_references: null,
  payment_method: "cash",
  cash_amount: null,
  customer_notes: null,
  subtotal: 134,
  shipping_cost: null,
  total: 134,
  branch: { name: "Abarrotes Alex - Concepción Durán" },
  order_items: [
    { id: id("f8", 1), product_name: "Globito", product_presentation: "220 g", quantity: 3, unit_price: 20, subtotal: 60, pricing_type: "wholesale", created_at: "2026-01-01T00:00:00Z" },
    { id: id("f8", 2), product_name: "Refresco de cola", product_presentation: "600 ml", quantity: 1, unit_price: 19, subtotal: 19, pricing_type: "promotion", created_at: "2026-01-01T00:00:01Z" },
    { id: id("f8", 3), product_name: "Leche entera", product_presentation: "1 L", quantity: 2, unit_price: 27.5, subtotal: 55, pricing_type: "normal", created_at: "2026-01-01T00:00:02Z" },
  ],
  order_status_history: [{ id: id("f7", 1), previous_status: null, new_status: "new", changed_by: null, created_at: new Date().toISOString() }],
};

const TABLES = {
  catalog_items: CATALOG_ITEMS,
  categories: [{ ...CATEGORY, subcategories: [{ count: 1 }], subs: [{ products: [{ count: PRODUCTS.length }] }] }],
  subcategories: [{ ...SUBCATEGORY, category: { name: CATEGORY.name, is_active: true, sort_order: 1 }, products: [{ count: PRODUCTS.length }] }],
  brands: [{ ...BRAND, products: [{ count: PRODUCTS.length }] }],
  products: ADMIN_PRODUCTS,
};

// Filtros que usa la app (subconjunto de PostgREST): eq, in, not.is.null; orden por una
// columna; offset/limit; count exact. Lo demás (búsqueda `or`) se ignora.
export function fixtureResponse(url, { head = false, single = false, countExact = false } = {}) {
  const table = url.pathname.split("/")[3];
  if (table === "orders") {
    // Solo el pedido de ejemplo (maybeSingle pide un arreglo); el resto va a la base real (vacía).
    if (url.searchParams.get("id") !== `eq.${FIXTURE_ORDER_ID}`) return null;
    return single ? json(ORDER) : json([ORDER]);
  }
  let rows = TABLES[table];
  if (!rows) return null;
  for (const [key, value] of url.searchParams) {
    if (["select", "order", "offset", "limit", "or"].includes(key)) continue;
    if (value.startsWith("eq.")) rows = rows.filter((row) => key in row ? String(row[key]) === value.slice(3) : true);
    else if (value.startsWith("in.(")) {
      const list = value.slice(4, -1).split(",");
      rows = rows.filter((row) => list.includes(String(row[key])));
    } else if (value === "not.is.null") rows = rows.filter((row) => row[key] !== null);
  }
  const order = url.searchParams.get("order")?.split(",")[0];
  if (order?.startsWith("effective_price")) {
    const dir = order.endsWith(".desc") ? -1 : 1;
    rows = [...rows].sort((a, b) => dir * (a.effective_price - b.effective_price) || a.name.localeCompare(b.name));
  }
  const total = rows.length;
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const limit = url.searchParams.has("limit") ? Number(url.searchParams.get("limit")) : total;
  const page = rows.slice(offset, offset + limit);
  const range = page.length ? `${offset}-${offset + page.length - 1}/${countExact ? total : "*"}` : `*/${countExact ? total : "*"}`;
  if (single) return page.length ? json(page[0]) : new Response(null, { status: 406 });
  return new Response(head ? null : JSON.stringify(page), { status: 200, headers: { "content-type": "application/json", "content-range": range } });
}

const json = (value) => new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
