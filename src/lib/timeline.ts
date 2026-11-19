import type { DependencyType, Task, ViewMode } from '../types';
import { holidayName, isNonWorking } from './workdays';
import { MONTHS_LONG, MONTHS_SHORT, WEEKDAYS_SHORT, dateParts, isoWeek, startOfMonth, startOfWeek, toDayNumber } from './date';

export const ROW_HEIGHT = 46;
export const HEADER_HEIGHT = 64;
export const BAR_HEIGHT = 28;

/** Schriftgröße der Balkenbeschriftung und geschätzte Breite pro Zeichen */
export const BAR_FONT = 14;
const CHAR_W = 8.2;

/** Geschätzte Breite einer Beschriftung in Pixeln */
export function labelWidth(text: string): number {
  return text.length * CHAR_W;
}

/** Passt die Beschriftung in den Balken? Sonst steht sie rechts daneben. */
export function labelFitsInside(text: string, barWidth: number): boolean {
  return barWidth > labelWidth(text) + 16;
}

export const PX_PER_DAY: Record<ViewMode, number> = { day: 40, week: 18, month: 6 };

export interface TimelineRange {
  startDay: number;
  days: number;
}

export interface HeaderCell {
  x: number;
  width: number;
  label: string;
  /** arbeitsfrei (Wochenende oder Feiertag) */
  weekend?: boolean;
  holiday?: string | null;
}

/** Sichtbarer Zeitraum: alle Aufgaben plus Puffer, an Woche/Monat ausgerichtet. */
export function computeRange(tasks: Task[], view: ViewMode, today: number): TimelineRange {
  let min = today;
  let max = today;
  for (const t of tasks) {
    min = Math.min(min, toDayNumber(t.start));
    max = Math.max(max, toDayNumber(t.end));
  }
  const pad = view === 'day' ? 7 : view === 'week' ? 21 : 45;
  let start = min - pad;
  let end = max + pad;
  if (view !== 'day') start = startOfWeek(start);
  if (view === 'month') start = startOfMonth(start);
  const minDays = view === 'day' ? 42 : view === 'week' ? 98 : 365;
  end = Math.max(end, start + minDays);
  return { startDay: start, days: end - start + 1 };
}

function segments(range: TimelineRange, ppd: number, keyOf: (day: number) => string, labelOf: (day: number) => string): HeaderCell[] {
  const cells: HeaderCell[] = [];
  let current: HeaderCell | null = null;
  let currentKey = '';
  for (let i = 0; i < range.days; i++) {
    const day = range.startDay + i;
    const key = keyOf(day);
    if (!current || key !== currentKey) {
      current = { x: i * ppd, width: 0, label: labelOf(day) };
      currentKey = key;
      cells.push(current);
    }
    current.width += ppd;
  }
  return cells;
}

export function headerRows(range: TimelineRange, view: ViewMode): { top: HeaderCell[]; bottom: HeaderCell[] } {
  const ppd = PX_PER_DAY[view];
  const monthKey = (d: number) => {
    const p = dateParts(d);
    return `${p.year}-${p.month}`;
  };
  if (view === 'day') {
    return {
      top: segments(range, ppd, monthKey, (d) => `${MONTHS_LONG[dateParts(d).month]} ${dateParts(d).year}`),
      bottom: Array.from({ length: range.days }, (_, i) => {
        const p = dateParts(range.startDay + i);
        const day = range.startDay + i;
        return { x: i * ppd, width: ppd, label: `${WEEKDAYS_SHORT[p.weekday]} ${p.date}`, weekend: isNonWorking(day), holiday: holidayName(day) };
      }),
    };
  }
  if (view === 'week') {
    return {
      top: segments(range, ppd, monthKey, (d) => `${MONTHS_SHORT[dateParts(d).month]} ${dateParts(d).year}`),
      bottom: segments(range, ppd, (d) => String(startOfWeek(d)), (d) => `KW ${isoWeek(d)}`),
    };
  }
  return {
    top: segments(range, ppd, (d) => String(dateParts(d).year), (d) => String(dateParts(d).year)),
    bottom: segments(range, ppd, monthKey, (d) => MONTHS_SHORT[dateParts(d).month]),
  };
}

export function barGeometry(task: Task, range: TimelineRange, ppd: number) {
  const x = (toDayNumber(task.start) - range.startDay) * ppd;
  const width = (toDayNumber(task.end) - toDayNumber(task.start) + 1) * ppd;
  return { x, width };
}

/** Pfad eines Abhängigkeitspfeils vom Ende des Vorgängers zum Start des Nachfolgers. */
export function dependencyPath(x1: number, y1: number, x2: number, y2: number): string {
  const gap = 10;
  if (x2 - x1 >= gap * 2) {
    const mid = x1 + gap;
    return `M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`;
  }
  const midY = y1 + (y2 > y1 ? ROW_HEIGHT / 2 : -ROW_HEIGHT / 2);
  return `M ${x1} ${y1} H ${x1 + gap} V ${midY} H ${x2 - gap} V ${y2} H ${x2}`;
}

/**
 * Pfeilpfad je nach Abhängigkeitsart. Startpunkt ist Anfang oder Ende des Vorgängers,
 * Ziel Anfang (Pfeil von links) oder Ende (Pfeil von rechts) des Nachfolgers.
 */
export function dependencyPathTyped(
  type: DependencyType,
  a: { x: number; width: number },
  y1: number,
  b: { x: number; width: number },
  y2: number,
): string {
  const gap = 10;
  const fromEnd = type === 'FS' || type === 'FF';
  const toStart = type === 'FS' || type === 'SS';
  const x1 = fromEnd ? a.x + a.width : a.x;
  const x2 = toStart ? b.x : b.x + b.width;
  if (type === 'FS') return dependencyPath(x1, y1, x2, y2);
  const ox1 = x1 + (fromEnd ? gap : -gap);
  const ox2 = x2 + (toStart ? -gap : gap);
  if (type === 'SS') return `M ${x1} ${y1} H ${Math.min(ox1, ox2)} V ${y2} H ${x2}`;
  if (type === 'FF') return `M ${x1} ${y1} H ${Math.max(ox1, ox2)} V ${y2} H ${x2}`;
  // SF: vom Anfang des Vorgängers nach links, ans Ende des Nachfolgers von rechts
  if (ox2 <= ox1) return `M ${x1} ${y1} H ${ox2} V ${y2} H ${x2}`;
  const midY = y1 + (y2 > y1 ? ROW_HEIGHT / 2 : -ROW_HEIGHT / 2);
  return `M ${x1} ${y1} H ${ox1} V ${midY} H ${ox2} V ${y2} H ${x2}`;
}
