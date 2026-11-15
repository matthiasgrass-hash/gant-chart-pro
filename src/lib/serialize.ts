import type { Project, Task } from '../types';
import { isValidIso } from './date';
import { TASK_COLORS } from './colors';

export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2);
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Liest ein Projekt aus JSON und prüft die Struktur. Wirft bei ungültigen Daten. */
export function parseProject(text: string): Project {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Die Datei enthält kein gültiges JSON.');
  }
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { tasks?: unknown }).tasks)) {
    throw new Error('Die Datei enthält kein Gantt-Projekt (Feld „tasks" fehlt).');
  }
  const obj = raw as { name?: unknown; tasks: unknown[] };
  const ids = new Set<string>();
  const tasks: Task[] = obj.tasks.map((item, index) => {
    const t = item as Partial<Record<keyof Task, unknown>>;
    const label = `Aufgabe ${index + 1}`;
    if (!t || typeof t !== 'object') throw new Error(`${label} ist ungültig.`);
    if (typeof t.id !== 'string' || !t.id) throw new Error(`${label} hat keine ID.`);
    if (ids.has(t.id)) throw new Error(`Die ID „${t.id}" kommt mehrfach vor.`);
    ids.add(t.id);
    if (!isValidIso(t.start) || !isValidIso(t.end)) throw new Error(`${label} hat ein ungültiges Datum (erwartet JJJJ-MM-TT).`);
    if (t.end < t.start) throw new Error(`${label} endet vor ihrem Start.`);
    const progress = typeof t.progress === 'number' && Number.isFinite(t.progress) ? Math.min(100, Math.max(0, Math.round(t.progress))) : 0;
    return {
      id: t.id,
      name: typeof t.name === 'string' && t.name.trim() ? t.name : `Aufgabe ${index + 1}`,
      start: t.start,
      end: t.end,
      progress,
      color: typeof t.color === 'string' && HEX_RE.test(t.color) ? t.color : TASK_COLORS[index % TASK_COLORS.length],
      dependencies: Array.isArray(t.dependencies) ? t.dependencies.filter((d): d is string => typeof d === 'string') : [],
    };
  });
  // Verweise auf nicht vorhandene Aufgaben entfernen
  for (const task of tasks) task.dependencies = task.dependencies.filter((d) => ids.has(d) && d !== task.id);
  return {
    version: 1,
    name: typeof obj.name === 'string' && obj.name.trim() ? obj.name : 'Importiertes Projekt',
    tasks,
  };
}
