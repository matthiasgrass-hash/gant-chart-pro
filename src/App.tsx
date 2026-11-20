import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Project, Task, ViewMode } from './types';
import { projectReducer } from './state/projectReducer';
import { loadProject, saveProject } from './lib/storage';
import { DEFAULT_PROJECT_NAME, createSampleProject } from './lib/sample';
import { addDays, toDayNumber, todayIso } from './lib/date';
import { createId } from './lib/id';
import { endFromPos, startPos } from './lib/worktime';
import { ensureWritePermission, fileSaveSupported, isAbort, pickOpenFile, pickSaveFile, recallHandle, rememberHandle, writeFile, type FileHandle } from './lib/fileSave';
import { endAfterWorkdays, nextWorkday } from './lib/workdays';
import { GE_COLOR } from './lib/colors';
import { parseProject, serializeProject } from './lib/serialize';
import { PX_PER_DAY, computeRange } from './lib/timeline';
import { downloadBlob, exportPdf, exportPng, fileBaseName } from './lib/exportImage';
import { Toolbar } from './components/Toolbar';
import { TaskList } from './components/TaskList';
import { GanttChart } from './components/GanttChart';
import { TaskDialog } from './components/TaskDialog';
import type { ExportOptions } from './components/Toolbar';
import { exportTimeline, projectSpan } from './lib/exportRange';
import { renderChartSvg } from './lib/renderChart';
import { Legend } from './components/Legend';
import { ResponsibilityDialog } from './components/ResponsibilityDialog';
import { NEW_RESPONSIBILITY } from './components/TaskList';
import { nextResponsibilityColor, usedResponsibilities, withEffectiveColors } from './lib/responsibilities';

const VIEW_KEY = 'gant-chart-pro:view';
const PDF_LEGEND_KEY = 'gant-chart-pro:pdf-legend';
const THEME_KEY = 'gant-chart-pro:theme';
const SAVED_SNAPSHOT_KEY = 'gant-chart-pro:saved-snapshot';

type Theme = 'light' | 'dark';

