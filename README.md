# Gantt Chart Pro

Interaktiver Gantt-Diagramm-Editor im Browser – gebaut mit **React 18, TypeScript und Vite**.
Alle Daten bleiben lokal im Browser (localStorage), es wird kein Server benötigt.

## Funktionen

- **Aufgaben & Zeitleiste** – Aufgaben anlegen, bearbeiten, löschen und sortieren; Zeitskala **Tag / Woche / Monat**, Wochenenden, Kalenderwochen, Heute-Linie
- **Drag & Drop** – Balken ziehen verschiebt die Aufgabe, die Ränder ziehen ändert Start bzw. Ende (tagesgenau einrastend)
- **Abhängigkeiten** (Ende → Anfang) – über den Dialog oder per Ziehen vom Punkt rechts am Balken auf eine andere Aufgabe; Pfeile werden gezeichnet, Konflikte (Nachfolger startet vor Ende des Vorgängers) rot markiert, zirkuläre Abhängigkeiten verhindert. Klick auf einen Pfeil entfernt ihn.
- **Fortschritt, Farben, Meilensteine** (eintägige Aufgaben werden in Wochen-/Monatsansicht als Raute dargestellt)
- **Import / Export** – Projekt als JSON speichern und wieder laden (mit Validierung), Diagramm als **PNG** oder **PDF** exportieren
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
      "progress": 50, "color": "#3b82f6", "dependencies": [] }
  ]
}
```

`start` und `end` sind inklusive (eine Aufgabe von Montag bis Montag dauert 1 Tag).
