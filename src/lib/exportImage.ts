import type { Project, Responsibility } from '../types';
import { COLUMN_WIDTH, cellText, isNumericColumn } from './columns';
import { HEADER_HEIGHT, ROW_HEIGHT } from './timeline';

const TABLE_PAD = 16;
const PDF_MARGIN = 38;
const LEGEND_PAD = 14;
const LEGEND_ROW = 24;

/** Legenden-Einträge nebeneinander anordnen, bei Bedarf in mehreren Zeilen. */
function layoutLegend(items: Responsibility[], width: number) {
  const startX = TABLE_PAD + 80;
  let x = startX;
  let y = LEGEND_PAD;
  const placed = items.map((r) => {
    const w = 20 + r.name.length * 7.5 + 28;
    if (x + w > width - TABLE_PAD && x > startX) {
      x = startX;
      y += LEGEND_ROW;
    }
    const item = { r, x, y };
    x += w;
    return item;
  });
  return { items: placed, height: y + LEGEND_ROW + LEGEND_PAD };
}
const COL_GAP = 12;
const SVG_NS = 'http://www.w3.org/2000/svg';
const BRAND = '#6022a7';
const APP_TITLE = 'GE HealthCare Projectmanagement';
const LOGO_URL = './ge-logo.png';
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, text?: string) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Kürzt Text grob auf die verfügbare Breite (ca. 7 px pro Zeichen bei 12–13 px Schrift). */
function fit(text: string, width: number): string {
  const max = Math.max(3, Math.floor(width / 7));
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Baut ein eigenständiges SVG aus Aufgabenspalte + Diagramm für den Export. */
interface Rect { x: number; y: number; width: number; height: number }

export function buildExportSvg(
  chart: SVGSVGElement,
  project: Project,
  withLogo = false,
  legend: Responsibility[] | null = null,
): { svg: SVGSVGElement; width: number; height: number; logoRect: Rect | null } {
  const chartWidth = Number(chart.getAttribute('width'));
  const chartHeight = Number(chart.getAttribute('height'));
  const title = 84;
  const tableWidth = project.columns.reduce((sum, c) => sum + COLUMN_WIDTH[c.kind] + COL_GAP, 0) + TABLE_PAD * 2 - COL_GAP;
  const width = tableWidth + chartWidth;
  const legendLayout = legend && legend.length ? layoutLegend(legend, width) : null;
  const height = title + chartHeight + (legendLayout ? legendLayout.height : 0);

  const svg = el('svg', { xmlns: SVG_NS, width, height, viewBox: `0 0 ${width} ${height}`, 'font-family': FONT });
  svg.appendChild(el('rect', { x: 0, y: 0, width, height, fill: '#ffffff' }));
  // Kopfbereich: GE-Logo, App-Titel, Projektüberschrift
  const logoSize = 56;
  const textX = withLogo ? 16 + logoSize + 14 : 16;
  // Das Logo wird nicht ins SVG eingebettet, sondern danach direkt auf das Canvas gezeichnet –
  // Safari lässt Bilder innerhalb eines SVG beim Rendern auf ein Canvas sonst weg.
  const logoRect = withLogo ? { x: 16, y: (title - logoSize) / 2 + 2, width: logoSize, height: logoSize } : null;
  svg.appendChild(el('text', { x: textX, y: 33, 'font-size': 14, 'font-weight': 700, 'letter-spacing': 0.5, fill: BRAND }, APP_TITLE.toUpperCase()));
  svg.appendChild(el('text', { x: textX, y: 58, 'font-size': 22, 'font-weight': 700, fill: '#0f172a' }, project.name));
  svg.appendChild(el('rect', { x: 0, y: 0, width, height: 4, fill: BRAND }));

  // Tabelle links: dieselben Spalten wie in der Aufgabenliste
  const names = el('g', { transform: `translate(0 ${title})` });
  names.appendChild(el('rect', { x: 0, y: 0, width: tableWidth, height: HEADER_HEIGHT, fill: '#f8fafc' }));
  names.appendChild(el('line', { x1: 0, x2: tableWidth, y1: HEADER_HEIGHT - 0.5, y2: HEADER_HEIGHT - 0.5, stroke: '#cbd5e1' }));
  let x = TABLE_PAD;
  const cols = project.columns.map((c) => {
    const col = { column: c, x, width: COLUMN_WIDTH[c.kind] };
    x += col.width + COL_GAP;
    return col;
  });
  for (const { column, x: cx, width: w } of cols) {
    const right = isNumericColumn(column.kind);
    names.appendChild(
      el('text', { x: right ? cx + w - 4 : cx, y: HEADER_HEIGHT / 2 + 5, 'font-size': 13, 'font-weight': 600, fill: '#334155', 'text-anchor': right ? 'end' : 'start' }, fit(column.label, w)),
    );
  }
  project.tasks.forEach((t, i) => {
    const y = HEADER_HEIGHT + i * ROW_HEIGHT;
    const mid = y + ROW_HEIGHT / 2 + 4;
    names.appendChild(el('line', { x1: 0, x2: tableWidth, y1: y + ROW_HEIGHT - 0.5, y2: y + ROW_HEIGHT - 0.5, stroke: '#e2e8f0' }));
    for (const { column, x: cx, width: w } of cols) {
      if (column.kind === 'name') {
        names.appendChild(el('circle', { cx: cx + 5, cy: y + ROW_HEIGHT / 2, r: 5, fill: t.color }));
        names.appendChild(el('text', { x: cx + 18, y: mid, 'font-size': 13, fill: '#0f172a' }, fit(t.name, w - 18)));
      } else if (column.kind === 'responsibility') {
        const r = project.responsibilities.find((x) => x.id === t.responsibility);
        if (r) {
          names.appendChild(el('circle', { cx: cx + 5, cy: y + ROW_HEIGHT / 2, r: 4.5, fill: r.color }));
          names.appendChild(el('text', { x: cx + 16, y: mid, 'font-size': 12, fill: '#475569' }, fit(r.name, w - 16)));
        }
      } else if (isNumericColumn(column.kind)) {
        names.appendChild(el('text', { x: cx + w - 4, y: mid, 'font-size': 12, fill: '#475569', 'text-anchor': 'end' }, cellText(t, column, project.responsibilities)));
      } else {
        names.appendChild(el('text', { x: cx, y: mid, 'font-size': 12, fill: '#475569' }, fit(cellText(t, column, project.responsibilities), w)));
      }
    }
  });
  names.appendChild(el('line', { x1: tableWidth - 0.5, x2: tableWidth - 0.5, y1: 0, y2: chartHeight, stroke: '#cbd5e1' }));
  svg.appendChild(names);

  const clone = chart.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll('[data-export="exclude"]').forEach((n) => n.remove());
  const chartGroup = el('g', { transform: `translate(${tableWidth} ${title})` });
  while (clone.firstChild) chartGroup.appendChild(clone.firstChild);
  svg.appendChild(chartGroup);
  if (legendLayout) {
    // Legende unter dem Diagramm: Zuständigkeiten in ihren Farben
    const g = el('g', { transform: `translate(0 ${title + chartHeight})` });
    g.appendChild(el('line', { x1: 0, x2: width, y1: 0.5, y2: 0.5, stroke: '#cbd5e1' }));
    g.appendChild(el('text', { x: TABLE_PAD, y: LEGEND_PAD + 14, 'font-size': 13, 'font-weight': 700, fill: '#334155' }, 'Legende'));
    for (const item of legendLayout.items) {
      g.appendChild(el('rect', { x: item.x, y: item.y + 2, width: 14, height: 14, rx: 3, fill: item.r.color }));
      g.appendChild(el('text', { x: item.x + 20, y: item.y + 14, 'font-size': 13, fill: '#0f172a' }, item.r.name));
    }
    svg.appendChild(g);
  }
  return { svg, width, height, logoRect };
}

async function svgToCanvas(
  svg: SVGSVGElement,
  width: number,
  height: number,
  scale: number,
  overlay?: { image: HTMLImageElement; rect: Rect } | null,
): Promise<HTMLCanvasElement> {
  const data = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([data], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Das Diagramm konnte nicht gerendert werden.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas wird von diesem Browser nicht unterstützt.');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);
    if (overlay) ctx.drawImage(overlay.image, overlay.rect.x, overlay.rect.y, overlay.rect.width, overlay.rect.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function fileBaseName(project: Project): string {
  const map: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' };
  return (
    project.name
      .trim()
      .replace(/[äöüÄÖÜß]/g, (c) => map[c])
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'gantt'
  );
}

/** Lädt das Logo (gleiche Herkunft, daher kein „tainted canvas“). */
async function loadLogo(): Promise<HTMLImageElement | null> {
  try {
    const img = new Image();
    img.src = new URL(LOGO_URL, document.baseURI).href;
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

async function renderExport(chart: SVGSVGElement, project: Project, maxSize: number, legend: Responsibility[] | null = null) {
  const logo = await loadLogo();
  const { svg, width, height, logoRect } = buildExportSvg(chart, project, Boolean(logo), legend);
  // Browser begrenzen Canvas-Größen; bei sehr breiten Diagrammen Auflösung reduzieren.
  const scale = Math.min(2, maxSize / width, maxSize / height);
  const canvas = await svgToCanvas(svg, width, height, scale, logo && logoRect ? { image: logo, rect: logoRect } : null);
  return { canvas, width, height };
}

export async function exportPng(chart: SVGSVGElement, project: Project): Promise<void> {
  const { canvas } = await renderExport(chart, project, 16000);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG konnte nicht erzeugt werden.');
  downloadBlob(blob, `${fileBaseName(project)}.png`);
}

/** PDF-Export, immer im hellen Design; `legend` = Zuständigkeiten für die Legende oder null für ohne. */
export async function exportPdf(chart: SVGSVGElement, project: Project, legend: Responsibility[] | null = null): Promise<void> {
  const { canvas, width, height } = await renderExport(chart, project, 14000, legend);
  const { jsPDF } = await import('jspdf');
  // Seitenrand ringsum (1 cm bei 96 dpi ≈ 38 px); die Seite wächst entsprechend mit
  const m = PDF_MARGIN;
  const pageW = width + 2 * m;
  const pageH = height + 2 * m;
  const pdf = new jsPDF({ orientation: pageW >= pageH ? 'landscape' : 'portrait', unit: 'px', format: [pageW, pageH], hotfixes: ['px_scaling'] });
  pdf.addImage(canvas, 'PNG', m, m, width, height, undefined, 'FAST');
  pdf.save(`${fileBaseName(project)}.pdf`);
}
