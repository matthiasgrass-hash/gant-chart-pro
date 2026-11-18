import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Project, Task, ViewMode } from './types';
import { projectReducer } from './state/projectReducer';
import { loadProject, saveProject } from './lib/storage';
import { DEFAULT_PROJECT_NAME, createSampleProject } from './lib/sample';
import { addDays, toDayNumber, todayIso } from './lib/date';
import { createId } from './lib/id';
import { endAfterWorkdays, nextWorkday } from './lib/workdays';
import { GE_COLOR } from './lib/colors';
import { parseProject, serializeProject } from './lib/serialize';
import { PX_PER_DAY, computeRange } from './lib/timeline';
import { downloadBlob, exportPdf, exportPng, fileBaseName } from './lib/exportImage';
import { Toolbar } from './components/Toolbar';
import { TaskList } from './components/TaskList';
import { GanttChart } from './components/GanttChart';
import { TaskDialog } from './components/TaskDialog';

const VIEW_KEY = 'gant-chart-pro:view';
const GE_COLOR_MIGRATION_KEY = 'gant-chart-pro:ge-color-v1';

/** Einmalig alle vorhandenen Aufgaben auf die GE-Farbe setzen. */
function applyGeColorOnce(project: Project): Project {
  try {
    if (localStorage.getItem(GE_COLOR_MIGRATION_KEY)) return project;
    localStorage.setItem(GE_COLOR_MIGRATION_KEY, '1');
  } catch {
    return project;
  }
  return { ...project, tasks: project.tasks.map((t) => ({ ...t, color: GE_COLOR })) };
}

function initialProject(): Project {
  const stored = loadProject();
  if (!stored) return createSampleProject();
  // Früherer Name des Beispielprojekts → neue Standardüberschrift
  return applyGeColorOnce(stored.name === 'Website-Relaunch' ? { ...stored, name: DEFAULT_PROJECT_NAME } : stored);
}

function initialView(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === 'day' || v === 'week' || v === 'month') return v;
  } catch {
    /* ignore */
  }
  return 'day';
}

