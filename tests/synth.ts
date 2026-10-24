import type { FrameFeatures } from '../src/types';

/**
 * Builds synthetic FrameFeatures streams for tests. Not participant data.
 * `closures` are [start_ms, duration_ms] pairs; the eye is fully closed in between.
 */
export function synthFrames(
  totalMs: number,
  closures: ReadonlyArray<readonly [number, number]>,
  opts: {
    fps?: number;
    open?: number;
    closed?: number;
    faceLost?: ReadonlyArray<readonly [number, number]>;
  } = {},
): FrameFeatures[] {
  const fps = opts.fps ?? 30;
  const dt = 1000 / fps;
  const open = opts.open ?? 0.3;
  const closed = opts.closed ?? 0.08;
  const frames: FrameFeatures[] = [];
  for (let i = 0; i * dt <= totalMs; i++) {
    const t = Math.round(i * dt * 1000) / 1000;
    const isClosed = closures.some(([s, d]) => t >= s && t < s + d);
    const lost = (opts.faceLost ?? []).some(([s, d]) => t >= s && t < s + d);
    const e = isClosed ? closed : open;
    const b = isClosed ? 0.9 : 0.05;
    frames.push({
      t_ms: t,
      face: !lost,
      earL: lost ? 0 : e,
      earR: lost ? 0 : e,
      blinkL: lost ? 0 : b,
      blinkR: lost ? 0 : b,
      yaw: 0,
      pitch: 0,
      roll: 0,
    });
  }
  return frames;
}

/** Closure schedule for a Morse string like "... --- ..." with given timings. */
export function morseSchedule(
  morse: string,
  { dot = 400, dash = 1000, symGap = 400, letterGap = 1600, wordGap = 3600, start = 500 } = {},
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let t = start;
  const words = morse.trim().split(' / ');
  words.forEach((w, wi) => {
    const letters = w.split(' ');
    letters.forEach((l, li) => {
      [...l].forEach((s, si) => {
        const d = s === '.' ? dot : dash;
        out.push([t, d]);
        t += d;
        if (si < l.length - 1) t += symGap;
      });
      if (li < letters.length - 1) t += letterGap;
    });
    if (wi < words.length - 1) t += wordGap;
  });
  return out;
}
