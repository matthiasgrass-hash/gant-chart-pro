import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type Ref } from 'react';
import type { Task, ViewMode } from '../types';
import { addDays, toDayNumber } from '../lib/date';
import { bufferEndDay, dependencyLabel, setTaskDates } from '../lib/schedule';
import { BAR_HEIGHT, HEADER_HEIGHT, PX_PER_DAY, ROW_HEIGHT, BAR_FONT, barGeometry, dependencyPathTyped, headerRows, labelFitsInside, type TimelineRange } from '../lib/timeline';

interface Props {
  tasks: Task[];
  view: ViewMode;
  range: TimelineRange;
  today: number;
  selectedId: string | null;
  svgRef: Ref<SVGSVGElement>;
  onSelect: (id: string | null) => void;
  onEdit: (task: Task) => void;
  onChangeDates: (id: string, start: string, end: string) => void;
  onAddDependency: (taskId: string, predecessorId: string) => void;
}

type DragState =
  | { kind: 'move' | 'start' | 'end'; id: string; originX: number; delta: number; moved: boolean }
  | { kind: 'link'; fromId: string; x1: number; y1: number; x: number; y: number };

const HANDLE = 8;

function shiftTask(task: Task, drag: DragState | null): Task {
  if (!drag || drag.kind === 'link' || drag.id !== task.id || drag.delta === 0) return task;
  const { delta } = drag;
  if (drag.kind === 'move') return { ...task, start: addDays(task.start, delta), end: addDays(task.end, delta) };
  if (drag.kind === 'start') {
    const start = addDays(task.start, delta);
    return { ...task, start: start > task.end ? task.end : start };
  }
  const end = addDays(task.end, delta);
  return { ...task, end: end < task.start ? task.start : end };
}

