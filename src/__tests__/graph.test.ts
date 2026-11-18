import { describe, expect, it } from 'vitest';
import { wouldCreateCycle } from '../lib/graph';
import type { Task } from '../types';

const t = (id: string, deps: string[] = []): Task => ({
  id,
  name: id,
  start: '2026-01-01',
  end: '2026-01-02',
  progress: 0,
  color: '#000000',
  dependencies: deps.map((taskId) => ({ taskId, type: 'FS', lag: 0 })),
});

describe('wouldCreateCycle', () => {
  const tasks = [t('a'), t('b', ['a']), t('c', ['b']), t('d')];
  it('erkennt Selbstbezug', () => expect(wouldCreateCycle(tasks, 'a', 'a')).toBe(true));
  it('erkennt direkte und transitive Zyklen', () => {
    expect(wouldCreateCycle(tasks, 'a', 'b')).toBe(true);
    expect(wouldCreateCycle(tasks, 'a', 'c')).toBe(true);
  });
  it('erlaubt gültige Abhängigkeiten', () => {
    expect(wouldCreateCycle(tasks, 'c', 'a')).toBe(false);
    expect(wouldCreateCycle(tasks, 'd', 'c')).toBe(false);
  });
});
