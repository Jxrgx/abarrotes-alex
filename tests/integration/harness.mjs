// Harness de integración con PGlite (PostgreSQL en WASM): stub mínimo de Supabase
// (roles, auth.uid(), storage), todas las migraciones y el seed. Datos sintéticos.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

const STUB = `
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create schema auth;
create schema extensions;
create table auth.users (id uuid primary key default gen_random_uuid());
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text not null, owner uuid default auth.uid(), metadata jsonb, unique (bucket_id, name));
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema storage to anon, authenticated;
grant all on storage.objects to anon, authenticated;
`;

export const USERS = {
  admin: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  admin2: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab2",
  employee: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  noprofile: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
};

/** Base nueva con migraciones + seed + usuarios sintéticos. */
export async function createDatabase() {
  const db = new PGlite({ extensions: { unaccent, btree_gist } });
  await db.exec(STUB);
  const dir = join(ROOT, "supabase", "migrations");
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(dir, file), "utf8"));
  }
  await db.exec(readFileSync(join(ROOT, "supabase", "seed.sql"), "utf8"));
  await db.exec(`insert into auth.users (id) values ${Object.values(USERS).map((id) => `('${id}')`).join(", ")};
    insert into profiles (id, role, full_name) values
      ('${USERS.admin}', 'admin', 'Admin Uno'), ('${USERS.admin2}', 'admin', 'Admin Dos'), ('${USERS.employee}', 'employee', 'Empleado');`);

  /**
   * Ejecuta SQL como un rol de Supabase (anon | admin | admin2 | employee | noprofile).
   * persist=false → la transacción se revierte.
   */
  async function as(who, sql, params = [], { persist = false } = {}) {
    const role = who === "anon" ? "anon" : "authenticated";
    await db.exec(`begin; set local role ${role};`);
    try {
      if (USERS[who]) await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: USERS[who], role })]);
      const result = await db.query(sql, params);
      await db.exec(persist ? "commit;" : "rollback;");
      return { ok: true, rows: result.rows };
    } catch (error) {
      await db.exec("rollback;");
      return { ok: false, code: error.code, message: error.message };
    }
  }

  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  return { db, as, one };
}

/** Crea un pedido sintético con create_order (como anon) y devuelve su id. */
export async function createSyntheticOrder({ db, one }, { deliveryType = "pickup", requestId } = {}) {
  const branch = (await one(`select id from branches order by name limit 1`)).id;
  const product = (await one(`select product_id from branch_products where branch_id = $1 order by price limit 1`, [branch])).product_id;
  await db.exec("set role anon;");
  try {
    const result = await one(
      `select (public.create_order($1, $2, $3::jsonb, 'Cliente Sintético', '5500000000', $4::public.delivery_type, p_address => $5, p_neighborhood => $6))->>'order_id' as id`,
      [requestId ?? crypto.randomUUID(), branch, JSON.stringify([{ product_id: product, quantity: 1 }]), deliveryType, deliveryType === "delivery" ? "Calle Ficticia 1" : null, deliveryType === "delivery" ? "Colonia Sintética" : null],
    );
    return result.id;
  } finally {
    await db.exec("reset role;");
  }
}
