export type ViewMode = 'day' | 'week' | 'month';

export interface Task {
  id: string;
  name: string;
  /** Startdatum (inklusive), Format YYYY-MM-DD */
  start: string;
  /** Enddatum (inklusive), Format YYYY-MM-DD */
  end: string;
  /** Fortschritt 0–100 */
  progress: number;
  color: string;
  /** IDs der Vorgänger (Ende-Anfang-Beziehung) */
  dependencies: string[];
  /** Werte der eigenen Textspalten, Schlüssel = Spalten-ID */
  fields?: Record<string, string>;
}

/** name/start/end/duration sind eingebaute Spalten, text sind frei angelegte. */
export type ColumnKind = 'name' | 'start' | 'end' | 'duration' | 'text';

export interface Column {
  id: string;
  label: string;
  kind: ColumnKind;
}

export interface Project {
  version: 1;
  name: string;
  columns: Column[];
  tasks: Task[];
}
