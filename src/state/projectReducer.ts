import type { Project, Task } from '../types';
import { wouldCreateCycle } from '../lib/graph';

export type ProjectAction =
  | { type: 'load'; project: Project }
  | { type: 'rename'; name: string }
  | { type: 'addTask'; task: Task }
  | { type: 'updateTask'; id: string; patch: Partial<Omit<Task, 'id'>> }
  | { type: 'deleteTask'; id: string }
  | { type: 'moveTask'; id: string; direction: -1 | 1 }
  | { type: 'addDependency'; taskId: string; predecessorId: string }
  | { type: 'removeDependency'; taskId: string; predecessorId: string };

function mapTask(project: Project, id: string, fn: (t: Task) => Task): Project {
  return { ...project, tasks: project.tasks.map((t) => (t.id === id ? fn(t) : t)) };
}

export function projectReducer(state: Project, action: ProjectAction): Project {
  switch (action.type) {
    case 'load':
      return action.project;
    case 'rename':
      return { ...state, name: action.name };
    case 'addTask':
      return { ...state, tasks: [...state.tasks, action.task] };
    case 'updateTask': {
      const { patch } = action;
      if (patch.dependencies) {
        const others = state.tasks.map((t) => (t.id === action.id ? { ...t, dependencies: [] } : t));
        const known = new Set(state.tasks.map((t) => t.id));
        const deps = [...new Set(patch.dependencies)].filter((d) => known.has(d) && !wouldCreateCycle(others, action.id, d));
        return mapTask(state, action.id, (t) => ({ ...t, ...patch, dependencies: deps }));
      }
      return mapTask(state, action.id, (t) => ({ ...t, ...patch }));
    }
    case 'deleteTask':
      return {
        ...state,
        tasks: state.tasks
          .filter((t) => t.id !== action.id)
          .map((t) => (t.dependencies.includes(action.id) ? { ...t, dependencies: t.dependencies.filter((d) => d !== action.id) } : t)),
      };
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
      if (!task || task.dependencies.includes(action.predecessorId)) return state;
      if (!state.tasks.some((t) => t.id === action.predecessorId)) return state;
      if (wouldCreateCycle(state.tasks, action.taskId, action.predecessorId)) return state;
      return mapTask(state, action.taskId, (t) => ({ ...t, dependencies: [...t.dependencies, action.predecessorId] }));
    }
    case 'removeDependency':
      return mapTask(state, action.taskId, (t) => ({ ...t, dependencies: t.dependencies.filter((d) => d !== action.predecessorId) }));
  }
}
