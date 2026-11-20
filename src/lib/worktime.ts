import type { Task } from '../types';
import { endIndex, isoFromWorkIndex, startIndex } from './workdays';

/**
 * Arbeitszeit innerhalb eines Arbeitstags. Uhrzeiten werden als Anteil dieses Fensters
 * gerechnet: 12:00 bei 08:00–16:00 = 0,5 Tage.
 */
export const WORK_START_MIN = 8 * 60;
export const WORK_END_MIN = 16 * 60;
const WORK_MIN = WORK_END_MIN - WORK_START_MIN;

/** Kleinste Dauer: 30 Minuten */
export const MIN_DURATION = 30 / WORK_MIN;

const EPS = 1e-6;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const WORK_START_LABEL = '08:00';
export const WORK_END_LABEL = '16:00';

/** Auf ganze Minuten der Arbeitszeit runden (vermeidet Rundungsfehler). */
export function roundPos(x: number): number {
  return Math.round(x * WORK_MIN) / WORK_MIN;
}

export function isValidTime(t: unknown): t is string {
  return typeof t === 'string' && TIME_RE.test(t);
}

/** Uhrzeit → Anteil des Arbeitstags (0 = Arbeitsbeginn, 1 = Arbeitsende), begrenzt auf die Arbeitszeit. */
export function timeToFraction(time: string | undefined, fallback: number): number {
  if (!isValidTime(time)) return fallback;
  const [h, m] = time.split(':').map(Number);
  const min = Math.min(WORK_END_MIN, Math.max(WORK_START_MIN, h * 60 + m));
  return (min - WORK_START_MIN) / WORK_MIN;
}

export function fractionToTime(f: number): string {
  const min = Math.round(WORK_START_MIN + f * WORK_MIN);
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** Startposition in Arbeitstagen (Arbeitstag-Index + Anteil). */
export function startPos(task: Pick<Task, 'start' | 'startTime'>): number {
  return startIndex(task.start) + timeToFraction(task.startTime, 0);
}

/** Endposition (exklusiv) in Arbeitstagen. */
export function endPos(task: Pick<Task, 'end' | 'endTime'>): number {
  return endIndex(task.end) + timeToFraction(task.endTime, 1);
}

/** Dauer in Arbeitstagen, auch Bruchteile (z. B. 2,5). */
export function taskDuration(task: Pick<Task, 'start' | 'startTime' | 'end' | 'endTime'>): number {
  return Math.max(MIN_DURATION, roundPos(endPos(task) - startPos(task)));
}

/** Position → Startdatum (+ Uhrzeit, falls nicht Arbeitsbeginn). */
export function startFromPos(pos: number): { start: string; startTime?: string } {
  const p = roundPos(pos);
  const idx = Math.floor(p + EPS);
  const f = p - idx;
  return f < EPS ? { start: isoFromWorkIndex(idx) } : { start: isoFromWorkIndex(idx), startTime: fractionToTime(f) };
}

/** Position (exklusiv) → Enddatum (+ Uhrzeit, falls nicht Arbeitsende). */
export function endFromPos(pos: number): { end: string; endTime?: string } {
  const p = roundPos(pos);
  const idx = Math.ceil(p - EPS) - 1;
  const f = p - idx;
  return f > 1 - EPS ? { end: isoFromWorkIndex(idx) } : { end: isoFromWorkIndex(idx), endTime: fractionToTime(f) };
}

/** Aufgabe an eine Startposition mit gegebener Dauer legen; unverändert, wenn schon so. */
export function placeTask(task: Task, pos: number, duration: number): Task {
  const s = startFromPos(pos);
  const e = endFromPos(pos + Math.max(MIN_DURATION, duration));
  if (s.start === task.start && s.startTime === task.startTime && e.end === task.end && e.endTime === task.endTime) return task;
  const { startTime: _s, endTime: _e, ...rest } = task;
  return { ...rest, ...s, ...e };
}

/** Zahl deutsch formatieren: 2.5 → „2,5“, 3 → „3“. */
export function formatDays(n: number): string {
  return (Math.round(n * 100) / 100).toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

/** Eingabe wie „2,5“ oder „2.5“ lesen. */
export function parseDays(text: string): number | null {
  const n = Number(text.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
