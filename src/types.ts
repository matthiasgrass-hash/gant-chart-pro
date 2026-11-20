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
  /** Optionale Startzeit am Starttag (HH:MM, innerhalb der Arbeitszeit); fehlt = ganztägig ab Arbeitsbeginn */
  startTime?: string;
  /** Optionale Endzeit am Endtag (HH:MM); fehlt = bis Arbeitsende */
  endTime?: string;
  /** Fortschritt 0–100 */
  progress: number;
  color: string;
  /** Puffer in Tagen nach dem Ende; Nachfolger (EA/EE) richten sich nach Ende + Puffer */
  buffer?: number;
  /** Vorgänger dieser Aufgabe */
  dependencies: Dependency[];
  /** ID der Zuständigkeit (Gewerk); bestimmt die Balkenfarbe */
  responsibility?: string;
  /** Werte der eigenen Textspalten, Schlüssel = Spalten-ID */
  fields?: Record<string, string>;
}

/** name/start/end/duration sind eingebaute Spalten, text sind frei angelegte. */
export type ColumnKind = 'name' | 'start' | 'end' | 'duration' | 'responsibility' | 'buffer' | 'text';

export interface Column {
  id: string;
  label: string;
  kind: ColumnKind;
}

export interface Project {
  version: 1;
  /** Rechenbasis: Arbeitstage Mo–Fr ohne bundesweite Feiertage. Fehlt bei älteren Dateien (Kalendertage). */
  calendar: 'workdays';
  name: string;
  columns: Column[];
  /** Zuständigkeiten (Gewerke) mit ihrer Farbe – erscheinen in der Legende */
  responsibilities: Responsibility[];
  tasks: Task[];
}

export interface Responsibility {
  id: string;
  name: string;
  color: string;
}
