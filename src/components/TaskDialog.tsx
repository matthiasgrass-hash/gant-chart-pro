import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Column, Dependency, DependencyType, Responsibility, Task } from '../types';
import { TASK_COLORS } from '../lib/colors';
import { formatDate, isValidIso } from '../lib/date';
import { WORK_END_LABEL, WORK_START_LABEL, endFromPos, endPos, formatDays, parseDays, startPos, taskDuration, timeToFraction } from '../lib/worktime';
import { useDraggable } from '../lib/useDraggable';
import { DEPENDENCY_TYPES, initialLag, schedule } from '../lib/schedule';
import { wouldCreateCycle } from '../lib/graph';

interface Props {
  task: Task;
  isNew: boolean;
  allTasks: Task[];
  columns: Column[];
  responsibilities: Responsibility[];
  /** Legt eine Zuständigkeit an und gibt ihre ID zurück */
  onCreateResponsibility: (name: string) => string | null;
  onSave: (task: Task, responsibilityColor?: { id: string; color: string }) => void;
  onDelete: (task: Task) => void;
  onClose: () => void;
}

export function TaskDialog({ task, isNew, allTasks, columns, responsibilities, onCreateResponsibility, onSave, onDelete, onClose }: Props) {
  const textColumns = columns.filter((c) => c.kind === 'text');
  const [draft, setDraft] = useState<Task>(task);
  const resp = responsibilities.find((r) => r.id === draft.responsibility);
  // Farbe der Zuständigkeit wird erst beim Speichern übernommen
  const [respColors, setRespColors] = useState<Record<string, string>>({});
  const shownColor = resp ? (respColors[resp.id] ?? resp.color) : draft.color;
  const setColor = (c: string) => (resp ? setRespColors((m) => ({ ...m, [resp.id]: c })) : update('color', c));
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dragger = useDraggable();

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
  const datesTouched = draft.start !== task.start || draft.end !== task.end || draft.startTime !== task.startTime || draft.endTime !== task.endTime;
  const validDates = isValidIso(draft.start) && isValidIso(draft.end) && endPos(draft) > startPos(draft);
  const preview = useMemo(() => {
    if (datesTouched || !draft.dependencies.length || !validDates) return null;
    const planned = schedule([...allTasks.filter((t) => t.id !== task.id), draft]).find((t) => t.id === task.id)!;
    return planned.start === draft.start && planned.startTime === draft.startTime ? null : planned;
  }, [allTasks, draft, task.id, datesTouched]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) return setError('Bitte einen Namen eingeben.');
    if (!isValidIso(draft.start) || !isValidIso(draft.end)) return setError('Bitte gültige Daten eingeben.');
    if (!validDates) return setError('Das Ende muss nach dem Start liegen.');
    const fields = Object.fromEntries(Object.entries(draft.fields ?? {}).filter(([, v]) => v.trim() !== ''));
    const respColor = resp && respColors[resp.id] && respColors[resp.id] !== resp.color ? { id: resp.id, color: respColors[resp.id] } : undefined;
    onSave({ ...draft, name: draft.name.trim(), fields }, respColor);
  };

  return (
    <dialog ref={dialogRef} className="task-dialog" style={dragger.style} onClose={onClose} onCancel={onClose}>
      <form onSubmit={submit}>
        <div {...dragger.handleProps}>
          <h2>{isNew ? 'Neue Aufgabe' : 'Aufgabe bearbeiten'}</h2>
        </div>

        <label className="field">
          <span>Name</span>
          <input autoFocus value={draft.name} onChange={(e) => update('name', e.target.value)} placeholder="z. B. Konzeptphase" />
        </label>

        <div className="field-row">
          <div className="field">
            <span>Start</span>
            <div className="date-time">
              <input type="date" value={draft.start} onChange={(e) => update('start', e.target.value)} required aria-label="Startdatum" />
              <TimeInput
                value={draft.startTime}
                placeholder={`ab ${WORK_START_LABEL}`}
                label="Startzeit (optional)"
                onChange={(v) => update('startTime', v && timeToFraction(v, 0) > 0 ? v : undefined)}
              />
            </div>
          </div>
          <div className="field">
            <span>Ende</span>
            <div className="date-time">
              <input type="date" value={draft.end} min={draft.start} onChange={(e) => update('end', e.target.value)} required aria-label="Enddatum" />
              <TimeInput
                value={draft.endTime}
                placeholder={`bis ${WORK_END_LABEL}`}
                label="Endzeit (optional)"
                onChange={(v) => update('endTime', v && timeToFraction(v, 1) < 1 ? v : undefined)}
              />
            </div>
          </div>
          <label className="field">
            <span>Dauer (AT)</span>
            <DurationInput
              value={validDates ? taskDuration(draft) : null}
              onChange={(days) => setDraft((d) => ({ ...d, endTime: undefined, ...endFromPos(startPos(d) + days) }))}
            />
          </label>
        </div>
        <small className="muted field-note">
          Uhrzeit optional, z. B. Start ab 12:00 = halber Tag (Arbeitszeit {WORK_START_LABEL}–{WORK_END_LABEL}). Dauer auch als 0,5 oder 2,5 Tage.
        </small>

        <label className="field field--inline">
          <span>Puffer nach Ende</span>
          <input
            type="number"
            min={0}
            step={1}
            value={draft.buffer ?? 0}
            onChange={(e) => update('buffer', Math.max(0, Math.round(Number(e.target.value) || 0)))}
            aria-describedby="buffer-hint"
          />
          <span className="muted">Arbeitstage</span>
          <small id="buffer-hint" className="muted">Nachfolger (EA/EE) starten erst nach dem Puffer.</small>
        </label>

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

        <label className="field">
          <span>Zuständigkeit</span>
          <select
            value={draft.responsibility ?? ''}
            onChange={(e) => {
              if (e.target.value === '__new__') {
                const name = prompt('Name der neuen Zuständigkeit:');
                const id = name ? onCreateResponsibility(name) : null;
                if (id) update('responsibility', id);
                return;
              }
              update('responsibility', e.target.value || undefined);
            }}
          >
            <option value="">– keine –</option>
            {responsibilities.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
            <option value="__new__">+ Neue Zuständigkeit…</option>
          </select>
        </label>

        <div className="field">
          <span>{resp ? `Farbe der Zuständigkeit „${resp.name}“` : 'Farbe'}</span>
          <div className="colors">
            {TASK_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                className={`color-swatch${shownColor.toLowerCase() === c ? ' is-active' : ''}`}
                style={{ background: c }}
                aria-label={`Farbe ${c}`}
                onClick={() => setColor(c)}
              />
            ))}
            <input type="color" value={shownColor} onChange={(e) => setColor(e.target.value)} aria-label="Eigene Farbe" />
          </div>
          {resp && <small className="muted">Gilt für alle Aufgaben mit dieser Zuständigkeit und erscheint so in der Legende.</small>}
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
                      aria-label={`Versatz in Arbeitstagen zu ${c.name}`}
                      title="Versatz in Arbeitstagen (negativ = Überlappung)"
                    />
                    <span className="muted">AT</span>
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

