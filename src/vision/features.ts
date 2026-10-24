import type { FrameFeatures } from '../types';

export interface Point {
  x: number;
  y: number;
}

/**
 * MediaPipe Face Mesh indices for the 6 EAR points, ordered p1..p6 as in
 * Soukupová & Čech (2016): p1/p4 are the corners, p2/p3 the upper lid, p6/p5 the lower lid.
 */
export const EAR_IDX_LEFT = [33, 160, 158, 133, 153, 144] as const;
export const EAR_IDX_RIGHT = [362, 385, 387, 263, 373, 380] as const;

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** EAR = (|p2−p6| + |p3−p5|) / (2·|p1−p4|). Points must be in an isotropic (pixel) space. */
export function ear(p: readonly [Point, Point, Point, Point, Point, Point]): number {
  const [p1, p2, p3, p4, p5, p6] = p;
  const horizontal = dist(p1, p4);
  if (horizontal === 0) return 0;
  return (dist(p2, p6) + dist(p3, p5)) / (2 * horizontal);
}

/**
 * Picks the 6 EAR points of one eye from normalised landmarks and scales them to pixels.
 * Normalised x and y have different units when the frame is not square, so scaling matters.
 */
export function eyePoints(
  landmarks: readonly Point[],
  idx: readonly number[],
  width: number,
  height: number,
): [Point, Point, Point, Point, Point, Point] {
  const pts = idx.map((i) => {
    const lm = landmarks[i];
    if (!lm) throw new Error(`landmark ${i} missing`);
    return { x: lm.x * width, y: lm.y * height };
  });
  return pts as [Point, Point, Point, Point, Point, Point];
}

export interface BlendshapeCategory {
  categoryName: string;
  score: number;
}

export function pickBlinks(categories: readonly BlendshapeCategory[]): {
  blinkL: number;
  blinkR: number;
} {
  let blinkL = 0;
  let blinkR = 0;
  for (const c of categories) {
    if (c.categoryName === 'eyeBlinkLeft') blinkL = c.score;
    else if (c.categoryName === 'eyeBlinkRight') blinkR = c.score;
  }
  return { blinkL, blinkR };
}

/**
 * Yaw/pitch/roll in degrees from MediaPipe's 4x4 facial transformation matrix
 * (column-major, as returned in `facialTransformationMatrixes[i].data`).
 * Uses the R = Rz(roll)·Ry(yaw)·Rx(pitch) decomposition.
 */
export function headPose(m: ArrayLike<number>): { yaw: number; pitch: number; roll: number } {
  // Column-major: element (row r, col c) is m[c*4 + r].
  const r = (row: number, col: number) => m[col * 4 + row] ?? 0;
  const deg = 180 / Math.PI;
  const sy = -r(2, 0);
  const yaw = Math.asin(Math.max(-1, Math.min(1, sy)));
  const pitch = Math.atan2(r(2, 1), r(2, 2));
  const roll = Math.atan2(r(1, 0), r(0, 0));
  return { yaw: yaw * deg, pitch: pitch * deg, roll: roll * deg };
}

export const NO_FACE = (t_ms: number): FrameFeatures => ({
  t_ms,
  face: false,
  earL: 0,
  earR: 0,
  blinkL: 0,
  blinkR: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
});
