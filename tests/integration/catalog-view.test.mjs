// Catálogo paginado (vista public.catalog_items, migración 20261107000100) con un
// dataset SINTÉTICO de 1600 productos (1000+ visibles) en PGlite (base efímera, nada persiste).
// Se consulta como anon, igual que la tienda: RLS, precio efectivo, orden GLOBAL antes de
// paginar, conteo, búsqueda por prefijo de palabra, productos sin marca y agotados.
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

import { createDatabase } from "./harness.mjs";

let ctx;
let BRANCH;
const PAGE = 24;

// Consulta como anon (rollback: solo lectura).
async function anon(sql, params = []) {
  const result = await ctx.as("anon", sql, params);
  if (!result.ok) throw new Error(result.message);
  return result.rows;
}

// Mismas cláusulas que lib/catalog/products.ts (PostgREST → SQL).
const ORDER_DEFAULT = "category_sort_order, subcategory_sort_order, name, presentation nulls first, id";
const ORDER_PRICE = (dir) => `effective_price ${dir}, name, presentation nulls first, id`;
const WORD_START = (column, param) => `(${column} ilike ${param} || '%' or ${column} ilike '% ' || ${param} || '%' or ${column} ilike '%-' || ${param} || '%')`;

before(async () => {
  ctx = await createDatabase();
  BRANCH = (await ctx.one(`select id from branches order by name limit 1`)).id;
  // 4 categorías (una inactiva), 3 subcategorías cada una, 6 marcas (una inactiva).
  await ctx.db.exec(`
    insert into categories (name, slug, sort_order, is_active)
    select 'Vol Cat ' || n, 'vol-cat-' || n, 100 + n, n <> 4 from generate_series(1, 4) n;
    insert into subcategories (category_id, name, slug, sort_order, is_active)
    select c.id, 'Vol Sub ' || c.sort_order || '-' || n, 'vol-sub-' || c.sort_order || '-' || n, n, true
    from categories c cross join generate_series(1, 3) n where c.slug like 'vol-cat-%';
    insert into brands (name, slug, is_active)
    select 'Volmarca ' || n, 'volmarca-' || n, n <> 6 from generate_series(1, 6) n;
  `);
  // 1600 productos: nombres variados, ~1/7 sin marca, algunos inactivos, unos de la marca inactiva.
  await ctx.db.exec(`
    insert into products (name, slug, subcategory_id, brand_id, presentation, unit, sale_type, is_active, is_featured)
    select
      (array['Refresco de cola', 'Coca-Cola', 'Galletas de chocolate', 'Jabón de barra', 'Leche entera', 'Agua natural'])[1 + n % 6] || ' vol ' || n,
      'vol-producto-' || n,
      (select id from subcategories where slug like 'vol-sub-%' order by slug offset ((n / 6) % 12) limit 1),
      case when n % 7 = 0 then null else (select id from brands where slug = 'volmarca-' || (1 + n % 6)) end,
      100 + n % 900, 'ml', 'unit',
      n % 50 <> 0,
      n % 97 = 0
    from generate_series(1, 1600) n;
    insert into branch_products (branch_id, product_id, price, is_available)
    select '${"${BRANCH}"}'::uuid, p.id, 5 + (p.presentation::int * 37 % 400) / 4.0, p.presentation::int % 11 <> 0
    from products p where p.slug like 'vol-producto-%';
  `.replace("'${BRANCH}'", `'${BRANCH}'`));
  // Promociones: vigentes (1 de cada 5), vencidas e inactivas (RLS las oculta).
  await ctx.db.exec(`
    insert into promotions (branch_product_id, promotional_price, starts_at, ends_at, is_active)
    select bp.id, round(bp.price * 0.5, 2), now() - interval '1 day', now() + interval '10 days', true
    from branch_products bp join products p on p.id = bp.product_id
    where p.slug like 'vol-producto-%' and p.presentation::int % 5 = 0;
    insert into promotions (branch_product_id, promotional_price, starts_at, ends_at, is_active)
    select bp.id, round(bp.price * 0.1, 2), now() - interval '20 days', now() - interval '10 days', true
    from branch_products bp join products p on p.id = bp.product_id
    where p.slug like 'vol-producto-%' and p.presentation::int % 5 = 1;
    insert into promotions (branch_product_id, promotional_price, starts_at, ends_at, is_active)
    select bp.id, round(bp.price * 0.1, 2), null, null, false
    from branch_products bp join products p on p.id = bp.product_id
    where p.slug like 'vol-producto-%' and p.presentation::int % 5 = 2;
  `);
  // Mayoreo (migración 20261108000100): 2 niveles en 1 de cada 3 productos; en otro grupo el
  // precio normal baja después y su nivel queda «Requiere revisión» (la tienda no lo ve).
  await ctx.db.exec(`
    insert into wholesale_prices (branch_product_id, min_quantity, max_quantity, unit_price)
    select bp.id, 3, 5, round(bp.price * 0.9, 2) from branch_products bp join products p on p.id = bp.product_id
    where p.slug like 'vol-producto-%' and p.presentation::int % 3 = 0;
    insert into wholesale_prices (branch_product_id, min_quantity, max_quantity, unit_price)
    select bp.id, 6, null, round(bp.price * 0.8, 2) from branch_products bp join products p on p.id = bp.product_id
    where p.slug like 'vol-producto-%' and p.presentation::int % 3 = 0;
    insert into wholesale_prices (branch_product_id, min_quantity, max_quantity, unit_price)
    select bp.id, 4, null, round(bp.price * 0.9, 2) from branch_products bp join products p on p.id = bp.product_id
    where p.slug like 'vol-producto-%' and p.presentation::int % 3 = 1 and p.presentation::int % 7 = 0;
    update branch_products bp set price = round(bp.price * 0.85, 2) from products p
    where p.id = bp.product_id and p.slug like 'vol-producto-%' and p.presentation::int % 3 = 1 and p.presentation::int % 7 = 0;
  `);
});

