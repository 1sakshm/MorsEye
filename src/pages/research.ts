import '../site/layout';
import '../styles/research.css';
import {
  area,
  axisBottom,
  axisLeft,
  curveLinear,
  line,
  max,
  min,
  pointer,
  quantileSorted,
  scaleLinear,
  scalePoint,
  select,
  type ScaleLinear,
  type Selection,
} from 'd3';
import { DEFAULT_TIMING } from '../segment/segmenter';
import { chartMessage, dataTable, figureParts, freshSvg, jitter, responsive } from '../site/charts';
import { fmtCI, fmtNum, loadResults, pct } from '../site/data';
import type { CI, DetectorResult, DurationSet, KShotPoint, SiteResults } from '../site/results';

type G = Selection<SVGGElement, unknown, null, undefined>;

const byId = <E extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as E | null;

const sorted = (xs: readonly number[]) => [...xs].sort((a, b) => a - b);
const q = (s: number[], p: number) => (s.length ? (quantileSorted(s, p) ?? NaN) : NaN);

type Linear = ScaleLinear<number, number>;

function xAxis(g: G, scale: Linear, innerH: number, ticks: number, title: string, innerW: number) {
  const ax = g.append('g').attr('class', 'axis').attr('transform', `translate(0,${innerH})`);
  ax.call(axisBottom(scale).ticks(ticks).tickSizeOuter(0));
  g.append('text')
    .attr('class', 'axis-title')
    .attr('x', innerW)
    .attr('y', innerH + 38)
    .attr('text-anchor', 'end')
    .text(title);
}

function yAxis(
  g: G,
  scale: Linear,
  ticks: number,
  title: string,
  format?: (d: number) => string,
  rotated = false,
) {
  const ax = g.append('g').attr('class', 'axis');
  const a = axisLeft(scale).ticks(ticks).tickSizeOuter(0);
  if (format) a.tickFormat((d) => format(d as number));
  ax.call(a);
  const t = g.append('text').attr('class', 'axis-title').text(title);
  if (rotated) {
    const [y0, y1] = scale.range() as [number, number];
    t.attr('transform', `translate(-42,${(y0 + y1) / 2}) rotate(-90)`).attr(
      'text-anchor',
      'middle',
    );
  } else {
    t.attr('x', 0).attr('y', -14);
  }
}

function gridY(g: G, scale: Linear, ticks: number, innerW: number) {
  g.append('g')
    .attr('class', 'gridline')
    .call(
      axisLeft(scale)
        .ticks(ticks)
        .tickSize(-innerW)
        .tickFormat(() => ''),
    );
}

// ------------------------------------------------------------------ duration explorer

type Kind = 'spontaneous' | 'short' | 'long';
const KINDS: { key: Kind; label: string; cls: string }[] = [
  { key: 'spontaneous', label: 'Spontaneous blinks', cls: 'spont' },
  { key: 'short', label: 'Deliberate short', cls: 'short' },
  { key: 'long', label: 'Deliberate long', cls: 'long' },
];

interface Readouts {
  ftpm: number;
  rejected: number;
  dotdash: number;
  dashdot: number;
  spontTriggered: number;
}

function readouts(d: DurationSet, reject: number, dot: number): Readouts {
  const spontTriggered = d.spontaneous.filter((x) => x >= reject).length;
  const deliberate = [...d.short, ...d.long];
  return {
    spontTriggered,
    ftpm: d.spontaneous_minutes > 0 ? spontTriggered / d.spontaneous_minutes : NaN,
    rejected: deliberate.length
      ? deliberate.filter((x) => x < reject).length / deliberate.length
      : NaN,
    dotdash: d.short.length ? d.short.filter((x) => x >= dot).length / d.short.length : NaN,
    dashdot: d.long.length
      ? d.long.filter((x) => x >= reject && x < dot).length / d.long.length
      : NaN,
  };
}

