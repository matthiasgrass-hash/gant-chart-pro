import { describe, expect, it } from 'vitest';
import type { Dependency, Task } from '../types';
import { endFromPos, formatDays, parseDays, startFromPos, startPos, taskDuration, timeToFraction } from '../lib/worktime';
import { schedule, setTaskDates } from '../lib/schedule';
import { projectReducer } from '../state/projectReducer';
import { parseProject, serializeProject } from '../lib/serialize';
import { DEFAULT_COLUMNS, cellText } from '../lib/columns';
import { barGeometry } from '../lib/timeline';
import { toDayNumber } from '../lib/date';

const task = (id: string, start: string, end: string, extra: Partial<Task> = {}, dependencies: Dependency[] = []): Task => ({
  id,
  name: id,
  start,
  end,
  progress: 0,
  color: '#6022a7',
  dependencies,
  ...extra,
});
const fs = (taskId: string, lag = 0): Dependency => ({ taskId, type: 'FS', lag });
const load = (tasks: Task[]) =>
  projectReducer({ version: 1, calendar: 'workdays', name: 'T', columns: DEFAULT_COLUMNS, responsibilities: [], tasks: [] }, {
    type: 'load',
    project: { version: 1, calendar: 'workdays', name: 'T', columns: DEFAULT_COLUMNS, responsibilities: [], tasks },
  });
const when = (t: Task) => `${t.start}${t.startTime ? ' ' + t.startTime : ''} – ${t.end}${t.endTime ? ' ' + t.endTime : ''}`;

describe('Arbeitszeit 08:00–16:00', () => {
  it('rechnet Uhrzeiten in Tagesanteile um', () => {
    expect(timeToFraction('12:00', 0)).toBe(0.5);
    expect(timeToFraction('10:00', 0)).toBe(0.25);
    expect(timeToFraction(undefined, 1)).toBe(1);
    expect(timeToFraction('06:00', 0)).toBe(0); // vor Arbeitsbeginn
  });
  it('Dauer mit halben Tagen', () => {
    expect(taskDuration(task('a', '2026-06-01', '2026-06-01', { startTime: '12:00' }))).toBe(0.5);
    expect(taskDuration(task('a', '2026-06-01', '2026-06-03', { startTime: '12:00' }))).toBe(2.5);
    expect(taskDuration(task('a', '2026-06-05', '2026-06-08', { startTime: '12:00', endTime: '12:00' }))).toBe(1); // Fr 12:00 – Mo 12:00
  });
  it('Position ↔ Datum/Uhrzeit, auch über das Wochenende', () => {
    const p = startPos({ start: '2026-06-05', startTime: '12:00' });
    expect(startFromPos(p)).toEqual({ start: '2026-06-05', startTime: '12:00' });
    expect(endFromPos(p + 1)).toEqual({ end: '2026-06-08', endTime: '12:00' });
    expect(endFromPos(p + 0.5)).toEqual({ end: '2026-06-05' }); // genau Arbeitsende
  });
  it('Zahlen deutsch lesen und schreiben', () => {
    expect(parseDays('2,5')).toBe(2.5);
    expect(parseDays('0.5')).toBe(0.5);
    expect(parseDays('abc')).toBeNull();
    expect(formatDays(2.5)).toBe('2,5');
    expect(formatDays(3)).toBe('3');
  });
});

describe('Planung mit halben Tagen', () => {
  it('Nachfolger startet zur Endzeit des Vorgängers am selben Tag', () => {
    const A = task('a', '2026-06-01', '2026-06-01', { endTime: '12:00' }); // halber Tag
    const tasks = schedule([A, task('b', '2026-06-10', '2026-06-10', {}, [fs('a')])]);
    expect(when(tasks[1])).toBe('2026-06-01 12:00 – 2026-06-02 12:00');
  });
  it('Start ab 12:00 verschiebt die ganze Kette um einen halben Tag', () => {
    let p = load([task('a', '2026-06-01', '2026-06-02'), task('b', '2026-06-03', '2026-06-03', {}, [fs('a')])]);
    p = projectReducer(p, { type: 'updateTask', id: 'a', patch: { startTime: '12:00', endTime: '12:00', end: '2026-06-03' } });
    expect(when(p.tasks[0])).toBe('2026-06-01 12:00 – 2026-06-03 12:00');
    expect(when(p.tasks[1])).toBe('2026-06-03 12:00 – 2026-06-04 12:00');
  });
  it('Verschieben per Ziehen behält die Uhrzeiten', () => {
    const tasks = [task('a', '2026-06-01', '2026-06-02', { startTime: '12:00' })];
    expect(when(setTaskDates(tasks, 'a', '2026-06-03', '2026-06-04')[0])).toBe('2026-06-03 12:00 – 2026-06-04');
  });
  it('Dauer 0,5 Tage setzen', () => {
    let p = load([task('a', '2026-06-01', '2026-06-03')]);
    p = projectReducer(p, { type: 'updateTask', id: 'a', patch: { endTime: undefined, ...endFromPos(startPos(p.tasks[0]) + 0.5) } });
    expect(when(p.tasks[0])).toBe('2026-06-01 – 2026-06-01 12:00');
    // wieder ganze Tage → Endzeit verschwindet
    p = projectReducer(p, { type: 'updateTask', id: 'a', patch: { endTime: undefined, ...endFromPos(startPos(p.tasks[0]) + 2) } });
    expect(when(p.tasks[0])).toBe('2026-06-01 – 2026-06-02');
  });
  it('Uhrzeit im Dialog entfernen = wieder ganztägig', () => {
    let p = load([task('a', '2026-06-01', '2026-06-02', { startTime: '12:00' })]);
    p = projectReducer(p, { type: 'updateTask', id: 'a', patch: { startTime: undefined } });
    expect(when(p.tasks[0])).toBe('2026-06-01 – 2026-06-02');
  });
});

describe('Anzeige und Speichern', () => {
  it('Spalten zeigen Uhrzeit und halbe Tage', () => {
    const t = task('a', '2026-06-01', '2026-06-03', { startTime: '12:00' });
    expect(cellText(t, DEFAULT_COLUMNS[1])).toBe('01.06.2026 12:00');
    expect(cellText(t, DEFAULT_COLUMNS[2])).toBe('03.06.2026');
    expect(cellText(t, DEFAULT_COLUMNS[3])).toBe('2,5');
  });
  it('Balken beginnt in der Tagesmitte', () => {
    const range = { startDay: toDayNumber('2026-06-01'), days: 10 };
    expect(barGeometry(task('a', '2026-06-01', '2026-06-01', { startTime: '12:00' }), range, 40)).toEqual({ x: 20, width: 20 });
  });
  it('Uhrzeiten überstehen Export/Import; Standardzeiten werden nicht gespeichert', () => {
    const p = load([task('a', '2026-06-01', '2026-06-03', { startTime: '10:30', endTime: '14:00' })]);
    expect(parseProject(serializeProject(p)).tasks[0]).toMatchObject({ startTime: '10:30', endTime: '14:00' });
    const q = parseProject(JSON.stringify({ tasks: [{ id: 'x', start: '2026-06-01', end: '2026-06-01', startTime: '08:00', endTime: '16:00' }] }));
    expect(q.tasks[0].startTime).toBeUndefined();
    expect(q.tasks[0].endTime).toBeUndefined();
  });
});
