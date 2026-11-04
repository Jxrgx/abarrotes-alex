import { BUSINESS_TIME_ZONE } from "./business";

// Fechas y horas en la zona horaria del negocio (no la del servidor ni UTC).
// Nunca usan la hora actual: "hoy" se recibe calculado por la base (todayStart).

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

/** "Hoy, 9:05 a.m." o "2 nov, 9:05 a.m." según el día local respecto a todayStart. */
export function formatBusinessDateTime(value: string, todayStart: string) {
  const time = formatBusinessTime(value);
  return businessDayKey(value) === businessDayKey(todayStart)
    ? `Hoy, ${time}`
    : `${dayFormatter.format(new Date(value))}, ${time}`;
}
