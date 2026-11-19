import type { Project } from '../types';
import { addDays, todayIso } from './date';
import { GE_COLOR } from './colors';
import { DEFAULT_COLUMNS } from './columns';
import { schedule } from './schedule';
import { defaultResponsibilities } from './responsibilities';
import { endAfterWorkdays, nextWorkday } from './workdays';
import type { Dependency } from '../types';

const fs = (taskId: string): Dependency => ({ taskId, type: 'FS', lag: 0 });

export const DEFAULT_PROJECT_NAME = 'Projektüberschrift';

export function createSampleProject(): Project {
  const t0 = addDays(todayIso(), -5);
  // Erste Aufgabe auf Arbeitstage legen; alle weiteren berechnet schedule()
  const aStart = nextWorkday(t0);
  const t = (id: string, name: string, days: number, responsibility: string, progress: number, dependencies: Dependency[]) => ({
    id,
    name,
    start: aStart,
    end: endAfterWorkdays(aStart, days),
    progress,
    color: GE_COLOR,
    responsibility,
    dependencies,
  });
  return {
    version: 1,
    name: DEFAULT_PROJECT_NAME,
    calendar: 'workdays',
    columns: DEFAULT_COLUMNS.map((c) => ({ ...c })),
    // Daten werden über schedule() aus den Abhängigkeiten berechnet
    responsibilities: defaultResponsibilities(),
    // Beispiel: MRT-Installation. Daten der abhängigen Aufgaben berechnet schedule();
    // angegeben ist nur die Dauer in Arbeitstagen.
    tasks: schedule([
      t('a', 'Planung & Abstimmung', 5, 'ge', 100, []),
      t('b', 'Baufreiheit herstellen', 10, 'bauseitig', 60, [fs('a')]),
      t('c', 'Elektroinstallation', 8, 'elektro', 20, [{ taskId: 'b', type: 'SS', lag: 3 }]),
      t('d', 'Klima/Kälte-Anlage', 7, 'klima', 0, [{ taskId: 'b', type: 'SS', lag: 5 }]),
      t('e', 'HF-Kabine montieren', 8, 'hf-kabine', 0, [fs('b')]),
      t('h', 'Schlosserarbeiten', 4, 'schlosser', 0, [{ taskId: 'e', type: 'SS', lag: 2 }]),
      t('f', 'Einbringung MRT', 2, 'ge', 0, [fs('c'), fs('d'), fs('e')]),
      t('g', 'Inbetriebnahme & Übergabe', 5, 'ge', 0, [fs('f')]),
    ]),
  };
}
