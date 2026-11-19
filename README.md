# Gantt Chart Pro

Interaktiver Gantt-Diagramm-Editor im Browser – gebaut mit **React 18, TypeScript und Vite**.
Alle Daten bleiben lokal im Browser (localStorage), es wird kein Server benötigt.

## Funktionen

- **Aufgaben & Zeitleiste** – Aufgaben anlegen, bearbeiten, löschen und sortieren; Zeitskala **Tag / Woche / Monat**, Wochenenden, Kalenderwochen, Heute-Linie
- **Drag & Drop** – Balken ziehen verschiebt die Aufgabe, die Ränder ziehen ändert Start bzw. Ende (tagesgenau einrastend)
- **Abhängigkeiten** in vier Arten – **EA** Ende→Anfang, **AA** Anfang→Anfang, **EE** Ende→Ende, **AE** Anfang→Ende – jeweils mit **Versatz in Tagen** (negativ = Überlappung). Anlegen per Ziehen vom Punkt rechts am Balken oder im Dialog; Klick auf einen Pfeil öffnet die Bearbeitung. Zirkuläre Abhängigkeiten werden verhindert.
- **Zuständigkeiten & Legende** – Spalte „Zuständigkeit“ mit Auswahlfeld (vorgegeben: GE, bauseitig, Elektro, Klima/Kälte, HF-Kabine, Schlosser; eigene über „+ Neue Zuständigkeit…“). Jede Zuständigkeit hat eine Farbe, die alle zugehörigen Balken übernehmen. Die Legende unter dem Diagramm zeigt die im Projekt verwendeten Zuständigkeiten in diesen Farben; Klick auf einen Eintrag ändert die Farbe, „Zuständigkeiten verwalten“ zum Umbenennen, Hinzufügen und Löschen. Im PDF-Export ist die Legende per Häkchen zuschaltbar.
- **Dark Mode** – Umschalter oben rechts (☾/☀); ohne eigene Wahl gilt die Systemeinstellung. PNG/PDF-Exporte sind immer hell.
- **Puffer** – pro Aufgabe optional Puffertage nach dem Ende (Dialog „Puffer nach Ende“). Nachfolger mit EA/EE starten bzw. enden erst nach dem Puffer; im Diagramm schraffiert dargestellt, als Spalte „Puffer“ über „+ Spalte“ einblendbar.
- **Automatische Planung** – wird eine Aufgabe verschoben oder ihre Dauer geändert, wandern alle Nachfolger (über die ganze Kette) automatisch mit, schon während des Ziehens. Verschiebt man eine abhängige Aufgabe selbst, bleibt sie liegen und ihr Versatz passt sich an.
- **Spalten anpassen** – über „+ Spalte" eigene Textspalten anlegen (z. B. „Verantwortlich"), Spaltennamen per Klick umbenennen, Spalten über ✕ löschen; Start/Ende/Tage lassen sich ausblenden und wieder einblenden. Textzellen per Klick direkt bearbeiten oder im Aufgaben-Dialog.
- **Fortschritt, Farben, Meilensteine** – Standardfarbe ist GE-Lila (`#6022a7`), andere Farben bei Bedarf im Dialog; eintägige Aufgaben werden in Wochen-/Monatsansicht als Raute dargestellt
- **Direkt bearbeiten** – Name und Tage (Dauer in Arbeitstagen) per Klick direkt in der Liste ändern, ohne Dialog; Dialoge lassen sich an der Titelzeile verschieben.
- **Speichern in eine Datei** – „Speichern“ (Strg+S) fragt beim ersten Mal im System-Dialog nach Ordner und Dateinamen und überschreibt danach genau diese Datei ohne Nachfrage; „Öffnen“ macht die geöffnete Datei zur Speicherdatei, „Speichern unter…“ (Strg+Umschalt+S) wählt neu. Ungespeicherte Änderungen zeigt ● am Knopf. Direktes Überschreiben gibt es in Chrome/Edge am Computer; andere Browser laden die Datei stattdessen herunter.
- **Import / Export** – Projekt als JSON speichern und laden (mit Validierung); Diagramm als **PNG** oder **PDF** mit GE-Logo, Projektüberschrift, allen Spalten und optionaler Legende. Der Export wird unabhängig von der Bildschirmansicht neu gezeichnet: Zeitraum **„Alles“** beginnt beim ersten Task und ist so breit, dass alle Balken mit Beschriftung vollständig sichtbar sind; alternativ ein **Datumsbereich von–bis**. Die Seitengröße passt sich automatisch an; PDF mit 1 cm Rand als **Vektor-PDF** (gestochen scharf bei jedem Zoom, Text durchsuchbar), PNG in dreifacher Auflösung.
- Tastatur: `Enter` bearbeitet, `Entf` löscht die ausgewählte Aufgabe, `Esc` hebt die Auswahl auf

### Arbeitstage

Alle Dauern, Versätze und Puffer werden in **Arbeitstagen** gerechnet: Montag–Freitag ohne die
bundesweiten gesetzlichen Feiertage (Neujahr, Karfreitag, Ostermontag, 1. Mai, Christi Himmelfahrt,
Pfingstmontag, Tag der Deutschen Einheit, 1. und 2. Weihnachtstag). Die Zeitachse zeigt weiterhin
alle Kalendertage; Wochenenden und Feiertage sind grau hinterlegt, Feiertage im Kopf lila markiert.
Start und Ende liegen immer auf Arbeitstagen; beim Verschieben bleibt die Zahl der Arbeitstage gleich.

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
  "calendar": "workdays",
  "name": "Mein Projekt",
  "tasks": [
    { "id": "a", "name": "Konzept", "start": "2026-11-16", "end": "2026-11-20",
      "progress": 50, "color": "#6022a7", "buffer": 2, "responsibility": "elektro",
      "dependencies": [{ "taskId": "x", "type": "SS", "lag": 2 }],
      "fields": { "owner": "Anna" } }
  ],
  "responsibilities": [
    { "id": "ge", "name": "GE", "color": "#6022a7" },
    { "id": "elektro", "name": "Elektro", "color": "#f59e0b" }
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

`start` und `end` sind inklusive (beginnt und endet eine Aufgabe am selben Tag, dauert sie 1 Arbeitstag). `dependencies[].type` ist `FS` (EA), `SS` (AA), `FF` (EE) oder `SF` (AE), `lag` der Versatz in Arbeitstagen. Dateien ohne `"calendar": "workdays"` stammen aus der Kalendertage-Version; ihr Versatz wird beim Import so umgerechnet, dass sich keine Termine verschieben. Ältere Dateien mit reinen ID-Listen werden als EA übernommen, ohne dass sich Termine verschieben. `columns` ist optional – ältere Dateien ohne Spalten bekommen die Standardspalten.
