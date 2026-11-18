# Gantt Chart Pro

Interaktiver Gantt-Diagramm-Editor im Browser – gebaut mit **React 18, TypeScript und Vite**.
Alle Daten bleiben lokal im Browser (localStorage), es wird kein Server benötigt.

## Funktionen

- **Aufgaben & Zeitleiste** – Aufgaben anlegen, bearbeiten, löschen und sortieren; Zeitskala **Tag / Woche / Monat**, Wochenenden, Kalenderwochen, Heute-Linie
- **Drag & Drop** – Balken ziehen verschiebt die Aufgabe, die Ränder ziehen ändert Start bzw. Ende (tagesgenau einrastend)
- **Abhängigkeiten** in vier Arten – **EA** Ende→Anfang, **AA** Anfang→Anfang, **EE** Ende→Ende, **AE** Anfang→Ende – jeweils mit **Versatz in Tagen** (negativ = Überlappung). Anlegen per Ziehen vom Punkt rechts am Balken oder im Dialog; Klick auf einen Pfeil öffnet die Bearbeitung. Zirkuläre Abhängigkeiten werden verhindert.
- **Puffer** – pro Aufgabe optional Puffertage nach dem Ende (Dialog „Puffer nach Ende“). Nachfolger mit EA/EE starten bzw. enden erst nach dem Puffer; im Diagramm schraffiert dargestellt, als Spalte „Puffer“ über „+ Spalte“ einblendbar.
- **Automatische Planung** – wird eine Aufgabe verschoben oder ihre Dauer geändert, wandern alle Nachfolger (über die ganze Kette) automatisch mit, schon während des Ziehens. Verschiebt man eine abhängige Aufgabe selbst, bleibt sie liegen und ihr Versatz passt sich an.
- **Spalten anpassen** – über „+ Spalte" eigene Textspalten anlegen (z. B. „Verantwortlich"), Spaltennamen per Klick umbenennen, Spalten über ✕ löschen; Start/Ende/Tage lassen sich ausblenden und wieder einblenden. Textzellen per Klick direkt bearbeiten oder im Aufgaben-Dialog.
- **Fortschritt, Farben, Meilensteine** – Standardfarbe ist GE-Lila (`#6022a7`), andere Farben bei Bedarf im Dialog; eintägige Aufgaben werden in Wochen-/Monatsansicht als Raute dargestellt
- **Import / Export** – Projekt als JSON speichern und wieder laden (mit Validierung), Diagramm als **PNG** oder **PDF** exportieren (mit GE-Logo, Projektüberschrift und allen Spalten der Aufgabenliste)
- Tastatur: `Enter` bearbeitet, `Entf` löscht die ausgewählte Aufgabe, `Esc` hebt die Auswahl auf

## Loslegen

```bash
npm install
npm run dev        # Entwicklungsserver auf http://localhost:5173
npm run build      # Produktions-Build nach dist/
npm test           # Unit-Tests (Vitest)
npm run typecheck  # TypeScript-Prüfung
```

Der Build verwendet relative Pfade (`base: './'`) und kann daher direkt z. B. über GitHub Pages ausgeliefert werden.

## Projektstruktur

```
src/
  App.tsx                  App-Zustand, Toolbar-Aktionen, Speichern
  components/
    GanttChart.tsx         SVG-Diagramm inkl. Drag & Drop und Pfeilen
    TaskList.tsx           Aufgabenliste links
    TaskDialog.tsx         Dialog zum Anlegen/Bearbeiten
    Toolbar.tsx
  state/projectReducer.ts  Alle Änderungen am Projekt
  lib/
    date.ts                Zeitzonen-sichere Datumsrechnung (Tagesnummern, KW)
    timeline.ts            Zeitachse, Geometrie, Pfeilpfade
    graph.ts               Zykluserkennung
    serialize.ts           JSON-Import/-Export mit Validierung
    exportImage.ts         PNG-/PDF-Export
    storage.ts, sample.ts, colors.ts, id.ts
```

## Datenformat (JSON)

```json
{
  "version": 1,
  "name": "Mein Projekt",
  "tasks": [
    { "id": "a", "name": "Konzept", "start": "2026-11-16", "end": "2026-11-20",
      "progress": 50, "color": "#6022a7", "buffer": 2,
      "dependencies": [{ "taskId": "x", "type": "SS", "lag": 2 }],
      "fields": { "owner": "Anna" } }
  ],
  "columns": [
    { "id": "name", "kind": "name", "label": "Aufgabe" },
    { "id": "start", "kind": "start", "label": "Start" },
    { "id": "end", "kind": "end", "label": "Ende" },
    { "id": "duration", "kind": "duration", "label": "Tage" },
    { "id": "owner", "kind": "text", "label": "Verantwortlich" }
  ]
}
```

`start` und `end` sind inklusive (eine Aufgabe von Montag bis Montag dauert 1 Tag). `dependencies[].type` ist `FS` (EA), `SS` (AA), `FF` (EE) oder `SF` (AE), `lag` der Versatz in Tagen. Ältere Dateien mit reinen ID-Listen werden als EA übernommen, ohne dass sich Termine verschieben. `columns` ist optional – ältere Dateien ohne Spalten bekommen die Standardspalten.
