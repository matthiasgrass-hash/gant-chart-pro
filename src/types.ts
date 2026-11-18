export type ViewMode = 'day' | 'week' | 'month';

/**
 * Art der Abhängigkeit (Vorgänger → Nachfolger):
 * FS = Ende→Anfang (EA), SS = Anfang→Anfang (AA), FF = Ende→Ende (EE), SF = Anfang→Ende (AE)
 */
export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF';

export interface Dependency {
  /** ID des Vorgängers */
  taskId: string;
  type: DependencyType;
  /** Versatz in Tagen (negativ = Überlappung) */
  lag: number;
}

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
  /** Puffer in Tagen nach dem Ende; Nachfolger (EA/EE) richten sich nach Ende + Puffer */
  buffer?: number;
  /** Vorgänger dieser Aufgabe */
  dependencies: Dependency[];
  /** Werte der eigenen Textspalten, Schlüssel = Spalten-ID */
  fields?: Record<string, string>;
}

/** name/start/end/duration sind eingebaute Spalten, text sind frei angelegte. */
export type ColumnKind = 'name' | 'start' | 'end' | 'duration' | 'buffer' | 'text';

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