// Lo que la tienda debe ver, calculado de forma independiente (como superusuario).
async function expectedVisible() {
  return (
    await ctx.db.query(`
      select bp.id, p.name, p.presentation, c.sort_order cso, s.sort_order sso,
        coalesce((select min(pr.promotional_price) from promotions pr
                  where pr.branch_product_id = bp.id and pr.is_active
                    and (pr.starts_at is null or pr.starts_at <= now()) and (pr.ends_at is null or pr.ends_at > now())
                    and pr.promotional_price < bp.price), bp.price) as effective
      from branch_products bp
      join products p on p.id = bp.product_id and p.is_active
      join subcategories s on s.id = p.subcategory_id and s.is_active
      join categories c on c.id = s.category_id and c.is_active
      where bp.branch_id = $1`, [BRANCH])
  ).rows;
}

describe("vista catalog_items: RLS y precio efectivo", () => {
  test("hay 1000+ productos visibles; anon solo ve lo activo (inactivos y categoría inactiva fuera)", async () => {
    const [{ n }] = await anon(`select count(*)::int n from catalog_items where branch_id = $1`, [BRANCH]);
    const expected = await expectedVisible();
    assert.ok(n >= 1000, `visibles: ${n}`);
    assert.equal(n, expected.length);
    const hidden = await anon(`select count(*)::int n from catalog_items where slug like 'vol-producto-%' and (category_slug = 'vol-cat-4' or slug in (select 'vol-producto-' || g from generate_series(50, 1600, 50) g))`);
    assert.equal(hidden[0].n, 0);
  });

  test("precio efectivo: solo promociones vigentes y menores; vencidas/inactivas se ignoran", async () => {
    const rows = await anon(`select id, price, promo_price, effective_price from catalog_items where branch_id = $1`, [BRANCH]);
    const expected = new Map((await expectedVisible()).map((row) => [row.id, Number(row.effective)]));
    let promos = 0;
    for (const row of rows) {
      assert.equal(Number(row.effective_price), expected.get(row.id), row.id);
      if (row.promo_price !== null) {
        promos++;
        assert.ok(Number(row.promo_price) < Number(row.price));
      }
    }
    assert.ok(promos > 100, `con promoción vigente: ${promos}`);
  });

  test("sin marca o con marca inactiva: el producto aparece sin marca", async () => {
    const [{ n }] = await anon(`select count(*)::int n from catalog_items where slug like 'vol-producto-%' and brand_name is null`);
    assert.ok(n > 150, `sin marca visibles: ${n}`);
  });

  test("privilegios: anon y authenticated solo leen (sin INSERT/UPDATE/DELETE/TRUNCATE)", async () => {
    for (const role of ["anon", "authenticated"]) {
      const row = await ctx.one(
        `select has_table_privilege($1, 'public.catalog_items', 'SELECT') s, has_table_privilege($1, 'public.catalog_items', 'INSERT') i,
                has_table_privilege($1, 'public.catalog_items', 'UPDATE') u, has_table_privilege($1, 'public.catalog_items', 'DELETE') d,
                has_table_privilege($1, 'public.catalog_items', 'TRUNCATE') t`,
        [role],
      );
      assert.deepEqual(row, { s: true, i: false, u: false, d: false, t: false }, role);
    }
    const write = await ctx.as("anon", `delete from catalog_items`);
    assert.equal(write.ok, false);
  });

  test("agotados siguen apareciendo", async () => {
    const [{ n }] = await anon(`select count(*)::int n from catalog_items where slug like 'vol-producto-%' and not is_available`);
    assert.ok(n > 50, `agotados: ${n}`);
  });
});

