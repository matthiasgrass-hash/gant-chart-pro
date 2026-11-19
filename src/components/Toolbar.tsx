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
  /** Öffnen per System-Dialog (falls unterstützt), sonst Datei-Auswahl */
  onOpen?: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  fileName: string | null;
  unsaved: boolean;
  onExportPng: () => void;
  onExportPdf: () => void;
  exportOptions: ExportOptions;
  onExportOptionsChange: (o: ExportOptions) => void;
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
        <button onClick={() => (p.onOpen ? p.onOpen() : fileRef.current?.click())} title="Projektdatei (JSON) öffnen">Öffnen</button>
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
        <button
          className={`save-btn${p.unsaved ? ' is-dirty' : ''}`}
          onClick={p.onSave}
          title={p.fileName ? `In „${p.fileName}“ speichern (Strg+S)` : 'Speichern – beim ersten Mal Speicherort wählen (Strg+S)'}
        >
          Speichern{p.unsaved && <span className="dirty-dot" aria-label="ungespeicherte Änderungen"> ●</span>}
        </button>
        <button onClick={p.onSaveAs} title="Speicherort und Dateinamen neu wählen (Strg+Umschalt+S)">
          Speichern unter…
        </button>
        <ExportMenu format="PNG" options={p.exportOptions} onChange={p.onExportOptionsChange} onExport={p.onExportPng} />
        <ExportMenu format="PDF" options={p.exportOptions} onChange={p.onExportOptionsChange} onExport={p.onExportPdf} />
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

export interface ExportOptions {
  legend: boolean;
  /** 'all' = alles ab dem ersten Task, 'custom' = Datumsbereich */
  rangeMode: 'all' | 'custom';
  from: string;
  to: string;
}

/** Export-Knopf mit Menü: Zeitraum (alles / von–bis) und Legende wählen, dann exportieren. */
function ExportMenu({
  format,
  options,
  onChange,
  onExport,
}: {
  format: 'PDF' | 'PNG';
  options: ExportOptions;
  onChange: (o: ExportOptions) => void;
  onExport: () => void;
}) {
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
  const set = (patch: Partial<ExportOptions>) => onChange({ ...options, ...patch });
  const invalid = options.rangeMode === 'custom' && (!options.from || !options.to);
  return (
    <div className="pdf-menu" ref={ref}>
      <button aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {format} ▾
      </button>
      {open && (
        <div className="menu pdf-menu__panel" role="dialog" aria-label={`${format}-Export`}>
          <div className="menu__group" role="radiogroup" aria-label="Zeitraum">
            <span className="menu__label">Zeitraum</span>
            <label className="menu__check">
              <input type="radio" name={`range-${format}`} checked={options.rangeMode === 'all'} onChange={() => set({ rangeMode: 'all' })} />
              Alles (ab dem ersten Task)
            </label>
            <label className="menu__check">
              <input type="radio" name={`range-${format}`} checked={options.rangeMode === 'custom'} onChange={() => set({ rangeMode: 'custom' })} />
              Bereich
            </label>
            {options.rangeMode === 'custom' && (
              <div className="menu__range">
                <label>
                  von
                  <input type="date" value={options.from} onChange={(e) => set({ from: e.target.value })} />
                </label>
                <label>
                  bis
                  <input type="date" value={options.to} min={options.from} onChange={(e) => set({ to: e.target.value })} />
                </label>
              </div>
            )}
          </div>
          <label className="menu__check">
            <input type="checkbox" checked={options.legend} onChange={(e) => set({ legend: e.target.checked })} />
            Legende einfügen
          </label>
          <button
            className="primary"
            disabled={invalid}
            onClick={() => {
              setOpen(false);
              onExport();
            }}
          >
            {format} erstellen
          </button>
        </div>
      )}
    </div>
  );
}
