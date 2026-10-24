import { ear, type Point } from '../vision/features';

/**
 * A drawn eye made of 30 landmark points: 11 on the upper lid (both corners included),
 * 9 on the lower lid and 10 around the iris. It is a parametric drawing, not a person.
 *
 * `closure` c runs from 0 (open) to 1 (closed). The upper lid travels down its own landmark
 * path to meet the lower lid, which rises a little, as real lids do. The EAR of the drawing is
 * computed with the app's own `ear()` from the same six points the app uses (corners p1/p4,
 * upper lid p2/p3, lower lid p6/p5), so the trace under the hero is a real EAR signal.
 */

export const EYE_VIEW = { width: 400, height: 220 } as const;

const LEFT = { x: 64, y: 116 };
const RIGHT = { x: 336, y: 108 };
const UPPER_RISE = 70;
const LOWER_DROP = 34;
/** Fraction of the lower lid height at which the closed lids meet. */
const MEET = 0.6;

export const IRIS_CENTER: Point = { x: 196, y: 104 };
export const IRIS_R = 48;

/** Indices of the six EAR points within `upper` and `lower`. */
export const EAR_POINTS = { p1: 0, p2: 3, p3: 7, p4: 10, p5: 6, p6: 2 } as const;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function baseline(s: number): Point {
  return { x: lerp(LEFT.x, RIGHT.x, s), y: lerp(LEFT.y, RIGHT.y, s) };
}

/** Lid bulge, slightly skewed toward the inner corner, like a real upper lid. */
function upperShape(s: number): number {
  return Math.pow(Math.sin(Math.PI * Math.pow(s, 0.92)), 0.85);
}

function lowerShape(s: number): number {
  return Math.pow(Math.sin(Math.PI * s), 1.15);
}

export interface EyeShape {
  /** 11 points, left corner to right corner. */
  upper: Point[];
  /** 9 interior points, left to right (the corners are shared with `upper`). */
  lower: Point[];
  /** 10 points around the iris. */
  iris: Point[];
}

export function eyeShape(closure: number): EyeShape {
  const c = Math.max(0, Math.min(1, closure));
  const upper: Point[] = [];
  for (let i = 0; i <= 10; i++) {
    const s = i / 10;
    const b = baseline(s);
    const open = b.y - UPPER_RISE * upperShape(s);
    const closed = b.y + MEET * LOWER_DROP * lowerShape(s) - 0.6;
    upper.push({ x: b.x, y: lerp(open, closed, c) });
  }
  const lower: Point[] = [];
  for (let i = 1; i <= 9; i++) {
    const s = i / 10;
    const b = baseline(s);
    const open = b.y + LOWER_DROP * lowerShape(s);
    const closed = b.y + MEET * LOWER_DROP * lowerShape(s) + 0.6;
    lower.push({ x: b.x, y: lerp(open, closed, c) });
  }
  const iris: Point[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    iris.push({ x: IRIS_CENTER.x + IRIS_R * Math.cos(a), y: IRIS_CENTER.y + IRIS_R * Math.sin(a) });
  }
  return { upper, lower, iris };
}

/** The six EAR points p1..p6 of a shape, in the order `ear()` expects. */
export function earPoints(e: EyeShape): [Point, Point, Point, Point, Point, Point] {
  const u = e.upper;
  const l = e.lower;
  return [
    u[EAR_POINTS.p1]!,
    u[EAR_POINTS.p2]!,
    u[EAR_POINTS.p3]!,
    u[EAR_POINTS.p4]!,
    l[EAR_POINTS.p5]!,
    l[EAR_POINTS.p6]!,
  ];
}

export function earAt(closure: number): number {
  return ear(earPoints(eyeShape(closure)));
}

