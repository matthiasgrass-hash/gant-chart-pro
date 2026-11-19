import type { Responsibility } from '../types';

interface Props {
  responsibilities: Responsibility[];
  onColorChange: (id: string, color: string) => void;
  onManage: () => void;
}

/** Legende unter dem Diagramm: alle im Projekt verwendeten Zuständigkeiten mit ihrer Farbe. */
export function Legend({ responsibilities, onColorChange, onManage }: Props) {
  return (
    <section className="legend" aria-label="Legende">
      <span className="legend__title">Legende</span>
      {responsibilities.length === 0 && <span className="muted">Noch keine Zuständigkeiten zugeordnet – Auswahl in der Spalte „Zuständigkeit“.</span>}
      {responsibilities.map((r) => (
        <label key={r.id} className="legend__item" title={`Farbe für „${r.name}“ ändern`}>
          <span className="legend__swatch" style={{ background: r.color }} />
          {r.name}
          <input type="color" className="visually-hidden" value={r.color} onChange={(e) => onColorChange(r.id, e.target.value)} />
        </label>
      ))}
      <span className="spacer" />
      <button className="legend__manage" onClick={onManage}>
        Zuständigkeiten verwalten
      </button>
    </section>
  );
}
