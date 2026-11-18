import type { Column, Dependency, DependencyType, Project, Task } from '../types';
import { wouldCreateCycle } from '../lib/graph';
import { alignLags, initialLag, normalizeDates, schedule, snapToWorkdays } from '../lib/schedule';

export type ProjectAction =
  | { type: 'load'; project: Project }
  | { type: 'rename'; name: string }
  | { type: 'addTask'; task: Task }
  | { type: 'updateTask'; id: string; patch: Partial<Omit<Task, 'id'>> }
  | { type: 'deleteTask'; id: string }
  | { type: 'moveTask'; id: string; direction: -1 | 1 }
  | { type: 'addDependency'; taskId: string; predecessorId: string; depType?: DependencyType }
  | { type: 'removeDependency'; taskId: string; predecessorId: string }
  | { type: 'addColumn'; column: Column }
  | { type: 'renameColumn'; id: string; label: string }
  | { type: 'deleteColumn'; id: string }
  | { type: 'setField'; taskId: string; columnId: string; value: string };

function mapTask(project: Project, id: string, fn: (t: Task) => Task): Project {
  return { ...project, tasks: project.tasks.map((t) => (t.id === id ? fn(t) : t)) };
}


const DEP_TYPES = new Set<DependencyType>(['FS', 'SS', 'FF', 'SF']);

/** Aufgaben neu planen, nachdem sich etwas geändert hat. */
function withTasks(state: Project, tasks: Task[]): Project {
  return { ...state, tasks: schedule(tasks) };
}

/** Abhängigkeiten bereinigen: nur bekannte Vorgänger, keine Duplikate, keine Zyklen. */
function sanitizeDependencies(state: Project, taskId: string, deps: Dependency[]): Dependency[] {
  const others = state.tasks.map((t) => (t.id === taskId ? { ...t, dependencies: [] } : t));
  const known = new Set(state.tasks.map((t) => t.id));
  const seen = new Set<string>();
  const result: Dependency[] = [];
  for (const d of deps) {
    if (!known.has(d.taskId) || seen.has(d.taskId) || wouldCreateCycle(others, taskId, d.taskId)) continue;
    seen.add(d.taskId);
    result.push({ taskId: d.taskId, type: DEP_TYPES.has(d.type) ? d.type : 'FS', lag: Number.isFinite(d.lag) ? Math.round(d.lag) : 0 });
  }
  return result;
}

export function projectReducer(state: Project, action: ProjectAction): Project {
  switch (action.type) {
    case 'load':
      return withTasks(action.project, action.project.tasks);
    case 'rename':
      return { ...state, name: action.name };
    case 'addTask':
      return withTasks(state, [
        ...state.tasks,
        {
          ...action.task,
          ...snapToWorkdays(action.task.start, action.task.end),
          dependencies: sanitizeDependencies(state, action.task.id, action.task.dependencies),
        },
      ]);
    case 'updateTask': {
      const { patch } = action;
      const old = state.tasks.find((t) => t.id === action.id);
      if (!old) return state;
      const dependencies = patch.dependencies ? sanitizeDependencies(state, action.id, patch.dependencies) : old.dependencies;
      let next: Task = { ...old, ...patch, dependencies };
      if (patch.buffer !== undefined) {
        const b = Math.max(0, Math.round(Number(patch.buffer) || 0));
        if (b) next.buffer = b;
        else delete next.buffer;
      }
      const datesChanged = (patch.start !== undefined && patch.start !== old.start) || (patch.end !== undefined && patch.end !== old.end);
      // Selbst verschobene abhängige Aufgabe bleibt, wo sie hingelegt wurde: Versatz anpassen
      if (datesChanged) {
        next = { ...next, ...normalizeDates(old, next.start, next.end) };
        next = alignLags(next, new Map(state.tasks.map((t) => [t.id, t])));
      }
      return withTasks(state, state.tasks.map((t) => (t.id === action.id ? next : t)));
    }
    case 'deleteTask': {
      const byId = new Map(state.tasks.map((t) => [t.id, t]));
      const tasks = state.tasks
        .filter((t) => t.id !== action.id)
        .map((t) =>
          t.dependencies.some((d) => d.taskId === action.id)
            ? alignLags({ ...t, dependencies: t.dependencies.filter((d) => d.taskId !== action.id) }, byId)
            : t,
        );
      return withTasks(state, tasks);
    }
    case 'moveTask': {
      const i = state.tasks.findIndex((t) => t.id === action.id);
      const j = i + action.direction;
      if (i < 0 || j < 0 || j >= state.tasks.length) return state;
      const tasks = [...state.tasks];
      [tasks[i], tasks[j]] = [tasks[j], tasks[i]];
      return { ...state, tasks };
    }
    case 'addDependency': {
      const task = state.tasks.find((t) => t.id === action.taskId);
      const pred = state.tasks.find((t) => t.id === action.predecessorId);
      if (!task || !pred || task.dependencies.some((d) => d.taskId === pred.id)) return state;
      if (wouldCreateCycle(state.tasks, task.id, pred.id)) return state;
      const type = action.depType ?? 'FS';
      const dep: Dependency = { taskId: pred.id, type, lag: initialLag(task, pred, type) };
      return withTasks(state, state.tasks.map((t) => (t.id === task.id ? { ...t, dependencies: [...t.dependencies, dep] } : t)));
    }
    case 'removeDependency': {
      const byId = new Map(state.tasks.map((t) => [t.id, t]));
      // Entfernen soll nichts verschieben: verbleibende Versätze so anpassen, dass der Start bleibt
      return withTasks(
        state,
        state.tasks.map((t) =>
          t.id === action.taskId ? alignLags({ ...t, dependencies: t.dependencies.filter((d) => d.taskId !== action.predecessorId) }, byId) : t,
        ),
      );
    }
    case 'addColumn': {
      const { column } = action;
      if (column.kind === 'name' || state.columns.some((c) => c.id === column.id)) return state;
      if (column.kind !== 'text' && state.columns.some((c) => c.kind === column.kind)) return state;
      return { ...state, columns: [...state.columns, column] };
    }
    case 'renameColumn': {
      const label = action.label.trim();
      if (!label) return state;
      return { ...state, columns: state.columns.map((c) => (c.id === action.id ? { ...c, label } : c)) };
    }
    case 'deleteColumn': {
      const column = state.columns.find((c) => c.id === action.id);
      if (!column || column.kind === 'name') return state;
      return {
        ...state,
        columns: state.columns.filter((c) => c.id !== action.id),
        tasks: state.tasks.map((t) => {
          if (!t.fields || !(action.id in t.fields)) return t;
          const { [action.id]: _removed, ...rest } = t.fields;
          return { ...t, fields: rest };
        }),
      };
    }
    case 'setField':
      return mapTask(state, action.taskId, (t) => {
        const fields = { ...t.fields };
        if (action.value.trim()) fields[action.columnId] = action.value;
        else delete fields[action.columnId];
        return { ...t, fields };
      });
  }
}
