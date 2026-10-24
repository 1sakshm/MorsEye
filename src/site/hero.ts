import { gsap } from 'gsap';
import { Decoder, encode, type DecoderAction } from '../decode/decoder';
import { fitThreshold } from '../detect/calibration';
import { segment, type Timing } from '../segment/segmenter';
import { closureForEar, earAt, EyeDrawing, EYE_VIEW, svgEl } from './eye';
import { prefersReducedMotion } from './motion';

/**
 * The home-page hero (PRD §6.4): a drawn eye blinks a message in Morse, marks are inked onto a
 * moving tape, letters appear when the real decoder would commit them, and the EAR of the
 * drawing is traced against the calibrated threshold.
 *
 * Everything is generated from `{ text, timing }`: closure durations are the middle of the
 * segmenter's dot/dash bands, and letter/space times come from running the app's own
 * Decoder over the schedule. Change the timing and the animation changes with it.
 */

export interface HeroSymbol {
  symbol: '.' | '-';
  /** Threshold crossing down (first closed frame) and up (first open frame), ms. */
  start: number;
  end: number;
}

export interface HeroLetter {
  char: string;
  /** Start of its first symbol and end of its last, ms. */
  first: number;
  last: number;
  /** When the decoder commits it, ms. */
  commit: number;
}

export interface HeroSchedule {
  symbols: HeroSymbol[];
  letters: HeroLetter[];
  spaces: number[];
  /** Loop length, ms. */
  duration: number;
  dotMs: number;
  dashMs: number;
  symbolGapMs: number;
}

const LEAD_MS = 700;
/** Lid travel times (the drawn lid passes the threshold part-way through each). */
const DOWN_MS = 110;
const UP_MS = 170;

export function buildSchedule(text: string, timing: Timing): HeroSchedule {
  const dotMs = Math.round((timing.rejectMs + timing.dotMaxMs) / 2);
  const dashMs = Math.round((timing.dotMaxMs + timing.dashMaxMs) / 2);
  const symbolGapMs = Math.round(timing.letterGapMs * 0.3);
  // Start the next letter shortly after the previous one is committed, well before a word gap.
  const nextLetterMs = Math.round(
    Math.min(timing.letterGapMs + 450, (timing.letterGapMs + timing.wordGapMs) / 2),
  );

  const symbols: HeroSymbol[] = [];
  let t = LEAD_MS;
  const words = encode(text).split(' / ');
  words.forEach((word, wi) => {
    const letters = word.split(' ');
    letters.forEach((pattern, li) => {
      [...pattern].forEach((s, si) => {
        const d = s === '.' ? dotMs : dashMs;
        symbols.push({ symbol: s as '.' | '-', start: t, end: t + d });
        t += d;
        if (si < pattern.length - 1) t += symbolGapMs;
      });
      if (li < letters.length - 1) t += nextLetterMs;
    });
    if (wi < words.length - 1) t += timing.wordGapMs + 600;
  });
  const lastEnd = t;
  const duration = lastEnd + timing.wordGapMs + 900;

  // Run the real decoder over the schedule to find when letters and spaces are committed.
  const dec = new Decoder(timing);
  const letters: HeroLetter[] = [];
  const spaces: number[] = [];
  let pending: HeroSymbol[] = [];
  let next = 0;
  const record = (acts: DecoderAction[], at: number) => {
    for (const a of acts) {
      if (a.type === 'letter' && pending.length) {
        letters.push({
          char: a.char,
          first: pending[0]!.start,
          last: pending[pending.length - 1]!.end,
          commit: at,
        });
        pending = [];
      } else if (a.type === 'space') {
        spaces.push(at);
      }
    }
  };
  for (let now = 0; now <= duration; now += 5) {
    while (next < symbols.length && symbols[next]!.end <= now) {
      const s = symbols[next]!;
      const seg = segment(
        { start_ms: s.start, end_ms: s.end, duration_ms: s.end - s.start, eye: 'both' },
        timing,
      );
      record(dec.push(seg), s.start);
      pending.push(s);
      next++;
    }
    const closed = symbols.some((s) => now >= s.start && now < s.end);
    record(dec.tick(now, closed), now);
  }

  return { symbols, letters, spaces, duration, dotMs, dashMs, symbolGapMs };
}

