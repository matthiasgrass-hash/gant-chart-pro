import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Column, Dependency, DependencyType, Task } from '../types';
import { TASK_COLORS } from '../lib/colors';
import { durationDays, formatDate, isValidIso } from '../lib/date';
import { DEPENDENCY_TYPES, initialLag, schedule } from '../lib/schedule';
import { wouldCreateCycle } from '../lib/graph';

interface Props {
  task: Task;
  isNew: boolean;
  allTasks: Task[];
  columns: Column[];
  onSave: (task: Task) => void;
  onDelete: (task: Task) => void;
  onClose: () => void;
}

export function TaskDialog({ task, isNew, allTasks, columns, onSave, onDelete, onClose }: Props) {
  const textColumns = columns.filter((c) => c.kind === 'text');
  const [draft, setDraft] = useState<Task>(task);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const candidates = allTasks.filter((t) => t.id !== task.id);
  // Für die Zyklusprüfung zählen die Abhängigkeiten dieser Aufgabe nicht mit.
  const graph = allTasks.map((t) => (t.id === task.id ? { ...t, dependencies: [] } : t));

  const update = <K extends keyof Task>(key: K, value: Task[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const depOf = (id: string) => draft.dependencies.find((d) => d.taskId === id);

  const toggleDep = (pred: Task) =>
    update(
      'dependencies',
      depOf(pred.id)
        ? draft.dependencies.filter((d) => d.taskId !== pred.id)
        : [...draft.dependencies, { taskId: pred.id, type: 'FS', lag: initialLag(draft, pred, 'FS') }],
    );

  const patchDep = (id: string, patch: Partial<Dependency>) =>
    update('dependencies', draft.dependencies.map((d) => (d.taskId === id ? { ...d, ...patch } : d)));

  // Vorschau: Wo landet die Aufgabe mit den eingestellten Abhängigkeiten?
  const datesTouched = draft.start !== task.start || draft.end !== task.end;
  const preview = useMemo(() => {
    if (datesTouched || !draft.dependencies.length || !isValidIso(draft.start) || !isValidIso(draft.end) || draft.end < draft.start) return null;
    const planned = schedule([...allTasks.filter((t) => t.id !== task.id), draft]).find((t) => t.id === task.id)!;
    return planned.start === draft.start ? null : planned;
  }, [allTasks, draft, task.id, datesTouched]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) return setError('Bitte einen Namen eingeben.');
    if (!isValidIso(draft.start) || !isValidIso(draft.end)) return setError('Bitte gültige Daten eingeben.');
    if (draft.end < draft.start) return setError('Das Ende darf nicht vor dem Start liegen.');
    const fields = Object.fromEntries(Object.entries(draft.fields ?? {}).filter(([, v]) => v.trim() !== ''));
    onSave({ ...draft, name: draft.name.trim(), fields });
  };

  return (
    <dialog ref={dialogRef} className="task-dialog" onClose={onClose} onCancel={onClose}>
      <form onSubmit={submit}>
        <h2>{isNew ? 'Neue Aufgabe' : 'Aufgabe bearbeiten'}</h2>

        <label className="field">
          <span>Name</span>
          <input autoFocus value={draft.name} onChange={(e) => update('name', e.target.value)} placeholder="z. B. Konzeptphase" />
        </label>

        <div className="field-row">
          <label className="field">
            <span>Start</span>
            <input type="date" value={draft.start} onChange={(e) => update('start', e.target.value)} required />
          </label>
          <label className="field">
            <span>Ende</span>
            <input type="date" value={draft.end} min={draft.start} onChange={(e) => update('end', e.target.value)} required />
          </label>
          <div className="field">
            <span>Dauer</span>
            <output>{isValidIso(draft.start) && isValidIso(draft.end) && draft.end >= draft.start ? `${durationDays(draft.start, draft.end)} Tage` : '–'}</output>
          </div>
        </div>

        {textColumns.length > 0 && (
          <div className="field-grid">
            {textColumns.map((c) => (
              <label key={c.id} className="field">
                <span>{c.label}</span>
                <input
                  value={draft.fields?.[c.id] ?? ''}
                  onChange={(e) => update('fields', { ...draft.fields, [c.id]: e.target.value })}
                />
              </label>
            ))}
          </div>
        )}

        <label className="field">
          <span>Fortschritt: {draft.progress} %</span>
          <input type="range" min={0} max={100} step={5} value={draft.progress} onChange={(e) => update('progress', Number(e.target.value))} />
        </label>

        <div className="field">
          <span>Farbe</span>
          <div className="colors">
            {TASK_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                className={`color-swatch${draft.color === c ? ' is-active' : ''}`}
                style={{ background: c }}
                aria-label={`Farbe ${c}`}
                onClick={() => update('color', c)}
              />
            ))}
            <input type="color" value={draft.color} onChange={(e) => update('color', e.target.value)} aria-label="Eigene Farbe" />
          </div>
        </div>

        <fieldset className="field deps">
          <legend>Abhängig von (Vorgänger)</legend>
          {candidates.length === 0 && <p className="muted">Keine weiteren Aufgaben vorhanden.</p>}
          {candidates.map((c) => {
            const cyclic = wouldCreateCycle(graph, task.id, c.id);
            const dep = depOf(c.id);
            return (
              <div key={c.id} className={`dep-row${dep ? ' is-active' : ''}`}>
                <label className={cyclic ? 'is-disabled' : ''} title={cyclic ? 'Würde eine zirkuläre Abhängigkeit erzeugen' : undefined}>
                  <input type="checkbox" checked={Boolean(dep)} disabled={cyclic} onChange={() => toggleDep(c)} />
                  <i className="swatch" style={{ background: c.color }} />
                  <span className="ellipsis">{c.name}</span>
                </label>
                {dep && (
                  <div className="dep-settings">
                    <select value={dep.type} onChange={(e) => patchDep(c.id, { type: e.target.value as DependencyType })} aria-label={`Art der Abhängigkeit zu ${c.name}`}>
                      {DEPENDENCY_TYPES.map((t) => (
                        <option key={t.type} value={t.type}>
                          {t.short} – {t.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step={1}
                      value={dep.lag}
                      onChange={(e) => patchDep(c.id, { lag: Math.round(Number(e.target.value) || 0) })}
                      aria-label={`Versatz in Tagen zu ${c.name}`}
                      title="Versatz in Tagen (negativ = Überlappung)"
                    />
                    <span className="muted">Tage</span>
                  </div>
                )}
              </div>
            );
          })}
        </fieldset>
        {draft.dependencies.length > 0 && (
          <p className="hint">
            Der Start wird automatisch aus den Vorgängern berechnet. Änderst du oben das Datum, passt sich der Versatz an.
            {preview && (
              <>
                {' '}
                <strong>
                  Neue Planung: {formatDate(preview.start)} – {formatDate(preview.end)}
                </strong>
              </>
            )}
          </p>
        )}

        {error && <p className="error" role="alert">{error}</p>}

        <div className="dialog-actions">
          {!isNew && (
            <button type="button" className="danger" onClick={() => onDelete(task)}>
              Löschen
            </button>
          )}
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" className="primary">
            Speichern
          </button>
        </div>
      </form>
    </dialog>
  );
}
