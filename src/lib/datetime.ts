import { BUSINESS_TIME_ZONE } from "./business";

// Fechas y horas en la zona horaria del negocio (no la del servidor ni UTC).
// Nunca usan la hora actual: "hoy"/"ahora" se reciben del servidor.

const timeFormatter = new Intl.DateTimeFormat("es-MX", {
  timeZone: BUSINESS_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});

const dayFormatter = new Intl.DateTimeFormat("es-MX", {
  timeZone: BUSINESS_TIME_ZONE,
  day: "numeric",
  month: "short",
});

const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "9:05 a.m." en la zona del negocio. */
export function formatBusinessTime(value: string | Date) {
  return timeFormatter.format(new Date(value));
}

/** Fecha local del negocio como "2026-11-03" (para comparar días). */
export function businessDayKey(value: string | Date) {
  return dayKeyFormatter.format(new Date(value));
}

// ---------------------------------------------------------------------------
// Conversión <input type="datetime-local"> ↔ timestamptz en la zona del negocio.
// El valor del input ("2026-11-10T08:00") no tiene zona: se interpreta SIEMPRE como
// hora de America/Merida, nunca como la zona del navegador ni del servidor.

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function zonedParts(date: Date) {
  const parts = Object.fromEntries(partsFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

// Desfase (ms) de la zona del negocio en ese instante (negativo al oeste de UTC).
function zoneOffset(date: Date) {
  const p = zonedParts(date);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000;
}

const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** "2026-11-10T08:00" (hora de Mérida) → ISO UTC, o null si no es válido. */
export function businessLocalToIso(local: string): string | null {
  const match = LOCAL_PATTERN.exec(local.trim());
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  // Dos pasos: el desfase se calcula en el instante resultante (robusto ante cambios
  // de horario aunque Mérida hoy no los tenga).
  let instant = asUtc - zoneOffset(new Date(asUtc));
  instant = asUtc - zoneOffset(new Date(instant));
  const check = zonedParts(new Date(instant));
  if (check.year !== year || check.month !== month || check.day !== day || check.hour !== hour || check.minute !== minute) {
    return null; // fecha inexistente (p. ej. 31 de febrero)
  }
  return new Date(instant).toISOString();
}

/** ISO (timestamptz) → "2026-11-10T08:00" en hora de Mérida, para precargar el input. */
export function isoToBusinessLocal(iso: string): string {
  const p = zonedParts(new Date(iso));
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

const dateTimeFormatter = new Intl.DateTimeFormat("es-MX", {
  timeZone: BUSINESS_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** "10 nov 2026, 8:00 a.m." en la zona del negocio. */
export function formatBusinessDateTimeFull(value: string) {
  return dateTimeFormatter.format(new Date(value));
}

/** "Hoy, 9:05 a.m." o "2 nov, 9:05 a.m." según el día local respecto a todayStart. */
export function formatBusinessDateTime(value: string, todayStart: string) {
  const time = formatBusinessTime(value);
  return businessDayKey(value) === businessDayKey(todayStart)
    ? `Hoy, ${time}`
    : `${dayFormatter.format(new Date(value))}, ${time}`;
}
