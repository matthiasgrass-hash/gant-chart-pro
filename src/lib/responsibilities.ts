import type { Project, Responsibility, Task } from '../types';
import { GE_COLOR } from './colors';

export const DEFAULT_RESPONSIBILITIES: Responsibility[] = [
  { id: 'ge', name: 'GE', color: GE_COLOR },
  { id: 'bauseitig', name: 'bauseitig', color: '#64748b' },
  { id: 'elektro', name: 'Elektro', color: '#f59e0b' },
  { id: 'klima', name: 'Klima/Kälte', color: '#0ea5e9' },
  { id: 'hf-kabine', name: 'HF-Kabine', color: '#10b981' },
  { id: 'schlosser', name: 'Schlosser', color: '#ef4444' },
];

/** Farben für weitere, selbst angelegte Zuständigkeiten */
const EXTRA_PALETTE = ['#ec4899', '#14b8a6', '#8b5cf6', '#84cc16', '#f97316', '#3b82f6', '#a16207', '#0f766e', '#be185d', '#475569'];

export function defaultResponsibilities(): Responsibility[] {
  return DEFAULT_RESPONSIBILITIES.map((r) => ({ ...r }));
}

/** Nächste noch nicht verwendete Farbe für eine neue Zuständigkeit. */
export function nextResponsibilityColor(existing: Responsibility[]): string {
  const used = new Set(existing.map((r) => r.color.toLowerCase()));
  return EXTRA_PALETTE.find((c) => !used.has(c)) ?? EXTRA_PALETTE[existing.length % EXTRA_PALETTE.length];
}

/** Farbe, mit der eine Aufgabe angezeigt wird: die ihrer Zuständigkeit, sonst ihre eigene. */
export function effectiveColor(task: Task, responsibilities: Responsibility[]): string {
  const r = task.responsibility ? responsibilities.find((x) => x.id === task.responsibility) : undefined;
  return r?.color ?? task.color;
}

/** Aufgaben mit aufgelöster Anzeigefarbe (für Diagramm, Liste und Export). */
export function withEffectiveColors(project: Project): Task[] {
  return project.tasks.map((t) => {
    const color = effectiveColor(t, project.responsibilities);
    return color === t.color ? t : { ...t, color };
  });
}

/** Zuständigkeiten, die mindestens einer Aufgabe zugeordnet sind – in der Reihenfolge der Liste. */
export function usedResponsibilities(project: Project): Responsibility[] {
  const used = new Set(project.tasks.map((t) => t.responsibility).filter(Boolean));
  return project.responsibilities.filter((r) => used.has(r.id));
}

export function responsibilityName(task: Task, responsibilities: Responsibility[]): string {
  return (task.responsibility && responsibilities.find((r) => r.id === task.responsibility)?.name) || '';
}
