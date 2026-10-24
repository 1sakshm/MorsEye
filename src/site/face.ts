import type { Point } from '../vision/features';

/**
 * A synthetic face as 478 landmark-like points (the size of MediaPipe's FaceLandmarker output:
 * 468 face points + 10 iris points). It is generated from parametric curves and a sunflower
 * fill — an "average" face shape that belongs to nobody. Coordinates are in face units:
 * x in about [-0.85, 0.85], y in about [-1.25, 1.25], y pointing down.
 */

export interface FacePoint extends Point {
  part: 'contour' | 'eye' | 'iris' | 'brow' | 'nose' | 'lips' | 'mesh';
}

export const FACE_POINT_COUNT = 478;
/** Centre of the eye on the viewer's left, used for the zoom in the scroll story. */
export const LEFT_EYE_CENTER: Point = { x: -0.36, y: -0.12 };

const OVAL_A = 0.84;
const OVAL_B = 1.24;

function ovalPoint(theta: number, shrink = 1): Point {
  // theta = 0 at the top of the head, increasing clockwise; the jaw narrows toward the chin.
  const c = Math.cos(theta);
  const jaw = 1 - 0.26 * Math.pow(Math.max(0, -c), 1.6);
  return { x: OVAL_A * Math.sin(theta) * jaw * shrink, y: -OVAL_B * c * shrink };
}

function insideOval(p: Point, shrink: number): boolean {
  // Compare against the contour at the same angle.
  const theta = Math.atan2(p.x, -p.y);
  const edge = ovalPoint(theta, shrink);
  return Math.hypot(p.x, p.y) <= Math.hypot(edge.x, edge.y);
}

function ellipseHole(p: Point, c: Point, rx: number, ry: number): boolean {
  return ((p.x - c.x) / rx) ** 2 + ((p.y - c.y) / ry) ** 2 < 1;
}

export function syntheticFace(): FacePoint[] {
  const pts: FacePoint[] = [];
  const add = (x: number, y: number, part: FacePoint['part']) => pts.push({ x, y, part });

  // Face contour (36).
  for (let i = 0; i < 36; i++) {
    const p = ovalPoint((i / 36) * Math.PI * 2);
    add(p.x, p.y, 'contour');
  }

  // Eyes: 16 contour points each (32) and 5 iris points each (10).
  for (const side of [-1, 1]) {
    const cx = 0.36 * side;
    const cy = -0.12;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const upper = Math.sin(a) < 0;
      const h = upper ? 0.075 : 0.05;
      add(cx + 0.13 * Math.cos(a), cy + h * Math.sin(a), 'eye');
    }
    add(cx, cy - 0.005, 'iris');
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      add(cx + 0.045 * Math.cos(a), cy - 0.005 + 0.045 * Math.sin(a), 'iris');
    }
  }

  // Brows (10 each).
  for (const side of [-1, 1]) {
    for (let i = 0; i < 10; i++) {
      const s = i / 9;
      const x = side * (0.17 + 0.4 * s);
      const y = -0.3 - 0.07 * Math.sin(Math.PI * Math.pow(s, 0.8)) + 0.02 * s;
      add(x, y, 'brow');
    }
  }

  // Nose: bridge (7), tip arc (9), wings (4) = 20.
  for (let i = 0; i < 7; i++) add(0, -0.14 + i * 0.065, 'nose');
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.15 + (0.7 * i) / 8);
    add(-0.11 * Math.cos(a), 0.3 + 0.06 * Math.sin(a), 'nose');
  }
  for (const side of [-1, 1]) {
    add(side * 0.13, 0.26, 'nose');
    add(side * 0.09, 0.2, 'nose');
  }

  // Lips: outer (20) with a cupid's bow, inner (20).
  const mouth = { x: 0, y: 0.62 };
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const upper = Math.sin(a) < 0;
    let y = mouth.y + (upper ? 0.075 : 0.09) * Math.sin(a);
    if (upper) y += 0.025 * Math.exp(-((Math.cos(a) / 0.18) ** 2)); // the dip in the middle
    add(mouth.x + 0.22 * Math.cos(a), y, 'lips');
  }
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    add(mouth.x + 0.16 * Math.cos(a), mouth.y + 0.018 * Math.sin(a), 'lips');
  }

  // Mesh fill: a sunflower spiral inside the oval, avoiding the eyes and mouth.
  const need = FACE_POINT_COUNT - pts.length;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const candidates = (n: number): Point[] => {
    const out: Point[] = [];
    for (let i = 0; i < n; i++) {
      const r = Math.sqrt((i + 0.5) / n);
      const a = i * golden;
      const p = { x: r * Math.cos(a) * OVAL_A * 0.96, y: r * Math.sin(a) * OVAL_B * 0.96 };
      if (!insideOval(p, 0.95)) continue;
      if (ellipseHole(p, { x: -0.36, y: -0.12 }, 0.2, 0.12)) continue;
      if (ellipseHole(p, { x: 0.36, y: -0.12 }, 0.2, 0.12)) continue;
      if (ellipseHole(p, mouth, 0.27, 0.13)) continue;
      out.push(p);
    }
    return out;
  };
  let lo = need;
  let hi = need * 4;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (candidates(mid).length >= need) hi = mid;
    else lo = mid + 1;
  }
  // The count is only roughly monotonic in n; step up until there are enough.
  while (candidates(lo).length < need) lo++;
  for (const p of candidates(lo).slice(0, need)) add(p.x, p.y, 'mesh');
  return pts;
}
