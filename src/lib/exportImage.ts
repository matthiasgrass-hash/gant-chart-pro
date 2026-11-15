import type { Project } from '../types';
import { formatDate } from './date';
import { HEADER_HEIGHT, ROW_HEIGHT } from './timeline';

const NAME_COL = 260;
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

/** Baut ein eigenständiges SVG aus Aufgabenspalte + Diagramm für den Export. */
interface Rect { x: number; y: number; width: number; height: number }

export function buildExportSvg(chart: SVGSVGElement, project: Project, withLogo = false): { svg: SVGSVGElement; width: number; height: number; logoRect: Rect | null } {
  const chartWidth = Number(chart.getAttribute('width'));
  const chartHeight = Number(chart.getAttribute('height'));
  const title = 84;
  const width = NAME_COL + chartWidth;
  const height = title + chartHeight;

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

  const names = el('g', { transform: `translate(0 ${title})` });
  names.appendChild(el('rect', { x: 0, y: 0, width: NAME_COL, height: HEADER_HEIGHT, fill: '#f8fafc' }));
  names.appendChild(el('text', { x: 16, y: HEADER_HEIGHT / 2 + 5, 'font-size': 13, 'font-weight': 600, fill: '#334155' }, 'Aufgabe'));
  project.tasks.forEach((t, i) => {
    const y = HEADER_HEIGHT + i * ROW_HEIGHT;
    names.appendChild(el('line', { x1: 0, x2: NAME_COL, y1: y + ROW_HEIGHT, y2: y + ROW_HEIGHT, stroke: '#e2e8f0' }));
    names.appendChild(el('circle', { cx: 18, cy: y + ROW_HEIGHT / 2, r: 5, fill: t.color }));
    const label = t.name.length > 30 ? `${t.name.slice(0, 29)}…` : t.name;
    names.appendChild(el('text', { x: 32, y: y + ROW_HEIGHT / 2 - 2, 'font-size': 13, fill: '#0f172a' }, label));
    names.appendChild(el('text', { x: 32, y: y + ROW_HEIGHT / 2 + 12, 'font-size': 10, fill: '#64748b' }, `${formatDate(t.start)} – ${formatDate(t.end)}`));
  });
  names.appendChild(el('line', { x1: NAME_COL - 0.5, x2: NAME_COL - 0.5, y1: 0, y2: chartHeight, stroke: '#cbd5e1' }));
  svg.appendChild(names);

  const clone = chart.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll('[data-export="exclude"]').forEach((n) => n.remove());
  const chartGroup = el('g', { transform: `translate(${NAME_COL} ${title})` });
  while (clone.firstChild) chartGroup.appendChild(clone.firstChild);
  svg.appendChild(chartGroup);
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

async function renderExport(chart: SVGSVGElement, project: Project, maxSize: number) {
  const logo = await loadLogo();
  const { svg, width, height, logoRect } = buildExportSvg(chart, project, Boolean(logo));
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

export async function exportPdf(chart: SVGSVGElement, project: Project): Promise<void> {
  const { canvas, width, height } = await renderExport(chart, project, 14000);
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: width >= height ? 'landscape' : 'portrait', unit: 'px', format: [width, height], hotfixes: ['px_scaling'] });
  pdf.addImage(canvas, 'PNG', 0, 0, width, height, undefined, 'FAST');
  pdf.save(`${fileBaseName(project)}.pdf`);
}
