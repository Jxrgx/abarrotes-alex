// Normalización de texto para búsqueda (cliente y servidor): minúsculas y sin
// acentos/diéresis ("Jabón" -> "jabon", "Niño" -> "nino"). Equivale a
// private.search_normalize() de PostgreSQL (unaccent + lower) para el español.
// Solo se usa para comparar; el texto que se muestra nunca se modifica.
export function normalizeSearchText(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}
