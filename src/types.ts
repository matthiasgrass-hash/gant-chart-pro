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
}

export interface Project {
  version: 1;
  name: string;
  tasks: Task[];
}