function readPref(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/** Leeren Tab für das PDF öffnen und „wird erstellt…“ anzeigen; null, falls ein Pop-up-Blocker ihn verhindert. */
function openPdfViewer(): Window | null {
  const win = window.open('', '_blank');
  if (!win) return null;
  try {
    win.document.title = 'PDF wird erstellt…';
    win.document.body.style.cssText = 'font-family:system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;color:#475569';
    win.document.body.textContent = 'PDF wird erstellt…';
  } catch {
    /* Inhalt ist optional */
  }
  return win;
}

/** Gespeicherte Wahl, sonst die Systemeinstellung. */
function initialTheme(): Theme {
  const saved = readPref(THEME_KEY, '');
  if (saved === 'light' || saved === 'dark') return saved;
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
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
  const [managingResponsibilities, setManagingResponsibilities] = useState(false);
  const [exportOptions, setExportOptions] = useState<ExportOptions>(() => ({
    legend: readPref(PDF_LEGEND_KEY, 'true') === 'true',
    rangeMode: 'all',
    from: '',
    to: '',
  }));
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [fileHandle, setFileHandle] = useState<FileHandle | null>(null);
  /** Stand der Datei beim letzten Speichern/Öffnen – zum Erkennen ungespeicherter Änderungen */
  const [savedText, setSavedTextState] = useState<string | null>(() => readPref(SAVED_SNAPSHOT_KEY, '') || null);
  const setSavedText = (text: string) => {
    setSavedTextState(text);
    writePref(SAVED_SNAPSHOT_KEY, text);
  };
  const markCleanAfterLoad = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const today = toDayNumber(todayIso());
  const range = useMemo(() => computeRange(project.tasks, view, today), [project.tasks, view, today]);

  useEffect(() => saveProject(project), [project]);
  // Zuletzt verwendete Datei nach dem Neuladen wiederfinden
  useEffect(() => {
    if (fileSaveSupported()) void recallHandle().then((h) => h && setFileHandle(h));
  }, []);
  const currentText = useMemo(() => serializeProject(project), [project]);
  useEffect(() => {
    if (markCleanAfterLoad.current) {
      markCleanAfterLoad.current = false;
      setSavedText(currentText);
    }
  }, [currentText]);
  const unsaved = savedText !== currentText;
  useEffect(() => writePref(PDF_LEGEND_KEY, String(exportOptions.legend)), [exportOptions.legend]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Anzeige: Aufgaben in der Farbe ihrer Zuständigkeit
  const displayTasks = useMemo(() => withEffectiveColors(project), [project]);
  const legendItems = useMemo(() => usedResponsibilities(project), [project]);
  const editTask = (id: string) => {
    const task = project.tasks.find((t) => t.id === id);
    if (task) setEditing({ task, isNew: false });
  };

  /** Zuständigkeit anlegen (oder vorhandene gleichen Namens verwenden) und ihre ID liefern. */
  const createResponsibility = (name: string, assignTo?: string): string | null => {
    const clean = name.trim();
    if (!clean) return null;
    const existing = project.responsibilities.find((r) => r.name.toLowerCase() === clean.toLowerCase());
    const id = existing?.id ?? createId();
    dispatch({ type: 'addResponsibility', responsibility: { id, name: clean, color: nextResponsibilityColor(project.responsibilities) }, assignTo });
    return id;
  };
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

  /** Export: Diagramm für den gewählten Zeitraum neu zeichnen (unabhängig von der Bildschirmansicht). */
  const runExport = async (format: 'png' | 'pdf') => {
    // Tab für das PDF sofort beim Klick öffnen – später (nach dem Erzeugen) würde ihn der Pop-up-Blocker verhindern
    const viewer = format === 'pdf' ? openPdfViewer() : null;
    try {
      const { range: exportRange, tasks } = exportTimeline(displayTasks, view, {
        mode: exportOptions.rangeMode,
        from: exportOptions.from,
        to: exportOptions.to,
      });
      if (!tasks.length) {
        viewer?.close();
        setToast({ text: 'Im gewählten Zeitraum liegen keine Aufgaben.', kind: 'error' });
        return;
      }
      const chart = renderChartSvg(tasks, view, exportRange, today);
      const exported = { ...project, tasks };
      const legend = exportOptions.legend ? usedResponsibilities(exported) : null;
      await (format === 'pdf' ? exportPdf(chart, exported, legend, viewer) : exportPng(chart, exported, legend));
      if (format === 'pdf' && !viewer) {
        setToast({ text: 'PDF gespeichert. Zum automatischen Öffnen bitte Pop-ups für diese Seite erlauben.', kind: 'info' });
      }
    } catch (err) {
      viewer?.close();
      setToast({ text: err instanceof Error ? err.message : 'Export fehlgeschlagen.', kind: 'error' });
    }
  };

  const importFile = async (file: File, handle: FileHandle | null = null) => {
    try {
      const imported = parseProject(await file.text());
      dispatch({ type: 'load', project: imported });
      setSelectedId(null);
      // Die geöffnete Datei wird zur Speicherdatei: „Speichern“ überschreibt sie
      setFileHandle(handle);
      void rememberHandle(handle);
      markCleanAfterLoad.current = true;
      setToast({ text: `„${imported.name}" geöffnet (${imported.tasks.length} Aufgaben).`, kind: 'info' });
    } catch (err) {
      setToast({ text: err instanceof Error ? err.message : 'Import fehlgeschlagen.', kind: 'error' });
    }
  };

  /** Öffnen über den System-Dialog (merkt sich die Datei fürs Speichern). */
  const openWithPicker = async () => {
    try {
      const handle = await pickOpenFile();
      await importFile(await handle.getFile(), handle);
    } catch (err) {
      if (!isAbort(err)) setToast({ text: 'Datei konnte nicht geöffnet werden.', kind: 'error' });
    }
  };

  /**
   * Speichern: beim ersten Mal (oder mit `saveAs`) Ordner und Dateinamen im System-Dialog wählen,
   * danach wird genau diese Datei ohne Nachfrage überschrieben.
   */
  const saveToFile = async (saveAs = false) => {
    const text = serializeProject(project);
    if (!fileSaveSupported()) {
      downloadBlob(new Blob([text], { type: 'application/json' }), `${fileBaseName(project)}.json`);
      setSavedText(text);
      setToast({ text: 'Als Download gespeichert. Direktes Überschreiben geht nur in Chrome oder Edge am Computer.', kind: 'info' });
      return;
    }
    try {
      let handle = saveAs ? null : fileHandle;
      if (handle && !(await ensureWritePermission(handle))) handle = null;
      if (!handle) {
        handle = await pickSaveFile(fileHandle?.name ?? `${fileBaseName(project)}.json`);
        setFileHandle(handle);
        void rememberHandle(handle);
      }
      await writeFile(handle, text);
      setSavedText(text);
      setToast({ text: `Gespeichert in „${handle.name}“.`, kind: 'info' });
    } catch (err) {
      if (!isAbort(err)) setToast({ text: `Speichern fehlgeschlagen: ${err instanceof Error ? err.message : err}`, kind: 'error' });
    }
  };
  const saveRef = useRef(saveToFile);
  saveRef.current = saveToFile;

  // Strg+S / Cmd+S speichert (auch wenn gerade ein Feld bearbeitet wird)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveRef.current(e.shiftKey);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
        onImport={(file) => importFile(file)}
        onOpen={fileSaveSupported() ? openWithPicker : undefined}
        onSave={() => saveToFile(false)}
        onSaveAs={() => saveToFile(true)}
        fileName={fileHandle?.name ?? null}
        unsaved={unsaved}
        onExportPng={() => runExport('png')}
        onExportPdf={() => runExport('pdf')}
        exportOptions={exportOptions}
        onExportOptionsChange={(o) => {
          // Beim Umschalten auf „Bereich“ mit dem Projektzeitraum vorbelegen
          if (o.rangeMode === 'custom' && (!o.from || !o.to)) {
            const span = projectSpan(project.tasks);
            if (span) o = { ...o, from: o.from || span.from, to: o.to || span.to };
          }
          setExportOptions(o);
        }}
        theme={theme}
        onToggleTheme={() => {
          const next = theme === 'dark' ? 'light' : 'dark';
          writePref(THEME_KEY, next); // nur eine bewusste Wahl speichern, sonst gilt die Systemeinstellung
          setTheme(next);
        }}
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
          tasks={displayTasks}
          responsibilities={project.responsibilities}
          onSetResponsibility={(taskId, value) => {
            if (value === NEW_RESPONSIBILITY) {
              const name = prompt('Name der neuen Zuständigkeit:');
              if (name) createResponsibility(name, taskId);
              return;
            }
            dispatch({ type: 'updateTask', id: taskId, patch: { responsibility: value || undefined } });
          }}
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
          onRenameTask={(id, name) => dispatch({ type: 'updateTask', id, patch: { name } })}
          onSetDuration={(id, days) => {
            const task = project.tasks.find((t) => t.id === id);
            // Start bleibt, Ende = Start + Dauer (auch halbe Tage, über Wochenenden/Feiertage)
            if (task) dispatch({ type: 'updateTask', id, patch: { endTime: undefined, ...endFromPos(startPos(task) + days) } });
          }}
          onEdit={(task) => editTask(task.id)}
          onMove={(id, direction) => dispatch({ type: 'moveTask', id, direction })}
          onReorder={(id, toIndex) => dispatch({ type: 'reorderTask', id, toIndex })}
          onDelete={deleteTask}
        />
        <GanttChart
          tasks={displayTasks}
          view={view}
          range={range}
          today={today}
          selectedId={selectedId}
          svgRef={svgRef}
          onSelect={setSelectedId}
          onEdit={(task) => editTask(task.id)}
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

      <Legend
        responsibilities={legendItems}
        onColorChange={(id, color) => dispatch({ type: 'updateResponsibility', id, patch: { color } })}
        onManage={() => setManagingResponsibilities(true)}
      />

      <footer className="statusbar">
        <span>
          {fileHandle ? `Datei: ${fileHandle.name}${unsaved ? ' · ungespeicherte Änderungen' : ' · gespeichert'}` : 'Noch nicht als Datei gespeichert'} · {project.tasks.length} Aufgaben · Tage = Arbeitstage (Mo–Fr ohne bundesweite Feiertage)
        </span>
        <span className="muted">Balken ziehen = verschieben · Ränder ziehen = Dauer ändern · Punkt rechts ziehen = Abhängigkeit · Pfeil klicken = Abhängigkeit bearbeiten · Doppelklick = bearbeiten</span>
      </footer>

      {editing && (
        <TaskDialog
          key={editing.task.id}
          task={editing.task}
          isNew={editing.isNew}
          allTasks={displayTasks}
          columns={project.columns}
          responsibilities={project.responsibilities}
          onCreateResponsibility={(name) => createResponsibility(name)}
          onClose={() => setEditing(null)}
          onDelete={deleteTask}
          onSave={(task, respColor) => {
            if (respColor) dispatch({ type: 'updateResponsibility', id: respColor.id, patch: { color: respColor.color } });
            if (editing.isNew) dispatch({ type: 'addTask', task });
            else dispatch({ type: 'updateTask', id: task.id, patch: task });
            setSelectedId(task.id);
            setEditing(null);
          }}
        />
      )}

      {managingResponsibilities && (
        <ResponsibilityDialog
          responsibilities={project.responsibilities}
          tasks={project.tasks}
          onAdd={(name) => createResponsibility(name)}
          onUpdate={(id, patch) => dispatch({ type: 'updateResponsibility', id, patch })}
          onDelete={(r) => {
            const n = project.tasks.filter((t) => t.responsibility === r.id).length;
            if (n && !confirm(`„${r.name}“ ist ${n === 1 ? '1 Aufgabe' : `${n} Aufgaben`} zugeordnet. Trotzdem löschen? Die Aufgaben behalten dann ihre eigene Farbe.`)) return;
            dispatch({ type: 'deleteResponsibility', id: r.id });
          }}
          onClose={() => setManagingResponsibilities(false)}
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
