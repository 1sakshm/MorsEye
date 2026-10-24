import { fitThreshold, mulberry32 } from '../detect/calibration';
import {
  detectAll,
  FIXED_EAR,
  HysteresisDetector,
  SIGNALS,
  type Threshold,
} from '../detect/detector';
import { band, DEFAULT_TIMING as T, type Band } from '../segment/segmenter';
import type { FrameFeatures } from '../types';
import { earAt, earPoints, eyeShape, EyeDrawing, EYE_VIEW, svgEl } from './eye';
import { LEFT_EYE_CENTER, syntheticFace } from './face';
import { buildSchedule } from './hero';

/**
 * The six steps of the /how scroll story (PRD §6.5). Each step draws into an SVG group in an
 * 800×600 coordinate space and exposes render(p) for p in 0..1, so the same code serves the
 * pinned, scroll-scrubbed stage and the static figures shown for reduced motion / small screens.
 */

export const STAGE = { width: 800, height: 600 } as const;

export interface Step {
  render(p: number): void;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Progress of p within [a, b], clamped. */
const span = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const f1 = (n: number) => n.toFixed(1);

function text(
  parent: Element,
  x: number,
  y: number,
  s: string,
  cls: string,
  anchor = 'start',
): SVGTextElement {
  const t = svgEl('text', { x, y, class: cls, 'text-anchor': anchor }, parent);
  t.textContent = s;
  return t;
}

// ---------------------------------------------------------------- 1. face to points

const FACE_SCALE = 205;
const FACE_CX = 400;
const FACE_CY = 300;

export class FaceStep implements Step {
  private readonly dots: SVGCircleElement[] = [];
  private readonly order: number[];

  constructor(root: SVGGElement) {
    const g = svgEl('g', { class: 'face' }, root);
    const pts = syntheticFace();
    for (const p of pts) {
      this.dots.push(
        svgEl(
          'circle',
          {
            cx: f1(FACE_CX + p.x * FACE_SCALE),
            cy: f1(FACE_CY + p.y * FACE_SCALE),
            r: p.part === 'mesh' ? 2 : 2.6,
            class: `face-pt face-pt--${p.part}`,
          },
          g,
        ),
      );
    }
    // Reveal in a scattered but fixed order, so the face "condenses" out of points.
    const rng = mulberry32(468);
    this.order = pts.map((_, i) => i).sort(() => rng() - 0.5);
  }

  render(p: number): void {
    const shown = Math.round(easeInOut(span(p, 0.02, 0.75)) * this.dots.length);
    this.order.forEach((idx, rank) => {
      this.dots[idx]!.style.opacity = rank < shown ? '1' : '0';
    });
  }
}

// ---------------------------------------------------------------- 2. eye to six points

const EYE_SCALE = 1.7;
const EYE_X = STAGE.width / 2 - (EYE_VIEW.width * EYE_SCALE) / 2;
const EYE_Y = 70;

export class EyeStep implements Step {
  private readonly zoomFace: SVGGElement;
  private readonly eyeG: SVGGElement;
  private readonly eye: EyeDrawing;
  private readonly lines: SVGLineElement[] = [];
  private readonly labels: SVGTextElement[] = [];
  private readonly terms: SVGTSpanElement[] = [];
  private readonly value: SVGTextElement;

  constructor(root: SVGGElement, id: string) {
    // A faint copy of the face that zooms toward the eye, then hands over to the detailed eye.
    this.zoomFace = svgEl('g', { class: 'face face--ghost' }, root);
    for (const p of syntheticFace()) {
      svgEl(
        'circle',
        {
          cx: f1(FACE_CX + p.x * FACE_SCALE),
          cy: f1(FACE_CY + p.y * FACE_SCALE),
          r: 2,
          class: 'face-pt',
        },
        this.zoomFace,
      );
    }
    this.eyeG = svgEl('g', { transform: `translate(${EYE_X} ${EYE_Y}) scale(${EYE_SCALE})` }, root);
    this.eye = new EyeDrawing(this.eyeG, `${id}-eye`);
    for (let i = 0; i < 3; i++) {
      this.lines.push(
        svgEl(
          'line',
          { class: i < 2 ? 'ear-line ear-line--v' : 'ear-line ear-line--h' },
          this.eyeG,
        ),
      );
    }
    ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].forEach((s) =>
      this.labels.push(text(this.eyeG, 0, 0, s, 'pt-label')),
    );