function durationExplorer(r: SiteResults): void {
  const fig = byId('fig-durations');
  const holder = byId('dur-chart');
  const sel = byId<HTMLSelectElement>('dur-participant');
  const inReject = byId<HTMLInputElement>('dur-reject');
  const inDot = byId<HTMLInputElement>('dur-dot');
  const resetBtn = byId<HTMLButtonElement>('dur-reset');
  const legend = byId('dur-legend');
  const live = byId('dur-live');
  if (!fig || !holder || !sel || !inReject || !inDot || !resetBtn || !legend || !live) return;

  const base = r.timing ?? DEFAULT_TIMING;
  const state = { who: 'pooled', reject: base.rejectMs, dot: base.dotMaxMs };
  const people = Object.keys(r.durations.participants ?? {}).sort();
  sel.replaceChildren(
    new Option('All participants (pooled)', 'pooled'),
    ...people.map((p) => new Option(p, p)),
  );

  const pooled = r.durations.pooled;
  const everything = sorted([...pooled.spontaneous, ...pooled.short, ...pooled.long]);
  if (!everything.length) {
    chartMessage(holder, 'No closure durations in the results file yet.');
    return;
  }
  const xMax = Math.min(
    4000,
    Math.max(base.cmdMs + 300, Math.ceil(q(everything, 0.995) / 250) * 250),
  );
  const BIN = xMax > 2600 ? 100 : 50;
  const STEP = 10;
  const MIN_GAP = 20;
  const dotLimit = base.dashMaxMs - MIN_GAP;

  const data = (): DurationSet =>
    state.who === 'pooled' ? pooled : (r.durations.participants[state.who] ?? pooled);

  const clampState = () => {
    state.reject = Math.max(0, Math.min(state.reject, state.dot - MIN_GAP));
    state.dot = Math.max(state.reject + MIN_GAP, Math.min(state.dot, dotLimit));
  };

  let liveTimer = 0;
  const showReadouts = () => {
    const d = data();
    const ro = readouts(d, state.reject, state.dot);
    const set = (k: string, v: string) => {
      const el = fig.querySelector(`[data-r="${k}"]`);
      if (el) el.textContent = v;
    };
    set('ftpm', Number.isFinite(ro.ftpm) ? `${ro.ftpm.toFixed(1)} per min` : '–');
    set('rejected', pct(ro.rejected));
    set('dotdash', pct(ro.dotdash));
    set('dashdot', pct(ro.dashdot));
    inReject.value = String(state.reject);
    inDot.value = String(state.dot);
    window.clearTimeout(liveTimer);
    liveTimer = window.setTimeout(() => {
      live.textContent =
        `Reject below ${state.reject} ms, dot/dash boundary ${state.dot} ms: ` +
        `${Number.isFinite(ro.ftpm) ? ro.ftpm.toFixed(1) : 'unknown'} false triggers per minute, ` +
        `${pct(ro.rejected)} of deliberate closures rejected, ${pct(ro.dotdash)} of dots read as dashes, ` +
        `${pct(ro.dashdot)} of dashes read as dots.`;
    }, 600);
    describe();
  };

  const describe = () => {
    const d = data();
    const ro = readouts(d, state.reject, state.dot);
    const parts = KINDS.map(({ key, label }) => {
      const s = sorted(d[key]);
      return s.length
        ? `${label}: n = ${s.length}, median ${Math.round(q(s, 0.5))} ms (middle half ${Math.round(q(s, 0.25))}–${Math.round(q(s, 0.75))} ms)`
        : `${label}: none`;
    });
    const who = state.who === 'pooled' ? 'All participants' : state.who;
    figureParts(fig, r, {
      downloadKeys: ['durations', 'closures', 'labels'],
      summary:
        `${who}. ${parts.join('. ')}. With the reject window at ${state.reject} ms, ${ro.spontTriggered} of ` +
        `${d.spontaneous.length} spontaneous blinks in ${fmtNum(d.spontaneous_minutes, 1)} minutes of reading would have typed a symbol.`,
      table: dataTable(
        `Closure durations (${who}) and the effect of the current thresholds`,
        ['Type', 'n', 'Median (ms)', 'Middle half (ms)', '5th–95th percentile (ms)'],
        KINDS.map(({ key, label }) => {
          const s = sorted(d[key]);
          return [
            label,
            s.length,
            s.length ? Math.round(q(s, 0.5)) : '–',
            s.length ? `${Math.round(q(s, 0.25))}–${Math.round(q(s, 0.75))}` : '–',
            s.length ? `${Math.round(q(s, 0.05))}–${Math.round(q(s, 0.95))}` : '–',
          ];
        }),
        [false, true, true, true, true],
      ),
    });
  };

  const renderLegend = () => {
    const d = data();
    legend.replaceChildren(
      ...KINDS.map(({ key, label, cls }) => {
        const s = document.createElement('span');
        s.className = 'legend';
        const sw = document.createElement('span');
        sw.className = `swatch swatch--${cls}`;
        s.append(sw, `${label} (n = ${d[key].length})`);
        return s;
      }),
    );
  };

  // Handles are positioned in place while dragging, so pointer capture is never lost to a redraw.
  let positionHandles: () => void = () => {};

  const draw = (w: number) => {
    const height = w < 520 ? 280 : 330;
    const m = { top: 64, right: 18, bottom: 48, left: 58 };
    const innerW = Math.max(120, w - m.left - m.right);
    const innerH = height - m.top - m.bottom;
    const svg = freshSvg(
      holder,
      w,
      height,
      'Overlaid histograms of closure duration for spontaneous blinks, deliberate short and deliberate long closures, with two draggable threshold lines.',
      'group',
    );
    const g: G = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);
    const x = scaleLinear().domain([0, xMax]).range([0, innerW]);

    const d = data();
    const series = KINDS.map(({ key, cls }) => {
      const vals = d[key];
      const n = Math.ceil(xMax / BIN);
      const counts = new Array<number>(n).fill(0);
      for (const v of vals) counts[Math.min(n - 1, Math.max(0, Math.floor(v / BIN)))]! += 1;
      const share = counts.map((c) => (vals.length ? c / vals.length : 0));
      return { cls, share };
    });
    const yMax = Math.max(0.05, max(series.flatMap((s) => s.share)) ?? 0.05);
    const y = scaleLinear()
      .domain([0, yMax * 1.08])
      .range([innerH, 0])
      .nice();

    // Band shading behind everything.
    const bands = g.append('g').attr('class', 'band-shades');
    const shade = (cls: string) =>
      bands
        .append('rect')
        .attr('class', `band-shade band-shade--${cls}`)
        .attr('y', 0)
        .attr('height', innerH);
    const sReject = shade('reject');
    const sDot = shade('dot');
    const sDash = shade('dash');
    const sHold = shade('hold');
    const sDelete = shade('delete');
    const placeStatic = () => {
      sDash.attr('x', x(state.dot)).attr('width', Math.max(0, x(base.dashMaxMs) - x(state.dot)));
      sHold
        .attr('x', x(base.dashMaxMs))
        .attr('width', Math.max(0, x(base.cmdMs) - x(base.dashMaxMs)));
      sDelete.attr('x', x(base.cmdMs)).attr('width', Math.max(0, innerW - x(base.cmdMs)));
    };

    gridY(g, y, 4, innerW);
    xAxis(g, x, innerH, w < 520 ? 4 : 8, 'closure duration (ms)', innerW);
    // The top margin belongs to the threshold handles, so this title runs up the axis.
    yAxis(g, y, 4, 'share of that type', (v) => `${Math.round(v * 100)}%`, true);

    for (const s of series) {
      const pts: [number, number][] = [];
      s.share.forEach((v, i) => {
        pts.push([x(i * BIN), y(v)]);
        pts.push([x(Math.min(xMax, (i + 1) * BIN)), y(v)]);
      });
      const top = line().curve(curveLinear)(pts) ?? '';
      g.append('path')
        .attr('class', `hist-area hist-area--${s.cls}`)
        .attr('d', `${top}L${x(xMax)},${innerH}L0,${innerH}Z`);
      g.append('path').attr('class', `hist-line hist-line--${s.cls}`).attr('d', top);
    }

    // Fixed band edges (not draggable) for reference; labels only where they fit.
    const edges = [
      [base.dashMaxMs, 'dash ends'],
      [base.cmdMs, 'delete'],
    ] as const;
    edges.forEach(([v, name], i) => {
      if (v > xMax) return;
      g.append('line')
        .attr('class', 'fixed-edge')
        .attr('x1', x(v))
        .attr('x2', x(v))
        .attr('y1', 0)
        .attr('y2', innerH);
      const next = edges[i + 1]?.[0];
      const room = (next !== undefined && next <= xMax ? x(next) : innerW) - x(v);
      if (room >= name.length * 7.5 + 8) {
        g.append('text')
          .attr('class', 'edge-label')
          .attr('x', x(v) + 4)
          .attr('y', 12)
          .text(name);
      }
    });

    const handle = (key: 'reject' | 'dot', label: string) => {
      const h = g
        .append('g')
        .attr('class', `handle handle--${key}`)
        .attr('tabindex', 0)
        .attr('role', 'slider')
        .attr(
          'aria-label',
          key === 'reject'
            ? 'Reject threshold in milliseconds'
            : 'Dot/dash boundary in milliseconds',
        )
        .attr('aria-orientation', 'horizontal');
      h.append('rect')
        .attr('class', 'handle-hit')
        .attr('x', -22)
        .attr('width', 44)
        .attr('y', -m.top + 4)
        .attr('height', innerH + m.top - 4);
      h.append('line').attr('class', 'handle-line').attr('y1', -18).attr('y2', innerH);
      // The knob can slide sideways (see positionHandles) so two close handles never overlap.
      const knob = h.append('g').attr('class', 'handle-knob-g');
      knob.append('line').attr('class', 'handle-leader').attr('y1', -18).attr('y2', -18);
      knob
        .append('rect')
        .attr('class', 'handle-focus')
        .attr('x', -28)
        .attr('y', -45)
        .attr('width', 56)
        .attr('height', 32)
        .attr('rx', 8);
      knob
        .append('rect')
        .attr('class', 'handle-knob')
        .attr('x', -24)
        .attr('y', -41)
        .attr('width', 48)
        .attr('height', 24)
        .attr('rx', 6);
      const val = knob
        .append('text')
        .attr('class', 'handle-value')
        .attr('y', -24)
        .attr('text-anchor', 'middle');
      knob
        .append('text')
        .attr('class', 'handle-name')
        .attr('y', -48)
        .attr('x', key === 'reject' ? -4 : 4)
        .attr('text-anchor', key === 'reject' ? 'end' : 'start')
        .text(label);
      const node = h.node()!;

      const setValue = (v: number) => {
        state[key] = Math.round(v / STEP) * STEP;
        if (key === 'reject')
          state.reject = Math.max(0, Math.min(state.reject, state.dot - MIN_GAP));
        else state.dot = Math.max(state.reject + MIN_GAP, Math.min(state.dot, dotLimit));
        positionHandles();
        showReadouts();
      };
      node.addEventListener('pointerdown', (e) => {
        node.setPointerCapture(e.pointerId);
        node.classList.add('is-dragging');
        e.preventDefault();
        node.focus();
      });
      node.addEventListener('pointermove', (e) => {
        if (!node.hasPointerCapture(e.pointerId)) return;
        const [px] = pointer(e, g.node());
        setValue(x.invert(px));
      });
      const end = (e: PointerEvent) => {
        if (node.hasPointerCapture(e.pointerId)) node.releasePointerCapture(e.pointerId);
        node.classList.remove('is-dragging');
      };
      node.addEventListener('pointerup', end);
      node.addEventListener('pointercancel', end);
      node.addEventListener('keydown', (e) => {
        const cur = state[key];
        const lo = key === 'reject' ? 0 : state.reject + MIN_GAP;
        const hi = key === 'reject' ? state.dot - MIN_GAP : dotLimit;
        const map: Record<string, number> = {
          ArrowLeft: cur - STEP,
          ArrowDown: cur - STEP,
          ArrowRight: cur + STEP,
          ArrowUp: cur + STEP,
          PageDown: cur - 100,
          PageUp: cur + 100,
          Home: lo,
          End: hi,
        };
        if (!(e.key in map)) return;
        e.preventDefault();
        setValue(map[e.key]!);
      });
      return { h, val, knob };
    };

    const hr = handle('reject', 'reject');
    const hd = handle('dot', 'dot | dash');

    positionHandles = () => {
      clampState();
      sReject.attr('x', 0).attr('width', x(state.reject));
      sDot.attr('x', x(state.reject)).attr('width', Math.max(0, x(state.dot) - x(state.reject)));
      placeStatic();
      const KNOB = 52;
      const gap = x(state.dot) - x(state.reject);
      const push = gap < KNOB ? (KNOB - gap) / 2 : 0;
      const leftRoom = Math.min(push, x(state.reject) + 30);
      for (const [hh, dx] of [
        [hr, -leftRoom],
        [hd, push * 2 - leftRoom],
      ] as const) {
        hh.knob.attr('transform', `translate(${dx},0)`);
        hh.knob.select('.handle-leader').attr('x1', 0).attr('x2', -dx);
      }
      for (const [{ h, val }, key, lo, hi] of [
        [hr, 'reject', 0, state.dot - MIN_GAP],
        [hd, 'dot', state.reject + MIN_GAP, dotLimit],
      ] as const) {
        const v = state[key];
        h.attr('transform', `translate(${x(v)},0)`)
          .attr('aria-valuenow', v)
          .attr('aria-valuemin', lo)
          .attr('aria-valuemax', hi)
          .attr('aria-valuetext', `${v} milliseconds`);
        val.text(String(v));
      }
    };
    positionHandles();
  };

  const redraw = responsive(holder, draw);

  sel.addEventListener('change', () => {
    state.who = sel.value;
    renderLegend();
    redraw();
    showReadouts();
  });
  const fromInput = (key: 'reject' | 'dot', el: HTMLInputElement) => {
    const v = Number(el.value);
    if (!Number.isFinite(v)) return;
    state[key] = Math.round(v / STEP) * STEP;
    clampState();
    positionHandles();
    showReadouts();
  };
  inReject.addEventListener('change', () => fromInput('reject', inReject));
  inDot.addEventListener('change', () => fromInput('dot', inDot));
  inReject.max = String(dotLimit);
  inDot.max = String(dotLimit);
  resetBtn.addEventListener('click', () => {
    state.reject = base.rejectMs;
    state.dot = base.dotMaxMs;
    positionHandles();
    showReadouts();
  });

  renderLegend();
  showReadouts();
}

