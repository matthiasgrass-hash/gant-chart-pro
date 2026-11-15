import { useRef } from 'react';
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
        <button onClick={p.onExportPdf}>PDF</button>
      </div>
      <div className="toolbar-group">
        <button onClick={p.onLoadSample} title="Beispielprojekt laden">Beispiel</button>
        <button className="danger" onClick={p.onClear} title="Alle Aufgaben löschen">Leeren</button>
      </div>
    </header>
  );
}