    const formula = svgEl(
      'text',
      { x: 400, y: 520, class: 'formula', 'text-anchor': 'middle' },
      root,
    );
    const part = (s: string, cls = '') => {
      const t = svgEl('tspan', cls ? { class: cls } : {}, formula);
      t.textContent = s;
      return t;
    };
    part('EAR = (');
    this.terms.push(part('|p2 − p6|', 'term term--v'));
    part(' + ');
    this.terms.push(part('|p3 − p5|', 'term term--v'));
    part(') / (2 · ');
    this.terms.push(part('|p1 − p4|', 'term term--h'));
    part(')');
    this.value = text(root, 400, 560, '', 'formula-value', 'middle');
  }

  render(p: number): void {
    // Zoom: the face scales up around the eye and fades; the detailed eye fades in.
    const z = easeInOut(span(p, 0, 0.4));
    const s = lerp(1, 6, z);
    const ex = FACE_CX + LEFT_EYE_CENTER.x * FACE_SCALE;
    const ey = FACE_CY + LEFT_EYE_CENTER.y * FACE_SCALE;
    const tx = lerp(0, 400 - ex * s, z);
    const ty = lerp(0, 230 - ey * s, z);
    this.zoomFace.setAttribute(
      'transform',
      `translate(${f1(tx)} ${f1(ty)}) scale(${s.toFixed(3)})`,
    );
    this.zoomFace.style.opacity = String(1 - span(p, 0.2, 0.42));
    this.eyeG.style.opacity = String(span(p, 0.28, 0.45));

    // The lid closes a little at the end, to show the EAR falling.
    const c = 0.82 * easeInOut(span(p, 0.86, 1));
    this.eye.set(c);
    const [p1, p2, p3, p4, p5, p6] = earPoints(eyeShape(c));
    const draw = [span(p, 0.45, 0.58), span(p, 0.55, 0.68), span(p, 0.65, 0.8)];
    const seg: [typeof p1, typeof p1][] = [
      [p2, p6],
      [p3, p5],
      [p1, p4],
    ];
    seg.forEach(([a, b], i) => {
      const k = draw[i]!;
      const l = this.lines[i]!;
      l.setAttribute('x1', f1(a.x));
      l.setAttribute('y1', f1(a.y));
      l.setAttribute('x2', f1(lerp(a.x, b.x, k)));
      l.setAttribute('y2', f1(lerp(a.y, b.y, k)));
      l.style.opacity = k > 0 ? '1' : '0';
      this.terms[i]!.classList.toggle('is-active', k > 0 && (k < 1 || p > 0.8));
    });
    const labelPos = [
      { pt: p1, dx: -26, dy: 5 },
      { pt: p2, dx: -8, dy: -12 },
      { pt: p3, dx: -8, dy: -12 },
      { pt: p4, dx: 10, dy: 5 },
      { pt: p5, dx: -8, dy: 24 },
      { pt: p6, dx: -8, dy: 24 },
    ];
    labelPos.forEach(({ pt, dx, dy }, i) => {
      const t = this.labels[i]!;
      t.setAttribute('x', f1(pt.x + dx));
      t.setAttribute('y', f1(pt.y + dy));
      t.style.opacity = String(span(p, 0.4, 0.5));
    });
    this.value.textContent =
      p > 0.8 ? `= ${earAt(c).toFixed(2)} for this drawing${c > 0.05 ? ', closing' : ''}` : '';
  }
}

// ---------------------------------------------------------------- 3. signal over time

