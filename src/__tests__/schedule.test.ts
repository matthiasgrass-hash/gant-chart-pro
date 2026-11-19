import { describe, expect, it } from 'vitest';
import type { Dependency, DependencyType, Project, Task } from '../types';
import { schedule, setTaskDates } from '../lib/schedule';
import { projectReducer } from '../state/projectReducer';
import { parseProject } from '../lib/serialize';
import { DEFAULT_COLUMNS } from '../lib/columns';
import { createSampleProject } from '../lib/sample';

/*
 * Alle Rechnungen in Arbeitstagen (Mo–Fr, ohne bundesweite Feiertage).
 * Juni 2026: Mo 1., Fr 5., Mo 8., Fr 12., Mo 15. – Pfingstmontag ist der 25.05.2026.
 */

const task = (id: string, start: string, end: string, dependencies: Dependency[] = []): Task => ({
  id,
  name: id,
  start,
  end,
  progress: 0,
  color: '#6022a7',
  dependencies,
});
const dep = (taskId: string, type: DependencyType = 'FS', lag = 0): Dependency => ({ taskId, type, lag });
const dates = (tasks: Task[], id: string) => {
  const t = tasks.find((x) => x.id === id)!;
  return [t.start, t.end];
};
const project = (tasks: Task[]): Project => ({ version: 1, calendar: 'workdays', name: 'T', columns: DEFAULT_COLUMNS, responsibilities: [], tasks });
const load = (tasks: Task[]) => projectReducer(project([]), { type: 'load', project: project(tasks) });

// Vorgänger A: Mo 01.–Fr 05.06.2026 (5 Arbeitstage), Nachfolger B dauert 3 Arbeitstage
const A = task('a', '2026-06-01', '2026-06-05');
const B = (deps: Dependency[]) => task('b', '2026-06-22', '2026-06-24', deps);

describe('Abhängigkeitsarten (Arbeitstage)', () => {
  it('EA: B startet am nächsten Arbeitstag nach A – über das Wochenende', () => {
    expect(dates(schedule([A, B([dep('a', 'FS')])]), 'b')).toEqual(['2026-06-08', '2026-06-10']);
  });
  it('AA mit Versatz +2', () => {
    expect(dates(schedule([A, B([dep('a', 'SS', 2)])]), 'b')).toEqual(['2026-06-03', '2026-06-05']);
  });
  it('EE: B endet mit A', () => {
    expect(dates(schedule([A, B([dep('a', 'FF')])]), 'b')).toEqual(['2026-06-03', '2026-06-05']);
  });
  it('AE: B endet am Arbeitstag vor dem Start von A', () => {
    expect(dates(schedule([A, B([dep('a', 'SF')])]), 'b')).toEqual(['2026-05-27', '2026-05-29']);
  });
  it('negativer Versatz = Überlappung, Dauer läuft übers Wochenende', () => {
    expect(dates(schedule([A, B([dep('a', 'FS', -2)])]), 'b')).toEqual(['2026-06-04', '2026-06-08']);
  });
  it('mehrere Vorgänger: der späteste bestimmt den Start', () => {
    const C = task('c', '2026-06-01', '2026-06-10');
    expect(dates(schedule([A, C, task('b', '2026-06-01', '2026-06-01', [dep('a'), dep('c')])]), 'b')).toEqual(['2026-06-11', '2026-06-11']);
  });
  it('Feiertag wird übersprungen (Pfingstmontag 25.05.2026)', () => {
    const P = task('p', '2026-05-18', '2026-05-22');
    expect(dates(schedule([P, task('b', '2026-06-01', '2026-06-03', [dep('p')])]), 'b')).toEqual(['2026-05-26', '2026-05-28']);
  });
});

