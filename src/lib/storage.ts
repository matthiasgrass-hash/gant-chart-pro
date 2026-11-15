import type { Project } from '../types';
import { parseProject, serializeProject } from './serialize';

const KEY = 'gant-chart-pro:project';

export function loadProject(): Project | null {
  try {
    const text = localStorage.getItem(KEY);
    return text ? parseProject(text) : null;
  } catch {
    return null;
  }
}

export function saveProject(project: Project): void {
  try {
    localStorage.setItem(KEY, serializeProject(project));
  } catch {
    // Speicher voll oder blockiert – App läuft trotzdem weiter.
  }
}