/** Illustrative synthetic EAR signal (not participant data): 10 s at 30 fps. */
export function syntheticSignal(): {
  frames: FrameFeatures[];
  events: { t: number; d: number; kind: 'spontaneous' | 'deliberate' }[];
} {
  const rng = mulberry32(2016);
  const events = [
    { t: 1200, d: 150, kind: 'spontaneous' as const },
    { t: 2600, d: 420, kind: 'deliberate' as const },
    { t: 4300, d: 170, kind: 'spontaneous' as const },
    { t: 5600, d: 950, kind: 'deliberate' as const },
    { t: 8200, d: 140, kind: 'spontaneous' as const },
  ];
  // Brief squints dip toward, but not to, closed.
  const squints = [
    { t: 3500, d: 260, depth: 0.205 },
    { t: 7300, d: 300, depth: 0.2 },
    { t: 9300, d: 220, depth: 0.206 },
  ];
  const open = 0.232;
  const closed = 0.085;
  let noise = 0;
  const frames: FrameFeatures[] = [];
  for (let i = 0; i <= 300; i++) {
    const t = Math.round((i * 1000) / 30);
    noise = 0.7 * noise + 0.3 * (rng() - 0.5) * 0.03;
    let v = open + noise;
    for (const e of events) {
      // Closing ramp (2 frames) in, hold, opening ramp (3 frames) out.
      const into = (t - e.t) / 66;
      const out = (t - (e.t + e.d)) / 100;
      if (t >= e.t - 66 && t < e.t) v = lerp(open, closed, clamp01(1 + into));
      else if (t >= e.t && t < e.t + e.d) v = closed + noise * 0.3;
      else if (t >= e.t + e.d && t < e.t + e.d + 100) v = lerp(closed, open, clamp01(out));
    }
    for (const s of squints) {
      if (t >= s.t && t < s.t + s.d) {
        const k = Math.sin((Math.PI * (t - s.t)) / s.d);
        v = Math.min(v, lerp(open, s.depth, k) + noise * 0.3);
      }
    }
    frames.push({
      t_ms: t,
      face: true,
      earL: v,
      earR: v,
      blinkL: 0,
      blinkR: 0,
      yaw: 0,
      pitch: 0,
      roll: 0,
    });
  }
  return { frames, events };
}

export interface SignalSummary {
  fixedCount: number;
  calibratedCount: number;
  realCount: number;
  calibrated: Threshold;
}

/**
 * Calibrates on the synthetic signal exactly as the app does (open samples, and the deepest
 * point of each deliberate closure), then counts what the real detector finds at each threshold.
 */
export function signalSummary(): SignalSummary {
  const { frames, events } = syntheticSignal();
  const busy = (t: number) => events.some((e) => t >= e.t - 100 && t < e.t + e.d + 150);
  const openSamples = frames.filter((f) => !busy(f.t_ms)).map((f) => f.earL);
  const peaks = events
    .filter((e) => e.kind === 'deliberate')
    .map((e) =>
      Math.min(...frames.filter((f) => f.t_ms >= e.t && f.t_ms < e.t + e.d).map((f) => f.earL)),
    );
  const cal = fitThreshold('ear', openSamples, peaks);
  const calibrated = { thr: cal.thr, h: cal.h };
  const count = (t: Threshold) =>
    detectAll(new HysteresisDetector(SIGNALS.earMean, t), frames).length;
  return {
    fixedCount: count(FIXED_EAR),
    calibratedCount: count(calibrated),
    realCount: events.length,
    calibrated,
  };
}

const PLOT = { x0: 70, x1: 760, y0: 110, y1: 430 };
const EAR_TOP = 0.3;

export class SignalStep implements Step {
  private readonly path: SVGPathElement;
  private readonly clip: SVGRectElement;
  private readonly thrLine: SVGLineElement;
  private readonly thrLabel: SVGTextElement;
  private readonly bars: SVGGElement;
  private readonly count: SVGTextElement;
  private readonly notes: SVGGElement;
  private readonly frames: FrameFeatures[];
  private readonly calibrated: Threshold;
  readonly summary: SignalSummary;

