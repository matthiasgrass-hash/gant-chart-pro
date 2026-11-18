import type { Column, ColumnKind, Task } from '../types';
import { durationDays, formatDate } from './date';

export const BUILTIN_LABELS: Record<Exclude<ColumnKind, 'text'>, string> = {
  name: 'Aufgabe',
  start: 'Start',
  end: 'Ende',
  duration: 'Tage',
};

export const DEFAULT_COLUMNS: Column[] = [
  { id: 'name', kind: 'name', label: BUILTIN_LABELS.name },
  { id: 'start', kind: 'start', label: BUILTIN_LABELS.start },
  { id: 'end', kind: 'end', label: BUILTIN_LABELS.end },
  { id: 'duration', kind: 'duration', label: BUILTIN_LABELS.duration },
];

export const COLUMN_WIDTH: Record<ColumnKind, number> = { name: 220, start: 88, end: 88, duration: 52, text: 140 };

export const ACTIONS_WIDTH = 96;

export function cellText(task: Task, column: Column): string {
  switch (column.kind) {
    case 'name':
      return task.name;
    case 'start':
      return formatDate(task.start);
    case 'end':
      return formatDate(task.end);
    case 'duration':
      return String(durationDays(task.start, task.end));
    case 'text':
      return task.fields?.[column.id] ?? '';
  }
}

/** Eingebaute Spalten, die gerade ausgeblendet sind und wieder hinzugefügt werden können. */
export function missingBuiltins(columns: Column[]): Column[] {
  return DEFAULT_COLUMNS.filter((d) => d.kind !== 'name' && !columns.some((c) => c.kind === d.kind));
}