export default function App() {
  const [project, dispatch] = useReducer(projectReducer, undefined, initialProject);
  const [view, setView] = useState<ViewMode>(initialView);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ task: Task; isNew: boolean } | null>(null);
  const [toast, setToast] = useState<{ text: string; kind: 'info' | 'error' } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const today = toDayNumber(todayIso());
  const range = useMemo(() => computeRange(project.tasks, view, today), [project.tasks, view, today]);

  useEffect(() => saveProject(project), [project]);
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* ignore */
    }
  }, [view]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  const scrollToToday = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const listWidth = el.querySelector('.task-list')?.clientWidth ?? 0;
    const x = (today - range.startDay) * PX_PER_DAY[view];
    el.scrollTo({ left: Math.max(0, x - (el.clientWidth - listWidth) / 3), behavior: 'smooth' });
  }, [today, range.startDay, view]);

  // Beim Start und beim Wechsel der Ansicht zu „Heute" springen
  useEffect(() => {
    scrollToToday();
  }, [view]);

  const newTask = (): Task => {
    const selected = project.tasks.find((t) => t.id === selectedId);
    const start = nextWorkday(selected ? addDays(selected.end, 1) : todayIso());
    return {
      id: createId(),
      name: '',
      start,
      end: endAfterWorkdays(start, 5),
      progress: 0,
      color: GE_COLOR,
      dependencies: selected ? [{ taskId: selected.id, type: 'FS', lag: 0 }] : [],
    };
  };

  const deleteTask = (task: Task) => {
    if (!confirm(`Aufgabe „${task.name}" löschen?`)) return;
    dispatch({ type: 'deleteTask', id: task.id });
    if (selectedId === task.id) setSelectedId(null);
    setEditing(null);
  };

  const runExport = async (fn: () => Promise<void>) => {
    try {
      if (!svgRef.current) return;
      await fn();
    } catch (err) {
      setToast({ text: err instanceof Error ? err.message : 'Export fehlgeschlagen.', kind: 'error' });
    }
  };

  const importFile = async (file: File) => {
    try {
      const imported = parseProject(await file.text());
      dispatch({ type: 'load', project: imported });
      setSelectedId(null);
      setToast({ text: `„${imported.name}" importiert (${imported.tasks.length} Aufgaben).`, kind: 'info' });
    } catch (err) {
      setToast({ text: err instanceof Error ? err.message : 'Import fehlgeschlagen.', kind: 'error' });
    }
  };

  // Tastatur: Entf löscht, Enter bearbeitet die ausgewählte Aufgabe
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing || !selectedId) return;
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable]')) return;
      const task = project.tasks.find((t) => t.id === selectedId);
      if (!task) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteTask(task);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        setEditing({ task, isNew: false });
      } else if (e.key === 'Escape') {
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="app">
      <Toolbar
        projectName={project.name}
        view={view}
        onRename={(name) => dispatch({ type: 'rename', name })}
        onViewChange={setView}
        onAddTask={() => setEditing({ task: newTask(), isNew: true })}
        onToday={scrollToToday}
        onImport={importFile}
        onExportJson={() => downloadBlob(new Blob([serializeProject(project)], { type: 'application/json' }), `${fileBaseName(project)}.json`)}
        onExportPng={() => runExport(() => exportPng(svgRef.current!, project))}
        onExportPdf={() => runExport(() => exportPdf(svgRef.current!, project))}
        onLoadSample={() => {
          if (project.tasks.length && !confirm('Aktuelles Projekt durch das Beispielprojekt ersetzen?')) return;
          dispatch({ type: 'load', project: createSampleProject() });
          setSelectedId(null);
        }}
        onClear={() => {
          if (!confirm('Alle Aufgaben löschen?')) return;
          dispatch({ type: 'load', project: { ...project, tasks: [] } });
          setSelectedId(null);
        }}
      />

      <main className="gantt" ref={scrollRef}>
        <TaskList
          tasks={project.tasks}
          columns={project.columns}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAddColumn={(column) =>
            dispatch({ type: 'addColumn', column: column ?? { id: createId(), kind: 'text', label: 'Neue Spalte' } })
          }
          onRenameColumn={(id, label) => dispatch({ type: 'renameColumn', id, label })}
          onDeleteColumn={(column) => {
            const hasValues = column.kind === 'text' && project.tasks.some((t) => t.fields?.[column.id]);
            const msg = hasValues
              ? `Spalte „${column.label}" mit allen Einträgen löschen?`
              : column.kind === 'text'
                ? `Spalte „${column.label}" löschen?`
                : `Spalte „${column.label}" ausblenden? Über „+ Spalte" kann sie wieder eingeblendet werden.`;
            if (confirm(msg)) dispatch({ type: 'deleteColumn', id: column.id });
          }}
          onSetField={(taskId, columnId, value) => dispatch({ type: 'setField', taskId, columnId, value })}
          onEdit={(task) => setEditing({ task, isNew: false })}
          onMove={(id, direction) => dispatch({ type: 'moveTask', id, direction })}
          onDelete={deleteTask}
        />
        <GanttChart
          tasks={project.tasks}
          view={view}
          range={range}
          today={today}
          selectedId={selectedId}
          svgRef={svgRef}
          onSelect={setSelectedId}
          onEdit={(task) => setEditing({ task, isNew: false })}
          onChangeDates={(id, start, end) => dispatch({ type: 'updateTask', id, patch: { start, end } })}
          onAddDependency={(taskId, predecessorId) => {
            const before = project.tasks.find((t) => t.id === taskId)?.dependencies.length;
            dispatch({ type: 'addDependency', taskId, predecessorId });
            const next = projectReducer(project, { type: 'addDependency', taskId, predecessorId });
            if (next.tasks.find((t) => t.id === taskId)?.dependencies.length === before) {
              setToast({ text: 'Abhängigkeit nicht möglich (existiert bereits oder wäre zirkulär).', kind: 'error' });
            }
          }}
        />
      </main>

      <footer className="statusbar">
        <span>{project.tasks.length} Aufgaben · Tage = Arbeitstage (Mo–Fr ohne bundesweite Feiertage)</span>
        <span className="muted">Balken ziehen = verschieben · Ränder ziehen = Dauer ändern · Punkt rechts ziehen = Abhängigkeit · Pfeil klicken = Abhängigkeit bearbeiten · Doppelklick = bearbeiten</span>
      </footer>

      {editing && (
        <TaskDialog
          key={editing.task.id}
          task={editing.task}
          isNew={editing.isNew}
          allTasks={project.tasks}
          columns={project.columns}
          onClose={() => setEditing(null)}
          onDelete={deleteTask}
          onSave={(task) => {
            if (editing.isNew) dispatch({ type: 'addTask', task });
            else dispatch({ type: 'updateTask', id: task.id, patch: task });
            setSelectedId(task.id);
            setEditing(null);
          }}
        />
      )}

      {toast && (
        <div className={`toast toast--${toast.kind}`} role="status">
          {toast.text}
        </div>
      )}
    </div>
  );
}