export function GanttChart(props: Props) {
  const { tasks, view, range, today, selectedId, svgRef, onSelect, onEdit, onChangeDates, onAddDependency } = props;
  const ppd = PX_PER_DAY[view];
  const width = range.days * ppd;
  const height = HEADER_HEIGHT + Math.max(tasks.length, 1) * ROW_HEIGHT;
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hoverLink, setHoverLink] = useState<string | null>(null);
  const localSvg = useRef<SVGSVGElement | null>(null);
  const lastClick = useRef<{ id: string; time: number } | null>(null);

  const header = useMemo(() => headerRows(range, view), [range, view]);
  // Vorschau beim Ziehen: gezogene Aufgabe + automatisch mitwandernde Nachfolger
  const displayed = useMemo(() => {
    if (!drag || drag.kind === 'link' || drag.delta === 0) return tasks;
    const original = tasks.find((t) => t.id === drag.id);
    if (!original) return tasks;
    const next = shiftTask(original, drag);
    return setTaskDates(tasks, next.id, next.start, next.end);
  }, [tasks, drag]);
  const rowOf = useMemo(() => new Map(displayed.map((t, i) => [t.id, i])), [displayed]);

  const setRefs = (node: SVGSVGElement | null) => {
    localSvg.current = node;
    if (typeof svgRef === 'function') svgRef(node);
    else if (svgRef) (svgRef as { current: SVGSVGElement | null }).current = node;
  };

  const toLocal = (e: { clientX: number; clientY: number }) => {
    const rect = localSvg.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const beginDrag = (e: ReactPointerEvent, kind: 'move' | 'start' | 'end', id: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    localSvg.current?.setPointerCapture(e.pointerId);
    onSelect(id);
    setDrag({ kind, id, originX: toLocal(e).x, delta: 0, moved: false });
  };

  const beginLink = (e: ReactPointerEvent, task: Task, x1: number, y1: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    localSvg.current?.setPointerCapture(e.pointerId);
    const p = toLocal(e);
    setDrag({ kind: 'link', fromId: task.id, x1, y1, x: p.x, y: p.y });
  };

  const taskAtY = (y: number) => {
    const row = Math.floor((y - HEADER_HEIGHT) / ROW_HEIGHT);
    return row >= 0 && row < tasks.length ? tasks[row] : null;
  };

  const handleMove = (e: ReactPointerEvent) => {
    if (!drag) return;
    const p = toLocal(e);
    if (drag.kind === 'link') {
      setDrag({ ...drag, x: p.x, y: p.y });
      const target = taskAtY(p.y);
      setHoverLink(target && target.id !== drag.fromId ? target.id : null);
      return;
    }
    const dx = p.x - drag.originX;
    const delta = Math.round(dx / ppd);
    const moved = drag.moved || Math.abs(dx) > 3;
    if (delta !== drag.delta || moved !== drag.moved) setDrag({ ...drag, delta, moved });
  };

  const handleUp = (e: ReactPointerEvent) => {
    if (!drag) return;
    localSvg.current?.releasePointerCapture(e.pointerId);
    if (drag.kind === 'link') {
      const target = taskAtY(toLocal(e).y);
      if (target && target.id !== drag.fromId) onAddDependency(target.id, drag.fromId);
    } else if (!drag.moved) {
      const now = Date.now();
      const prev = lastClick.current;
      if (prev && prev.id === drag.id && now - prev.time < 400) {
        lastClick.current = null;
        const task = tasks.find((t) => t.id === drag.id);
        if (task) onEdit(task);
      } else {
        lastClick.current = { id: drag.id, time: now };
      }
    } else if (drag.delta !== 0) {
      const original = tasks.find((t) => t.id === drag.id);
      if (original) {
        const next = shiftTask(original, drag);
        onChangeDates(next.id, next.start, next.end);
      }
    }
    setHoverLink(null);
    setDrag(null);
  };

  const todayX = (today - range.startDay) * ppd;
  const cursor = drag ? (drag.kind === 'move' ? 'grabbing' : drag.kind === 'link' ? 'crosshair' : 'ew-resize') : undefined;

  return (
    <svg
      ref={setRefs}
      className="gantt-svg"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fontFamily='system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
      style={{ cursor }}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={() => {
        setDrag(null);
        setHoverLink(null);
      }}
      onPointerDown={() => onSelect(null)}
      role="img"
      aria-label="Gantt-Diagramm"
    >
      <defs>
        <pattern id="buffer-hatch" patternUnits="userSpaceOnUse" width={6} height={6} patternTransform="rotate(45)">
          <rect width={6} height={6} fill="#f3eefb" />
          <line x1={0} y1={0} x2={0} y2={6} stroke="#6022a7" strokeOpacity={0.45} strokeWidth={2} />
        </pattern>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
        </marker>
        <marker id="arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#6022a7" />
        </marker>
      </defs>

      {/* Hintergrund & Raster */}
      <rect x={0} y={0} width={width} height={height} fill="#ffffff" />
      {view === 'day' &&
        header.bottom.map((c) =>
          c.weekend ? (
            <rect key={`we-${c.x}`} x={c.x} y={HEADER_HEIGHT} width={c.width} height={height - HEADER_HEIGHT} fill={c.holiday ? '#f1edf9' : '#f1f5f9'}>
              {c.holiday && <title>{`${c.holiday} (arbeitsfrei)`}</title>}
            </rect>
          ) : null,
        )}
      {displayed.map((t, i) =>
        t.id === selectedId ? <rect key={`sel-${t.id}`} data-export="exclude" x={0} y={HEADER_HEIGHT + i * ROW_HEIGHT} width={width} height={ROW_HEIGHT} fill="#f3eefb" /> : null,
      )}
      {header.bottom.map((c) => (
        <line key={`v-${c.x}`} x1={c.x + 0.5} x2={c.x + 0.5} y1={HEADER_HEIGHT / 2} y2={height} stroke="#e2e8f0" />
      ))}
      {displayed.map((t, i) => (
        <line key={`h-${t.id}`} x1={0} x2={width} y1={HEADER_HEIGHT + (i + 1) * ROW_HEIGHT - 0.5} y2={HEADER_HEIGHT + (i + 1) * ROW_HEIGHT - 0.5} stroke="#eef2f7" />
      ))}

      {/* Kopfzeile */}
      <rect x={0} y={0} width={width} height={HEADER_HEIGHT} fill="#f8fafc" />
      {header.top.map((c) => (
        <g key={`t-${c.x}`}>
          <line x1={c.x + 0.5} x2={c.x + 0.5} y1={0} y2={HEADER_HEIGHT / 2} stroke="#cbd5e1" />
          <text x={c.x + 8} y={HEADER_HEIGHT / 4 + 5} fontSize={13} fontWeight={600} fill="#334155">
            {c.width > 40 ? c.label : ''}
          </text>
        </g>
      ))}
      {todayX >= 0 && todayX <= width && (
        <rect x={todayX} y={HEADER_HEIGHT / 2} width={Math.max(ppd, 2)} height={HEADER_HEIGHT / 2} fill="#fee2e2" />
      )}
      <line x1={0} x2={width} y1={HEADER_HEIGHT / 2 + 0.5} y2={HEADER_HEIGHT / 2 + 0.5} stroke="#e2e8f0" />
      {header.bottom.map((c) => (
        <text
          key={`b-${c.x}`}
          x={c.x + c.width / 2}
          y={(HEADER_HEIGHT * 3) / 4 + 4}
          fontSize={view === 'day' ? 11 : 12}
          textAnchor="middle"
          fill={view === 'day' && range.startDay + c.x / ppd === today ? '#dc2626' : c.holiday ? '#6022a7' : c.weekend ? '#94a3b8' : '#475569'}
          fontWeight={view === 'day' && range.startDay + c.x / ppd === today ? 700 : c.holiday ? 600 : undefined}
        >
          {c.width >= 24 ? c.label : ''}
          {c.holiday && <title>{`${c.holiday} (arbeitsfrei)`}</title>}
        </text>
      ))}
      <line x1={0} x2={width} y1={HEADER_HEIGHT - 0.5} y2={HEADER_HEIGHT - 0.5} stroke="#cbd5e1" />


      {/* Abhängigkeiten */}
      {displayed.flatMap((t) =>
        t.dependencies.map((dep) => {
          const pred = displayed.find((d) => d.id === dep.taskId);
          if (!pred) return null;
          const a = barGeometry(pred, range, ppd);
          const b = barGeometry(t, range, ppd);
          const y1 = HEADER_HEIGHT + rowOf.get(pred.id)! * ROW_HEIGHT + ROW_HEIGHT / 2;
          const y2 = HEADER_HEIGHT + rowOf.get(t.id)! * ROW_HEIGHT + ROW_HEIGHT / 2;
          // Ende-basierte Pfeile starten am Ende des Puffers
          const predBufEnd = bufferEndDay(pred);
          const aWithBuffer = { x: a.x, width: a.width + (predBufEnd === null ? 0 : (predBufEnd - toDayNumber(pred.end)) * ppd) };
          const d = dependencyPathTyped(dep.type, aWithBuffer, y1, b, y2);
          const active = selectedId === t.id || selectedId === pred.id;
          const color = active ? '#6022a7' : '#64748b';
          return (
            <g key={`dep-${pred.id}-${t.id}`} className="dependency">
              <path d={d} fill="none" stroke={color} strokeWidth={active ? 2 : 1.5} markerEnd={`url(#${active ? 'arrow-active' : 'arrow'})`} />
              <path
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth={12}
                data-export="exclude"
                style={{ cursor: 'pointer' }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onEdit(tasks.find((x) => x.id === t.id) ?? t)}
              >
                <title>{`${pred.name} → ${t.name} (${dependencyLabel(dep)}) – klicken zum Bearbeiten`}</title>
              </path>
            </g>
          );
        }),
      )}

      {/* Balken */}
      {displayed.map((t, i) => {
        const { x, width: w } = barGeometry(t, range, ppd);
        const bufEnd = bufferEndDay(t);
        const bufferW = bufEnd === null ? 0 : (bufEnd - toDayNumber(t.end)) * ppd;
        const y = HEADER_HEIGHT + i * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2;
        const isMilestone = t.start === t.end && view !== 'day';
        const selected = t.id === selectedId;
        const linkTarget = hoverLink === t.id;
        // Beginnt der Balken vor dem sichtbaren Zeitraum (Export „Bereich“), steht die Beschriftung im sichtbaren Teil
        const labelX = Math.max(x, 0) + 8;
        const labelInside = labelFitsInside(t.name, x + w - Math.max(x, 0));
        const progressW = (w * t.progress) / 100;
        return (
          <g key={t.id} className="bar-group">
            <title>{`${t.name}\n${t.start} – ${t.end}\nFortschritt: ${t.progress} %`}</title>
            {bufferW > 0 && (
              <rect x={x + w} y={y + 3} width={bufferW} height={BAR_HEIGHT - 6} rx={3} fill="url(#buffer-hatch)" stroke="#6022a7" strokeOpacity={0.5} strokeDasharray="3 2">
                <title>{`Puffer: ${t.buffer} ${t.buffer === 1 ? 'Arbeitstag' : 'Arbeitstage'}`}</title>
              </rect>
            )}
            {isMilestone ? (
              <path
                d={`M ${x + w / 2} ${y} l ${BAR_HEIGHT / 2} ${BAR_HEIGHT / 2} l ${-BAR_HEIGHT / 2} ${BAR_HEIGHT / 2} l ${-BAR_HEIGHT / 2} ${-BAR_HEIGHT / 2} z`}
                fill={t.color}
                stroke={selected || linkTarget ? '#1e293b' : 'none'}
                strokeWidth={2}
                style={{ cursor: 'grab' }}
                onPointerDown={(e) => beginDrag(e, 'move', t.id)}
              />
            ) : null}
            {isMilestone && (
              <text
                x={Math.max(x + w + bufferW + 8, x + w / 2 + BAR_HEIGHT / 2 + 6)}
                y={y + BAR_HEIGHT / 2 + 4}
                fontSize={BAR_FONT}
                fill="#334155"
                pointerEvents="none"
              >
                {t.name}
              </text>
            )}
            {isMilestone ? null : (
              <>
                <rect x={x} y={y} width={w} height={BAR_HEIGHT} rx={5} fill={t.color} fillOpacity={0.35} />
                <rect x={x} y={y} width={progressW} height={BAR_HEIGHT} rx={5} fill={t.color} />
                {progressW > 5 && progressW < w - 5 && <rect x={x + progressW - 5} y={y} width={5} height={BAR_HEIGHT} fill={t.color} />}
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={BAR_HEIGHT}
                  rx={5}
                  fill="transparent"
                  stroke={selected || linkTarget ? '#1e293b' : t.color}
                  strokeWidth={selected || linkTarget ? 2 : 1}
                  style={{ cursor: 'grab' }}
                  onPointerDown={(e) => beginDrag(e, 'move', t.id)}
                />
                {labelInside ? (
                  <>
                    {/* Schrift dunkel auf hellem Teil, weiß auf dem gefüllten (Fortschritts-)Teil */}
                    <clipPath id={`progress-clip-${i}`}>
                      <rect x={x} y={y} width={progressW} height={BAR_HEIGHT} />
                    </clipPath>
                    <text x={labelX} y={y + BAR_HEIGHT / 2 + 4} fontSize={BAR_FONT} fill="#1e1b2e" pointerEvents="none">
                      {t.name}
                    </text>
                    {progressW > 0 && (
                      <text x={labelX} y={y + BAR_HEIGHT / 2 + 4} fontSize={BAR_FONT} fontWeight={500} fill="#ffffff" clipPath={`url(#progress-clip-${i})`} pointerEvents="none">
                        {t.name}
                      </text>
                    )}
                  </>
                ) : (
                  <text x={x + w + bufferW + 8} y={y + BAR_HEIGHT / 2 + 4} fontSize={BAR_FONT} fill="#334155" pointerEvents="none">
                    {t.name}
                  </text>
                )}
                <rect
                  className="resize-handle"
                  data-export="exclude"
                  x={x - 2}
                  y={y}
                  width={HANDLE}
                  height={BAR_HEIGHT}
                  fill="transparent"
                  style={{ cursor: 'ew-resize' }}
                  onPointerDown={(e) => beginDrag(e, 'start', t.id)}
                />
                <rect
                  className="resize-handle"
                  data-export="exclude"
                  x={x + w - HANDLE + 2}
                  y={y}
                  width={HANDLE}
                  height={BAR_HEIGHT}
                  fill="transparent"
                  style={{ cursor: 'ew-resize' }}
                  onPointerDown={(e) => beginDrag(e, 'end', t.id)}
                />
              </>
            )}
            <circle
              className="link-handle"
              data-export="exclude"
              cx={x + w + bufferW + (isMilestone && !bufferW ? -w / 2 + BAR_HEIGHT / 2 + 8 : 8)}
              cy={y + BAR_HEIGHT / 2}
              r={5}
              fill="#ffffff"
              stroke="#6022a7"
              strokeWidth={2}
              opacity={0}
              style={{ cursor: 'crosshair' }}
              onPointerDown={(e) => beginLink(e, t, x + w + bufferW, y + BAR_HEIGHT / 2)}
            >
              <title>Ziehen, um eine Abhängigkeit zu erstellen</title>
            </circle>
          </g>
        );
      })}

      {/* Heute-Linie */}
      {todayX >= 0 && todayX <= width && (
        <g>
          {/* dünne, durchgehende Linie über Kopf und Diagramm */}
          <line x1={todayX + ppd / 2} x2={todayX + ppd / 2} y1={HEADER_HEIGHT / 2} y2={height} stroke="#ef4444" strokeWidth={1} pointerEvents="none">
            <title>Heute</title>
          </line>
        </g>
      )}

      {drag?.kind === 'link' && (
        <line x1={drag.x1} y1={drag.y1} x2={drag.x} y2={drag.y} stroke="#6022a7" strokeWidth={2} strokeDasharray="5 4" markerEnd="url(#arrow-active)" pointerEvents="none" />
      )}

      {tasks.length === 0 && (
        <text x={24} y={HEADER_HEIGHT + ROW_HEIGHT / 2 + 4} fontSize={14} fill="#94a3b8">
          Noch keine Aufgaben – lege mit „Neue Aufgabe" die erste an.
        </text>
      )}
    </svg>
  );
}
