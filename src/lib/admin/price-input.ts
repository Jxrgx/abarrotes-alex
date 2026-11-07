import { decimalToCents } from "@/lib/catalog/pricing";

// Precios escritos en el panel (producto, mayoreo). Texto decimal normalizado: nunca un
// float como autoridad.

// "$1,234.5" → "1234.50"; null si no es un precio válido (0 a 99,999.99, máx. 2 decimales).
export function normalizePrice(raw: string): string | null {
  let value = raw.trim().replace(/^\$/, "").trim();
  // La coma solo como separador de miles bien formado ("1,234.50"); "18,50" se rechaza
  // en lugar de interpretarse como 1850.
  if (value.includes(",")) {
    if (!/^\d{1,3}(,\d{3})+(\.\d*)?$/.test(value)) return null;
    value = value.replace(/,/g, "");
  }
  const match = /^(\d{1,5})(?:\.(\d{0,2}))?$/.exec(value);
  if (!match) return null;
  return `${Number(match[1])}.${(match[2] ?? "").padEnd(2, "0")}`;
}

export function priceToCents(raw: string): number | null {
  const normalized = normalizePrice(raw);
  return normalized === null ? null : decimalToCents(normalized);
}
