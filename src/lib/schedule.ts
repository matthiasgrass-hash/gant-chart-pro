import type { Dependency, DependencyType, Task } from '../types';
import { durationDays, fromDayNumber, toDayNumber } from './date';

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
  return `${label}, ${dep.lag > 0 ? '+' : ''}${dep.lag} ${Math.abs(dep.lag) === 1 ? 'Tag' : 'Tage'}`;
}

/**
 * Frühester Start (Tagesnummer), den diese Abhängigkeit für den Nachfolger erlaubt.
 * Gerechnet wird mit exklusivem Ende (F = letzter Tag + 1).
 */
export function requiredStart(dep: Dependency, pred: Task, durationOfSuccessor: number): number {
  const S = toDayNumber(pred.start);
  const F = toDayNumber(pred.end) + 1;
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

/** Start, den die Abhängigkeiten vorgeben (Maximum aller Vorgänger), oder null ohne Vorgänger. */
function constrainedStart(task: Task, byId: Map<string, Task>): number | null {
  const dur = durationDays(task.start, task.end);
  let result: number | null = null;
  for (const dep of task.dependencies) {
    const pred = byId.get(dep.taskId);
    if (!pred) continue;
    const r = requiredStart(dep, pred, dur);
    result = result === null ? r : Math.max(result, r);
  }
  return result;
}

function moveTo(task: Task, startDay: number): Task {
  const current = toDayNumber(task.start);
  if (current === startDay) return task;
  const dur = durationDays(task.start, task.end);
  return { ...task, start: fromDayNumber(startDay), end: fromDayNumber(startDay + dur - 1) };
}

/**
 * Automatische Planung: Jede Aufgabe mit Vorgängern wird genau auf den frühesten Start
 * gelegt, den ihre Abhängigkeiten (inkl. Versatz) erlauben. Aufgaben ohne Vorgänger bleiben,
 * wo sie sind. Verschiebt man also eine Aufgabe, wandern alle Nachfolger mit.
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
  const delta = toDayNumber(task.start) - required;
  if (delta === 0) return task;
  return { ...task, dependencies: task.dependencies.map((d) => (byId.has(d.taskId) ? { ...d, lag: d.lag + delta } : d)) };
}

/** Setzt Start/Ende einer Aufgabe (z. B. per Drag & Drop) und plant alle Nachfolger neu. */
export function setTaskDates(tasks: Task[], id: string, start: string, end: string): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return schedule(tasks.map((t) => (t.id === id ? alignLags({ ...t, start, end }, byId) : t)));
}

/**
 * Versatz für eine neue Abhängigkeit: Liegt die Aufgabe schon später als nötig, bleibt sie
 * dort (Versatz = Abstand); würde sie die Bedingung verletzen, wird sie verschoben (Versatz 0).
 */
export function initialLag(task: Task, pred: Task, type: DependencyType): number {
  const r = requiredStart({ taskId: pred.id, type, lag: 0 }, pred, durationDays(task.start, task.end));
  return Math.max(0, toDayNumber(task.start) - r);
}
