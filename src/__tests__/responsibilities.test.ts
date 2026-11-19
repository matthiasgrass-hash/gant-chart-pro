import { describe, expect, it } from 'vitest';
import { projectReducer } from '../state/projectReducer';
import { createSampleProject } from '../lib/sample';
import { parseProject, serializeProject } from '../lib/serialize';
import { DEFAULT_RESPONSIBILITIES, effectiveColor, nextResponsibilityColor, usedResponsibilities, withEffectiveColors } from '../lib/responsibilities';
import { cellText } from '../lib/columns';

describe('Zuständigkeiten', () => {
  it('Standardliste in der gewünschten Reihenfolge', () => {
    expect(DEFAULT_RESPONSIBILITIES.map((r) => r.name)).toEqual(['GE', 'bauseitig', 'Elektro', 'Klima/Kälte', 'HF-Kabine', 'Schlosser']);
  });

  it('Aufgabe übernimmt die Farbe ihrer Zuständigkeit; ohne Zuständigkeit die eigene', () => {
    const p = createSampleProject();
    const elektro = p.tasks.find((t) => t.responsibility === 'elektro')!;
    expect(effectiveColor(elektro, p.responsibilities)).toBe('#f59e0b');
    expect(effectiveColor({ ...elektro, responsibility: undefined, color: '#123456' }, p.responsibilities)).toBe('#123456');
  });

  it('Farbe ändern wirkt auf alle Aufgaben der Zuständigkeit und die Legende', () => {
    let p = createSampleProject();
    p = projectReducer(p, { type: 'updateResponsibility', id: 'ge', patch: { color: '#000000' } });
    const geTasks = withEffectiveColors(p).filter((t) => t.responsibility === 'ge');
    expect(geTasks.length).toBeGreaterThan(1);
    expect(geTasks.every((t) => t.color === '#000000')).toBe(true);
    expect(usedResponsibilities(p).find((r) => r.id === 'ge')!.color).toBe('#000000');
  });

  it('Legende zeigt nur verwendete Zuständigkeiten, in Listenreihenfolge', () => {
    let p = createSampleProject();
    p = projectReducer(p, { type: 'updateTask', id: 'h', patch: { responsibility: undefined } }); // Schlosser entfernen
    expect(usedResponsibilities(p).map((r) => r.name)).toEqual(['GE', 'bauseitig', 'Elektro', 'Klima/Kälte', 'HF-Kabine']);
  });

  it('eigene Zuständigkeit anlegen und direkt zuordnen; gleicher Name wird wiederverwendet', () => {
    let p = createSampleProject();
    p = projectReducer(p, { type: 'addResponsibility', responsibility: { id: 'x1', name: 'Sanitär', color: nextResponsibilityColor(p.responsibilities) }, assignTo: 'a' });
    expect(p.responsibilities[p.responsibilities.length - 1].name).toBe('Sanitär');
    expect(p.tasks.find((t) => t.id === 'a')!.responsibility).toBe('x1');
    const count = p.responsibilities.length;
    p = projectReducer(p, { type: 'addResponsibility', responsibility: { id: 'x2', name: ' sanitär ', color: '#111111' }, assignTo: 'b' });
    expect(p.responsibilities.length).toBe(count);
    expect(p.tasks.find((t) => t.id === 'b')!.responsibility).toBe('x1');
  });

  it('Löschen entfernt die Zuordnung bei allen Aufgaben', () => {
    let p = createSampleProject();
    p = projectReducer(p, { type: 'deleteResponsibility', id: 'ge' });
    expect(p.responsibilities.some((r) => r.id === 'ge')).toBe(false);
    expect(p.tasks.some((t) => t.responsibility === 'ge')).toBe(false);
  });

  it('Spalte zeigt den Namen der Zuständigkeit', () => {
    const p = createSampleProject();
    const col = p.columns.find((c) => c.kind === 'responsibility')!;
    expect(cellText(p.tasks.find((t) => t.id === 'e')!, col, p.responsibilities)).toBe('HF-Kabine');
  });

  it('Export/Import erhält Zuständigkeiten, Farben und Zuordnungen', () => {
    let p = createSampleProject();
    p = projectReducer(p, { type: 'updateResponsibility', id: 'klima', patch: { name: 'Kälte', color: '#abcdef' } });
    const back = parseProject(serializeProject(p));
    expect(back.responsibilities).toEqual(p.responsibilities);
    expect(back.tasks.map((t) => t.responsibility)).toEqual(p.tasks.map((t) => t.responsibility));
  });

  it('ältere Dateien bekommen Standard-Zuständigkeiten; unbekannte Zuordnungen fallen weg', () => {
    const p = parseProject(JSON.stringify({ tasks: [{ id: 'a', start: '2026-06-01', end: '2026-06-02', responsibility: 'gibt-es-nicht' }] }));
    expect(p.responsibilities.map((r) => r.id)).toEqual(DEFAULT_RESPONSIBILITIES.map((r) => r.id));
    expect(p.tasks[0].responsibility).toBeUndefined();
    expect(p.columns.some((c) => c.kind === 'responsibility')).toBe(true);
  });
});
