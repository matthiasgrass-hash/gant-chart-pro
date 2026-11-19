import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { exportTimeline, projectSpan } from '../lib/exportRange';
import { toDayNumber } from '../lib/date';
import { PX_PER_DAY, barGeometry, labelWidth } from '../lib/timeline';

const task = (id: string, name: string, start: string, end: string, extra: Partial<Task> = {}): Task => ({
  id,
  name,
  start,
  end,
  progress: 0,
  color: '#6022a7',
  dependencies: [],
  ...extra,
});

const tasks = [
  task('a', 'Planung', '2026-06-01', '2026-06-12'),
  task('b', 'Sehr lange Beschriftung für einen kurzen Balken', '2026-06-15', '2026-06-15'),
  task('c', 'Mitte', '2026-06-08', '2026-06-10'),
];

describe('Exportbereich „Alles“', () => {
  it('beginnt beim ersten Task (Tagesansicht mit 1 Tag Rand), nicht beim heutigen Tag', () => {
    const { range } = exportTimeline(tasks, 'day', { mode: 'all', from: '', to: '' });
    expect(range.startDay).toBe(toDayNumber('2026-06-01') - 1);
  });

  it('reicht so weit, dass auch die Beschriftung neben dem letzten Balken ganz sichtbar ist', () => {
    for (const view of ['day', 'week', 'month'] as const) {
      const { range } = exportTimeline(tasks, view, { mode: 'all', from: '', to: '' });
      const ppd = PX_PER_DAY[view];
      const b = barGeometry(tasks[1], range, ppd);
      const labelEnd = b.x + Math.max(b.width, 13) + 8 + labelWidth(tasks[1].name);
      expect(range.days * ppd).toBeGreaterThanOrEqual(labelEnd);
    }
  });

  it('Wochen- und Monatsansicht beginnen am Wochen- bzw. Monatsanfang', () => {
    expect(exportTimeline(tasks, 'week', { mode: 'all', from: '', to: '' }).range.startDay).toBe(toDayNumber('2026-06-01')); // Montag
    expect(exportTimeline(tasks, 'month', { mode: 'all', from: '', to: '' }).range.startDay).toBe(toDayNumber('2026-06-01'));
  });

  it('berücksichtigt den Puffer', () => {
    const withBuffer = [task('a', 'A', '2026-06-01', '2026-06-30', { buffer: 10 })];
    const { range } = exportTimeline(withBuffer, 'day', { mode: 'all', from: '', to: '' });
    expect(range.startDay + range.days - 1).toBeGreaterThanOrEqual(toDayNumber('2026-07-14'));
  });
});

describe('Exportbereich „von–bis“', () => {
  it('zeigt genau den Bereich und nur Aufgaben, die hineinfallen', () => {
    const { range, tasks: inRange } = exportTimeline(tasks, 'day', { mode: 'custom', from: '2026-06-09', to: '2026-06-12' });
    expect(range).toEqual({ startDay: toDayNumber('2026-06-09'), days: 4 });
    expect(inRange.map((t) => t.id)).toEqual(['a', 'c']);
  });
  it('vertauschte Daten werden korrigiert', () => {
    const { range } = exportTimeline(tasks, 'day', { mode: 'custom', from: '2026-06-12', to: '2026-06-09' });
    expect(range.startDay).toBe(toDayNumber('2026-06-09'));
  });
  it('Vorbelegung: frühester Start bis spätestes Ende', () => {
    expect(projectSpan(tasks)).toEqual({ from: '2026-06-01', to: '2026-06-15' });
  });
});
