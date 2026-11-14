/** Formatting shared by the account screens. Everything is pt-BR. */

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const DAY_MS = 24 * 60 * 60 * 1000;

/** 1990 → "R$ 19,90" (with the non-breaking space the locale uses, so the price never wraps). */
export function formatCents(cents: number): string {
  return currency.format(cents / 100);
}

export function formatDate(timestamp: number): string {
  return dateFormat.format(timestamp);
}

/** "2026-11-14" → "14/11/2026", for a date written the ISO way (the version of the legal texts). */
export function formatIsoDate(date: string): string {
  const [year, month, day] = date.split("-");
  return year && month && day ? `${day}/${month}/${year}` : date;
}

export function formatDateTime(timestamp: number): string {
  return dateTimeFormat.format(timestamp);
}

/** Whole days from `now` until `timestamp`, rounded up; zero or less once it has passed. */
export function daysUntil(timestamp: number, now: number): number {
  return Math.ceil((timestamp - now) / DAY_MS);
}

// ---------- CPF ----------

export const CPF_LENGTH = 11;

export function cpfDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, CPF_LENGTH);
}

/** "12345678909" → "123.456.789-09", also for a partly typed number. */
export function maskCpf(value: string): string {
  const digits = cpfDigits(value);
  return [
    digits.slice(0, 3),
    digits.length > 3 ? `.${digits.slice(3, 6)}` : "",
    digits.length > 6 ? `.${digits.slice(6, 9)}` : "",
    digits.length > 9 ? `-${digits.slice(9, 11)}` : "",
  ].join("");
}

function checkDigit(digits: string, length: number): number {
  let sum = 0;
  for (let index = 0; index < length; index += 1) sum += Number(digits[index]) * (length + 1 - index);
  const rest = (sum * 10) % 11;
  return rest === 10 ? 0 : rest;
}

/** Validates the two check digits. Repeated digits ("111.111.111-11") pass the sum but are not CPFs. */
export function isValidCpf(value: string): boolean {
  const digits = cpfDigits(value);
  if (digits.length !== CPF_LENGTH || /^(\d)\1+$/.test(digits)) return false;
  return checkDigit(digits, 9) === Number(digits[9]) && checkDigit(digits, 10) === Number(digits[10]);
}
