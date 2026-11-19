import { useEffect, useRef, useState } from 'react';
import type { ViewMode } from '../types';

interface Props {
  projectName: string;
  view: ViewMode;
  onRename: (name: string) => void;
  onViewChange: (view: ViewMode) => void;
  onAddTask: () => void;
  onToday: () => void;
  onImport: (file: File) => void;
  onExportJson: () => void;
  onExportPng: () => void;
  onExportPdf: () => void;
  pdfLegend: boolean;
  onPdfLegendChange: (value: boolean) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onLoadSample: () => void;
  onClear: () => void;
}

const VIEWS: { id: ViewMode; label: string }[] = [
  { id: 'day', label: 'Tag' },
  { id: 'week', label: 'Woche' },
  { id: 'month', label: 'Monat' },
];

export function Toolbar(p: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <header className="toolbar">
      <div className="brand">
        <img
          className="brand-logo"
          src="./ge-logo.png"
          alt="GE HealthCare"
          width={54}
          height={54}
          onError={(e) => {
            // Fallback, solange keine Logo-Datei unter public/ge-logo.png liegt
            const img = e.currentTarget;
            if (!img.src.endsWith('favicon.svg')) img.src = './favicon.svg';
          }}
        />
        <div className="brand-text">
          <h1 className="app-title">GE HealthCare Projectmanagement</h1>
          <input className="project-name" value={p.projectName} onChange={(e) => p.onRename(e.target.value)} placeholder="Projektüberschrift" aria-label="Projektüberschrift" />
        </div>
      </div>

      <div className="toolbar-group">
        <button className="primary" onClick={p.onAddTask}>+ Neue Aufgabe</button>
      </div>

      <div className="toolbar-group segmented" role="group" aria-label="Zeitskala">
        {VIEWS.map((v) => (
          <button key={v.id} className={p.view === v.id ? 'is-active' : ''} aria-pressed={p.view === v.id} onClick={() => p.onViewChange(v.id)}>
            {v.label}
          </button>
        ))}
      </div>
      <button onClick={p.onToday}>Heute</button>

      <span className="spacer" />

      <div className="toolbar-group">
        <button onClick={() => fileRef.current?.click()}>Import</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) p.onImport(file);
            e.target.value = '';
          }}
        />
        <button onClick={p.onExportJson}>JSON</button>
        <button onClick={p.onExportPng}>PNG</button>
        <PdfMenu legend={p.pdfLegend} onLegendChange={p.onPdfLegendChange} onExport={p.onExportPdf} />
      </div>
      <div className="toolbar-group">
        <button onClick={p.onLoadSample} title="Beispielprojekt laden">Beispiel</button>
        <button className="danger" onClick={p.onClear} title="Alle Aufgaben löschen">Leeren</button>
      </div>
      <button
        className="theme-toggle"
        onClick={p.onToggleTheme}
        aria-label={p.theme === 'dark' ? 'Helles Design einschalten' : 'Dunkles Design einschalten'}
        title={p.theme === 'dark' ? 'Helles Design' : 'Dunkles Design'}
      >
        {p.theme === 'dark' ? '☀' : '☾'}
      </button>
    </header>
  );
}

/** PDF-Knopf mit kleinem Menü: Legende ein-/ausschalten, dann exportieren. */
function PdfMenu({ legend, onLegendChange, onExport }: { legend: boolean; onLegendChange: (v: boolean) => void; onExport: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className="pdf-menu" ref={ref}>
      <button aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        PDF ▾
      </button>
      {open && (
        <div className="menu pdf-menu__panel" role="dialog" aria-label="PDF-Export">
          <label className="menu__check">
            <input type="checkbox" checked={legend} onChange={(e) => onLegendChange(e.target.checked)} />
            Legende einfügen
          </label>
          <button
            className="primary"
            onClick={() => {
              setOpen(false);
              onExport();
            }}
          >
            PDF erstellen
          </button>
        </div>
      )}
    </div>
  );
}