describe('automatisches Verschieben', () => {
  const chain = schedule([A, task('b', '2026-06-08', '2026-06-10', [dep('a')]), task('c', '2026-06-09', '2026-06-09', [dep('b', 'SS', 1)])]);

  it('erste Aufgabe eine Woche nach hinten → ganze Kette folgt', () => {
    const moved = setTaskDates(chain, 'a', '2026-06-08', '2026-06-12');
    expect(dates(moved, 'b')).toEqual(['2026-06-15', '2026-06-17']);
    expect(dates(moved, 'c')).toEqual(['2026-06-16', '2026-06-16']);
  });
  it('erste Aufgabe nach vorne → Kette folgt, Feiertag wird ausgelassen', () => {
    const moved = setTaskDates(chain, 'a', '2026-05-18', '2026-05-22');
    expect(dates(moved, 'b')).toEqual(['2026-05-26', '2026-05-28']);
    expect(dates(moved, 'c')).toEqual(['2026-05-27', '2026-05-27']);
  });
  it('Verschieben behält die Dauer in Arbeitstagen (Balken wird über Wochenende länger)', () => {
    const moved = setTaskDates(chain, 'a', '2026-06-04', '2026-06-08'); // um 3 Kalendertage
    expect(dates(moved, 'a')).toEqual(['2026-06-04', '2026-06-10']);
    expect(dates(moved, 'b')).toEqual(['2026-06-11', '2026-06-15']);
  });
  it('Start auf Samstag rutscht auf Montag', () => {
    expect(dates(setTaskDates(chain, 'a', '2026-06-06', '2026-06-10'), 'a')).toEqual(['2026-06-08', '2026-06-12']);
  });
  it('Dauer verlängern verschiebt EA-Nachfolger', () => {
    expect(dates(setTaskDates(chain, 'a', '2026-06-01', '2026-06-09'), 'b')).toEqual(['2026-06-10', '2026-06-12']);
  });
  it('abhängige Aufgabe selbst verschieben: bleibt liegen, Versatz passt sich an, Nachfolger folgen', () => {
    const moved = setTaskDates(chain, 'b', '2026-06-10', '2026-06-12');
    expect(dates(moved, 'b')).toEqual(['2026-06-10', '2026-06-12']);
    expect(moved.find((t) => t.id === 'b')!.dependencies[0].lag).toBe(2);
    expect(dates(moved, 'c')).toEqual(['2026-06-11', '2026-06-11']);
    // Danach wandert b mit a weiterhin mit – mit dem neuen Abstand
    expect(dates(setTaskDates(moved, 'a', '2026-06-02', '2026-06-06'), 'b')).toEqual(['2026-06-11', '2026-06-15']);
  });
});

describe('Reducer', () => {
  it('neue Abhängigkeit verschiebt nur, wenn die Bedingung verletzt wäre', () => {
    let p = load([A, task('b', '2026-06-03', '2026-06-04'), task('c', '2026-06-15', '2026-06-16')]);
    p = projectReducer(p, { type: 'addDependency', taskId: 'b', predecessorId: 'a' });
    expect(dates(p.tasks, 'b')).toEqual(['2026-06-08', '2026-06-09']); // verschoben
    p = projectReducer(p, { type: 'addDependency', taskId: 'c', predecessorId: 'a' });
    expect(dates(p.tasks, 'c')).toEqual(['2026-06-15', '2026-06-16']); // bleibt, Versatz = Abstand
    expect(p.tasks.find((t) => t.id === 'c')!.dependencies[0].lag).toBe(5);
  });
  it('Abhängigkeit entfernen oder Vorgänger löschen verschiebt nichts', () => {
    let p = load([A, task('c', '2026-06-01', '2026-06-10'), task('b', '2026-06-11', '2026-06-11', [dep('a', 'FS', 2), dep('c')])]);
    expect(dates(p.tasks, 'b')).toEqual(['2026-06-11', '2026-06-11']);
    p = projectReducer(p, { type: 'removeDependency', taskId: 'b', predecessorId: 'c' });
    expect(dates(p.tasks, 'b')).toEqual(['2026-06-11', '2026-06-11']);
    p = projectReducer(p, { type: 'deleteTask', id: 'a' });
    expect(dates(p.tasks, 'b')).toEqual(['2026-06-11', '2026-06-11']);
    expect(p.tasks.find((t) => t.id === 'b')!.dependencies).toEqual([]);
  });
  it('Art im Dialog ändern (ohne Datum) plant neu', () => {
    let p = load([A, task('b', '2026-06-08', '2026-06-10', [dep('a')])]);
    p = projectReducer(p, { type: 'updateTask', id: 'b', patch: { dependencies: [dep('a', 'SS')] } });
    expect(dates(p.tasks, 'b')).toEqual(['2026-06-01', '2026-06-03']);
  });
  it('neue Aufgabe auf Wochenende wird auf Arbeitstage gelegt', () => {
    const p = projectReducer(load([]), { type: 'addTask', task: task('n', '2026-06-06', '2026-06-14') });
    expect(dates(p.tasks, 'n')).toEqual(['2026-06-08', '2026-06-12']);
  });
  it('Beispielprojekt ist in sich konsistent geplant und liegt nur auf Arbeitstagen', () => {
    const p = createSampleProject();
    expect(schedule(p.tasks)).toEqual(p.tasks);
    for (const t of p.tasks) for (const d of [t.start, t.end]) expect([0, 6]).not.toContain(new Date(`${d}T00:00:00Z`).getUTCDay());
  });
});

