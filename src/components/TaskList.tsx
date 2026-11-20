import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { Column, Responsibility, Task } from '../types';
import { ACTIONS_WIDTH, cellText, clampColumnWidth, columnWidth, isNumericColumn, missingBuiltins } from '../lib/columns';
import { HEADER_HEIGHT, ROW_HEIGHT } from '../lib/timeline';
import { parseDays } from '../lib/worktime';

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
  responsibilities: Responsibility[];
  /** value: ID, '' = keine, NEW_RESPONSIBILITY = neue anlegen */
  onSetResponsibility: (taskId: string, value: string) => void;
  onRenameTask: (taskId: string, name: string) => void;
  /** Dauer in Arbeitstagen setzen (Ende verschiebt sich) */
  onSetDuration: (taskId: string, days: number) => void;
  /** Aufgabe per Ziehen an eine neue Position in der Reihenfolge setzen */
  onReorder: (taskId: string, toIndex: number) => void;
  /** Spaltenbreite setzen; null = Standardbreite */
  onSetColumnWidth: (columnId: string, width: number | null) => void;
  onMoveColumn: (columnId: string, toIndex: number) => void;
}

export const NEW_RESPONSIBILITY = '__new__';

export function listWidth(columns: Column[], widthOf: (c: Column) => number = columnWidth): number {
  // Spaltenbreiten + Aktionsspalte + Grid-Abstände (6px) + Innenabstand links/rechts
  return columns.reduce((sum, c) => sum + widthOf(c), 0) + ACTIONS_WIDTH + columns.length * 6 + 20;
}

