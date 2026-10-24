import type { Closure, FrameFeatures } from '../types';

/**
 * Detectors D1–D5 (PRD §3.4). All of them:
 *  - use hysteresis: enter "closed" past `thr`, leave only past `thr ∓ h`;
 *  - use no majority-vote buffer (the v1 app's 5-frame vote added ~80–170 ms of lag);
 *  - measure a closure from the first closed frame to the first open frame, on frame timestamps;
 *  - discard a partial closure when the face is lost (FACE_LOST), instead of ending it early.
 */

export type DetectorId = 'D1' | 'D2' | 'D3' | 'D4' | 'D5';

/** A scalar signal and which direction means "closed". */
export interface Signal {
  /** 'ear': mean EAR of both eyes (low = closed). 'blend': blendshape score (high = closed). */
  kind: 'ear' | 'blend';
  read: (f: FrameFeatures) => number;
}

export const SIGNALS = {
  /** Mean EAR of both eyes. */
  earMean: { kind: 'ear', read: (f) => (f.earL + f.earR) / 2 },
  /** max(eyeBlinkLeft, eyeBlinkRight): either eye closing counts (D3/D4 as specified). */
  blendMax: { kind: 'blend', read: (f) => Math.max(f.blinkL, f.blinkR) },
  /** min(eyeBlinkLeft, eyeBlinkRight): both eyes must close. Used when wink mode is on. */
  blendMin: { kind: 'blend', read: (f) => Math.min(f.blinkL, f.blinkR) },
  blendL: { kind: 'blend', read: (f) => f.blinkL },
  blendR: { kind: 'blend', read: (f) => f.blinkR },
} satisfies Record<string, Signal>;

export interface Threshold {
  /** The decision threshold on the signal. */
  thr: number;
  /** Hysteresis width, in signal units (PRD: 10% of the open–closed range). */
  h: number;
}

/** Fixed thresholds for the uncalibrated baselines. h assumes typical ranges (EAR 0.30→0.10, blend 0→1). */
export const FIXED_EAR: Threshold = { thr: 0.21, h: 0.02 };
export const FIXED_BLEND: Threshold = { thr: 0.5, h: 0.1 };

export type DetectorState = 'open' | 'closed' | 'face_lost';

export interface Detector {
  readonly state: DetectorState;
  /** Start timestamp of the closure in progress, or null. */
  readonly closedSince: number | null;
  /** Feed one frame. Returns a completed closure, if this frame ended one. */
  update(f: FrameFeatures): Closure | null;
  reset(): void;
}

/** True when the value is on the "closed" side of `level`. */
function isClosedSide(kind: Signal['kind'], value: number, level: number): boolean {
  return kind === 'ear' ? value < level : value > level;
}

/** Level the signal must cross to count as open again: thr + h for EAR, thr − h for blend. */
function releaseLevel(kind: Signal['kind'], t: Threshold): number {
  return kind === 'ear' ? t.thr + t.h : t.thr - t.h;
}

export class HysteresisDetector implements Detector {
  state: DetectorState = 'open';
  closedSince: number | null = null;

  constructor(
    readonly signal: Signal,
    public threshold: Threshold,
    readonly eye: Closure['eye'] = 'both',
  ) {}

  /** The current signal value (for live traces). NaN without a face. */
  value(f: FrameFeatures): number {
    return f.face ? this.signal.read(f) : Number.NaN;
  }

  update(f: FrameFeatures): Closure | null {
    if (!f.face) {
      // Pause: drop any partial closure rather than ending it at the wrong time.
      this.state = 'face_lost';
      this.closedSince = null;
      return null;
    }
    const v = this.signal.read(f);
    const { kind } = this.signal;

    if (this.state === 'face_lost') {
      // Re-acquire. If the eye is already closed we cannot know when it closed, so wait for open.
      if (isClosedSide(kind, v, this.threshold.thr)) return null;
      this.state = 'open';
      return null;
    }

    if (this.state === 'open') {
      if (isClosedSide(kind, v, this.threshold.thr)) {
        this.state = 'closed';
        this.closedSince = f.t_ms;
      }
      return null;
    }

    // state === 'closed'
    if (!isClosedSide(kind, v, releaseLevel(kind, this.threshold))) {
      const start = this.closedSince ?? f.t_ms;
      this.state = 'open';
      this.closedSince = null;
      return { start_ms: start, end_ms: f.t_ms, duration_ms: f.t_ms - start, eye: this.eye };
    }
    return null;
  }

  reset(): void {
    this.state = 'open';
    this.closedSince = null;
  }
}

/**
 * D5: a wink is one eye closed (per-eye blendshape threshold) while the other stays open
 * (score below `otherOpenMax`, 0.3 in the PRD) for the whole closure.
 */
export class WinkDetector implements Detector {
  private readonly left: HysteresisDetector;
  private readonly right: HysteresisDetector;
  private leftClean = true;
  private rightClean = true;

  constructor(
    thrL: Threshold,
    thrR: Threshold,
    readonly otherOpenMax = 0.3,
  ) {
    this.left = new HysteresisDetector(SIGNALS.blendL, thrL, 'left');
    this.right = new HysteresisDetector(SIGNALS.blendR, thrR, 'right');
  }

  get state(): DetectorState {
    if (this.left.state === 'face_lost') return 'face_lost';
    return this.left.state === 'closed' || this.right.state === 'closed' ? 'closed' : 'open';
  }

  get closedSince(): number | null {
    return this.left.closedSince ?? this.right.closedSince;
  }

  update(f: FrameFeatures): Closure | null {
    const l = this.left.update(f);
    const r = this.right.update(f);
    if (f.face) {
      if (this.left.state === 'closed' && f.blinkR >= this.otherOpenMax) this.leftClean = false;
      if (this.right.state === 'closed' && f.blinkL >= this.otherOpenMax) this.rightClean = false;
    }
    let out: Closure | null = null;
    if (l) {
      if (this.leftClean) out = l;
      this.leftClean = true;
    }
    if (r) {
      if (this.rightClean) out = out ?? r;
      this.rightClean = true;
    }
    if (!f.face) {
      this.leftClean = true;
      this.rightClean = true;
    }
    return out;
  }

  reset(): void {
    this.left.reset();
    this.right.reset();
    this.leftClean = true;
    this.rightClean = true;
  }
}

/** Per-user calibration results needed to build D2/D4/D5. */
export interface UserThresholds {
  ear?: Threshold;
  blend?: Threshold;
  blendL?: Threshold;
  blendR?: Threshold;
}

export function makeDetector(id: DetectorId, user: UserThresholds = {}): Detector {
  switch (id) {
    case 'D1':
      return new HysteresisDetector(SIGNALS.earMean, FIXED_EAR);
    case 'D2':
      return new HysteresisDetector(SIGNALS.earMean, user.ear ?? FIXED_EAR);
    case 'D3':
      return new HysteresisDetector(SIGNALS.blendMax, FIXED_BLEND);
    case 'D4':
      return new HysteresisDetector(SIGNALS.blendMax, user.blend ?? FIXED_BLEND);
    case 'D5':
      return new WinkDetector(
        user.blendL ?? user.blend ?? FIXED_BLEND,
        user.blendR ?? user.blend ?? FIXED_BLEND,
      );
  }
}

/** Run a detector over a whole recording. */
export function detectAll(det: Detector, frames: readonly FrameFeatures[]): Closure[] {
  const out: Closure[] = [];
  for (const f of frames) {
    const c = det.update(f);
    if (c) out.push(c);
  }
  return out;
}
