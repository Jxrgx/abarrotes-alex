import type { Database } from "@/types/database";

type ProductUnit = Database["public"]["Enums"]["product_unit"];

const priceFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

const quantityFormatter = new Intl.NumberFormat("es-MX", {
  maximumFractionDigits: 3,
});

// $18.00
export function formatPrice(value: number) {
  return priceFormatter.format(value);
}

// Montos en centavos enteros (carrito): 1850 -> $18.50
export function formatCents(cents: number) {
  return priceFormatter.format(cents / 100);
}

export function formatUnit(unit: ProductUnit, quantity = 1) {
  if (unit === "pieza") return quantity === 1 ? "pieza" : "piezas";
  return unit;
}

// 600 ml · 1.5 L · 250 g · 12 piezas
export function formatPresentation(presentation: number | null, unit: ProductUnit | null) {
  if (presentation === null || unit === null) return null;
  return `${quantityFormatter.format(presentation)} ${formatUnit(unit, presentation)}`;
}

// "08:00:00" -> "8:00 a. m."
export function formatTime(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const period = hours < 12 ? "a. m." : "p. m.";
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHours}:${String(minutes).padStart(2, "0")} ${period}`;
}

// Números de 10 dígitos de México, agrupados según su clave LADA:
// 55/33/81 (CDMX, Guadalajara, Monterrey) son de 2 dígitos -> "55 1234 5678";
// el resto son de 3 -> "984 471 0604". Cualquier otro formato se muestra tal cual.
const TWO_DIGIT_AREA_CODES = new Set(["55", "33", "81"]);

export function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 10) return phone;
  return TWO_DIGIT_AREA_CODES.has(digits.slice(0, 2))
    ? `${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}`
    : `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}
