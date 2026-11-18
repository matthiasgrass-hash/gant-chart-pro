import { fromDayNumber, toDayNumber } from './date';

/**
 * Arbeitstage-Kalender: Montag–Freitag, ohne bundesweite gesetzliche Feiertage in Deutschland.
 *
 * Jeder Arbeitstag bekommt eine fortlaufende Nummer („Arbeitstag-Index“), sodass sich
 * Dauer, Versatz und Puffer einfach in Arbeitstagen rechnen lassen. Tag 0 = 1970-01-01.
 */

/** Wochentag mit Montag = 0 … Sonntag = 6 */
function mondayBased(day: number): number {
  return (((day + 3) % 7) + 7) % 7;
}

export function isWeekend(day: number): boolean {
  return mondayBased(day) >= 5;
}

// ---------- Feiertage ----------

/** Ostersonntag (Gregorianischer Kalender, Algorithmus nach Meeus/Jones/Butcher). */
function easterSunday(year: number): number {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return toDayNumber(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
}

/** Bundesweite gesetzliche Feiertage eines Jahres (Tagesnummer → Name). */
export function germanHolidays(year: number): Map<number, string> {
  const fixed = (md: string) => toDayNumber(`${year}-${md}`);
  const easter = easterSunday(year);
  const list: [number, string][] = [
    [fixed('01-01'), 'Neujahr'],
    [easter - 2, 'Karfreitag'],
    [easter + 1, 'Ostermontag'],
    [fixed('05-01'), 'Tag der Arbeit'],
    [easter + 39, 'Christi Himmelfahrt'],
    [easter + 50, 'Pfingstmontag'],
    [fixed('10-03'), 'Tag der Deutschen Einheit'],
    [fixed('12-25'), '1. Weihnachtstag'],
    [fixed('12-26'), '2. Weihnachtstag'],
  ];
  // 2017 war der Reformationstag einmalig bundesweit Feiertag
  if (year === 2017) list.push([fixed('10-31'), 'Reformationstag']);
  return new Map(list);
}

const FIRST_YEAR = 1950;
const LAST_YEAR = 2150;
let holidayNames: Map<number, string> | null = null;
/** Sortierte Feiertage, die auf Mo–Fr fallen (nur diese verändern die Arbeitstage-Zählung). */
let weekdayHolidays: number[] = [];

function ensureHolidays() {
  if (holidayNames) return;
  holidayNames = new Map();
  for (let y = FIRST_YEAR; y <= LAST_YEAR; y++) for (const [d, n] of germanHolidays(y)) holidayNames.set(d, n);
  weekdayHolidays = [...holidayNames.keys()].filter((d) => !isWeekend(d)).sort((a, b) => a - b);
}

export function holidayName(day: number): string | null {
  ensureHolidays();
  return holidayNames!.get(day) ?? null;
}

export function isHoliday(day: number): boolean {
  return holidayName(day) !== null;
}

/** Arbeitsfrei: Wochenende oder bundesweiter Feiertag. */
export function isNonWorking(day: number): boolean {
  return isWeekend(day) || isHoliday(day);
}

/** Anzahl der Werktags-Feiertage strikt vor `day` (binäre Suche). */
function holidaysBefore(day: number): number {
  ensureHolidays();
  let lo = 0;
  let hi = weekdayHolidays.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (weekdayHolidays[mid] < day) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// ---------- Arbeitstag-Index ----------

/** Index nur über Wochenenden (Sa/So zählen als folgender Montag). */
function weekdayIndex(day: number): number {
  const wd = mondayBased(day);
  return ((day - wd + 3) / 7) * 5 + Math.min(wd, 5);
}

function dayFromWeekdayIndex(index: number): number {
  const week = Math.floor(index / 5);
  return week * 7 + (index - week * 5) - 3;
}

function nextWorkingDay(day: number): number {
  let d = day;
  while (isNonWorking(d)) d++;
  return d;
}

function previousWorkingDay(day: number): number {
  let d = day;
  while (isNonWorking(d)) d--;
  return d;
}

/** Index des Arbeitstags; arbeitsfreie Tage zählen als der nächste Arbeitstag. */
export function workIndexForward(day: number): number {
  const d = nextWorkingDay(day);
  return weekdayIndex(d) - holidaysBefore(d);
}

/** Index des Arbeitstags; arbeitsfreie Tage zählen als der vorherige Arbeitstag. */
export function workIndexBackward(day: number): number {
  const d = previousWorkingDay(day);
  return weekdayIndex(d) - holidaysBefore(d);
}

/** Kalendertag (Tagesnummer) zu einem Arbeitstag-Index. */
export function dayFromWorkIndex(index: number): number {
  // Fixpunkt: gesucht ist ein Arbeitstag d mit weekdayIndex(d) - holidaysBefore(d) = index
  let h = 0;
  for (;;) {
    const d = dayFromWeekdayIndex(index + h);
    const hd = holidaysBefore(d);
    if (hd !== h) h = hd;
    else if (isHoliday(d)) h += 1;
    else return d;
  }
}

export const startIndex = (iso: string) => workIndexForward(toDayNumber(iso));
export const endIndex = (iso: string) => workIndexBackward(toDayNumber(iso));
export const isoFromWorkIndex = (index: number) => fromDayNumber(dayFromWorkIndex(index));

/** Anzahl Arbeitstage von start bis end (beide inklusive), mindestens 1. */
export function workDays(start: string, end: string): number {
  return Math.max(1, endIndex(end) - startIndex(start) + 1);
}

/** Datum auf den nächsten Arbeitstag schieben (Wochenende/Feiertag → nächster Arbeitstag). */
export const nextWorkday = (iso: string) => isoFromWorkIndex(startIndex(iso));

/** Datum auf den vorherigen Arbeitstag schieben (Wochenende/Feiertag → vorheriger Arbeitstag). */
export const previousWorkday = (iso: string) => isoFromWorkIndex(endIndex(iso));

/** Enddatum für einen Start und eine Dauer in Arbeitstagen. */
export function endAfterWorkdays(start: string, days: number): string {
  return isoFromWorkIndex(startIndex(start) + Math.max(1, days) - 1);
}