// ------------------------------------------------------------------ detector comparison

type Metric = 'f1' | 'precision' | 'recall' | 'ftpm';
const METRIC_LABEL: Record<Metric, string> = {
  f1: 'event F1',
  precision: 'precision',
  recall: 'recall',
  ftpm: 'false triggers per minute',
};

function metricOf(d: DetectorResult, m: Metric): { ci: CI; pp: { p: string; value: number }[] } {
  switch (m) {
    case 'f1':
      return { ci: d.f1, pp: d.f1_pp ?? [] };
    case 'ftpm':
      return { ci: d.ftpm, pp: d.ftpm_pp ?? [] };
    default:
      return { ci: d[m], pp: [] };
  }
}

function detectorChart(r: SiteResults): void {
  const fig = byId('fig-detectors');
  const holder = byId('det-chart');
  const metricSel = byId<HTMLSelectElement>('det-metric');
  if (!fig || !holder || !metricSel) return;
  if (!r.detectors?.length) {
    chartMessage(holder, 'No detector results yet.');
    return;
  }
  let metric: Metric = 'f1';

  const describe = () => {
    const rows = r.detectors.map((d) => ({ d, ...metricOf(d, metric) }));
    const better =
      metric === 'ftpm' ? (a: number, b: number) => a < b : (a: number, b: number) => a > b;
    const best = rows.reduce((a, b) => (better(b.ci.mean, a.ci.mean) ? b : a));
    const worst = rows.reduce((a, b) => (better(a.ci.mean, b.ci.mean) ? b : a));
    const digits = metric === 'ftpm' ? 1 : 2;
    figureParts(fig, r, {
      downloadKeys: ['detectors', 'detector_metrics'],
      summary:
        `Best mean ${METRIC_LABEL[metric]}: ${best.d.id} — ${best.d.label}: ${fmtCI(best.ci, digits)}. ` +
        `Worst: ${worst.d.id} — ${worst.d.label}: ${fmtCI(worst.ci, digits)}. Where intervals overlap, ` +
        `the difference may not be reliable with this many participants.`,
      table: dataTable(
        `Detector ${METRIC_LABEL[metric]}: mean and 95% interval`,
        ['Detector', 'Description', 'Mean', '95% interval', 'Participant range'],
        rows.map(({ d, ci, pp }) => [
          d.id,
          d.label,
          fmtNum(ci.mean, digits),
          `${fmtNum(ci.lo, digits)} – ${fmtNum(ci.hi, digits)}`,
          pp.length
            ? `${fmtNum(min(pp, (p) => p.value) ?? NaN, digits)} – ${fmtNum(max(pp, (p) => p.value) ?? NaN, digits)}`
            : '–',
        ]),
        [false, false, true, true, true],
      ),
    });
  };

  const draw = (w: number) => {
    const rows = r.detectors.map((d) => ({ d, ...metricOf(d, metric) }));
    const narrow = w < 600;
    const rowH = narrow ? 66 : 50;
    const m = { top: 16, right: 24, bottom: 52, left: narrow ? 14 : 250 };
    const innerW = Math.max(120, w - m.left - m.right);
    const innerH = rows.length * rowH;
    const svg = freshSvg(
      holder,
      w,
      innerH + m.top + m.bottom,
      `Dot and interval plot of ${METRIC_LABEL[metric]} for detectors ${rows.map((r) => r.d.id).join(', ')}.`,
    );
    const g: G = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);
    const hi =
      metric === 'ftpm'
        ? (max(rows.flatMap((r) => [r.ci.hi, ...r.pp.map((p) => p.value)])) ?? 1) * 1.1
        : 1;
    const x = scaleLinear().domain([0, hi]).range([0, innerW]).nice();

    g.append('g')
      .attr('class', 'gridline')
      .attr('transform', `translate(0,${innerH})`)
      .call(
        axisBottom(x)
          .ticks(narrow ? 4 : 6)
          .tickSize(-innerH)
          .tickFormat(() => ''),
      );
    xAxis(g, x, innerH, narrow ? 4 : 6, METRIC_LABEL[metric], innerW);

    rows.forEach(({ d, ci, pp }, i) => {
      const cy = i * rowH + (narrow ? rowH * 0.62 : rowH / 2);
      const label = g.append('text').attr('class', 'row-label');
      if (narrow) label.attr('x', 0).attr('y', cy - 20);
      else
        label
          .attr('x', -14)
          .attr('y', cy + 5)
          .attr('text-anchor', 'end');
      label.append('tspan').attr('class', 'row-id').text(`${d.id} `);
      label.append('tspan').text(d.label);

      pp.forEach((p, k) =>
        g
          .append('circle')
          .attr('class', 'pp-dot')
          .attr('cx', x(p.value))
          .attr('cy', cy + jitter(i * 31 + k) * rowH * 0.16)
          .attr('r', 4)
          .append('title')
          .text(`${p.p}: ${fmtNum(p.value, metric === 'ftpm' ? 1 : 2)}`),
      );
      g.append('line')
        .attr('class', 'ci-line')
        .attr('x1', x(ci.lo))
        .attr('x2', x(ci.hi))
        .attr('y1', cy)
        .attr('y2', cy);
      for (const v of [ci.lo, ci.hi]) {
        g.append('line')
          .attr('class', 'ci-cap')
          .attr('x1', x(v))
          .attr('x2', x(v))
          .attr('y1', cy - 6)
          .attr('y2', cy + 6);
      }
      g.append('circle')
        .attr('class', 'mean-dot')
        .attr('cx', x(ci.mean))
        .attr('cy', cy)
        .attr('r', 7)
        .append('title')
        .text(`${d.id} ${d.label}: ${fmtCI(ci, metric === 'ftpm' ? 1 : 2)}`);
    });
  };

  const redraw = responsive(holder, draw);
  metricSel.addEventListener('change', () => {
    metric = metricSel.value as Metric;
    redraw();
    describe();
  });
  describe();
}