describe('Import älterer Dateien', () => {
  it('ID-Listen werden zu EA mit Versatz, ohne dass sich etwas verschiebt', () => {
    const old = {
      tasks: [
        { id: 'a', name: 'A', start: '2026-06-01', end: '2026-06-05', dependencies: [] },
        { id: 'b', name: 'B', start: '2026-06-04', end: '2026-06-09', dependencies: ['a'] }, // überlappt
        { id: 'c', name: 'C', start: '2026-06-22', end: '2026-06-23', dependencies: ['a', 'b'] }, // mit Abstand
      ],
    };
    const p = projectReducer(project([]), { type: 'load', project: parseProject(JSON.stringify(old)) });
    expect(dates(p.tasks, 'b')).toEqual(['2026-06-04', '2026-06-09']);
    expect(dates(p.tasks, 'c')).toEqual(['2026-06-22', '2026-06-23']);
    expect(p.tasks[1].dependencies).toEqual([{ taskId: 'a', type: 'FS', lag: -2 }]);
  });
  it('Dateien mit Kalendertage-Versatz werden auf Arbeitstage umgerechnet, ohne zu verschieben', () => {
    const calendarFile = {
      tasks: [
        { id: 'a', start: '2026-06-01', end: '2026-06-05' },
        { id: 'b', start: '2026-06-15', end: '2026-06-16', dependencies: [{ taskId: 'a', type: 'FS', lag: 9 }] }, // 9 Kalendertage
      ],
    };
    const p = projectReducer(project([]), { type: 'load', project: parseProject(JSON.stringify(calendarFile)) });
    expect(dates(p.tasks, 'b')).toEqual(['2026-06-15', '2026-06-16']);
    expect(p.tasks[1].dependencies[0].lag).toBe(5); // 5 Arbeitstage
    expect(p.calendar).toBe('workdays');
  });
  it('Arbeitstage-Dateien behalten Art und Versatz', () => {
    const p = parseProject(
      JSON.stringify({
        calendar: 'workdays',
        tasks: [{ id: 'a', start: '2026-06-01', end: '2026-06-02' }, { id: 'b', start: '2026-06-01', end: '2026-06-02', dependencies: [{ taskId: 'a', type: 'SS', lag: 3 }, { taskId: 'a', type: 'FF' }] }],
      }),
    );
    expect(p.tasks[1].dependencies).toEqual([{ taskId: 'a', type: 'SS', lag: 3 }]);
  });
});

describe('Puffer (Arbeitstage)', () => {
  const Ab = { ...A, buffer: 3 };
  it('EA: Nachfolger startet erst nach Ende + Puffer', () => {
    expect(dates(schedule([Ab, B([dep('a', 'FS')])]), 'b')).toEqual(['2026-06-11', '2026-06-15']);
  });
  it('EE: Nachfolger endet mit Ende + Puffer', () => {
    expect(dates(schedule([Ab, B([dep('a', 'FF')])]), 'b')).toEqual(['2026-06-08', '2026-06-10']);
  });
  it('AA bleibt vom Puffer unberührt', () => {
    expect(dates(schedule([Ab, B([dep('a', 'SS')])]), 'b')).toEqual(['2026-06-01', '2026-06-03']);
  });
  it('Puffer im Dialog setzen verschiebt Nachfolger, 0 entfernt ihn', () => {
    let p = load([A, task('b', '2026-06-08', '2026-06-10', [dep('a')])]);
    p = projectReducer(p, { type: 'updateTask', id: 'a', patch: { buffer: 2 } });
    expect(dates(p.tasks, 'b')).toEqual(['2026-06-10', '2026-06-12']);
    p = projectReducer(p, { type: 'updateTask', id: 'a', patch: { buffer: 0 } });
    expect(p.tasks[0].buffer).toBeUndefined();
    expect(dates(p.tasks, 'b')).toEqual(['2026-06-08', '2026-06-10']);
  });
  it('Puffer übersteht Export/Import', () => {
    const p = parseProject(JSON.stringify({ tasks: [{ id: 'a', start: '2026-06-01', end: '2026-06-02', buffer: 4 }, { id: 'b', start: '2026-06-01', end: '2026-06-02', buffer: -1 }] }));
    expect(p.tasks.map((t) => t.buffer)).toEqual([4, undefined]);
  });
});

describe('Beispielprojekt an jedem Tag', () => {
  it('liegt für jedes „heute“ eines Jahres nur auf Arbeitstagen', async () => {
    const { vi } = await import('vitest');
    for (let i = 0; i < 366; i += 1) {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 0, 1 + i, 12));
      const p = createSampleProject();
      vi.useRealTimers();
      for (const t of p.tasks) for (const d of [t.start, t.end]) expect([0, 6]).not.toContain(new Date(`${d}T00:00:00Z`).getUTCDay());
    }
  });
});
