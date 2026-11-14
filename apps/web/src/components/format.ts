/** Formatting shared by the account screens. Everything is pt-BR. */
import { PROTECTED_ROOM_GOLD_PER_HOUR } from "@sualive/config";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const amountFormat = new Intl.NumberFormat("pt-BR");

const DAY_MS = 24 * 60 * 60 * 1000;

/** 1990 → "1.990": an amount of silver or gold, or a price of the shop. */
export function formatAmount(amount: number): string {
  return amountFormat.format(amount);
}

/** A movement of the statement with its sign: 300 → "+300", -1990 → "−1.990". */
export function formatSignedAmount(amount: number): string {
  return `${amount < 0 ? "−" : "+"}${amountFormat.format(Math.abs(amount))}`;
}

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

// ---------- Gold as time of protected room ----------

const MINUTES_PER_HOUR = 60;

/** Whole minutes of protected room that a gold balance pays for, rounded down. Never negative. */
export function protectedRoomMinutes(gold: number): number {
  return Math.max(0, Math.floor((gold * MINUTES_PER_HOUR) / PROTECTED_ROOM_GOLD_PER_HOUR));
}

/** 90 → "1 h 30 min", 60 → "1 h", 45 → "45 min", 0 → "0 min". Whole minutes, rounded down. */
export function formatDuration(minutes: number): string {
  const whole = Math.max(0, Math.floor(minutes));
  const hours = Math.floor(whole / MINUTES_PER_HOUR);
  const rest = whole % MINUTES_PER_HOUR;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${amountFormat.format(hours)} h` : `${amountFormat.format(hours)} h ${rest} min`;
}

/**
 * A gold balance as time of protected room: 500 → "1 h", 750 → "1 h 30 min", 250 → "30 min".
 * The one formatting used by the wallet, the home page and the pages of the Plus.
 */
export function formatProtectedRoomTime(gold: number): string {
  return formatDuration(protectedRoomMinutes(gold));
}

const MINUTE_MS = 60 * 1000;

/** Whole hours and minutes of a duration, rounded to the minute: 4_980_000 → { hours: 1, minutes: 23 }. */
export function splitDuration(ms: number): { hours: number; minutes: number } {
  const total = Math.max(0, Math.round(ms / MINUTE_MS));
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

/** A countdown in minutes and seconds, rounded up to the second: 89_500 → "1:30"; never below "0:00". */
export function formatCountdown(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
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