/** Optionale Uhrzeit (leer = ganztägig) mit Knopf zum Zurücksetzen. */
function TimeInput({ value, placeholder, label, onChange }: { value?: string; placeholder: string; label: string; onChange: (v: string | undefined) => void }) {
  return (
    <span className="time-input">
      <input
        type="time"
        min={WORK_START_LABEL}
        max={WORK_END_LABEL}
        step={900}
        value={value ?? ''}
        aria-label={label}
        title={value ? label : `${label} – leer = ${placeholder}`}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
      {value ? (
        <button type="button" className="icon time-clear" title="Uhrzeit entfernen (ganztägig)" onClick={() => onChange(undefined)}>
          ✕
        </button>
      ) : (
        <span className="time-hint">{placeholder}</span>
      )}
    </span>
  );
}

/** Dauer in Arbeitstagen, auch mit Komma (0,5 / 2,5). Übernahme beim Verlassen oder mit Enter. */
function DurationInput({ value, onChange }: { value: number | null; onChange: (days: number) => void }) {
  const [text, setText] = useState(value === null ? '' : formatDays(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(value === null ? '' : formatDays(value));
  }, [value, focused]);
  const commit = () => {
    const n = parseDays(text);
    if (n !== null && n > 0) onChange(n);
    else setText(value === null ? '' : formatDays(value));
  };
  return (
    <input
      inputMode="decimal"
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
      }}
      aria-label="Dauer in Arbeitstagen"
    />
  );
}
