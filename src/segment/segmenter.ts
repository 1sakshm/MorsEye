import type { Closure } from '../types';

/**
 * Closure duration -> symbol (PRD §5.3).
 *
 *   d <  rejectMs              reject     probable spontaneous blink, ignored
 *   rejectMs  <= d < dotMaxMs  dot
 *   dotMaxMs  <= d < dashMaxMs dash
 *   dashMaxMs <= d < cmdMs     hold       no symbol; two holds within PAUSE_WINDOW_MS toggle pause
 *   d >= cmdMs                 backspace
 *
 * The defaults below are the PRD's starting values. They are to be replaced by the values
 * chosen from the Study A duration distributions (see docs/decisions.md).
 */

export interface Timing {
  rejectMs: number;
  dotMaxMs: number;
  dashMaxMs: number;
  cmdMs: number;
  letterGapMs: number;
  wordGapMs: number;
}

export const DEFAULT_TIMING: Timing = {
  rejectMs: 200,
  dotMaxMs: 600,
  dashMaxMs: 1400,
  cmdMs: 2000,
  letterGapMs: 1200,
  wordGapMs: 3000,
};

export const PRESETS = { slow: 1.5, medium: 1, fast: 0.7 } as const;
export type Preset = keyof typeof PRESETS;

export function scaleTiming(t: Timing, factor: number): Timing {
  return {
    rejectMs: Math.round(t.rejectMs * factor),
    dotMaxMs: Math.round(t.dotMaxMs * factor),
    dashMaxMs: Math.round(t.dashMaxMs * factor),
    cmdMs: Math.round(t.cmdMs * factor),
    letterGapMs: Math.round(t.letterGapMs * factor),
    wordGapMs: Math.round(t.wordGapMs * factor),
  };
}

export function presetTiming(p: Preset, base: Timing = DEFAULT_TIMING): Timing {
  return scaleTiming(base, PRESETS[p]);
}

/** Bands must be strictly increasing and the word gap longer than the letter gap. */
export function validTiming(t: Timing): boolean {
  return (
    t.rejectMs >= 0 &&
    t.rejectMs < t.dotMaxMs &&
    t.dotMaxMs < t.dashMaxMs &&
    t.dashMaxMs <= t.cmdMs &&
    t.letterGapMs > 0 &&
    t.letterGapMs < t.wordGapMs
  );
}

export type Band = 'reject' | 'dot' | 'dash' | 'hold' | 'backspace';

export function band(durationMs: number, t: Timing): Band {
  if (durationMs < t.rejectMs) return 'reject';
  if (durationMs < t.dotMaxMs) return 'dot';
  if (durationMs < t.dashMaxMs) return 'dash';
  if (durationMs < t.cmdMs) return 'hold';
  return 'backspace';
}

export interface Segment {
  band: Band;
  start_ms: number;
  end_ms: number;
  duration_ms: number;
  eye: Closure['eye'];
}

export function segment(c: Closure, t: Timing): Segment {
  return {
    band: band(c.duration_ms, t),
    start_ms: c.start_ms,
    end_ms: c.end_ms,
    duration_ms: c.duration_ms,
    eye: c.eye,
  };
}

/** Progress through the bands for the live ring: which band an ongoing closure is in, and 0..1 overall. */
export function liveBand(elapsedMs: number, t: Timing): { band: Band; progress: number } {
  return { band: band(elapsedMs, t), progress: Math.min(1, elapsedMs / t.cmdMs) };
}