  constructor(root: SVGGElement, id: string) {
    const { frames, events } = syntheticSignal();
    this.frames = frames;
    this.summary = signalSummary();
    this.calibrated = this.summary.calibrated;

    const x = (t: number) => PLOT.x0 + (t / 10000) * (PLOT.x1 - PLOT.x0);
    const y = (v: number) => PLOT.y1 - (v / EAR_TOP) * (PLOT.y1 - PLOT.y0);

    // Axes.
    const axes = svgEl('g', { class: 'axis' }, root);
    svgEl('line', { x1: PLOT.x0, x2: PLOT.x1, y1: PLOT.y1, y2: PLOT.y1 }, axes);
    svgEl('line', { x1: PLOT.x0, x2: PLOT.x0, y1: PLOT.y0, y2: PLOT.y1 }, axes);
    for (const v of [0, 0.1, 0.2, 0.3]) {
      text(axes, PLOT.x0 - 10, y(v) + 5, v.toFixed(1), 'axis-label', 'end');
      svgEl('line', { x1: PLOT.x0 - 5, x2: PLOT.x0, y1: y(v), y2: y(v) }, axes);
    }
    for (let s = 0; s <= 10; s += 2) {
      text(axes, x(s * 1000), PLOT.y1 + 24, `${s} s`, 'axis-label', 'middle');
    }
    text(axes, PLOT.x0, PLOT.y0 - 18, 'EAR', 'axis-title');

    const defs = svgEl('defs', {}, root);
    const cp = svgEl('clipPath', { id: `${id}-reveal` }, defs);
    this.clip = svgEl('rect', { x: PLOT.x0, y: 0, width: 0, height: STAGE.height }, cp);

    const content = svgEl('g', { 'clip-path': `url(#${id}-reveal)` }, root);
    let d = '';
    for (const f of frames) d += `${d ? 'L' : 'M'}${f1(x(f.t_ms))},${f1(y(f.earL))}`;
    this.path = svgEl('path', { d, class: 'signal-line' }, content);
    this.bars = svgEl('g', { class: 'detected' }, content);

    this.notes = svgEl('g', { class: 'notes' }, content);
    const sp = events[0]!;
    const de = events[3]!;
    const note = (e: { t: number; d: number }, label: string, dy: number) => {
      const cx = x(e.t + e.d / 2);
      svgEl(
        'line',
        { x1: cx, x2: cx, y1: y(0.085) + 8, y2: y(0.085) + dy - 14, class: 'note-line' },
        this.notes,
      );
      text(this.notes, cx, y(0.085) + dy, label, 'note-label', 'middle');
    };
    note(sp, 'spontaneous blink', 42);
    note(de, 'deliberate closure', 42);

    this.thrLine = svgEl('line', { x1: PLOT.x0, x2: PLOT.x1, class: 'thr-line' }, root);
    this.thrLabel = text(root, PLOT.x1, 0, '', 'thr-label', 'end');
    this.count = text(root, PLOT.x0, PLOT.y1 + 62, '', 'count-label');

    this.x = x;
    this.y = y;
  }

  private readonly x: (t: number) => number;
  private readonly y: (v: number) => number;

  render(p: number): void {
    const reveal = easeInOut(span(p, 0, 0.45));
    this.clip.setAttribute('width', f1((PLOT.x1 - PLOT.x0 + 10) * reveal));
    this.notes.style.opacity = String(span(p, 0.3, 0.45));

    const k = easeInOut(span(p, 0.55, 0.85));
    const t: Threshold = {
      thr: lerp(FIXED_EAR.thr, this.calibrated.thr, k),
      h: lerp(FIXED_EAR.h, this.calibrated.h, k),
    };
    const yy = this.y(t.thr);
    this.thrLine.setAttribute('y1', f1(yy));
    this.thrLine.setAttribute('y2', f1(yy));
    this.thrLabel.setAttribute('y', f1(yy - 8));
    this.thrLabel.textContent =
      k <= 0
        ? `fixed threshold ${t.thr.toFixed(2)}`
        : k >= 1
          ? `calibrated threshold ${t.thr.toFixed(2)}`
          : `threshold ${t.thr.toFixed(3)}`;

    // Run the app's own detector at the current threshold and draw what it finds.
    const found = detectAll(new HysteresisDetector(SIGNALS.earMean, t), this.frames);
    this.bars.replaceChildren();
    for (const c of found) {
      svgEl(
        'rect',
        {
          x: f1(this.x(c.start_ms)),
          width: f1(Math.max(3, this.x(c.end_ms) - this.x(c.start_ms))),
          y: PLOT.y1 - 12,
          height: 8,
          rx: 3,
        },
        this.bars,
      );
    }
    this.count.textContent =
      p > 0.05
        ? `Detector finds ${found.length} closure${found.length === 1 ? '' : 's'} (the signal has ${this.summary.realCount} real ones)`
        : '';
    this.count.style.opacity = String(span(p, 0.4, 0.5));
  }
}

// ---------------------------------------------------------------- 4. duration to symbol

const BAND_ORDER: Band[] = ['reject', 'dot', 'dash', 'hold', 'backspace'];
const BAND_NAME: Record<Band, string> = {
  reject: 'ignored',
  dot: 'dot ·',
  dash: 'dash −',
  hold: 'no symbol',
  backspace: 'delete',
};
const BAND_CLASS: Record<Band, string> = {
  reject: 'reject',
  dot: 'dot',
  dash: 'dash',
  hold: 'hold',
  backspace: 'delete',
};
const DUR_MAX = 2600;

export class DurationStep implements Step {
  private readonly items: {
    bar: SVGRectElement;
    end: SVGCircleElement;
    d: number;
    row: number;
    band: Band;
  }[] = [];
  private readonly glyphs: SVGTextElement[] = [];
  private readonly X = (d: number) => 70 + (d / DUR_MAX) * 690;

