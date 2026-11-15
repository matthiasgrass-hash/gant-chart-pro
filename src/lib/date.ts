const MS_PER_DAY = 86_400_000;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

const pad = (n: number) => String(n).padStart(2, '0');

/** Tage seit 1970-01-01 (UTC) – unabhängig von Zeitzone und Sommerzeit. */
export function toDayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

export function fromDayNumber(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return fromDayNumber(toDayNumber(iso) + days);
}

/** Anzahl Tage von a bis b (b - a). */
export function diffDays(a: string, b: string): number {
  return toDayNumber(b) - toDayNumber(a);
}

/** Dauer einer Aufgabe in Tagen (Start und Ende inklusive). */
export function durationDays(start: string, end: string): number {
  return diffDays(start, end) + 1;
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isValidIso(value: unknown): value is string {
  return typeof value === 'string' && ISO_RE.test(value) && fromDayNumber(toDayNumber(value)) === value;
}

export function dateParts(day: number): { year: number; month: number; date: number; weekday: number } {
  const d = new Date(day * MS_PER_DAY);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), date: d.getUTCDate(), weekday: d.getUTCDay() };
}

/** ISO-8601-Kalenderwoche. */
export function isoWeek(day: number): number {
  const { weekday } = dateParts(day);
  const thursday = day + 3 - ((weekday + 6) % 7);
  const yearStart = toDayNumber(`${dateParts(thursday).year}-01-01`);
  return Math.floor((thursday - yearStart) / 7) + 1;
}

/** Montag der Woche, in der `day` liegt. */
export function startOfWeek(day: number): number {
  return day - ((dateParts(day).weekday + 6) % 7);
}

export function startOfMonth(day: number): number {
  const { year, month } = dateParts(day);
  return toDayNumber(`${year}-${pad(month + 1)}-01`);
}

const deFormatter = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

export function formatDate(iso: string): string {
  return deFormatter.format(new Date(toDayNumber(iso) * MS_PER_DAY));
}

export const MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
export const MONTHS_LONG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export const WEEKDAYS_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
