// Lectura segura del cuerpo JSON de los endpoints públicos (Fase 9A).
// - Exige Content-Type application/json (415 si no).
// - Rechaza por Content-Length declarado (413) y además CORTA la lectura si el cuerpo
//   real supera el límite (un cliente puede mentir en Content-Length o usar chunked).
// - JSON inválido → 400. Nunca devuelve ni registra el contenido recibido.
// Así un payload enorme no se parsea completo ni llega a Zod ni a PostgreSQL.

export type JsonBodyResult = { ok: true; data: unknown } | { ok: false; status: 400 | 413 | 415 };

export async function readJsonBody(request: Request, maxBytes: number): Promise<JsonBodyResult> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json(\s*;|$)/i.test(contentType.trim())) return { ok: false, status: 415 };

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, status: 413 };
  if (!request.body) return { ok: false, status: 400 };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel().catch(() => {});
      return { ok: false, status: 413 };
    }
    chunks.push(value);
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(concat(chunks, received));
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400 };
  }
}

function concat(chunks: Uint8Array[], length: number) {
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** Límites: un pedido de 100 partidas con todos los textos al máximo cabe en ~25 KB. */
export const ORDER_BODY_MAX_BYTES = 32 * 1024;
/** 100 UUIDs + sucursal ≈ 4 KB. */
export const CART_BODY_MAX_BYTES = 16 * 1024;
