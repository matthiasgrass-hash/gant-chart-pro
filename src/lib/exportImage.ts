import type { Project, Responsibility } from '../types';
import { cellText, columnWidth, isNumericColumn } from './columns';
import { HEADER_HEIGHT, ROW_HEIGHT } from './timeline';

const TABLE_PAD = 16;
const LEGEND_PAD = 14;
const LEGEND_ROW = 26;

/** Legenden-Einträge nebeneinander anordnen, bei Bedarf in mehreren Zeilen. */
function layoutLegend(items: Responsibility[], width: number) {
  const startX = TABLE_PAD + 80;
  let x = startX;
  let y = LEGEND_PAD;
  const placed = items.map((r) => {
    const w = 20 + r.name.length * 8.6 + 28;
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
  const max = Math.max(3, Math.floor(width / 8.4));
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Baut ein eigenständiges SVG aus Aufgabenspalte + Diagramm für den Export. */
interface Rect { x: number; y: number; width: number; height: number }

export function buildExportSvg(
  chart: SVGSVGElement,
  project: Project,
  withLogo = false,
  legend: Responsibility[] | null = null,
  fontFamily: string = FONT,
): { svg: SVGSVGElement; width: number; height: number; logoRect: Rect | null } {
  const chartWidth = Number(chart.getAttribute('width'));
  const chartHeight = Number(chart.getAttribute('height'));
  const title = 84;
  const tableWidth = project.columns.reduce((sum, c) => sum + columnWidth(c) + COL_GAP, 0) + TABLE_PAD * 2 - COL_GAP;
  const width = tableWidth + chartWidth;
  const legendLayout = legend && legend.length ? layoutLegend(legend, width) : null;
  const height = title + chartHeight + (legendLayout ? legendLayout.height : 0);

  const svg = el('svg', { xmlns: SVG_NS, width, height, viewBox: `0 0 ${width} ${height}`, 'font-family': fontFamily });
  svg.appendChild(el('rect', { x: 0, y: 0, width, height, fill: '#ffffff' }));
  // Kopfbereich: GE-Logo, App-Titel, Projektüberschrift
  const logoSize = 56;
  const textX = withLogo ? 16 + logoSize + 14 : 16;
  // Das Logo wird nicht ins SVG eingebettet, sondern danach direkt auf das Canvas gezeichnet –
  // Safari lässt Bilder innerhalb eines SVG beim Rendern auf ein Canvas sonst weg.
  const logoRect = withLogo ? { x: 16, y: (title - logoSize) / 2 + 2, width: logoSize, height: logoSize } : null;
  svg.appendChild(el('text', { x: textX, y: 33, 'font-size': 15, 'font-weight': 700, 'letter-spacing': 0.5, fill: BRAND }, APP_TITLE.toUpperCase()));
  svg.appendChild(el('text', { x: textX, y: 60, 'font-size': 24, 'font-weight': 700, fill: '#0f172a' }, project.name));
  svg.appendChild(el('rect', { x: 0, y: 0, width, height: 4, fill: BRAND }));

  // Tabelle links: dieselben Spalten wie in der Aufgabenliste
  const names = el('g', { transform: `translate(0 ${title})` });
  names.appendChild(el('rect', { x: 0, y: 0, width: tableWidth, height: HEADER_HEIGHT, fill: '#f8fafc' }));
  names.appendChild(el('line', { x1: 0, x2: tableWidth, y1: HEADER_HEIGHT - 0.5, y2: HEADER_HEIGHT - 0.5, stroke: '#cbd5e1' }));
  let x = TABLE_PAD;
  const cols = project.columns.map((c) => {
    const col = { column: c, x, width: columnWidth(c) };
    x += col.width + COL_GAP;
    return col;
  });
  for (const { column, x: cx, width: w } of cols) {
    const right = isNumericColumn(column.kind);
    names.appendChild(
      el('text', { x: right ? cx + w - 4 : cx, y: HEADER_HEIGHT / 2 + 5, 'font-size': 15, 'font-weight': 700, fill: '#334155', 'text-anchor': right ? 'end' : 'start' }, fit(column.label, w)),
    );
  }
  project.tasks.forEach((t, i) => {
    const y = HEADER_HEIGHT + i * ROW_HEIGHT;
    const mid = y + ROW_HEIGHT / 2 + 4;
    names.appendChild(el('line', { x1: 0, x2: tableWidth, y1: y + ROW_HEIGHT - 0.5, y2: y + ROW_HEIGHT - 0.5, stroke: '#e2e8f0' }));
    for (const { column, x: cx, width: w } of cols) {
      if (column.kind === 'name') {
        names.appendChild(el('circle', { cx: cx + 5, cy: y + ROW_HEIGHT / 2, r: 5, fill: t.color }));
        names.appendChild(el('text', { x: cx + 18, y: mid, 'font-size': 15, fill: '#0f172a' }, fit(t.name, w - 18)));
      } else if (column.kind === 'responsibility') {
        const r = project.responsibilities.find((x) => x.id === t.responsibility);
        if (r) {
          names.appendChild(el('circle', { cx: cx + 5, cy: y + ROW_HEIGHT / 2, r: 4.5, fill: r.color }));
          names.appendChild(el('text', { x: cx + 16, y: mid, 'font-size': 14, fill: '#475569' }, fit(r.name, w - 16)));
        }
      } else if (isNumericColumn(column.kind)) {
        names.appendChild(el('text', { x: cx + w - 4, y: mid, 'font-size': 14, fill: '#475569', 'text-anchor': 'end' }, cellText(t, column, project.responsibilities)));
      } else {
        names.appendChild(el('text', { x: cx, y: mid, 'font-size': 14, fill: '#475569' }, fit(cellText(t, column, project.responsibilities), w)));
      }
    }
  });
  names.appendChild(el('line', { x1: tableWidth - 0.5, x2: tableWidth - 0.5, y1: 0, y2: chartHeight, stroke: '#cbd5e1' }));
  svg.appendChild(names);

  const clone = chart.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll('[data-export="exclude"]').forEach((n) => n.remove());
  const chartGroup = el('g', { transform: `translate(${tableWidth} ${title})` });
  // Balken außerhalb des Exportzeitraums abschneiden (nicht in die Tabelle ragen lassen)
  const clip = el('clipPath', { id: 'export-chart-clip' });
  clip.appendChild(el('rect', { x: 0, y: 0, width: chartWidth, height: chartHeight }));
  const defs = el('defs', {});
  defs.appendChild(clip);
  svg.appendChild(defs);
  const clipped = el('g', { 'clip-path': 'url(#export-chart-clip)' });
  while (clone.firstChild) clipped.appendChild(clone.firstChild);
  chartGroup.appendChild(clipped);
  svg.appendChild(chartGroup);
  if (legendLayout) {
    // Legende unter dem Diagramm: Zuständigkeiten in ihren Farben
    const g = el('g', { transform: `translate(0 ${title + chartHeight})` });
    g.appendChild(el('line', { x1: 0, x2: width, y1: 0.5, y2: 0.5, stroke: '#cbd5e1' }));
    g.appendChild(el('text', { x: TABLE_PAD, y: LEGEND_PAD + 15, 'font-size': 15, 'font-weight': 700, fill: '#334155' }, 'Legende'));
    for (const item of legendLayout.items) {
      g.appendChild(el('rect', { x: item.x, y: item.y + 2, width: 14, height: 14, rx: 3, fill: item.r.color }));
      g.appendChild(el('text', { x: item.x + 20, y: item.y + 15, 'font-size': 15, fill: '#0f172a' }, item.r.name));
    }
    svg.appendChild(g);
  }
  if (fontFamily === 'helvetica') {
    // PDF-Standardschrift kennt nur normal/fett: Zwischenstärken (500, 600 …) abbilden
    svg.querySelectorAll('[font-weight]').forEach((n) => {
      const w = n.getAttribute('font-weight')!;
      const num = Number(w);
      n.setAttribute('font-weight', w === 'bold' || num >= 600 ? 'bold' : 'normal');
    });
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

/** Raster-Auflösung: bis 3-fach, aber innerhalb der Canvas-Grenzen der Browser. */
function rasterScale(width: number, height: number, maxSide: number): number {
  return Math.max(0.5, Math.min(3, maxSide / width, maxSide / height, Math.sqrt(120_000_000 / (width * height))));
}

async function renderExport(chart: SVGSVGElement, project: Project, maxSide: number, legend: Responsibility[] | null = null) {
  const logo = await loadLogo();
  const { svg, width, height, logoRect } = buildExportSvg(chart, project, Boolean(logo), legend);
  const canvas = await svgToCanvas(svg, width, height, rasterScale(width, height, maxSide), logo && logoRect ? { image: logo, rect: logoRect } : null);
  return { canvas, width, height };
}

export async function exportPng(chart: SVGSVGElement, project: Project, legend: Responsibility[] | null = null): Promise<void> {
  const { canvas } = await renderExport(chart, project, 16000, legend);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG konnte nicht erzeugt werden.');
  downloadBlob(blob, `${fileBaseName(project)}.png`);
}

/** 1 px (96 dpi) = 0,75 pt; 1 cm = 28,35 pt */
const PX_TO_PT = 0.75;
const PDF_MARGIN_PT = 28.35;

function imageToPngDataUrl(img: HTMLImageElement): string {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || 192;
  c.height = img.naturalHeight || 192;
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

/**
 * `viewer`: vorab (beim Klick) geöffneter Tab, in dem das fertige PDF angezeigt wird.
 *
 * PDF-Export als Vektorgrafik (Text und Linien bleiben bei jedem Zoom scharf, Text ist durchsuchbar).
 * Immer im hellen Design; `legend` = Zuständigkeiten für die Legende oder null für ohne.
 * Fällt auf ein hochaufgelöstes Bild zurück, falls die Vektor-Umwandlung scheitert.
 */
export async function exportPdf(
  chart: SVGSVGElement,
  project: Project,
  legend: Responsibility[] | null = null,
  viewer: Window | null = null,
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const logo = await loadLogo();
  const { svg, width, height, logoRect } = buildExportSvg(chart, project, Boolean(logo), legend, 'helvetica');
  const m = PDF_MARGIN_PT;
  const w = width * PX_TO_PT;
  const h = height * PX_TO_PT;
  const pageW = w + 2 * m;
  const pageH = h + 2 * m;
  const pdf = new jsPDF({ orientation: pageW >= pageH ? 'landscape' : 'portrait', unit: 'pt', format: [pageW, pageH], compress: true });

  try {
    const { svg2pdf } = await import('svg2pdf.js');
    // svg2pdf liest Maße aus dem Dokument – kurz unsichtbar einhängen
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-100000px;top:0;width:0;height:0;overflow:hidden;';
    host.appendChild(svg);
    document.body.appendChild(host);
    try {
      await svg2pdf(svg, pdf, { x: m, y: m, width: w, height: h });
    } finally {
      host.remove();
    }
    if (logo && logoRect) {
      pdf.addImage(imageToPngDataUrl(logo), 'PNG', m + logoRect.x * PX_TO_PT, m + logoRect.y * PX_TO_PT, logoRect.width * PX_TO_PT, logoRect.height * PX_TO_PT);
    }
  } catch (err) {
    console.warn('Vektor-PDF nicht möglich, verwende Bild:', err);
    const raster = await renderExport(chart, project, 14000, legend);
    pdf.addImage(raster.canvas, 'PNG', m, m, w, h, undefined, 'FAST');
  }
  const filename = `${fileBaseName(project)}.pdf`;
  const blob = pdf.output('blob');
  downloadBlob(blob, filename);
  // Fertiges PDF im vorab geöffneten Tab anzeigen (der Blob-URL bleibt dafür gültig)
  if (viewer && !viewer.closed) viewer.location.href = URL.createObjectURL(new File([blob], filename, { type: 'application/pdf' }));
}
