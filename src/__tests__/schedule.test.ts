import { describe, expect, it } from 'vitest';
import type { Dependency, DependencyType, Task } from '../types';
import { schedule, setTaskDates } from '../lib/schedule';
import { projectReducer } from '../state/projectReducer';
import { parseProject } from '../lib/serialize';
import { DEFAULT_COLUMNS } from '../lib/columns';
import { createSampleProject } from '../lib/sample';

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
const project = (tasks: Task[]) => ({ version: 1 as const, name: 'T', columns: DEFAULT_COLUMNS, tasks });

// Vorgänger A: 01.–05.06.2026 (5 Tage), Nachfolger B dauert 3 Tage
const A = task('a', '2026-06-01', '2026-06-05');

describe('Abhängigkeitsarten', () => {
  it('EA (Ende→Anfang): B startet am Tag nach dem Ende von A', () => {
    expect(dates(schedule([A, task('b', '2026-06-20', '2026-06-22', [dep('a', 'FS')])]), 'b')).toEqual(['2026-06-06', '2026-06-08']);
  });
  it('AA (Anfang→Anfang) mit Versatz +2', () => {
    expect(dates(schedule([A, task('b', '2026-06-20', '2026-06-22', [dep('a', 'SS', 2)])]), 'b')).toEqual(['2026-06-03', '2026-06-05']);
  });
  it('EE (Ende→Ende): B endet mit A', () => {
    expect(dates(schedule([A, task('b', '2026-06-20', '2026-06-22', [dep('a', 'FF')])]), 'b')).toEqual(['2026-06-03', '2026-06-05']);
  });
  it('AE (Anfang→Ende): B endet am Tag vor dem Start von A', () => {
    expect(dates(schedule([A, task('b', '2026-06-20', '2026-06-22', [dep('a', 'SF')])]), 'b')).toEqual(['2026-05-29', '2026-05-31']);
  });
  it('negativer Versatz = Überlappung', () => {
    expect(dates(schedule([A, task('b', '2026-06-20', '2026-06-22', [dep('a', 'FS', -2)])]), 'b')).toEqual(['2026-06-04', '2026-06-06']);
  });
  it('mehrere Vorgänger: der späteste bestimmt den Start', () => {
    const C = task('c', '2026-06-01', '2026-06-10');
    expect(dates(schedule([A, C, task('b', '2026-06-01', '2026-06-01', [dep('a'), dep('c')])]), 'b')).toEqual(['2026-06-11', '2026-06-11']);
  });
});

describe('automatisches Verschieben', () => {
  const chain = schedule([A, task('b', '2026-06-06', '2026-06-08', [dep('a')]), task('c', '2026-06-09', '2026-06-09', [dep('b', 'SS', 1)])]);

  it('erste Aufgabe nach hinten → ganze Kette folgt', () => {
    const moved = setTaskDates(chain, 'a', '2026-06-04', '2026-06-08');
    expect(dates(moved, 'b')).toEqual(['2026-06-09', '2026-06-11']);
    expect(dates(moved, 'c')).toEqual(['2026-06-10', '2026-06-10']);
  });
  it('erste Aufgabe nach vorne → Kette folgt ebenfalls', () => {
    const moved = setTaskDates(chain, 'a', '2026-05-29', '2026-06-02');
    expect(dates(moved, 'b')).toEqual(['2026-06-03', '2026-06-05']);
    expect(dates(moved, 'c')).toEqual(['2026-06-04', '2026-06-04']);
  });
  it('Dauer verlängern verschiebt EA-Nachfolger', () => {
    expect(dates(setTaskDates(chain, 'a', '2026-06-01', '2026-06-07'), 'b')).toEqual(['2026-06-08', '2026-06-10']);
  });
  it('abhängige Aufgabe selbst verschieben: bleibt liegen, Versatz passt sich an, Nachfolger folgen', () => {
    const moved = setTaskDates(chain, 'b', '2026-06-10', '2026-06-12');
    expect(dates(moved, 'b')).toEqual(['2026-06-10', '2026-06-12']);
    expect(moved.find((t) => t.id === 'b')!.dependencies[0].lag).toBe(4);
    expect(dates(moved, 'c')).toEqual(['2026-06-11', '2026-06-11']);
    // Danach wandert b mit a weiterhin mit – mit dem neuen Abstand
    expect(dates(setTaskDates(moved, 'a', '2026-06-02', '2026-06-06'), 'b')).toEqual(['2026-06-11', '2026-06-13']);
  });
});