// ------------------------------------------------------------------ few-shot curve

function kshotChart(r: SiteResults, labelOf: (id: string) => string): void {
  const fig = byId('fig-kshot');
  const holder = byId('kshot-chart');
  const legend = byId('kshot-legend');
  if (!fig || !holder || !legend) return;
  if (!r.kshot?.length) {
    chartMessage(holder, 'No few-shot calibration results yet.');
    return;
  }
  const ids = [...new Set(r.kshot.map((p) => p.detector))];
  const ks = [...new Set(r.kshot.map((p) => p.k))].sort((a, b) => a - b);
  const byDet = new Map<string, KShotPoint[]>(
    ids.map((id) => [id, r.kshot.filter((p) => p.detector === id).sort((a, b) => a.k - b.k)]),
  );

  legend.replaceChildren(
    ...ids.map((id, i) => {
      const s = document.createElement('span');
      s.className = 'legend';
      const sw = document.createElement('span');
      sw.className = `swatch swatch--series${i}`;
      // The k used elsewhere on the page does not apply on a curve over k.
      s.append(sw, `${id} · ${labelOf(id).replace(/\s*\(k\s*=\s*\d+\)\s*$/, '')}`);
      return s;
    }),
  );

  const draw = (w: number) => {
    const height = w < 520 ? 280 : 320;
    const m = { top: 30, right: 24, bottom: 52, left: 52 };
    const innerW = Math.max(120, w - m.left - m.right);
    const innerH = height - m.top - m.bottom;
    const svg = freshSvg(
      holder,
      w,
      height,
      'Line chart of event F1 against the number of calibration closures k, with 95% interval bands.',
    );
    const g: G = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);
    const x = scalePoint<number>().domain(ks).range([0, innerW]).padding(0.35);
    const lo = min(r.kshot, (p) => p.f1.lo) ?? 0;
    const y = scaleLinear()
      .domain([Math.max(0, Math.floor((lo - 0.05) * 10) / 10), 1])
      .range([innerH, 0]);
    gridY(g, y, 5, innerW);
    const ax = g.append('g').attr('class', 'axis').attr('transform', `translate(0,${innerH})`);
    ax.call(
      axisBottom(x)
        .tickFormat((k) => (k === 0 ? '0 (fixed)' : String(k)))
        .tickSizeOuter(0),
    );
    g.append('text')
      .attr('class', 'axis-title')
      .attr('x', innerW)
      .attr('y', innerH + 40)
      .attr('text-anchor', 'end')
      .text('calibration closures k');
    yAxis(g, y, 5, 'event F1');

    ids.forEach((id, i) => {
      const pts = byDet.get(id) ?? [];
      const band = area<KShotPoint>()
        .x((p) => x(p.k) ?? 0)
        .y0((p) => y(p.f1.lo))
        .y1((p) => y(p.f1.hi));
      g.append('path')
        .attr('class', `ci-band ci-band--series${i}`)
        .attr('d', band(pts) ?? '');
      const ln = line<KShotPoint>()
        .x((p) => x(p.k) ?? 0)
        .y((p) => y(p.f1.mean));
      g.append('path')
        .attr('class', `series-line series-line--series${i}`)
        .attr('d', ln(pts) ?? '');
      for (const p of pts) {
        const cx = x(p.k) ?? 0;
        const cy = y(p.f1.mean);
        // Circles for the first series, squares for the second: distinguishable without colour.
        const mark: SVGElement | null =
          i % 2 === 0
            ? g.append('circle').attr('cx', cx).attr('cy', cy).attr('r', 5.5).node()
            : g
                .append('rect')
                .attr('x', cx - 5)
                .attr('y', cy - 5)
                .attr('width', 10)
                .attr('height', 10)
                .node();
        if (mark) {
          select(mark)
            .attr('class', `series-mark series-mark--series${i}`)
            .append('title')
            .text(`${id}, k = ${p.k}: ${fmtCI(p.f1)}`);
        }
      }
    });
  };
  responsive(holder, draw);

  const gains = ids.map((id) => {
    const pts = byDet.get(id) ?? [];
    const k0 = pts.find((p) => p.k === 0);
    const kMax = pts[pts.length - 1];
    return k0 && kMax
      ? `${id}: F1 ${fmtNum(k0.f1.mean)} at k = 0, ${fmtNum(kMax.f1.mean)} at k = ${kMax.k}`
      : `${id}: incomplete`;
  });
  figureParts(fig, r, {
    downloadKeys: ['kshot', 'few_shot'],
    summary: `${gains.join('; ')}.`,
    table: dataTable(
      'Event F1 by number of calibration closures',
      ['Detector', 'k', 'Mean F1', '95% interval'],
      r.kshot.map((p) => [
        p.detector,
        p.k,
        fmtNum(p.f1.mean),
        `${fmtNum(p.f1.lo)} – ${fmtNum(p.f1.hi)}`,
      ]),
      [false, true, true, true],
    ),
  });
}

