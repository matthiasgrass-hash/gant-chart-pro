import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { Task, ViewMode } from '../types';
import type { TimelineRange } from './timeline';
import { GanttChart } from '../components/GanttChart';

const noop = () => {};

/**
 * Zeichnet das Diagramm für den Export unabhängig von der Bildschirmansicht
 * (eigener Zeitraum, keine Auswahl) und liefert das fertige SVG-Element.
 */
export function renderChartSvg(tasks: Task[], view: ViewMode, range: TimelineRange, today: number): SVGSVGElement {
  const host = document.createElement('div');
  const root = createRoot(host);
  flushSync(() => {
    root.render(
      <GanttChart
        tasks={tasks}
        view={view}
        range={range}
        today={today}
        selectedId={null}
        svgRef={noop}
        onSelect={noop}
        onEdit={noop}
        onChangeDates={noop}
        onAddDependency={noop}
      />,
    );
  });
  const svg = host.querySelector('svg')!.cloneNode(true) as SVGSVGElement;
  root.unmount();
  return svg;
}
