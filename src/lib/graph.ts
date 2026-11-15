import type { Task } from '../types';

/**
 * Prüft, ob die neue Abhängigkeit „taskId hängt von predecessorId ab"
 * einen Zyklus erzeugen würde (inkl. Selbstbezug).
 */
export function wouldCreateCycle(tasks: Task[], taskId: string, predecessorId: string): boolean {
  if (taskId === predecessorId) return true;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const stack = [predecessorId];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === taskId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const task = byId.get(id);
    if (task) stack.push(...task.dependencies);
  }
  return false;
}
