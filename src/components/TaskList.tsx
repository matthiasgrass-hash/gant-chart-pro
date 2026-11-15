import type { Task } from '../types';
import { durationDays, formatDate } from '../lib/date';
import { HEADER_HEIGHT, ROW_HEIGHT } from '../lib/timeline';

interface Props {
  tasks: Task[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEdit: (task: Task) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onDelete: (task: Task) => void;
}

export function TaskList({ tasks, selectedId, onSelect, onEdit, onMove, onDelete }: Props) {
  return (
    <div className="task-list" role="table" aria-label="Aufgabenliste">
      <div className="task-list__header" role="row" style={{ height: HEADER_HEIGHT }}>
        <span role="columnheader">Aufgabe</span>
        <span role="columnheader">Start</span>
        <span role="columnheader">Ende</span>
        <span role="columnheader" className="num">Tage</span>
        <span />
      </div>
      {tasks.map((t, i) => (
        <div
          key={t.id}
          role="row"
          className={`task-list__row${t.id === selectedId ? ' is-selected' : ''}`}
          style={{ height: ROW_HEIGHT }}
          onClick={() => onSelect(t.id)}
          onDoubleClick={() => onEdit(t)}
        >
          <span role="cell" className="task-name" title={t.name}>
            <i className="swatch" style={{ background: t.color }} />
            {t.name}
            {t.progress === 100 && <span className="done" aria-label="erledigt">✓</span>}
          </span>
          <span role="cell">{formatDate(t.start)}</span>
          <span role="cell">{formatDate(t.end)}</span>
          <span role="cell" className="num">{durationDays(t.start, t.end)}</span>
          <span role="cell" className="row-actions" onClick={(e) => e.stopPropagation()}>
            <button className="icon" title="Nach oben" disabled={i === 0} onClick={() => onMove(t.id, -1)}>↑</button>
            <button className="icon" title="Nach unten" disabled={i === tasks.length - 1} onClick={() => onMove(t.id, 1)}>↓</button>
            <button className="icon" title="Bearbeiten" onClick={() => onEdit(t)}>✎</button>
            <button className="icon danger" title="Löschen" onClick={() => onDelete(t)}>✕</button>
          </span>
        </div>
      ))}
    </div>
  );
}