describe("paginación: 24 por página, orden global y conteo", () => {
  for (const [label, order, compare] of [
    ["predeterminado", ORDER_DEFAULT, null],
    ["precio ascendente", ORDER_PRICE("asc"), (a, b) => a - b],
    ["precio descendente", ORDER_PRICE("desc"), (a, b) => b - a],
  ]) {
    test(`${label}: recorrer todas las páginas da cada producto una vez y en orden global`, async () => {
      const [{ n: total }] = await anon(`select count(*)::int n from catalog_items where branch_id = $1`, [BRANCH]);
      const pages = Math.ceil(total / PAGE);
      const seen = [];
      for (let page = 1; page <= pages; page++) {
        const rows = await anon(`select id, effective_price from catalog_items where branch_id = $1 order by ${order} limit ${PAGE} offset ${(page - 1) * PAGE}`, [BRANCH]);
        assert.equal(rows.length, page < pages ? PAGE : total - PAGE * (pages - 1), `página ${page}`);
        seen.push(...rows);
      }
      assert.equal(new Set(seen.map((row) => row.id)).size, total, "sin repetidos ni faltantes");
      if (compare) {
        for (let index = 1; index < seen.length; index++) {
          assert.ok(compare(Number(seen[index - 1].effective_price), Number(seen[index].effective_price)) <= 0, `orden global roto en ${index}`);
        }
        // La primera página de "precio asc" contiene los más baratos de TODO el catálogo.
        const prices = seen.map((row) => Number(row.effective_price));
        const sorted = [...prices].sort(compare);
        assert.deepEqual(prices.slice(0, PAGE), sorted.slice(0, PAGE));
      }
    });
  }

  test("página más allá del final → 0 filas (la app muestra «Esta página no existe»)", async () => {
    const rows = await anon(`select id from catalog_items where branch_id = $1 order by ${ORDER_DEFAULT} limit ${PAGE} offset 100000`, [BRANCH]);
    assert.equal(rows.length, 0);
  });
});

