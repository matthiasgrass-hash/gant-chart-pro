import type { Task, ViewMode } from '../types';
import { toDayNumber } from './date';
import { bufferEndDay } from './schedule';
import { BAR_HEIGHT, PX_PER_DAY, barGeometry, computeRange, labelFitsInside, labelWidth, type TimelineRange } from './timeline';
import { startOfMonth, startOfWeek } from './date';

export interface ExportRangeOptions {
  /** 'all' = vom ersten bis zum letzten Task, 'custom' = from…to */
  mode: 'all' | 'custom';
  from: string;
  to: string;
}

/** Abstand rechts vom Balken bis zur Beschriftung bzw. danach (px) */
const LABEL_GAP = 8;
const RIGHT_PAD = 16;

/**
 * Zeitraum und Aufgaben für den Export.
 * „Alles“: beginnt beim ersten Task und reicht so weit, dass jeder Balken inklusive Puffer
 * und rechts stehender Beschriftung vollständig sichtbar ist – unabhängig vom heutigen Tag.
 * „Bereich“: genau von–bis; nur Aufgaben, die in den Bereich fallen.
 */
export function exportTimeline(tasks: Task[], view: ViewMode, opts: ExportRangeOptions): { range: TimelineRange; tasks: Task[] } {
  const ppd = PX_PER_DAY[view];

  if (opts.mode === 'custom') {
    let from = toDayNumber(opts.from);
    let to = toDayNumber(opts.to);
    if (to < from) [from, to] = [to, from];
    const inRange = tasks.filter((t) => toDayNumber(t.start) <= to && (bufferEndDay(t) ?? toDayNumber(t.end)) >= from);
    return { range: { startDay: from, days: to - from + 1 }, tasks: inRange };
  }

  if (!tasks.length) return { range: computeRange(tasks, view, toDayNumber(new Date().toISOString().slice(0, 10))), tasks };

  let start = Math.min(...tasks.map((t) => toDayNumber(t.start)));
  if (view === 'day') start -= 1; // kleiner Rand vor dem ersten Balken
  if (view === 'week') start = startOfWeek(start);
  if (view === 'month') start = startOfMonth(start);

  // Rechtes Ende: Balkenende (inkl. Puffer) bzw. Ende der Beschriftung, falls sie neben dem Balken steht
  const probe: TimelineRange = { startDay: start, days: 1 };
  let endPx = 0;
  for (const t of tasks) {
    const { x, width } = barGeometry(t, probe, ppd);
    const bufEnd = bufferEndDay(t);
    const barRight = x + width + (bufEnd === null ? 0 : (bufEnd - toDayNumber(t.end)) * ppd);
    const isMilestone = t.start === t.end && view !== 'day';
    const outside = isMilestone || !labelFitsInside(t.name, width);
    // Meilenstein-Raute kann breiter als ein Tag sein
    const right = isMilestone ? Math.max(barRight, x + width / 2 + BAR_HEIGHT / 2) : barRight;
    endPx = Math.max(endPx, outside ? right + LABEL_GAP + labelWidth(t.name) + RIGHT_PAD : right + RIGHT_PAD);
  }
  const days = Math.max(1, Math.ceil(endPx / ppd));
  return { range: { startDay: start, days }, tasks };
}

/** Frühester Start und spätestes Ende (für die Vorbelegung des Datumsbereichs). */
export function projectSpan(tasks: Task[]): { from: string; to: string } | null {
  if (!tasks.length) return null;
  const from = tasks.reduce((m, t) => (t.start < m ? t.start : m), tasks[0].start);
  const to = tasks.reduce((m, t) => (t.end > m ? t.end : m), tasks[0].end);
  return { from, to };
}