/** Text, der per Klick zum Eingabefeld wird. Enter/Verlassen speichert, Esc bricht ab. */
function InlineEdit({
  value,
  placeholder,
  className,
  onSave,
  autoEdit = false,
  numeric = false,
  onActivate,
}: {
  value: string;
  placeholder?: string;
  className?: string;
  onSave: (v: string) => void;
  autoEdit?: boolean;
  /** Zahleneingabe (auch mit Komma, z. B. 2,5) */
  numeric?: boolean;
  /** wird beim Start der Bearbeitung aufgerufen, z. B. um die Zeile auszuwählen */
  onActivate?: () => void;
}) {
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
          onActivate?.();
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
      className={`inline-input${numeric ? ' inline-input--num' : ''}`}
      {...(numeric ? { inputMode: 'decimal' as const } : {})}
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
  // Breiten während des Ziehens am Spaltenrand (live), sonst gespeicherte bzw. Standardbreite
  const [liveWidths, setLiveWidths] = useState<Record<string, number>>({});
  const widthOf = (c: Column) => liveWidths[c.id] ?? columnWidth(c);
  const template = `${columns.map((c) => `${widthOf(c)}px`).join(' ')} ${ACTIONS_WIDTH}px`;
  const headerRef = useRef<HTMLDivElement>(null);
  const colDrag = useColumnDrag(headerRef, columns.length, (id, to) => p.onMoveColumn(id, to));

  const startResize = (e: ReactPointerEvent<HTMLSpanElement>, c: Column) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startW = widthOf(c);
    let last = startW;
    const move = (ev: PointerEvent) => {
      last = clampColumnWidth(startW + ev.clientX - startX);
      setLiveWidths({ [c.id]: last });
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      setLiveWidths({});
      if (last !== startW) p.onSetColumnWidth(c.id, last);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  const [freshColumn, setFreshColumn] = useState<string | null>(null);
  const rowDrag = useRowDrag(tasks.length, (id, to) => p.onReorder(id, to));
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
    <div className="task-list" role="table" aria-label="Aufgabenliste" style={{ width: listWidth(columns, widthOf) }}>
      <div ref={headerRef} className="task-list__header" role="row" style={{ height: HEADER_HEIGHT, gridTemplateColumns: template }}>
        {columns.map((c, ci) => (
          <span
            key={c.id}
            role="columnheader"
            data-col-index={ci}
            className={`col-head${isNumericColumn(c.kind) ? ' num' : ''}${colDrag.draggingId === c.id ? ' is-dragging' : ''}`}
            style={{ transform: colDrag.offsetFor(c.id) }}
            title="Zum Verschieben ziehen · Klick auf den Namen: umbenennen"
            onPointerDown={(e) => colDrag.onPointerDown(e, c.id, ci)}
            onPointerMove={colDrag.onPointerMove}
            onPointerUp={colDrag.onPointerUp}
            onPointerCancel={colDrag.onPointerCancel}
          >
            <InlineEdit key={freshColumn === c.id ? 'fresh' : 'normal'} autoEdit={freshColumn === c.id} value={c.label} onSave={(v) => p.onRenameColumn(c.id, v)} />
            {c.kind !== 'name' && (
              <button className="icon col-delete" title={`Spalte „${c.label}" löschen`} onClick={() => p.onDeleteColumn(c)}>
                ✕
              </button>
            )}
            <span
              className="col-resize"
              title="Breite ändern (ziehen) · Doppelklick: Standardbreite"
              onPointerDown={(e) => startResize(e, c)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                p.onSetColumnWidth(c.id, null);
              }}
            />
          </span>
        ))}
        {colDrag.indicatorX !== null && <span className="col-drop-indicator" style={{ left: colDrag.indicatorX }} aria-hidden="true" />}
        <AddColumnMenu columns={columns} onAdd={p.onAddColumn} />
      </div>
      {tasks.map((t, i) => (
        <div
          key={t.id}
          role="row"
          className={`task-list__row${t.id === selectedId ? ' is-selected' : ''}${rowDrag.draggingId === t.id ? ' is-dragging' : ''}${rowDrag.draggingId ? ' is-sorting' : ''}`}
          style={{ height: ROW_HEIGHT, gridTemplateColumns: template, transform: rowDrag.offsetFor(t.id, i) }}
          onPointerDown={(e) => rowDrag.onPointerDown(e, t.id, i)}
          onPointerMove={rowDrag.onPointerMove}
          onPointerUp={rowDrag.onPointerUp}
          onPointerCancel={rowDrag.onPointerCancel}
          onClick={() => p.onSelect(t.id)}
          onDoubleClick={() => p.onEdit(t)}
        >
          {columns.map((c) =>
            c.kind === 'name' ? (
              <span key={c.id} role="cell" className="task-name">
                <span className="row-grip" aria-hidden="true" title="Zum Verschieben ziehen">
                  ⠿
                </span>
                <i className="swatch" style={{ background: t.color }} />
                <InlineEdit
                  className="task-name__edit"
                  value={t.name}
                  onActivate={() => p.onSelect(t.id)}
                  onSave={(v) => v.trim() && p.onRenameTask(t.id, v.trim())}
                />
                {t.progress === 100 && <span className="done" aria-label="erledigt">✓</span>}
              </span>
            ) : c.kind === 'responsibility' ? (
              <span key={c.id} role="cell" className="resp-cell" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                <i className="swatch" style={{ background: p.responsibilities.find((r) => r.id === t.responsibility)?.color ?? 'transparent' }} />
                <select
                  className="resp-select"
                  value={t.responsibility ?? ''}
                  onChange={(e) => p.onSetResponsibility(t.id, e.target.value)}
                  aria-label={`Zuständigkeit für ${t.name}`}
                >
                  <option value="">–</option>
                  {p.responsibilities.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                  <option value={NEW_RESPONSIBILITY}>+ Neue Zuständigkeit…</option>
                </select>
              </span>
            ) : c.kind === 'text' ? (
              <span key={c.id} role="cell" className="text-cell">
                <InlineEdit value={cellText(t, c)} placeholder="–" onSave={(v) => p.onSetField(t.id, c.id, v)} />
              </span>
            ) : (
              <span key={c.id} role="cell" className={isNumericColumn(c.kind) ? 'num' : undefined}>
                {c.kind === 'duration' ? (
                  <InlineEdit
                    className="num-edit"
                    numeric
                    value={cellText(t, c)}
                    onActivate={() => p.onSelect(t.id)}
                    onSave={(v) => {
                      // auch halbe Tage: „2,5“ oder „0.5“
                      const n = parseDays(v);
                      if (n !== null && n > 0) p.onSetDuration(t.id, n);
                    }}
                  />
                ) : (
                  cellText(t, c)
                )}
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

/**
 * Zeilen per Ziehen umsortieren: Zeile gedrückt halten und hoch/runter ziehen.
 * Erst ab einigen Pixeln Bewegung wird gezogen – ein normaler Klick (z. B. Name bearbeiten) bleibt ein Klick.
 */
function useRowDrag(count: number, onDrop: (id: string, toIndex: number) => void) {
  const [state, setState] = useState<{ id: string; from: number; dy: number; active: boolean } | null>(null);
  const start = useRef<{ id: string; from: number; y: number; pointerId: number } | null>(null);

  const target = (from: number, dy: number) => Math.max(0, Math.min(count - 1, from + Math.round(dy / ROW_HEIGHT)));

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>, id: string, index: number) => {
    if (e.button !== 0) return;
    // Bedienelemente behalten ihr Verhalten
    if ((e.target as HTMLElement).closest('input, select, textarea, .row-actions, .col-delete')) return;
    start.current = { id, from: index, y: e.clientY, pointerId: e.pointerId };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s || e.pointerId !== s.pointerId) return;
    const dy = e.clientY - s.y;
    if (!state?.active && Math.abs(dy) < 5) return;
    if (!state?.active) e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    setState({ id: s.id, from: s.from, dy, active: true });
  };

  const finish = (e: ReactPointerEvent<HTMLDivElement>, drop: boolean) => {
    const s = start.current;
    start.current = null;
    if (!s || !state?.active) {
      setState(null);
      return;
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    const to = target(s.from, state.dy);
    setState(null);
    // Den Klick, der nach dem Loslassen kommt, verschlucken (sonst würde z. B. der Name bearbeitet)
    const swallow = (ev: MouseEvent) => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
    if (drop && to !== s.from) onDrop(s.id, to);
  };

  /** Verschiebung jeder Zeile während des Ziehens (gezogene Zeile folgt der Maus, andere weichen aus). */
  const offsetFor = (id: string, index: number): string | undefined => {
    if (!state?.active) return undefined;
    if (id === state.id) return `translateY(${state.dy}px)`;
    const to = target(state.from, state.dy);
    if (state.from < to && index > state.from && index <= to) return `translateY(${-ROW_HEIGHT}px)`;
    if (state.from > to && index >= to && index < state.from) return `translateY(${ROW_HEIGHT}px)`;
    return undefined;
  };

  return {
    draggingId: state?.active ? state.id : null,
    offsetFor,
    onPointerDown,
    onPointerMove,
    onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => finish(e, true),
    onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => finish(e, false),
  };
}

/**
 * Spalten im Kopf per Ziehen verschieben. Erst ab einigen Pixeln Bewegung wird gezogen –
 * ein Klick auf den Namen (Umbenennen) bleibt ein Klick. Eine Linie zeigt die Zielposition.
 */
function useColumnDrag(headerRef: { current: HTMLDivElement | null }, count: number, onDrop: (id: string, toIndex: number) => void) {
  const [state, setState] = useState<{ id: string; dx: number; to: number; indicatorX: number } | null>(null);
  const start = useRef<{ id: string; from: number; x: number; pointerId: number; cells: DOMRect[]; left: number } | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLSpanElement>, id: string, index: number) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('input, .col-resize, .col-delete')) return;
    const header = headerRef.current;
    if (!header) return;
    const cells = [...header.querySelectorAll<HTMLElement>('[data-col-index]')].map((el) => el.getBoundingClientRect());
    start.current = { id, from: index, x: e.clientX, pointerId: e.pointerId, cells, left: header.getBoundingClientRect().left };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLSpanElement>) => {
    const s = start.current;
    if (!s || e.pointerId !== s.pointerId) return;
    const dx = e.clientX - s.x;
    if (!state && Math.abs(dx) < 6) return;
    if (!state) e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    // Einfügestelle: vor der ersten Spalte, deren Mitte rechts vom Mauszeiger liegt
    let gap = s.cells.findIndex((r) => e.clientX < r.left + r.width / 2);
    if (gap < 0) gap = count;
    const to = gap > s.from ? gap - 1 : gap;
    const edge = gap < count ? s.cells[gap].left - 3 : s.cells[count - 1].right + 3;
    setState({ id: s.id, dx, to, indicatorX: edge - s.left });
  };

  const finish = (e: ReactPointerEvent<HTMLSpanElement>, drop: boolean) => {
    const s = start.current;
    start.current = null;
    const st = state;
    setState(null);
    if (!s || !st) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    // Den Klick nach dem Loslassen verschlucken (sonst würde umbenannt)
    const swallow = (ev: MouseEvent) => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
    if (drop && st.to !== s.from) onDrop(s.id, st.to);
  };

  return {
    draggingId: state?.id ?? null,
    indicatorX: state ? state.indicatorX : null,
    offsetFor: (id: string) => (state && state.id === id ? `translateX(${state.dx}px)` : undefined),
    onPointerDown,
    onPointerMove,
    onPointerUp: (e: ReactPointerEvent<HTMLSpanElement>) => finish(e, true),
    onPointerCancel: (e: ReactPointerEvent<HTMLSpanElement>) => finish(e, false),
  };
}
