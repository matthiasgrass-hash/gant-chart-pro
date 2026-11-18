import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Column, Task } from '../types';
import { ACTIONS_WIDTH, COLUMN_WIDTH, cellText, isNumericColumn, missingBuiltins } from '../lib/columns';
import { HEADER_HEIGHT, ROW_HEIGHT } from '../lib/timeline';

interface Props {
  tasks: Task[];
  columns: Column[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEdit: (task: Task) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onDelete: (task: Task) => void;
  onAddColumn: (column: Column | null) => void;
  onRenameColumn: (id: string, label: string) => void;
  onDeleteColumn: (column: Column) => void;
  onSetField: (taskId: string, columnId: string, value: string) => void;
}

export function listWidth(columns: Column[]): number {
  // Spaltenbreiten + Aktionsspalte + Grid-Abstände (6px) + Innenabstand links/rechts
  return columns.reduce((sum, c) => sum + COLUMN_WIDTH[c.kind], 0) + ACTIONS_WIDTH + columns.length * 6 + 20;
}

/** Text, der per Klick zum Eingabefeld wird. Enter/Verlassen speichert, Esc bricht ab. */
function InlineEdit({ value, placeholder, className, onSave, autoEdit = false }: { value: string; placeholder?: string; className?: string; onSave: (v: string) => void; autoEdit?: boolean }) {
  const [editing, setEditing] = useState(autoEdit);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);

  if (!editing) {
    return (
      <button
        type="button"
        className={`inline-edit ${className ?? ''}${value ? '' : ' is-empty'}`}
        title={value ? `${value} – klicken zum Bearbeiten` : 'Klicken zum Bearbeiten'}
        onClick={(e) => {
          e.stopPropagation();
          setDraft(value);
          setEditing(true);
        }}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {value || placeholder}
      </button>
    );
  }
  const commit = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commit();
    else if (e.key === 'Escape') setEditing(false);
    e.stopPropagation();
  };
  return (
    <input
      ref={ref}
      className="inline-input"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKey}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  );
}

function AddColumnMenu({ columns, onAdd }: { columns: Column[]; onAdd: (c: Column | null) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hidden = missingBuiltins(columns);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="add-column" ref={ref}>
      <button className="icon add-column__btn" title="Spalte hinzufügen" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        + Spalte
      </button>
      {open && (
        <div className="menu" role="menu">
          <button role="menuitem" onClick={() => { setOpen(false); onAdd(null); }}>
            Neue Textspalte
          </button>
          {hidden.length > 0 && <div className="menu__sep">Weitere Spalten</div>}
          {hidden.map((c) => (
            <button key={c.kind} role="menuitem" onClick={() => { setOpen(false); onAdd({ ...c }); }}>
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TaskList(p: Props) {
  const { tasks, columns, selectedId } = p;
  const template = `${columns.map((c) => (c.kind === 'name' ? `minmax(0, ${COLUMN_WIDTH.name}px)` : `${COLUMN_WIDTH[c.kind]}px`)).join(' ')} ${ACTIONS_WIDTH}px`;
  const [freshColumn, setFreshColumn] = useState<string | null>(null);
  const prevCount = useRef(columns.length);
  // Neu angelegte Textspalte direkt zum Umbenennen öffnen
  useEffect(() => {
    if (columns.length > prevCount.current) {
      const last = columns[columns.length - 1];
      if (last.kind === 'text') setFreshColumn(last.id);
    }
    prevCount.current = columns.length;
  }, [columns]);

  return (
    <div className="task-list" role="table" aria-label="Aufgabenliste" style={{ width: listWidth(columns) }}>
      <div className="task-list__header" role="row" style={{ height: HEADER_HEIGHT, gridTemplateColumns: template }}>
        {columns.map((c) => (
          <span key={c.id} role="columnheader" className={`col-head${isNumericColumn(c.kind) ? ' num' : ''}`}>
            <InlineEdit key={freshColumn === c.id ? 'fresh' : 'normal'} autoEdit={freshColumn === c.id} value={c.label} onSave={(v) => p.onRenameColumn(c.id, v)} />
            {c.kind !== 'name' && (
              <button className="icon col-delete" title={`Spalte „${c.label}" löschen`} onClick={() => p.onDeleteColumn(c)}>
                ✕
              </button>
            )}
          </span>
        ))}
        <AddColumnMenu columns={columns} onAdd={p.onAddColumn} />
      </div>
      {tasks.map((t, i) => (
        <div
          key={t.id}
          role="row"
          className={`task-list__row${t.id === selectedId ? ' is-selected' : ''}`}
          style={{ height: ROW_HEIGHT, gridTemplateColumns: template }}
          onClick={() => p.onSelect(t.id)}
          onDoubleClick={() => p.onEdit(t)}
        >
          {columns.map((c) =>
            c.kind === 'name' ? (
              <span key={c.id} role="cell" className="task-name" title={t.name}>
                <i className="swatch" style={{ background: t.color }} />
                <span className="ellipsis">{t.name}</span>
                {t.progress === 100 && <span className="done" aria-label="erledigt">✓</span>}
              </span>
            ) : c.kind === 'text' ? (
              <span key={c.id} role="cell" className="text-cell">
                <InlineEdit value={cellText(t, c)} placeholder="–" onSave={(v) => p.onSetField(t.id, c.id, v)} />
              </span>
            ) : (
              <span key={c.id} role="cell" className={isNumericColumn(c.kind) ? 'num' : undefined}>
                {cellText(t, c)}
              </span>
            ),
          )}
          <span role="cell" className="row-actions" onClick={(e) => e.stopPropagation()}>
            <button className="icon" title="Nach oben" disabled={i === 0} onClick={() => p.onMove(t.id, -1)}>↑</button>
            <button className="icon" title="Nach unten" disabled={i === tasks.length - 1} onClick={() => p.onMove(t.id, 1)}>↓</button>
            <button className="icon" title="Bearbeiten" onClick={() => p.onEdit(t)}>✎</button>
            <button className="icon danger" title="Löschen" onClick={() => p.onDelete(t)}>✕</button>
          </span>
        </div>
      ))}
    </div>
  );
}
