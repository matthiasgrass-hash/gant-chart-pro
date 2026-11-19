import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';

/**
 * Macht ein Fenster (z. B. <dialog>) an einem Griff (Titelzeile) mit der Maus verschiebbar.
 * `style` kommt auf das Fenster, `handleProps` auf den Griff.
 */
export function useDraggable() {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    // Bedienelemente im Griff behalten ihr normales Verhalten
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, input, select, textarea, a')) return;
    drag.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    // Nicht komplett aus dem Fenster schieben
    const maxX = window.innerWidth / 2;
    const maxY = window.innerHeight / 2;
    setOffset({
      x: Math.max(-maxX, Math.min(maxX, d.ox + e.clientX - d.px)),
      y: Math.max(-maxY + 40, Math.min(maxY, d.oy + e.clientY - d.py)),
    });
  };
  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const style: CSSProperties = offset.x || offset.y ? { transform: `translate(${offset.x}px, ${offset.y}px)` } : {};
  return {
    style,
    handleProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, className: 'drag-handle', title: 'Zum Verschieben ziehen' },
  };
}
