import type { Signal, Threshold } from './detector';

/**
 * Per-user threshold fitting (PRD §3.4, §5.4):
 *   thr = open_median − α·(open_median − closed_median),  α = 0.5
 *   h   = 10% of |open_median − closed_median|
 * "Closed" statistics come from calibration closures: one value per closure, the deepest
 * point of the signal (min EAR / max blendshape) inside the cued window.
 */

export const ALPHA = 0.5;
export const HYSTERESIS_FRACTION = 0.1;

/** Minimum open–closed separation below which calibration is flagged as poor. */
export const MIN_RANGE: Record<Signal['kind'], number> = { ear: 0.06, blend: 0.3 };

export function median(xs: readonly number[]): number {
  if (xs.length === 0) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Median absolute deviation (unscaled). */
export function mad(xs: readonly number[]): number {
  const m = median(xs);
  return median(xs.map((x) => Math.abs(x - m)));
}

export interface Calibration extends Threshold {
  kind: Signal['kind'];
  openMedian: number;
  openMad: number;
  closedMedian: number;
  closedMad: number;
  /** |open − closed|. */
  range: number;
  ok: boolean;
  /** Human-readable advice when ok is false. */
  warning?: string;
}

/** Deepest point of one calibration closure: min for EAR, max for blendshape. */
export function closurePeak(kind: Signal['kind'], samples: readonly number[]): number {
  if (samples.length === 0) return Number.NaN;
  return kind === 'ear' ? Math.min(...samples) : Math.max(...samples);
}

export function fitThreshold(
  kind: Signal['kind'],
  openSamples: readonly number[],
  closedPeaks: readonly number[],
  alpha = ALPHA,
): Calibration {
  const openMedian = median(openSamples);
  const closedMedian = median(closedPeaks);
  const range = Math.abs(openMedian - closedMedian);
  const thr = openMedian - alpha * (openMedian - closedMedian);
  const h = HYSTERESIS_FRACTION * range;

  // "Closed" must be on the expected side of "open" for the signal's polarity.
  const rightWay = kind === 'ear' ? closedMedian < openMedian : closedMedian > openMedian;
  let warning: string | undefined;
  if (!Number.isFinite(range) || openSamples.length === 0 || closedPeaks.length === 0) {
    warning = 'Not enough calibration data. Keep your face in view and try again.';
  } else if (!rightWay || range < MIN_RANGE[kind]) {
    warning =
      'Your open and closed eyes look too similar to the camera. Try more light on your face, ' +
      'tilt glasses to cut glare, or move a little closer, then recalibrate.';
  }

  return {
    kind,
    thr,
    h,
    openMedian,
    openMad: mad(openSamples),
    closedMedian,
    closedMad: mad(closedPeaks),
    range,
    ok: warning === undefined,
    ...(warning ? { warning } : {}),
  };
}

/** Deterministic PRNG (mulberry32). Used for k-shot draws and study cue schedules. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Draw k items without replacement. */
export function sample<T>(xs: readonly T[], k: number, rng: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a.slice(0, Math.min(k, a.length));
}

/**
 * Few-shot calibration: fit from k randomly drawn closures, `draws` times (PRD §3.4: 20 draws per k).
 * k = 0 means "no calibration" and is handled by the caller with the fixed threshold.
 */
export function kShotThresholds(
  kind: Signal['kind'],
  openSamples: readonly number[],
  closedPeaks: readonly number[],
  k: number,
  draws: number,
  seed: number,
): Calibration[] {
  const rng = mulberry32(seed);
  const out: Calibration[] = [];
  for (let d = 0; d < draws; d++) {
    out.push(fitThreshold(kind, openSamples, sample(closedPeaks, k, rng)));
  }
  return out;
}