describe('Reducer', () => {
  it('neue Abhängigkeit verschiebt nur, wenn die Bedingung verletzt wäre', () => {
    let p = projectReducer(project([A, task('b', '2026-06-03', '2026-06-04'), task('c', '2026-06-15', '2026-06-16')]), { type: 'load', project: project([A, task('b', '2026-06-03', '2026-06-04'), task('c', '2026-06-15', '2026-06-16')]) });
    p = projectReducer(p, { type: 'addDependency', taskId: 'b', predecessorId: 'a' });
    expect(dates(p.tasks, 'b')).toEqual(['2026-06-06', '2026-06-07']); // verschoben
    p = projectReducer(p, { type: 'addDependency', taskId: 'c', predecessorId: 'a' });
    expect(dates(p.tasks, 'c')).toEqual(['2026-06-15', '2026-06-16']); // bleibt, Versatz = Abstand
    expect(p.tasks.find((t) => t.id === 'c')!.dependencies[0].lag).toBe(9);
  });
  it('Abhängigkeit entfernen oder Vorgänger löschen verschiebt nichts', () => {
    let p = projectReducer(project([]), { type: 'load', project: project([A, task('c', '2026-06-01', '2026-06-10'), task('b', '2026-06-11', '2026-06-11', [dep('a', 'FS', 5), dep('c')])]) });
    expect(dates(p.tasks, 'b')).toEqual(['2026-06-11', '2026-06-11']);
    p = projectReducer(p, { type: 'removeDependency', taskId: 'b', predecessorId: 'c' });
    expect(dates(p.tasks, 'b')).toEqual(['2026-06-11', '2026-06-11']);
    p = projectReducer(p, { type: 'deleteTask', id: 'a' });
    expect(dates(p.tasks, 'b')).toEqual(['2026-06-11', '2026-06-11']);
    expect(p.tasks.find((t) => t.id === 'b')!.dependencies).toEqual([]);
  });
  it('Art im Dialog ändern (ohne Datum) plant neu', () => {
    let p = projectReducer(project([]), { type: 'load', project: project([A, task('b', '2026-06-06', '2026-06-08', [dep('a')])]) });
    p = projectReducer(p, { type: 'updateTask', id: 'b', patch: { dependencies: [dep('a', 'SS')] } });
    expect(dates(p.tasks, 'b')).toEqual(['2026-06-01', '2026-06-03']);
  });
  it('Beispielprojekt ist in sich konsistent geplant', () => {
    const p = createSampleProject();
    expect(schedule(p.tasks)).toEqual(p.tasks);
  });
});

describe('Import älterer Dateien', () => {
  it('ID-Listen werden zu EA mit Versatz, ohne dass sich etwas verschiebt', () => {
    const old = {
      tasks: [
        { id: 'a', name: 'A', start: '2026-06-01', end: '2026-06-05', dependencies: [] },
        { id: 'b', name: 'B', start: '2026-06-04', end: '2026-06-09', dependencies: ['a'] }, // überlappt
        { id: 'c', name: 'C', start: '2026-06-20', end: '2026-06-21', dependencies: ['a', 'b'] }, // mit Abstand
      ],
    };
    const p = projectReducer(project([]), { type: 'load', project: parseProject(JSON.stringify(old)) });
    expect(dates(p.tasks, 'b')).toEqual(['2026-06-04', '2026-06-09']);
    expect(dates(p.tasks, 'c')).toEqual(['2026-06-20', '2026-06-21']);
    expect(p.tasks[1].dependencies).toEqual([{ taskId: 'a', type: 'FS', lag: -2 }]);
  });
  it('neues Format mit Art und Versatz bleibt erhalten', () => {
    const p = parseProject(JSON.stringify({ tasks: [{ id: 'a', start: '2026-06-01', end: '2026-06-02' }, { id: 'b', start: '2026-06-01', end: '2026-06-02', dependencies: [{ taskId: 'a', type: 'SS', lag: 3 }, { taskId: 'a', type: 'FF' }] }] }));
    expect(p.tasks[1].dependencies).toEqual([{ taskId: 'a', type: 'SS', lag: 3 }]);
  });
});