/** Closure amount at which the drawing's EAR equals `thr` (EAR falls monotonically with c). */
export function closureForEar(thr: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (earAt(mid) > thr) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const f = (n: number) => n.toFixed(2);

/** Smooth path through points (Catmull-Rom converted to cubic Béziers). */
export function smoothPath(pts: readonly Point[], move = true): string {
  if (pts.length < 2) return '';
  let d = move ? `M${f(pts[0]!.x)},${f(pts[0]!.y)}` : `L${f(pts[0]!.x)},${f(pts[0]!.y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += `C${f(c1.x)},${f(c1.y)} ${f(c2.x)},${f(c2.y)} ${f(p2.x)},${f(p2.y)}`;
  }
  return d;
}

/** Path of the visible eye opening: along the upper lid, back along the lower lid. */
export function openingPath(e: EyeShape): string {
  const lowerFull = [e.upper[10]!, ...[...e.lower].reverse(), e.upper[0]!];
  return `${smoothPath(e.upper)} ${smoothPath(lowerFull, false).replace(/^L[^C]*/, '')}Z`;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svgEl<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
  parent?: Element,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  parent?.appendChild(el);
  return el;
}

/**
 * An SVG rendering of the eye. Colours come from CSS classes (theme tokens), so theme
 * changes need no redraw. Call `set(c)` to move the lids.
 */
export class EyeDrawing {
  readonly group: SVGGElement;
  private readonly white: SVGPathElement;
  private readonly upperLid: SVGPathElement;
  private readonly lowerLid: SVGPathElement;
  private readonly clipPath: SVGPathElement;
  private readonly upperDots: SVGCircleElement[] = [];
  private readonly lowerDots: SVGCircleElement[] = [];
  private readonly earLines: SVGLineElement[] = [];

  constructor(parent: SVGElement, id: string, opts: { showEarLines?: boolean } = {}) {
    this.group = svgEl('g', { class: 'eye' }, parent);
    const defs = svgEl('defs', {}, this.group);
    const clip = svgEl('clipPath', { id: `${id}-clip` }, defs);
    this.clipPath = svgEl('path', {}, clip);

    // The crease above the upper lid does not move.
    const creaseOpen = eyeShape(0).upper.map((p, i) => ({
      x: p.x,
      y: p.y - 16 * Math.sin((Math.PI * i) / 10) - 2,
    }));
    svgEl('path', { class: 'eye-crease', d: smoothPath(creaseOpen.slice(1, 10)) }, this.group);
    this.white = svgEl('path', { class: 'eye-white' }, this.group);

    const irisG = svgEl('g', { 'clip-path': `url(#${id}-clip)` }, this.group);
    svgEl('circle', { class: 'eye-iris', cx: IRIS_CENTER.x, cy: IRIS_CENTER.y, r: IRIS_R }, irisG);
    svgEl(
      'circle',
      { class: 'eye-iris-inner', cx: IRIS_CENTER.x, cy: IRIS_CENTER.y, r: IRIS_R * 0.62 },
      irisG,
    );
    svgEl(
      'circle',
      { class: 'eye-pupil', cx: IRIS_CENTER.x, cy: IRIS_CENTER.y, r: IRIS_R * 0.34 },
      irisG,
    );
    svgEl(
      'circle',
      { class: 'eye-glint', cx: IRIS_CENTER.x + 14, cy: IRIS_CENTER.y - 16, r: 6 },
      irisG,
    );
    const open = eyeShape(0);
    for (const p of open.iris) {
      svgEl('circle', { class: 'lm lm-iris', cx: p.x, cy: p.y, r: 2.6 }, irisG);
    }

    this.upperLid = svgEl('path', { class: 'eye-lid' }, this.group);
    this.lowerLid = svgEl('path', { class: 'eye-lid eye-lid--lower' }, this.group);

    if (opts.showEarLines) {
      for (let i = 0; i < 3; i++) {
        this.earLines.push(
          svgEl('line', { class: i === 2 ? 'ear-line ear-line--h' : 'ear-line' }, this.group),
        );
      }
    }

    const isEar = (i: number, which: 'u' | 'l') =>
      which === 'u'
        ? i === EAR_POINTS.p1 || i === EAR_POINTS.p2 || i === EAR_POINTS.p3 || i === EAR_POINTS.p4
        : i === EAR_POINTS.p5 || i === EAR_POINTS.p6;
    open.upper.forEach((_, i) =>
      this.upperDots.push(
        svgEl(
          'circle',
          { class: isEar(i, 'u') ? 'lm lm-ear' : 'lm', r: isEar(i, 'u') ? 4.2 : 3 },
          this.group,
        ),
      ),
    );
    open.lower.forEach((_, i) =>
      this.lowerDots.push(
        svgEl(
          'circle',
          { class: isEar(i, 'l') ? 'lm lm-ear' : 'lm', r: isEar(i, 'l') ? 4.2 : 3 },
          this.group,
        ),
      ),
    );
    this.set(0);
  }

  set(closure: number): void {
    const e = eyeShape(closure);
    const opening = openingPath(e);
    this.white.setAttribute('d', opening);
    this.clipPath.setAttribute('d', opening);
    this.upperLid.setAttribute('d', smoothPath(e.upper));
    this.lowerLid.setAttribute('d', smoothPath([e.upper[0]!, ...e.lower, e.upper[10]!]));
    e.upper.forEach((p, i) => {
      this.upperDots[i]!.setAttribute('cx', f(p.x));
      this.upperDots[i]!.setAttribute('cy', f(p.y));
    });
    e.lower.forEach((p, i) => {
      this.lowerDots[i]!.setAttribute('cx', f(p.x));
      this.lowerDots[i]!.setAttribute('cy', f(p.y));
    });
    if (this.earLines.length) {
      const [p1, p2, p3, p4, p5, p6] = earPoints(e);
      const set = (l: SVGLineElement, a: Point, b: Point) => {
        l.setAttribute('x1', f(a.x));
        l.setAttribute('y1', f(a.y));
        l.setAttribute('x2', f(b.x));
        l.setAttribute('y2', f(b.y));
      };
      set(this.earLines[0]!, p2, p6);
      set(this.earLines[1]!, p3, p5);
      set(this.earLines[2]!, p1, p4);
    }
  }
}
