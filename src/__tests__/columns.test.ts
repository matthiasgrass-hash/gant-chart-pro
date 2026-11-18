import { describe, expect, it } from 'vitest';
import { projectReducer } from '../state/projectReducer';
import { createSampleProject } from '../lib/sample';
import { parseProject, serializeProject } from '../lib/serialize';
import { DEFAULT_COLUMNS, cellText, missingBuiltins } from '../lib/columns';
import { GE_COLOR } from '../lib/colors';

describe('Spalten', () => {
  it('Beispielprojekt nutzt GE-Farbe und Standardspalten', () => {
    const p = createSampleProject();
    expect(p.tasks.every((t) => t.color === GE_COLOR)).toBe(true);
    expect(p.columns.map((c) => c.kind)).toEqual(['name', 'start', 'end', 'duration']);
  });

  it('Textspalte hinzufügen, befüllen, umbenennen und löschen', () => {
    let p = createSampleProject();
    p = projectReducer(p, { type: 'addColumn', column: { id: 'owner', kind: 'text', label: 'Neue Spalte' } });
    p = projectReducer(p, { type: 'renameColumn', id: 'owner', label: 'Verantwortlich' });
    p = projectReducer(p, { type: 'setField', taskId: 'a', columnId: 'owner', value: 'Anna' });
    expect(p.columns[p.columns.length - 1]).toEqual({ id: 'owner', kind: 'text', label: 'Verantwortlich' });
    expect(cellText(p.tasks[0], p.columns[p.columns.length - 1]!)).toBe('Anna');
    // leerer Name wird ignoriert
    expect(projectReducer(p, { type: 'renameColumn', id: 'owner', label: '  ' })).toBe(p);
    p = projectReducer(p, { type: 'deleteColumn', id: 'owner' });
    expect(p.columns.some((c) => c.id === 'owner')).toBe(false);
    expect(p.tasks[0].fields).toEqual({});
  });

  it('Aufgaben-Spalte kann nicht gelöscht, eingebaute können ausgeblendet und wieder eingeblendet werden', () => {
    let p = createSampleProject();
    expect(projectReducer(p, { type: 'deleteColumn', id: 'name' })).toBe(p);
    p = projectReducer(p, { type: 'deleteColumn', id: 'duration' });
    expect(missingBuiltins(p.columns).map((c) => c.kind)).toEqual(['duration', 'buffer']);
    p = projectReducer(p, { type: 'addColumn', column: { ...DEFAULT_COLUMNS[3] } });
    expect(missingBuiltins(p.columns).map((c) => c.kind)).toEqual(['buffer']);
    // doppelte eingebaute Spalte wird abgelehnt
    expect(projectReducer(p, { type: 'addColumn', column: { id: 'x', kind: 'start', label: 'Start 2' } })).toBe(p);
  });

  it('Spalten und Feldwerte überstehen Export/Import', () => {
    let p = createSampleProject();
    p = projectReducer(p, { type: 'addColumn', column: { id: 'owner', kind: 'text', label: 'Verantwortlich' } });
    p = projectReducer(p, { type: 'setField', taskId: 'b', columnId: 'owner', value: 'Ben' });
    p = projectReducer(p, { type: 'renameColumn', id: 'start', label: 'Beginn' });
    const back = parseProject(serializeProject(p));
    expect(back.columns).toEqual(p.columns);
    expect(back.tasks[1].fields).toEqual({ owner: 'Ben' });
  });

  it('ältere Dateien ohne Spalten bekommen die Standardspalten', () => {
    const p = parseProject(JSON.stringify({ tasks: [{ id: 'x', start: '2026-05-01', end: '2026-05-02', fields: { ghost: 'weg' } }] }));
    expect(p.columns).toEqual(DEFAULT_COLUMNS);
    expect(p.tasks[0].fields).toBeUndefined();
    expect(p.tasks[0].color).toBe(GE_COLOR);
  });

  it('kaputte Spaltenangaben werden bereinigt, Aufgaben-Spalte steht vorne', () => {
    const p = parseProject(
      JSON.stringify({
        columns: [{ id: 's', kind: 'start', label: 'S' }, { id: 's', kind: 'text', label: 'dup' }, { id: 'n', kind: 'name', label: 'Was' }, { id: 'z', kind: 'bogus' }],
        tasks: [],
      }),
    );
    expect(p.columns).toEqual([{ id: 'n', kind: 'name', label: 'Was' }, { id: 's', kind: 'start', label: 'S' }]);
  });
});