// ------------------------------------------------------------------ text entry

function textEntryChart(r: SiteResults): void {
  const fig = byId('fig-text');
  const cpmHolder = byId('text-cpm');
  const errHolder = byId('text-err');
  if (!fig || !cpmHolder || !errHolder) return;
  const te = r.text_entry;
  if (!te || !te.blocks?.length) {
    chartMessage(
      cpmHolder,
      'Study B (text entry) has not been run or analysed yet. Entry rate and error rate by block will appear here.',
    );
    errHolder.replaceChildren();
    figureParts(fig, r, {
      downloadKeys: ['text_entry'],
      summary: 'No text-entry data yet.',
      table: null,
    });
    return;
  }
  const blocks = te.blocks.map((b) => b.block);

  const panel = (
    holder: HTMLElement,
    key: 'cpm' | 'error',
    title: string,
    fmt: (v: number) => string,
  ) => {
    responsive(holder, (w) => {
      const height = 260;
      const m = { top: 30, right: 18, bottom: 46, left: 52 };
      const innerW = Math.max(100, w - m.left - m.right);
      const innerH = height - m.top - m.bottom;
      const svg = freshSvg(
        holder,
        w,
        height,
        `${title} by block, per participant and mean with 95% interval.`,
      );
      const g: G = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);
      const x = scalePoint<number>().domain(blocks).range([0, innerW]).padding(0.4);
      const vals = [
        ...te.blocks.map((b) => b[key].hi),
        ...te.per_participant.flatMap((p) => p[key]),
      ];
      const y = scaleLinear()
        .domain([0, (max(vals) ?? 1) * 1.1])
        .range([innerH, 0])
        .nice();
      gridY(g, y, 4, innerW);
      const ax = g.append('g').attr('class', 'axis').attr('transform', `translate(0,${innerH})`);
      ax.call(
        axisBottom(x)
          .tickFormat((b) => `block ${b}`)
          .tickSizeOuter(0),
      );
      yAxis(g, y, 4, title, fmt);
      const pl = line<number>()
        .x((_, i) => x(blocks[i]!) ?? 0)
        .y((v) => y(v));
      for (const p of te.per_participant) {
        g.append('path')
          .attr('class', 'pp-line')
          .attr('d', pl(p[key]) ?? '')
          .append('title')
          .text(p.p);
      }
      const ml = line<(typeof te.blocks)[number]>()
        .x((b) => x(b.block) ?? 0)
        .y((b) => y(b[key].mean));
      g.append('path')
        .attr('class', 'mean-line')
        .attr('d', ml(te.blocks) ?? '');
      for (const b of te.blocks) {
        const cx = x(b.block) ?? 0;
        g.append('line')
          .attr('class', 'ci-line')
          .attr('x1', cx)
          .attr('x2', cx)
          .attr('y1', y(b[key].lo))
          .attr('y2', y(b[key].hi));
        g.append('circle')
          .attr('class', 'mean-dot')
          .attr('cx', cx)
          .attr('cy', y(b[key].mean))
          .attr('r', 6)
          .append('title')
          .text(`Block ${b.block}: ${fmt(b[key].mean)} [${fmt(b[key].lo)}, ${fmt(b[key].hi)}]`);
      }
    });
  };
  panel(cpmHolder, 'cpm', 'characters per minute', (v) => v.toFixed(0));
  panel(errHolder, 'error', 'error rate (uncorrected)', (v) => `${Math.round(v * 100)}%`);

  const first = te.blocks[0]!;
  const last = te.blocks[te.blocks.length - 1]!;
  figureParts(fig, r, {
    downloadKeys: ['text_entry', 'study_b'],
    summary:
      `Entry rate went from ${fmtCI(first.cpm, 1)} characters per minute in block ${first.block} to ` +
      `${fmtCI(last.cpm, 1)} in block ${last.block}; uncorrected error rate from ${pct(first.error.mean)} to ${pct(last.error.mean)}.`,
    table: dataTable(
      'Text entry by block: mean and 95% interval',
      ['Block', 'Characters per minute', 'Words per minute', 'Error rate (uncorrected)'],
      te.blocks.map((b) => [
        b.block,
        fmtCI(b.cpm, 1),
        fmtNum(b.cpm.mean / 5, 1),
        `${pct(b.error.mean)} [${pct(b.error.lo)}, ${pct(b.error.hi)}]`,
      ]),
      [true, true, true, true],
    ),
  });
}

