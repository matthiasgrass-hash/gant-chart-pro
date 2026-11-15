import { describe, expect, it } from 'vitest';
import { projectReducer } from '../state/projectReducer';
import { createSampleProject } from '../lib/sample';
import { parseProject, serializeProject } from '../lib/serialize';

describe('projectReducer', () => {
  it('entfernt beim Löschen auch Verweise in Abhängigkeiten', () => {
    const p = projectReducer(createSampleProject(), { type: 'deleteTask', id: 'b' });
    expect(p.tasks.find((t) => t.id === 'b')).toBeUndefined();
    expect(p.tasks.some((t) => t.dependencies.includes('b'))).toBe(false);
  });
  it('verhindert zirkuläre Abhängigkeiten', () => {
    const p0 = createSampleProject();
    const p = projectReducer(p0, { type: 'addDependency', taskId: 'a', predecessorId: 'g' });
    expect(p).toBe(p0);
  });
  it('filtert zirkuläre Abhängigkeiten beim Bearbeiten', () => {
    const p = projectReducer(createSampleProject(), { type: 'updateTask', id: 'a', patch: { dependencies: ['g', 'nope', 'c'] } });
    // g und c hängen (transitiv) von a ab, 'nope' existiert nicht
    expect(p.tasks.find((t) => t.id === 'a')!.dependencies).toEqual([]);
    const q = projectReducer(createSampleProject(), { type: 'updateTask', id: 'g', patch: { dependencies: ['a', 'a', 'f'] } });
    expect(q.tasks.find((t) => t.id === 'g')!.dependencies).toEqual(['a', 'f']);
  });
  it('verschiebt Aufgaben in der Reihenfolge', () => {
    const p = projectReducer(createSampleProject(), { type: 'moveTask', id: 'b', direction: -1 });
    expect(p.tasks.slice(0, 2).map((t) => t.id)).toEqual(['b', 'a']);
  });
});

describe('serialize', () => {
  it('Round-Trip bleibt identisch', () => {
    const p = createSampleProject();
    expect(parseProject(serializeProject(p))).toEqual(p);
  });
  it('lehnt ungültige Dateien mit verständlicher Meldung ab', () => {
    expect(() => parseProject('kein json')).toThrow(/JSON/);
    expect(() => parseProject('{}')).toThrow(/tasks/);
    expect(() => parseProject(JSON.stringify({ tasks: [{ id: 'x', start: '2026-05-02', end: '2026-05-01' }] }))).toThrow(/endet vor/);
  });
  it('bereinigt Verweise auf unbekannte Aufgaben', () => {
    const p = parseProject(JSON.stringify({ tasks: [{ id: 'x', start: '2026-05-01', end: '2026-05-02', dependencies: ['y', 'x'] }] }));
    expect(p.tasks[0].dependencies).toEqual([]);
    expect(p.tasks[0].progress).toBe(0);
  });
});
