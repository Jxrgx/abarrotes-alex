import { formatTime } from "@/lib/format";

import type { BranchHours } from "./branches";

// day_of_week: 0 = domingo … 6 = sábado (igual que en la base de datos).
export const DAY_NAMES = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

// La semana se muestra de lunes a domingo.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export type HoursGroup = {
  /** "Lunes a sábado", "Domingo" */
  days: string;
  /** "8:00 a. m. – 9:00 p. m." o "Cerrado" */
  hours: string;
};

function describe(entry: BranchHours | undefined) {
  if (!entry || entry.isClosed || !entry.openingTime || !entry.closingTime) return "Cerrado";
  return `${formatTime(entry.openingTime)} – ${formatTime(entry.closingTime)}`;
}

// Agrupa días consecutivos con el mismo horario para mostrarlo de forma compacta.
export function groupBranchHours(hours: BranchHours[]): HoursGroup[] {
  const byDay = new Map(hours.map((entry) => [entry.dayOfWeek, entry]));
  const groups: { first: number; last: number; hours: string }[] = [];

  for (const day of WEEK_ORDER) {
    const description = describe(byDay.get(day));
    const previous = groups.at(-1);
    if (previous && previous.hours === description) {
      previous.last = day;
    } else {
      groups.push({ first: day, last: day, hours: description });
    }
  }

  return groups.map(({ first, last, hours: description }) => ({
    days:
      first === last
        ? DAY_NAMES[first]
        : `${DAY_NAMES[first]} a ${DAY_NAMES[last].toLowerCase()}`,
    hours: description,
  }));
}
