import type { Column, ColumnKind, Dependency, DependencyType, Project, Task } from '../types';
import { isValidIso } from './date';
import { GE_COLOR } from './colors';
import { alignLags } from './schedule';
import { wouldCreateCycle } from './graph';
import { BUILTIN_COLUMNS, DEFAULT_COLUMNS } from './columns';

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
  const legacy = new Set<string>();
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
      color: typeof t.color === 'string' && HEX_RE.test(t.color) ? t.color : GE_COLOR,
      dependencies: parseDependencies(t.dependencies, legacy, t.id),
      fields: parseFields(t.fields),
      ...(typeof t.buffer === 'number' && Number.isFinite(t.buffer) && t.buffer >= 1 ? { buffer: Math.round(t.buffer) } : {}),
    };
  });
  // Verweise auf nicht vorhandene Aufgaben entfernen
  for (const task of tasks) {
    const seen = new Set<string>();
    task.dependencies = task.dependencies.filter((d) => ids.has(d.taskId) && d.taskId !== task.id && !seen.has(d.taskId) && Boolean(seen.add(d.taskId)));
  }
  // Ältere Dateien (Abhängigkeiten nur als ID-Liste oder Versatz in Kalendertagen):
  // Versatz in Arbeitstagen so wählen, dass sich keine Starttermine verschieben
  const calendarDays = (obj as { calendar?: unknown }).calendar !== 'workdays';
  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (let i = 0; i < tasks.length; i++) {
    if (calendarDays || legacy.has(tasks[i].id)) tasks[i] = alignLags(tasks[i], byId);
  }
  // Zyklen (z. B. aus Hand-bearbeiteten Dateien) auflösen
  for (const task of tasks) {
    const clean: typeof task.dependencies = [];
    for (const d of task.dependencies) {
      const probe = tasks.map((t) => (t.id === task.id ? { ...t, dependencies: clean } : t));
      if (!wouldCreateCycle(probe, task.id, d.taskId)) clean.push(d);
    }
    task.dependencies = clean;
  }
  const columns = parseColumns((obj as { columns?: unknown }).columns);
  // Nur Werte behalten, zu denen es eine Textspalte gibt
  const textIds = new Set(columns.filter((c) => c.kind === 'text').map((c) => c.id));
  for (const task of tasks) {
    const entries = Object.entries(task.fields ?? {}).filter(([k, v]) => textIds.has(k) && v !== '');
    if (entries.length) task.fields = Object.fromEntries(entries);
    else delete task.fields;
  }
  return {
    version: 1,
    calendar: 'workdays',
    name: typeof obj.name === 'string' && obj.name.trim() ? obj.name : 'Importiertes Projekt',
    columns,
    tasks,
  };
}

function parseFields(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const entries = Object.entries(raw as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string');
  return entries.length ? Object.fromEntries(entries) : undefined;
}

const KINDS: ColumnKind[] = ['name', 'start', 'end', 'duration', 'buffer', 'text'];

/** Spalten prüfen; fehlt die Angabe (ältere Dateien), gelten die Standardspalten. */
function parseColumns(raw: unknown): Column[] {
  if (!Array.isArray(raw)) return DEFAULT_COLUMNS.map((c) => ({ ...c }));
  const seenIds = new Set<string>();
  const seenKinds = new Set<ColumnKind>();
  const result: Column[] = [];
  for (const item of raw) {
    const c = item as Partial<Column>;
    if (!c || typeof c.id !== 'string' || !c.id || seenIds.has(c.id)) continue;
    if (!KINDS.includes(c.kind as ColumnKind)) continue;
    const kind = c.kind as ColumnKind;
    if (kind !== 'text' && seenKinds.has(kind)) continue;
    const fallback = BUILTIN_COLUMNS.find((d) => d.kind === kind)?.label ?? 'Spalte';
    seenIds.add(c.id);
    seenKinds.add(kind);
    result.push({ id: c.id, kind, label: typeof c.label === 'string' && c.label.trim() ? c.label : fallback });
  }
  // Die Aufgaben-Spalte muss immer vorhanden sein und steht vorne
  const nameIndex = result.findIndex((c) => c.kind === 'name');
  const name = nameIndex >= 0 ? result.splice(nameIndex, 1)[0] : { ...DEFAULT_COLUMNS[0] };
  return [name, ...result];
}

const DEP_TYPES: DependencyType[] = ['FS', 'SS', 'FF', 'SF'];

/** Liest Abhängigkeiten; alte Dateien enthalten nur IDs (= Ende→Anfang). */
function parseDependencies(raw: unknown, legacy: Set<string>, taskId: unknown): Dependency[] {
  if (!Array.isArray(raw)) return [];
  const result: Dependency[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      result.push({ taskId: item, type: 'FS', lag: 0 });
      if (typeof taskId === 'string') legacy.add(taskId);
    } else if (item && typeof item === 'object' && typeof (item as Dependency).taskId === 'string') {
      const d = item as Partial<Dependency>;
      result.push({
        taskId: d.taskId!,
        type: DEP_TYPES.includes(d.type as DependencyType) ? (d.type as DependencyType) : 'FS',
        lag: typeof d.lag === 'number' && Number.isFinite(d.lag) ? Math.round(d.lag) : 0,
      });
    }
  }
  return result;
}