// ------------------------------------------------------------------ frame rate

function fpsChart(r: SiteResults): void {
  const fig = byId('fig-fps');
  const holder = byId('fps-chart');
  if (!fig || !holder) return;
  const pts = r.fps ?? [];
  if (!pts.length) {
    chartMessage(holder, 'No frame-rate data yet.');
    return;
  }
  responsive(holder, (w) => {
    const height = w < 520 ? 260 : 300;
    const m = { top: 30, right: 24, bottom: 52, left: 56 };
    const innerW = Math.max(120, w - m.left - m.right);
    const innerH = height - m.top - m.bottom;
    const svg = freshSvg(
      holder,
      w,
      height,
      'Scatter plot of duration error against measured frame rate, with a dashed one-frame-interval curve.',
    );
    const g: G = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);
    const fx = [min(pts, (p) => p.fps) ?? 15, max(pts, (p) => p.fps) ?? 30];
    const x = scaleLinear()
      .domain([Math.max(1, Math.floor(fx[0]! - 3)), Math.ceil(fx[1]! + 3)])
      .range([0, innerW]);
    const yTop = Math.max(max(pts, (p) => p.duration_error_ms) ?? 0, 1000 / x.domain()[0]!);
    const y = scaleLinear()
      .domain([0, yTop * 1.1])
      .range([innerH, 0])
      .nice();
    gridY(g, y, 5, innerW);
    xAxis(g, x, innerH, 6, 'measured frame rate (fps)', innerW);
    yAxis(g, y, 5, 'duration error (ms)');
    const [a, b] = x.domain() as [number, number];
    const curve: [number, number][] = [];
    for (let f = a; f <= b; f += 0.25) curve.push([x(f), y(1000 / f)]);
    g.append('path')
      .attr('class', 'frame-curve')
      .attr('d', line()(curve) ?? '');
    g.append('text')
      .attr('class', 'edge-label')
      .attr('x', x(a) + 6)
      .attr('y', Math.max(12, y(1000 / a) - 8))
      .text('one frame interval');
    for (const p of pts) {
      g.append('circle')
        .attr('class', 'mean-dot')
        .attr('cx', x(p.fps))
        .attr('cy', y(p.duration_error_ms))
        .attr('r', 6)
        .append('title')
        .text(`${p.p}: ${p.fps.toFixed(1)} fps, ${p.duration_error_ms.toFixed(0)} ms`);
      if (pts.length <= 14 && w >= 420) {
        g.append('text')
          .attr('class', 'point-label')
          .attr('x', x(p.fps) + 9)
          .attr('y', y(p.duration_error_ms) + 4)
          .text(p.p);
      }
    }
  });
  const s = [...pts].sort((a, b) => a.fps - b.fps);
  figureParts(fig, r, {
    downloadKeys: ['fps', 'frame_rate'],
    intervals: false,
    extraMeta: 'Each point is one participant.',
    summary:
      `Measured frame rates ranged from ${s[0]!.fps.toFixed(1)} to ${s[s.length - 1]!.fps.toFixed(1)} fps ` +
      `(one frame = ${(1000 / s[s.length - 1]!.fps).toFixed(0)}–${(1000 / s[0]!.fps).toFixed(0)} ms).`,
    table: dataTable(
      'Duration error and frame rate per participant',
      ['Participant', 'Frame rate (fps)', 'Frame interval (ms)', 'Duration error (ms)'],
      s.map((p) => [
        p.p,
        p.fps.toFixed(1),
        p.frame_interval_ms.toFixed(1),
        p.duration_error_ms.toFixed(1),
      ]),
      [false, true, true, true],
    ),
  });
}