  constructor(root: SVGGElement) {
    const X = this.X;
    const edges = [0, T.rejectMs, T.dotMaxMs, T.dashMaxMs, T.cmdMs, DUR_MAX];
    BAND_ORDER.forEach((b, i) => {
      const x0 = X(edges[i]!);
      const x1 = X(edges[i + 1]!);
      svgEl(
        'rect',
        { x: x0, y: 92, width: x1 - x0, height: 400, class: `band-col band-col--${BAND_CLASS[b]}` },
        root,
      );
      // Narrow bands get their name on a second line so neighbouring names do not collide.
      const y = x1 - x0 < BAND_NAME[b].length * 11.5 + 8 ? 556 : 528;
      this.glyphs.push(
        text(
          root,
          (x0 + x1) / 2,
          y,
          BAND_NAME[b],
          `band-name band-name--${BAND_CLASS[b]}`,
          'middle',
        ),
      );
    });
    const axis = svgEl('g', { class: 'axis' }, root);
    svgEl('line', { x1: 70, x2: 760, y1: 492, y2: 492 }, axis);
    for (const e of edges.slice(1, -1)) {
      svgEl('line', { x1: X(e), x2: X(e), y1: 92, y2: 498, class: 'band-edge' }, axis);
      text(axis, X(e), 84, `${e}`, 'axis-label', 'middle');
    }
    text(axis, 70, 60, 'closure duration (ms)', 'axis-title');

    const durations = [460, 150, 1150, 2300, 330, 180, 1650, 820];
    durations.forEach((d, row) => {
      const bar = svgEl('rect', { x: 70, height: 12, rx: 6, class: 'dur-bar' }, root);
      const end = svgEl('circle', { r: 8, class: 'dur-end' }, root);
      this.items.push({ bar, end, d, row, band: band(d, T) });
    });
  }

  render(p: number): void {
    const X = this.X;
    this.items.forEach((it, i) => {
      const q = span(p, 0.08 + i * 0.07, 0.42 + i * 0.07);
      const rowY = 120 + it.row * 30;
      const xEnd = X(it.d);
      // Phase A: the bar shrinks to its end point; phase B: the end point drops into its band.
      const a = easeInOut(clamp01(q * 2));
      const b = clamp01(q * 2 - 1);
      const left = lerp(70, xEnd, a);
      it.bar.setAttribute('x', f1(left));
      it.bar.setAttribute('y', f1(rowY - 6));
      it.bar.setAttribute('width', f1(Math.max(0, xEnd - left)));
      const y = lerp(rowY, 466, b * b);
      it.end.setAttribute('cx', f1(xEnd));
      it.end.setAttribute('cy', f1(y));
      it.end.setAttribute('class', q > 0.3 ? `dur-end dur-end--${BAND_CLASS[it.band]}` : 'dur-end');
      it.bar.setAttribute('class', q > 0.3 ? `dur-bar dur-bar--${BAND_CLASS[it.band]}` : 'dur-bar');
    });
    this.glyphs.forEach((g) => (g.style.opacity = String(0.35 + 0.65 * span(p, 0.6, 0.9))));
  }
}

// ---------------------------------------------------------------- 5. gaps to letters and words

export class GapsStep implements Step {
  private readonly marks: { el: SVGRectElement; start: number; end: number }[] = [];
  private readonly letters: { el: SVGTextElement; bracket: SVGPathElement; commit: number }[] = [];
  private readonly words: SVGGElement;
  private readonly cursor: SVGLineElement;
  private readonly total: number;
  private readonly X: (t: number) => number;
  private readonly gapNotes: SVGGElement;

