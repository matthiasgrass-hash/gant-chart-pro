import type { Project } from '../types';
import { addDays, todayIso } from './date';
import { GE_COLOR } from './colors';
import { DEFAULT_COLUMNS } from './columns';

export const DEFAULT_PROJECT_NAME = 'Projektüberschrift';

export function createSampleProject(): Project {
  const t0 = addDays(todayIso(), -5);
  const d = (n: number) => addDays(t0, n);
  return {
    version: 1,
    name: DEFAULT_PROJECT_NAME,
    columns: DEFAULT_COLUMNS.map((c) => ({ ...c })),
    tasks: [
      { id: 'a', name: 'Anforderungen sammeln', start: d(0), end: d(4), progress: 100, color: GE_COLOR, dependencies: [] },
      { id: 'b', name: 'Konzept & Wireframes', start: d(5), end: d(11), progress: 60, color: GE_COLOR, dependencies: ['a'] },
      { id: 'c', name: 'Visuelles Design', start: d(10), end: d(18), progress: 20, color: GE_COLOR, dependencies: ['b'] },
      { id: 'd', name: 'Frontend-Entwicklung', start: d(19), end: d(33), progress: 0, color: GE_COLOR, dependencies: ['c'] },
      { id: 'e', name: 'Backend-Anbindung', start: d(14), end: d(30), progress: 0, color: GE_COLOR, dependencies: ['b'] },
      { id: 'f', name: 'Tests & QA', start: d(34), end: d(39), progress: 0, color: GE_COLOR, dependencies: ['d', 'e'] },
      { id: 'g', name: 'Go-Live', start: d(40), end: d(40), progress: 0, color: GE_COLOR, dependencies: ['f'] },
    ],
  };
}