// ------------------------------------------------------------------ paper: BibTeX copy

function bibtexCopy(): void {
  const btn = byId<HTMLButtonElement>('bibtex-copy');
  const pre = byId('bibtex');
  const status = byId('bibtex-status');
  if (!btn || !pre || !status) return;
  btn.addEventListener('click', async () => {
    const textToCopy = pre.textContent ?? '';
    try {
      await navigator.clipboard.writeText(textToCopy);
      status.textContent = 'Copied.';
    } catch {
      const range = document.createRange();
      range.selectNodeContents(pre);
      const s = getSelection();
      s?.removeAllRanges();
      s?.addRange(range);
      status.textContent = 'Selected: press Ctrl+C (or Cmd+C) to copy.';
    }
    window.setTimeout(() => (status.textContent = ''), 4000);
  });
}

// ------------------------------------------------------------------ boot

function noData(): void {
  const status = byId('results-status');
  if (status) {
    status.textContent =
      'Results are not available yet. Study A is in progress; results are expected in November 2026.';
  }
  for (const id of ['dur-chart', 'det-chart', 'kshot-chart', 'text-cpm', 'fps-chart']) {
    const h = byId(id);
    if (h) chartMessage(h, 'No results yet.');
  }
  document
    .querySelectorAll<HTMLElement>('.chart-controls, .readouts, #dur-legend')
    .forEach((el) => (el.hidden = true));
}

bibtexCopy();

loadResults().then((r) => {
  if (!r) {
    noData();
    return;
  }
  const status = byId('results-status');
  if (status) {
    status.textContent = r.synthetic
      ? 'The study has not been analysed yet. Until it is, these charts show synthetic data, so that the analysis and this page can be tested end to end.'
      : `Study A: N = ${r.n_participants} participants. Generated ${new Date(r.generated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} from the logged data by the analysis scripts.`;
  }
  const banner = byId('synthetic-banner');
  if (banner) banner.hidden = !r.synthetic;
  const limits = byId('limits-lede');
  if (limits && !r.synthetic && r.n_participants > 0) {
    limits.textContent =
      `Participants were ${r.n_participants} able-bodied adult volunteers. The system has not been ` +
      'tested with people with motor impairments, and no clinical claim is made.';
  }
  const labelOf = (id: string) => r.detectors?.find((d) => d.id === id)?.label ?? id;
  durationExplorer(r);
  detectorChart(r);
  kshotChart(r, labelOf);
  textEntryChart(r);
  fpsChart(r);
});