  constructor(root: SVGGElement) {
    const sched = buildSchedule('HI YOU', T);
    const first = sched.symbols[0]!.start;
    const last = sched.spaces[sched.spaces.length - 1] ?? sched.duration;
    this.total = last - first + 400;
    const X = (t: number) => 50 + ((t - first) / this.total) * 700;
    this.X = X;

    svgEl('rect', { x: 30, y: 200, width: 740, height: 70, class: 'story-tape' }, root);
    for (const s of sched.symbols) {
      const el = svgEl(
        'rect',
        { x: X(s.start), y: 229, height: 12, width: 0, rx: 6, class: 'tape-mark' },
        root,
      );
      this.marks.push({ el, start: s.start, end: s.end });
    }
    sched.letters.forEach((l) => {
      const x0 = X(l.first);
      const x1 = X(l.last);
      const bracket = svgEl(
        'path',
        { d: `M${f1(x0)},282 v8 H${f1(x1)} v-8`, class: 'letter-bracket' },
        root,
      );
      const el = text(root, (x0 + x1) / 2, 320, l.char, 'story-letter', 'middle');
      this.letters.push({ el, bracket, commit: l.commit });
    });

    // Word brackets.
    this.words = svgEl('g', { class: 'word-brackets' }, root);
    const wordsOf = [sched.letters.slice(0, 2), sched.letters.slice(2)];
    for (const w of wordsOf) {
      const x0 = X(w[0]!.first);
      const x1 = X(w[w.length - 1]!.last);
      svgEl('path', { d: `M${f1(x0)},344 v10 H${f1(x1)} v-10`, class: 'word-bracket' }, this.words);
      text(this.words, (x0 + x1) / 2, 386, w.map((l) => l.char).join(''), 'story-word', 'middle');
    }

    // Gap annotations: one within a letter, one between letters, one between words.
    this.gapNotes = svgEl('g', { class: 'gap-notes' }, root);
    const s = sched.symbols;
    const gap = (a: number, b: number, y: number, label: string) => {
      svgEl('path', { d: `M${f1(X(a))},${y} H${f1(X(b))}`, class: 'gap-arrow' }, this.gapNotes);
      svgEl(
        'path',
        { d: `M${f1(X(a))},${y - 6} v12 M${f1(X(b))},${y - 6} v12`, class: 'gap-arrow' },
        this.gapNotes,
      );
      // Centred on the gap, but kept inside the stage.
      const width = label.length * 10.5;
      const left = Math.max(24, Math.min(776 - width, (X(a) + X(b)) / 2 - width / 2));
      text(this.gapNotes, left, y - 12, label, 'gap-label');
    };
    gap(s[0]!.end, s[1]!.start, 186, `< ${(T.letterGapMs / 1000).toFixed(1)} s: same letter`);
    gap(
      sched.letters[0]!.last,
      sched.letters[1]!.first,
      150,
      `≥ ${(T.letterGapMs / 1000).toFixed(1)} s: letter`,
    );
    gap(
      sched.letters[1]!.last,
      sched.letters[2]!.first,
      114,
      `≥ ${(T.wordGapMs / 1000).toFixed(0)} s: space`,
    );

    this.cursor = svgEl('line', { y1: 205, y2: 265, class: 'tape-cursor' }, root);
  }

  render(p: number): void {
    // Time sweeps across the tape; marks ink as it passes, letters appear at their commit time.
    const first = this.marks[0]!.start;
    const now = first + easeInOut(span(p, 0, 0.75)) * this.total;
    for (const m of this.marks) {
      const e = Math.min(now, m.end);
      m.el.setAttribute('width', f1(Math.max(0, this.X(e) - this.X(m.start))));
    }
    for (const l of this.letters) {
      const o = clamp01((now - l.commit) / 400);
      l.el.style.opacity = String(o);
      l.bracket.style.opacity = String(o);
    }
    this.words.style.opacity = String(span(p, 0.78, 0.92));
    this.gapNotes.style.opacity = String(span(p, 0.8, 0.95));
    this.cursor.setAttribute('x1', f1(this.X(now)));
    this.cursor.setAttribute('x2', f1(this.X(now)));
    this.cursor.style.opacity = p < 0.78 ? '1' : '0';
  }
}

// ---------------------------------------------------------------- 6. your turn

export class TurnStep implements Step {
  private readonly eye: EyeDrawing;

  constructor(root: SVGGElement, id: string) {
    const g = svgEl('g', { transform: `translate(${EYE_X} 110) scale(${EYE_SCALE})` }, root);
    this.eye = new EyeDrawing(g, `${id}-eye`);
    text(root, 400, 520, 'Your turn.', 'turn-title', 'middle');
  }

  render(p: number): void {
    // One slow, deliberate blink as the step comes in.
    const c = p < 0.5 ? easeInOut(span(p, 0.2, 0.35)) : 1 - easeInOut(span(p, 0.45, 0.6));
    this.eye.set(c);
  }
}

export function makeStep(i: number, root: SVGGElement, id: string): Step {
  switch (i) {
    case 0:
      return new FaceStep(root);
    case 1:
      return new EyeStep(root, id);
    case 2:
      return new SignalStep(root, id);
    case 3:
      return new DurationStep(root);
    case 4:
      return new GapsStep(root);
    default:
      return new TurnStep(root, id);
  }
}
