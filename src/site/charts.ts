import { select, type Selection } from 'd3';
import { unitWord, type SiteResults } from './results';
import { RESULTS_URL, SYNTHETIC_NOTE } from './data';

/**
 * Small helpers shared by the /research charts. Charts are SVG; colours are applied through CSS
 * classes that use theme tokens, and every chart redraws on resize and on theme change.
 */

export type SVGSel = Selection<SVGSVGElement, unknown, null, undefined>;

export interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Calls `draw(width)` now, whenever the container is resized, and on theme change.
 * Returns a function that forces a redraw.
 */
export function responsive(container: HTMLElement, draw: (width: number) => void): () => void {
  let last = -1;
  let frame = 0;
  const run = (force = false) => {
    const w = Math.round(container.clientWidth);
    if (!force && w === last) return;
    last = w;
    draw(w);
  };
  const schedule = (force = false) => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => run(force));
  };
  new ResizeObserver(() => schedule()).observe(container);
  window.addEventListener('morseye:theme', () => schedule(true));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => schedule(true));
  run(true);
  return () => run(true);
}

/** A fresh SVG of the given size inside `container` (replacing any previous one). */
export function freshSvg(
  container: HTMLElement,
  width: number,
  height: number,
  label: string,
  /** 'group' when the chart holds focusable controls (children of an img are not exposed). */
  role: 'img' | 'group' = 'img',
): SVGSel {
  select(container).selectAll('svg.chart-svg').remove();
  return select(container)
    .append('svg')
    .attr('class', 'chart-svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('role', role)
    .attr('aria-label', label);
}

/** Builds a simple data table (the accessible alternative to a chart). */
export function dataTable(
  caption: string,
  head: string[],
  rows: (string | number)[][],
  numeric: boolean[] = [],
): HTMLTableElement {
  const t = document.createElement('table');
  const cap = t.createCaption();
  cap.textContent = caption;
  const thead = t.createTHead().insertRow();
  head.forEach((h, i) => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = h;
    if (numeric[i]) th.className = 'num';
    thead.appendChild(th);
  });
  const body = t.createTBody();
  for (const r of rows) {
    const tr = body.insertRow();
    r.forEach((c, i) => {
      const td = tr.insertCell();
      td.textContent = String(c);
      if (numeric[i]) td.className = 'num';
    });
  }
  return t;
}

/** Fills a figure's standard parts: caption meta line, synthetic badge, summary, table. */
export function figureParts(
  fig: HTMLElement,
  r: SiteResults,
  opts: {
    downloadKeys: string[];
    summary: string;
    table: HTMLTableElement | null;
    extraMeta?: string;
    /** False for charts that show raw per-participant values only. */
    intervals?: boolean;
  },
): void {
  const meta = fig.querySelector<HTMLElement>('[data-part="meta"]');
  if (meta) {
    const href = opts.downloadKeys.map((k) => r.downloads?.[k]).find(Boolean) ?? RESULTS_URL;
    const isCsv = /\.csv$/i.test(href);
    meta.replaceChildren();
    meta.append(
      `N = ${r.n_participants} ${unitWord(r, r.n_participants)}.` +
        (opts.intervals === false ? '' : ` Intervals: ${r.ci_method}.`) +
        (opts.extraMeta ? ` ${opts.extraMeta}` : '') +
        ' ',
    );
    const a = document.createElement('a');
    a.href = href;
    a.textContent = isCsv ? 'Download data (CSV)' : 'Download data (JSON)';
    a.setAttribute('download', '');
    meta.append(a);
  }
  const badge = fig.querySelector<HTMLElement>('[data-part="synthetic"]');
  if (badge) {
    badge.hidden = !r.synthetic;
    badge.textContent = SYNTHETIC_NOTE;
  }
  const summary = fig.querySelector<HTMLElement>('[data-part="summary"]');
  if (summary) summary.textContent = opts.summary;
  const tableHolder = fig.querySelector<HTMLElement>('[data-part="table"]');
  if (tableHolder) {
    tableHolder.replaceChildren();
    if (opts.table) {
      const wrap = document.createElement('div');
      wrap.className = 'table-scroll';
      wrap.appendChild(opts.table);
      tableHolder.appendChild(wrap);
    }
  }
}

/** Deterministic small jitter in [-1, 1] for participant dots (stable across redraws). */
export function jitter(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/** Shows a chart-area message (no data, load failure). */
export function chartMessage(holder: HTMLElement, text: string): void {
  holder.replaceChildren();
  const p = document.createElement('p');
  p.className = 'chart-empty';
  p.textContent = text;
  holder.appendChild(p);
}