describe("búsqueda por prefijo de palabra (sin acentos) + filtros", () => {
  const search = (term, extra = "", params = []) =>
    anon(`select name from catalog_items where branch_id = $1 and ${WORD_START("search_name", "$2")} ${extra}`, [BRANCH, term, ...params]);

  test("«cola» encuentra «Refresco de cola» y «Coca-Cola», nunca «chocolate»", async () => {
    const names = (await search("cola")).map((row) => row.name);
    assert.ok(names.some((name) => name.startsWith("Refresco de cola")));
    assert.ok(names.some((name) => name.startsWith("Coca-Cola")));
    assert.equal(names.some((name) => /chocolate/i.test(name)), false);
  });

  test("«jabon» encuentra «Jabón» (sin acentos) y «coca» encuentra «Coca-Cola»", async () => {
    assert.ok((await search("jabon")).every((row) => row.name.startsWith("Jabón")));
    assert.ok((await search("jabon")).length > 100);
    assert.ok((await search("coca")).every((row) => row.name.startsWith("Coca-Cola")));
  });

  test("búsqueda + categoría + marca + orden por precio + página: conteo y orden correctos", async () => {
    const where = `branch_id = $1 and ${WORD_START("search_name", "$2")} and category_slug = 'vol-cat-1' and brand_id is not null`;
    const [{ n }] = await anon(`select count(*)::int n from catalog_items where ${where}`, [BRANCH, "agua"]);
    assert.ok(n > 0);
    const page2 = await anon(`select effective_price from catalog_items where ${where} order by ${ORDER_PRICE("asc")} limit ${PAGE} offset ${PAGE}`, [BRANCH, "agua"]);
    const all = await anon(`select effective_price from catalog_items where ${where} order by ${ORDER_PRICE("asc")}`, [BRANCH, "agua"]);
    assert.deepEqual(page2.map((row) => row.effective_price), all.slice(PAGE, PAGE * 2).map((row) => row.effective_price));
  });

  test("mayoreo viaja en la misma consulta paginada; el orden por precio usa 1 unidad; Ofertas = promociones", async () => {
    const [{ n: total }] = await anon(`select count(*)::int n from catalog_items where branch_id = $1`, [BRANCH]);
    const expected = new Map(
      (await ctx.db.query(`
        select bp.id, (select count(*)::int from wholesale_prices w where w.branch_product_id = bp.id and w.unit_price < bp.price) tiers
        from branch_products bp where bp.branch_id = $1`, [BRANCH])).rows.map((row) => [row.id, row.tiers]),
    );
    let withTiers = 0;
    for (let page = 1; page <= Math.ceil(total / PAGE); page++) {
      const rows = await anon(`select id, price, effective_price, wholesale_tiers from catalog_items where branch_id = $1 order by ${ORDER_PRICE("asc")} limit ${PAGE} offset ${(page - 1) * PAGE}`, [BRANCH]);
      for (const row of rows) {
        const tiers = row.wholesale_tiers ?? [];
        assert.equal(tiers.length, expected.get(row.id), `niveles de ${row.id}`);
        if (tiers.length) {
          withTiers += 1;
          assert.deepEqual(tiers.map((tier) => [tier.min, tier.max]), [[3, 5], [6, null]], "orden por cantidad mínima");
          assert.ok(tiers.every((tier) => tier.price < Number(row.price)), "solo niveles menores al normal");
          assert.ok(Number(row.effective_price) <= Number(row.price), "1 unidad: normal o promoción");
          assert.ok(tiers.some((tier) => tier.price < Number(row.effective_price)) || Number(row.effective_price) < Number(row.price), "el mayoreo no altera el precio de 1 unidad");
        }
      }
    }
    assert.ok(withTiers > 300, `productos con mayoreo visibles: ${withTiers}`);
    const review = (await ctx.db.query(`select count(*)::int n from wholesale_prices w join branch_products bp on bp.id = w.branch_product_id where w.unit_price >= bp.price`)).rows[0].n;
    assert.ok(review > 0, "hay niveles «Requiere revisión» en el dataset");
    const [{ n: onSale }] = await anon(`select count(*)::int n from catalog_items where branch_id = $1 and promo_price is not null`, [BRANCH]);
    // «Ofertas» (home) = productos con promoción vigente, nunca «solo mayoreo».
    const [{ n: promos }] = (await ctx.db.query(`
      select count(*)::int n from branch_products bp
      join products p on p.id = bp.product_id and p.is_active
      join subcategories s on s.id = p.subcategory_id and s.is_active
      join categories c on c.id = s.category_id and c.is_active
      where bp.branch_id = $1 and exists (select 1 from promotions pr where pr.branch_product_id = bp.id and pr.is_active
        and (pr.starts_at is null or pr.starts_at <= now()) and (pr.ends_at is null or pr.ends_at > now()) and pr.promotional_price < bp.price)`, [BRANCH])).rows;
    assert.equal(onSale, promos);
  });

  test("plan de consulta: una sola sentencia por página (sin N+1) y rápida con 1000+ productos", async () => {
    const started = performance.now();
    await anon(`select * from catalog_items where branch_id = $1 order by ${ORDER_PRICE("asc")} limit ${PAGE}`, [BRANCH]);
    await anon(`select count(*) from catalog_items where branch_id = $1`, [BRANCH]);
    const elapsed = performance.now() - started;
    assert.ok(elapsed < 2000, `${elapsed.toFixed(0)} ms en PGlite (WASM)`);
  });
});
