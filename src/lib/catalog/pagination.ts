// Ventana de páginas para la paginación de escritorio: primera, última, la actual y una a
// cada lado; los huecos se marcan con "ellipsis". Ej. página 8 de 42:
// 1 … 7 8 9 … 42. Con 7 páginas o menos se muestran todas. Módulo puro.

export type PaginationItem = { type: "page"; page: number } | { type: "ellipsis"; key: string };

export function paginationItems(current: number, total: number): PaginationItem[] {
  if (total <= 1) return [];
  const page = Math.min(Math.max(1, current), total);
  if (total <= 7) return Array.from({ length: total }, (_, index) => ({ type: "page", page: index + 1 }));

  // Cerca de los extremos se muestran 5 seguidas para que la ventana no "salte".
  let start = Math.max(2, page - 1);
  let end = Math.min(total - 1, page + 1);
  if (page <= 4) {
    start = 2;
    end = 5;
  } else if (page >= total - 3) {
    start = total - 4;
    end = total - 1;
  }

  const items: PaginationItem[] = [{ type: "page", page: 1 }];
  if (start > 2) items.push({ type: "ellipsis", key: "inicio" });
  for (let number = start; number <= end; number++) items.push({ type: "page", page: number });
  if (end < total - 1) items.push({ type: "ellipsis", key: "fin" });
  items.push({ type: "page", page: total });
  return items;
}