/** Time fraction u at which an ease reaches value y (eases are monotonic). */
function inverseEase(ease: (u: number) => number, y: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (ease(mid) < y) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const DOWN_EASE = 'power2.in';
const UP_EASE = 'power1.out';

export interface HeroOptions {
  eyeSvg: SVGSVGElement;
  traceSvg: SVGSVGElement;
  tapeSvg: SVGSVGElement;
  toggle: HTMLButtonElement;
  text: string;
  timing: Timing;
}

/** EAR window shown in the trace, ms. */
const TRACE_WINDOW = 8000;
const EAR_MAX = 0.36;

export function mountHero(o: HeroOptions): { schedule: HeroSchedule; threshold: number } {
  const schedule = buildSchedule(o.text, o.timing);

  // Calibrate on the drawing itself, with the app's formula, exactly as a user would be calibrated.
  const cal = fitThreshold('ear', [earAt(0)], [earAt(1)]);
  const thr = cal.thr;
  const cStar = closureForEar(thr);

  // ---- eye
  o.eyeSvg.setAttribute('viewBox', `0 0 ${EYE_VIEW.width} ${EYE_VIEW.height}`);
  const eye = new EyeDrawing(o.eyeSvg, 'hero-eye');

  // ---- timeline: the lid is tweened so that it crosses the threshold exactly at each symbol's
  // start and end; `clock` carries loop time for the tape.
  const lid = { c: 0 };
  const clock = { t: 0 };
  const downU = inverseEase(gsap.parseEase(DOWN_EASE), cStar);
  const upU = inverseEase(gsap.parseEase(UP_EASE), 1 - cStar);
  const tl = gsap.timeline({ repeat: -1, paused: true, onUpdate: () => draw() });
  tl.to(clock, { t: schedule.duration, duration: schedule.duration / 1000, ease: 'none' }, 0);
  for (const s of schedule.symbols) {
    tl.to(
      lid,
      { c: 1, duration: DOWN_MS / 1000, ease: DOWN_EASE },
      (s.start - downU * DOWN_MS) / 1000,
    );
    tl.to(lid, { c: 0, duration: UP_MS / 1000, ease: UP_EASE }, (s.end - upU * UP_MS) / 1000);
  }

  // ---- trace
  const trace = {
    path: svgEl('path', { class: 'trace-line' }, o.traceSvg),
    thrLine: svgEl('line', { class: 'trace-thr' }, o.traceSvg),
    thrLabel: svgEl('text', { class: 'trace-label' }, o.traceSvg),
    earLabel: svgEl('text', { class: 'trace-label' }, o.traceSvg),
    closed: svgEl('g', { class: 'trace-closed' }, o.traceSvg),
  };
  trace.thrLabel.textContent = `threshold ${thr.toFixed(2)}`;
  trace.earLabel.textContent = 'EAR';
  const samples: { g: number; ear: number }[] = [];

  // ---- tape
  const tapeG = svgEl('g', {}, o.tapeSvg);
  const head = svgEl('path', { class: 'tape-head' }, o.tapeSvg);
  const ITER = 4;
  const marks: SVGRectElement[] = [];
  const letterEls: SVGTextElement[] = [];
  for (let k = 0; k < ITER; k++) {
    for (let i = 0; i < schedule.symbols.length; i++) {
      marks.push(svgEl('rect', { class: 'tape-mark', rx: 5, ry: 5, height: 10 }, tapeG));
    }
    for (const l of schedule.letters) {
      const el = svgEl('text', { class: 'tape-letter', 'text-anchor': 'middle' }, tapeG);
      el.textContent = l.char;
      letterEls.push(el);
    }
  }

  let W = 400;
  /** Plot width: the trace runs in [0, PW]; its labels sit in a gutter to the right of the pen. */
  let PW = 300;
  let H = 72;
  let TW = 800;
  let headX = 400;
  let speed = 0.07;

  function layout(): void {
    const tr = o.traceSvg.getBoundingClientRect();
    W = Math.max(200, tr.width || 400);
    H = Math.max(50, tr.height || 72);
    o.traceSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const tp = o.tapeSvg.getBoundingClientRect();
    TW = Math.max(200, tp.width || 800);
    o.tapeSvg.setAttribute('viewBox', `0 0 ${TW} 84`);
    const er = o.eyeSvg.getBoundingClientRect();
    const eyeCenter = er.width ? er.left + er.width / 2 - tp.left : TW / 2;
    headX = Math.max(TW * 0.3, Math.min(TW * 0.86, eyeCenter));
    speed = TW < 640 ? 0.045 : 0.07;
    head.setAttribute('d', `M${headX - 7},0 L${headX + 7},0 L${headX},9 Z`);
    // The labels go in a gutter right of the pen, so the scrolling trace never runs through them.
    // The width estimate (12 px mono) covers the moment before the web font has loaded.
    const labelW = (el: SVGTextElement) =>
      Math.max(el.getComputedTextLength(), (el.textContent ?? '').length * 7.3);
    PW = Math.max(
      120,
      W - Math.ceil(Math.max(labelW(trace.thrLabel), labelW(trace.earLabel))) - 14,
    );
    const y = yOf(thr);
    trace.thrLine.setAttribute('x1', '0');
    trace.thrLine.setAttribute('x2', String(PW));
    trace.thrLine.setAttribute('y1', y.toFixed(1));
    trace.thrLine.setAttribute('y2', y.toFixed(1));
    trace.thrLabel.setAttribute('x', String(PW + 8));
    trace.thrLabel.setAttribute('y', (y + 4).toFixed(1));
    // "EAR" names the line at its open-eye level, next to where new samples arrive.
    trace.earLabel.setAttribute('x', String(PW + 8));
    trace.earLabel.setAttribute('y', (yOf(earAt(0)) + 4).toFixed(1));
  }

  const yOf = (e: number) => H - 8 - (Math.min(e, EAR_MAX) / EAR_MAX) * (H - 20);

  // GSAP can report a stale total time for one render while a repeat wraps around, so the
  // clock only moves forward, except while stillFrame() seeks on purpose.
  let nowMs = 0;
  let seeking = false;
  const globalTime = () => nowMs;

  function sample(): void {
    const g = globalTime();
    const last = samples[samples.length - 1];
    if (last && g <= last.g) return;
    samples.push({ g, ear: earAt(lid.c) });
    while (samples.length > 2 && samples[0]!.g < g - TRACE_WINDOW - 200) samples.shift();
  }

  function drawTrace(): void {
    const g = globalTime();
    const x = (t: number) => PW - ((g - t) / TRACE_WINDOW) * PW;
    let d = '';
    for (const s of samples) d += `${d ? 'L' : 'M'}${x(s.g).toFixed(1)},${yOf(s.ear).toFixed(1)}`;
    trace.path.setAttribute('d', d);
    // Closed intervals (EAR below threshold), drawn as bars along the bottom.
    trace.closed.replaceChildren();
    let runStart: number | null = null;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]!;
      const below = s.ear < thr;
      if (below && runStart === null) runStart = s.g;
      if ((!below || i === samples.length - 1) && runStart !== null) {
        const x0 = x(runStart);
        const x1 = x(s.g);
        svgEl(
          'rect',
          { x: x0, y: H - 5, width: Math.max(1, x1 - x0), height: 4, rx: 2 },
          trace.closed,
        );
        runStart = null;
      }
    }
  }

  function drawTape(): void {
    const g = globalTime();
    const D = schedule.duration;
    const jNow = Math.floor(g / D);
    const midY = 30;
    let mi = 0;
    let li = 0;
    for (let k = 0; k < ITER; k++) {
      const j = jNow - (ITER - 1) + k;
      const base = j * D;
      for (const s of schedule.symbols) {
        const el = marks[mi++]!;
        const gs = base + s.start;
        if (j < 0 || gs > g) {
          el.setAttribute('width', '0');
          continue;
        }
        const ge = Math.min(base + s.end, g);
        const left = headX - (g - gs) * speed;
        const right = headX - (g - ge) * speed;
        el.setAttribute('x', left.toFixed(1));
        el.setAttribute('y', String(midY - 5));
        el.setAttribute('width', Math.max(0, right - left).toFixed(1));
      }
      for (const l of schedule.letters) {
        const el = letterEls[li++]!;
        const gc = base + l.commit;
        if (j < 0 || gc > g) {
          el.setAttribute('opacity', '0');
          continue;
        }
        const cx = headX - (g - (base + (l.first + l.last) / 2)) * speed;
        el.setAttribute('x', cx.toFixed(1));
        el.setAttribute('y', '66');
        el.setAttribute('opacity', Math.min(1, (g - gc) / 350).toFixed(2));
      }
    }
  }

  function draw(): void {
    const t = tl.totalTime() * 1000;
    if (t >= nowMs || seeking) nowMs = t;
    eye.set(lid.c);
    sample();
    drawTrace();
    drawTape();
  }

  /** A still frame with the tape already filled (reduced motion, or before playing). */
  function stillFrame(): void {
    const D = schedule.duration;
    const end = 2 * D - 450;
    seeking = true;
    samples.length = 0;
    // Each seek renders the timeline, and draw() records one trace sample per step.
    for (let g = end - TRACE_WINDOW; g <= end; g += 20) tl.totalTime(Math.max(0, g) / 1000);
    tl.totalTime(end / 1000);
    seeking = false;
  }

  // ---- controls
  let userPaused = prefersReducedMotion();
  let visible = true;
  const setButton = () => {
    o.toggle.textContent = userPaused ? 'Play animation' : 'Pause animation';
  };
  const apply = () => {
    if (!userPaused && visible) tl.play();
    else tl.pause();
    setButton();
  };
  o.toggle.addEventListener('click', () => {
    userPaused = !userPaused;
    apply();
  });

  // Start from a filled frame (tape and trace already have history) and play on from there.
  layout();
  stillFrame();
  apply();

  const ro = new ResizeObserver(() => {
    layout();
    if (tl.paused()) {
      drawTrace();
      drawTape();
    }
  });
  ro.observe(o.tapeSvg);
  ro.observe(o.eyeSvg);

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      apply();
    }).observe(o.eyeSvg);
  }

  return { schedule, threshold: thr };
}
