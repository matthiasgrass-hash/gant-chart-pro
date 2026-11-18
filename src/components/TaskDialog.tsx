import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Column, Task } from '../types';
import { TASK_COLORS } from '../lib/colors';
import { durationDays, isValidIso } from '../lib/date';
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

  const toggleDep = (id: string) =>
    update('dependencies', draft.dependencies.includes(id) ? draft.dependencies.filter((d) => d !== id) : [...draft.dependencies, id]);

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
            return (
              <label key={c.id} className={cyclic ? 'is-disabled' : ''} title={cyclic ? 'Würde eine zirkuläre Abhängigkeit erzeugen' : undefined}>
                <input type="checkbox" checked={draft.dependencies.includes(c.id)} disabled={cyclic} onChange={() => toggleDep(c.id)} />
                <i className="swatch" style={{ background: c.color }} />
                {c.name}
              </label>
            );
          })}
        </fieldset>

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
