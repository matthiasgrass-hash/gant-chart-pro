import type { Dependency, DependencyType, Task } from '../types';
import { toDayNumber } from './date';
import { MIN_DURATION, endFromPos, endPos, placeTask, roundPos, startFromPos, startPos, taskDuration } from './worktime';

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

/** Dauer einer Aufgabe in Arbeitstagen (Mo–Fr ohne Feiertage), auch Bruchteile wie 2,5. */
export function taskWorkDays(task: Task): number {
  return taskDuration(task);
}

/** Letzter Kalendertag des Puffers (Tagesnummer) oder null ohne Puffer. */
export function bufferEndDay(task: Task): number | null {
  const b = bufferDays(task);
  if (!b) return null;
  return toDayNumber(endFromPos(endPos(task) + b).end);
}

/**
 * Frühester Start (Position in Arbeitstagen, mit Bruchteilen), den diese Abhängigkeit
 * für den Nachfolger erlaubt. Endet der Vorgänger um 12:00, startet ein EA-Nachfolger um 12:00.
 */
export function requiredStart(dep: Dependency, pred: Task, durationOfSuccessor: number): number {
  const S = startPos(pred);
  // Puffer des Vorgängers verlängert sein Ende für alle ende-basierten Abhängigkeiten
  const F = endPos(pred) + bufferDays(pred);
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

/** Start (Position), den die Abhängigkeiten vorgeben (Maximum), oder null ohne Vorgänger. */
function constrainedStart(task: Task, byId: Map<string, Task>): number | null {
  const dur = taskDuration(task);
  let result: number | null = null;
  for (const dep of task.dependencies) {
    const pred = byId.get(dep.taskId);
    if (!pred) continue;
    const r = requiredStart(dep, pred, dur);
    result = result === null ? r : Math.max(result, r);
  }
  return result === null ? null : roundPos(result);
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
    if (start !== null) byId.set(id, placeTask(task, start, taskDuration(task)));
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
  const delta = roundPos(startPos(task) - required);
  if (Math.abs(delta) < 1e-9) return task;
  return { ...task, dependencies: task.dependencies.map((d) => (byId.has(d.taskId) ? { ...d, lag: roundPos(d.lag + delta) } : d)) };
}

/**
 * Neue Daten/Uhrzeiten auf Arbeitszeit legen. Wird die Aufgabe nur verschoben (Start und Ende
 * um gleich viele Kalendertage, Uhrzeiten unverändert), bleibt ihre Dauer erhalten. Sonst
 * (Dauer geändert) gelten Start und Ende so, wie angegeben – Wochenenden/Feiertage übersprungen.
 */
export function normalizeDates(old: Task, next: Pick<Task, 'start' | 'end' | 'startTime' | 'endTime'>): Pick<Task, 'start' | 'end' | 'startTime' | 'endTime'> {
  const moved = toDayNumber(next.start) - toDayNumber(old.start);
  const timesSame = next.startTime === old.startTime && next.endTime === old.endTime;
  const S = startPos(next);
  const isMove = timesSame && moved !== 0 && moved === toDayNumber(next.end) - toDayNumber(old.end);
  const duration = isMove ? taskDuration(old) : Math.max(MIN_DURATION, roundPos(endPos(next) - S));
  return { ...startFromPos(S), ...endFromPos(S + duration) };
}

/** Start und Ende auf Arbeitszeit legen (für neue Aufgaben). */
export function snapToWorkdays(task: Pick<Task, 'start' | 'end' | 'startTime' | 'endTime'>): Pick<Task, 'start' | 'end' | 'startTime' | 'endTime'> {
  const S = startPos(task);
  return { ...startFromPos(S), ...endFromPos(S + Math.max(MIN_DURATION, roundPos(endPos(task) - S))) };
}

/** Datumsfelder setzen und dabei fehlende Uhrzeiten wirklich entfernen. */
export function withDates(task: Task, d: Pick<Task, 'start' | 'end' | 'startTime' | 'endTime'>): Task {
  const { startTime: _s, endTime: _e, ...rest } = task;
  return { ...rest, start: d.start, end: d.end, ...(d.startTime ? { startTime: d.startTime } : {}), ...(d.endTime ? { endTime: d.endTime } : {}) };
}

/** Setzt Start/Ende einer Aufgabe (z. B. per Drag & Drop) und plant alle Nachfolger neu. Uhrzeiten bleiben erhalten. */
export function setTaskDates(tasks: Task[], id: string, start: string, end: string): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return schedule(tasks.map((t) => (t.id === id ? alignLags(withDates(t, normalizeDates(t, { ...t, start, end })), byId) : t)));
}

/**
 * Versatz für eine neue Abhängigkeit: Liegt die Aufgabe schon später als nötig, bleibt sie
 * dort (Versatz = Abstand in Arbeitstagen); würde sie die Bedingung verletzen, wird sie
 * verschoben (Versatz 0).
 */
export function initialLag(task: Task, pred: Task, type: DependencyType): number {
  const r = requiredStart({ taskId: pred.id, type, lag: 0 }, pred, taskDuration(task));
  return Math.max(0, roundPos(startPos(task) - r));
}
