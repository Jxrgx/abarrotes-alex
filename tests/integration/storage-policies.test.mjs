// Fase 8C.2: bucket product-images y políticas de storage.objects (stub de storage).
import assert from "node:assert/strict";
import { before, test } from "node:test";

import { createDatabase } from "./harness.mjs";

let ctx;
const P = "11111111-1111-4111-8111-111111111111";
const PATH = `products/${P}/22222222-2222-4222-8222-222222222222.webp`;
const insert = (who, name, bucket = "product-images") => ctx.as(who, `insert into storage.objects (bucket_id, name) values ($1, $2) returning name`, [bucket, name]);

before(async () => {
  ctx = await createDatabase();
  await ctx.db.exec(`insert into storage.buckets (id, name) values ('otro-bucket', 'otro-bucket');
    insert into storage.objects (bucket_id, name, owner) values ('product-images', 'products/${P}/existente.webp', null);`);
});

test("bucket público, solo WebP, 2 MB", async () => {
  const bucket = await ctx.one(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'product-images'`);
  assert.deepEqual([bucket.public, Number(bucket.file_size_limit), bucket.allowed_mime_types], [true, 2097152, ["image/webp"]]);
});

test("anon, sin profile y employee no escriben ni listan", async () => {
  for (const who of ["anon", "noprofile", "employee"]) {
    assert.equal((await insert(who, PATH)).code, "42501", `${who} insert`);
    const update = await ctx.as(who, `update storage.objects set name = name where bucket_id = 'product-images' returning name`);
    assert.ok((update.ok && update.rows.length === 0) || update.code === "42501", `${who} update`);
    const remove = await ctx.as(who, `delete from storage.objects where bucket_id = 'product-images' returning name`);
    assert.ok((remove.ok && remove.rows.length === 0) || remove.code === "42501", `${who} delete`);
    const list = await ctx.as(who, `select name from storage.objects where bucket_id = 'product-images'`);
    assert.ok((list.ok && list.rows.length === 0) || list.code === "42501", `${who} list`);
  }
});

test("admin: sube solo bajo products/ del bucket, lee, reemplaza y borra", async () => {
  assert.ok((await insert("admin", PATH)).ok);
  assert.equal((await insert("admin", "otra-carpeta/x.webp")).code, "42501");
  assert.equal((await insert("admin", `products/${P}/x.webp`, "otro-bucket")).code, "42501");
  assert.equal((await ctx.as("admin", `select name from storage.objects where bucket_id = 'product-images'`)).rows.length, 1);
  assert.equal((await ctx.as("admin", `update storage.objects set name = 'fuera/x.webp' where name = 'products/${P}/existente.webp'`)).code, "42501");
  assert.equal((await ctx.as("admin", `delete from storage.objects where name = 'products/${P}/existente.webp' returning name`)).rows.length, 1);
});
