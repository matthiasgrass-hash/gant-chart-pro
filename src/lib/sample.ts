import type { Project } from '../types';
import { addDays, todayIso } from './date';
import { GE_COLOR } from './colors';
import { DEFAULT_COLUMNS } from './columns';
import { schedule } from './schedule';
import { endAfterWorkdays, nextWorkday } from './workdays';
import type { Dependency } from '../types';

const fs = (taskId: string): Dependency => ({ taskId, type: 'FS', lag: 0 });

export const DEFAULT_PROJECT_NAME = 'Projektüberschrift';

export function createSampleProject(): Project {
  const t0 = addDays(todayIso(), -5);
  const d = (n: number) => addDays(t0, n);
  // Erste Aufgabe auf Arbeitstage legen; alle weiteren berechnet schedule()
  const aStart = nextWorkday(t0);
  return {
    version: 1,
    name: DEFAULT_PROJECT_NAME,
    calendar: 'workdays',
    columns: DEFAULT_COLUMNS.map((c) => ({ ...c })),
    // Daten werden über schedule() aus den Abhängigkeiten berechnet
    tasks: schedule([
      { id: 'a', name: 'Anforderungen sammeln', start: aStart, end: endAfterWorkdays(aStart, 5), progress: 100, color: GE_COLOR, dependencies: [] },
      { id: 'b', name: 'Konzept & Wireframes', start: d(5), end: d(11), progress: 60, color: GE_COLOR, dependencies: [fs('a')] },
      { id: 'c', name: 'Visuelles Design', start: d(8), end: d(16), progress: 20, color: GE_COLOR, dependencies: [{ taskId: 'b', type: 'SS', lag: 3 }] },
      { id: 'd', name: 'Frontend-Entwicklung', start: d(17), end: d(31), progress: 0, color: GE_COLOR, dependencies: [fs('c')] },
      { id: 'e', name: 'Backend-Anbindung', start: d(10), end: d(26), progress: 0, color: GE_COLOR, dependencies: [{ taskId: 'b', type: 'SS', lag: 5 }] },
      { id: 'h', name: 'Dokumentation', start: d(25), end: d(31), progress: 0, color: GE_COLOR, dependencies: [{ taskId: 'd', type: 'FF', lag: 0 }] },
      { id: 'f', name: 'Tests & QA', start: d(32), end: d(37), progress: 0, color: GE_COLOR, dependencies: [fs('d'), fs('e')] },
      { id: 'g', name: 'Go-Live', start: d(38), end: d(38), progress: 0, color: GE_COLOR, dependencies: [fs('f')] },
    ]),
  };
}
