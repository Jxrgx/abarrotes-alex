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

// 10 dígitos -> "55 0000 0000"; cualquier otro formato se muestra tal cual.
export function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10
    ? `${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}`
    : phone;
}
