import type { Column, ColumnKind, Responsibility, Task } from '../types';
import { responsibilityName } from './responsibilities';
import { formatDate } from './date';
import { formatDays, taskDuration } from './worktime';

export const BUILTIN_LABELS: Record<Exclude<ColumnKind, 'text'>, string> = {
  name: 'Aufgabe',
  start: 'Start',
  end: 'Ende',
  duration: 'Tage',
  responsibility: 'Zuständigkeit',
  buffer: 'Puffer',
};

/** Alle eingebauten Spalten; „Puffer" ist standardmäßig ausgeblendet. */
export const BUILTIN_COLUMNS: Column[] = [
  { id: 'name', kind: 'name', label: BUILTIN_LABELS.name },
  { id: 'start', kind: 'start', label: BUILTIN_LABELS.start },
  { id: 'end', kind: 'end', label: BUILTIN_LABELS.end },
  { id: 'duration', kind: 'duration', label: BUILTIN_LABELS.duration },
  { id: 'responsibility', kind: 'responsibility', label: BUILTIN_LABELS.responsibility },
  { id: 'buffer', kind: 'buffer', label: BUILTIN_LABELS.buffer },
];

export const DEFAULT_COLUMNS: Column[] = BUILTIN_COLUMNS.slice(0, 5);

export const COLUMN_WIDTH: Record<ColumnKind, number> = { name: 260, start: 140, end: 140, duration: 64, responsibility: 150, buffer: 70, text: 160 };

export const ACTIONS_WIDTH = 96;

/** Rechtsbündige Zahlenspalten */
export const isNumericColumn = (kind: ColumnKind) => kind === 'duration' || kind === 'buffer';

export function cellText(task: Task, column: Column, responsibilities: Responsibility[] = []): string {
  switch (column.kind) {
    case 'name':
      return task.name;
    case 'start':
      return task.startTime ? `${formatDate(task.start)} ${task.startTime}` : formatDate(task.start);
    case 'end':
      return task.endTime ? `${formatDate(task.end)} ${task.endTime}` : formatDate(task.end);
    case 'duration':
      return formatDays(taskDuration(task));
    case 'responsibility':
      return responsibilityName(task, responsibilities);
    case 'buffer':
      return task.buffer ? String(task.buffer) : '–';
    case 'text':
      return task.fields?.[column.id] ?? '';
  }
}

/** Eingebaute Spalten, die gerade nicht angezeigt werden und hinzugefügt werden können. */
export function missingBuiltins(columns: Column[]): Column[] {
  return BUILTIN_COLUMNS.filter((d) => d.kind !== 'name' && !columns.some((c) => c.kind === d.kind));
}
