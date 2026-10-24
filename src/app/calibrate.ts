import { closurePeak, fitThreshold, type Calibration } from '../detect/calibration';
import { SIGNALS } from '../detect/detector';
import type { FrameFeatures } from '../types';
import type { Engine } from './engine';
import { load, remove, save } from './storage';

/**
 * Calibration flow (PRD §5.4):
 *  1. eyes open on a dot for 5 s -> open statistics;
 *  2. five 1 s cued closures -> one "closed" peak per closure;
 *  3. fit thresholds for every signal the app can use;
 *  4. quality check (open and closed must be well separated).
 * The practice step and the UI live in the page; this module only collects and fits.
 */

export const OPEN_MS = 5000;
export const N_CLOSURES = 5;
export const READY_MS = 1600;
export const CUE_MS = 1000;
/** Window after cue onset in which the closure peak is searched (reaction time + closure). */
export const PEAK_WINDOW_MS = 2000;

export interface StoredCalibration {
  version: 1;
  at: string;
  ear: Calibration;
  blend: Calibration;
  blendMin: Calibration;
  blendL: Calibration;
  blendR: Calibration;
}

const KEY = 'morseye-calibration';

export function loadCalibration(): StoredCalibration | null {
  const c = load<StoredCalibration | null>(KEY, null);
  return c && c.version === 1 && c.ear && c.blend ? c : null;
}

export function saveCalibration(c: StoredCalibration): void {
  save(KEY, c);
}

export function clearCalibration(): void {
  remove(KEY);
}

export type CalibStep =
  | { step: 'open'; remainingMs: number }
  | { step: 'ready'; index: number }
  | { step: 'close'; index: number }
  | { step: 'done'; result: StoredCalibration };

const readers = {
  ear: SIGNALS.earMean.read,
  blend: SIGNALS.blendMax.read,
  blendMin: SIGNALS.blendMin.read,
  blendL: SIGNALS.blendL.read,
  blendR: SIGNALS.blendR.read,
} as const;
type Key = keyof typeof readers;
const KEYS = Object.keys(readers) as Key[];
const kindOf = (k: Key): 'ear' | 'blend' => (k === 'ear' ? 'ear' : 'blend');

export function fitAll(open: FrameFeatures[], closures: FrameFeatures[][]): StoredCalibration {
  const fit = (k: Key) =>
    fitThreshold(
      kindOf(k),
      open.map(readers[k]),
      closures.filter((c) => c.length).map((c) => closurePeak(kindOf(k), c.map(readers[k]))),
    );
  const out = Object.fromEntries(KEYS.map((k) => [k, fit(k)])) as Record<Key, Calibration>;
  return { version: 1, at: new Date().toISOString(), ...out };
}

/** Runs the timed collection against live frames. `onStep` drives the UI; `onCue` plays a tone. */
export function runCalibration(
  engine: Engine,
  onStep: (s: CalibStep) => void,
  onCue: (on: boolean) => void,
  signal: AbortSignal,
): Promise<StoredCalibration> {
  return new Promise((resolve, reject) => {
    const open: FrameFeatures[] = [];
    const closures: FrameFeatures[][] = Array.from({ length: N_CLOSURES }, () => []);
    let t0: number | null = null;
    const closeStart = OPEN_MS;
    const period = READY_MS + CUE_MS;
    const end = closeStart + N_CLOSURES * period + (PEAK_WINDOW_MS - CUE_MS);
    let lastCue = false;

    const off = engine.onFrame(({ features: f }) => {
      if (signal.aborted) return;
      t0 ??= f.t_ms;
      const t = f.t_ms - t0;
      if (t < OPEN_MS) {
        if (f.face) open.push(f);
        onStep({ step: 'open', remainingMs: OPEN_MS - t });
        return;
      }
      if (t >= end) {
        off();
        onCue(false);
        const result = fitAll(open, closures);
        onStep({ step: 'done', result });
        resolve(result);
        return;
      }
      const rel = t - closeStart;
      const index = Math.min(N_CLOSURES - 1, Math.floor(rel / period));
      const inPeriod = rel - index * period;
      const cueOn = rel < N_CLOSURES * period && inPeriod >= READY_MS;
      if (cueOn !== lastCue) {
        onCue(cueOn);
        lastCue = cueOn;
      }
      // index === N_CLOSURES means "all cues shown, finishing the last peak window".
      const readyIndex = rel >= N_CLOSURES * period ? N_CLOSURES : index;
      onStep(cueOn ? { step: 'close', index } : { step: 'ready', index: readyIndex });
      // Peak window for closure i starts at its cue onset.
      for (let i = 0; i < N_CLOSURES; i++) {
        const onset = i * period + READY_MS;
        if (rel >= onset && rel < onset + PEAK_WINDOW_MS && f.face) closures[i]!.push(f);
      }
    });

    signal.addEventListener('abort', () => {
      off();
      onCue(false);
      reject(new DOMException('aborted', 'AbortError'));
    });
  });
}
