import type { Dependency, DependencyType, Task } from '../types';
import { toDayNumber } from './date';
import { endAfterWorkdays, endIndex, isoFromWorkIndex, nextWorkday, previousWorkday, startIndex, workDays } from './workdays';

export const DEPENDENCY_TYPES: { type: DependencyType; short: string; label: string }[] = [
  { type: 'FS', short: 'EA', label: 'Ende → Anfang' },
  { type: 'SS', short: 'AA', label: 'Anfang → Anfang' },
  { type: 'FF', short: 'EE', label: 'Ende → Ende' },
  { type: 'SF', short: 'AE', label: 'Anfang → Ende' },
];

export function dependencyShort(dep: Dependency): string {
  const short = DEPENDENCY_TYPES.find((d) => d.type === dep.type)?.short ?? dep.type;
  return dep.lag ? `${short}${dep.lag > 0 ? '+' : ''}${dep.lag}` : short;
}

export function dependencyLabel(dep: Dependency): string {
  const label = DEPENDENCY_TYPES.find((d) => d.type === dep.type)?.label ?? dep.type;
  if (!dep.lag) return label;
  return `${label}, ${dep.lag > 0 ? '+' : ''}${dep.lag} ${Math.abs(dep.lag) === 1 ? 'Arbeitstag' : 'Arbeitstage'}`;
}

export function bufferDays(task: Task): number {
  return task.buffer && task.buffer > 0 ? Math.round(task.buffer) : 0;
}

/** Dauer einer Aufgabe in Arbeitstagen (Mo–Fr ohne Feiertage). */
export function taskWorkDays(task: Task): number {
  return workDays(task.start, task.end);
}

/** Letzter Kalendertag des Puffers (Tagesnummer) oder null ohne Puffer. */
export function bufferEndDay(task: Task): number | null {
  const b = bufferDays(task);
  if (!b) return null;
  return toDayNumber(isoFromWorkIndex(endIndex(task.end) + b));
}

/**
 * Frühester Start (als Arbeitstag-Index), den diese Abhängigkeit für den Nachfolger erlaubt.
 * Gerechnet wird in Arbeitstagen mit exklusivem Ende (F = letzter Arbeitstag + 1).
 */
export function requiredStart(dep: Dependency, pred: Task, durationOfSuccessor: number): number {
  const S = startIndex(pred.start);
  // Puffer des Vorgängers verlängert sein Ende für alle ende-basierten Abhängigkeiten
  const F = S + taskWorkDays(pred) + bufferDays(pred);
  switch (dep.type) {
    case 'FS':
      return F + dep.lag;
    case 'SS':
      return S + dep.lag;
    case 'FF':
      return F + dep.lag - durationOfSuccessor;
    case 'SF':
      return S + dep.lag - durationOfSuccessor;
  }
}

/** Start (Arbeitstag-Index), den die Abhängigkeiten vorgeben (Maximum), oder null ohne Vorgänger. */
function constrainedStart(task: Task, byId: Map<string, Task>): number | null {
  const dur = taskWorkDays(task);
  let result: number | null = null;
  for (const dep of task.dependencies) {
    const pred = byId.get(dep.taskId);
    if (!pred) continue;
    const r = requiredStart(dep, pred, dur);
    result = result === null ? r : Math.max(result, r);
  }
  return result;
}

/** Aufgabe auf einen Arbeitstag-Index legen, Dauer in Arbeitstagen bleibt erhalten. */
function moveTo(task: Task, index: number): Task {
  const start = isoFromWorkIndex(index);
  const end = isoFromWorkIndex(index + taskWorkDays(task) - 1);
  return start === task.start && end === task.end ? task : { ...task, start, end };
}

/**
 * Automatische Planung: Jede Aufgabe mit Vorgängern wird genau auf den frühesten Start
 * gelegt, den ihre Abhängigkeiten (inkl. Versatz und Puffer) erlauben. Aufgaben ohne
 * Vorgänger bleiben, wo sie sind. Verschiebt man also eine Aufgabe, wandern alle Nachfolger mit.
 */
export function schedule(tasks: Task[]): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const done = new Set<string>();
  const visiting = new Set<string>();

  const visit = (id: string) => {
    if (done.has(id) || visiting.has(id)) return; // Zyklen werden beim Anlegen verhindert
    visiting.add(id);
    const task = byId.get(id)!;
    for (const dep of task.dependencies) if (byId.has(dep.taskId)) visit(dep.taskId);
    const start = constrainedStart(task, byId);
    if (start !== null) byId.set(id, moveTo(task, start));
    visiting.delete(id);
    done.add(id);
  };
  tasks.forEach((t) => visit(t.id));
  return tasks.map((t) => byId.get(t.id)!);
}

/**
 * Passt die Versätze aller Abhängigkeiten gleichmäßig an, sodass die Aufgabe genau an ihrem
 * aktuellen Start bleibt. Wird genutzt, wenn man eine abhängige Aufgabe selbst verschiebt
 * oder wenn sich ihre Vorgänger ändern, ohne dass sie springen soll.
 */
export function alignLags(task: Task, byId: Map<string, Task>): Task {
  const required = constrainedStart(task, byId);
  if (required === null) return task;
  const delta = startIndex(task.start) - required;
  if (delta === 0) return task;
  return { ...task, dependencies: task.dependencies.map((d) => (byId.has(d.taskId) ? { ...d, lag: d.lag + delta } : d)) };
}

/**
 * Neue Daten auf Arbeitstage legen. Wird die Aufgabe nur verschoben (Start und Ende um gleich
 * viele Kalendertage), bleibt ihre Dauer in Arbeitstagen erhalten. Sonst (Dauer geändert)
 * rutscht der Start auf den nächsten und das Ende auf den vorherigen Arbeitstag.
 */
export function normalizeDates(old: Task, start: string, end: string): { start: string; end: string } {
  const moved = toDayNumber(start) - toDayNumber(old.start);
  if (moved !== 0 && moved === toDayNumber(end) - toDayNumber(old.end)) {
    const s = nextWorkday(start);
    return { start: s, end: endAfterWorkdays(s, taskWorkDays(old)) };
  }
  return snapToWorkdays(start, end);
}

/** Start auf den nächsten, Ende auf den vorherigen Arbeitstag legen (mind. 1 Arbeitstag). */
export function snapToWorkdays(start: string, end: string): { start: string; end: string } {
  const s = nextWorkday(start);
  const e = previousWorkday(end);
  return { start: s, end: e < s ? s : e };
}

/** Setzt Start/Ende einer Aufgabe (z. B. per Drag & Drop) und plant alle Nachfolger neu. */
export function setTaskDates(tasks: Task[], id: string, start: string, end: string): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return schedule(tasks.map((t) => (t.id === id ? alignLags({ ...t, ...normalizeDates(t, start, end) }, byId) : t)));
}

/**
 * Versatz für eine neue Abhängigkeit: Liegt die Aufgabe schon später als nötig, bleibt sie
 * dort (Versatz = Abstand in Arbeitstagen); würde sie die Bedingung verletzen, wird sie
 * verschoben (Versatz 0).
 */
export function initialLag(task: Task, pred: Task, type: DependencyType): number {
  const r = requiredStart({ taskId: pred.id, type, lag: 0 }, pred, taskWorkDays(task));
  return Math.max(0, startIndex(task.start) - r);
}
