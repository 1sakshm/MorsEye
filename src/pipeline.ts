import { Decoder, type DecoderAction } from './decode/decoder';
import { makeDetector, type DetectorId, type UserThresholds } from './detect/detector';
import { segment, type Segment, type Timing } from './segment/segmenter';
import type { Closure, FrameFeatures } from './types';

/**
 * Offline replay: frames -> detector -> segmenter -> decoder, exactly as the live app does it.
 * Used by the replay test, scripts/replay.ts (Node) and as the reference for analysis/replay.py.
 */
export interface ReplayResult {
  closures: Closure[];
  segments: Segment[];
  actions: DecoderAction[];
  text: string;
}

export function replay(
  frames: readonly FrameFeatures[],
  detectorId: DetectorId,
  timing: Timing,
  user: UserThresholds = {},
  winks = false,
): ReplayResult {
  const det = makeDetector(detectorId, user);
  const dec = new Decoder(timing, winks);
  const closures: Closure[] = [];
  const segments: Segment[] = [];
  const actions: DecoderAction[] = [];
  for (const f of frames) {
    const c = det.update(f);
    if (c) {
      closures.push(c);
      const s = segment(c, timing);
      segments.push(s);
      actions.push(...dec.push(s));
    }
    actions.push(...dec.tick(f.t_ms, det.state === 'closed'));
  }
  actions.push(...dec.flush());
  return { closures, segments, actions, text: dec.text };
}

export const ALL_DETECTORS: readonly DetectorId[] = ['D1', 'D2', 'D3', 'D4', 'D5'];

/** Replay every detector (D5 with winks on). The shape stored in tests/fixtures/replay_expected.json. */
export function replayAll(frames: readonly FrameFeatures[], timing: Timing, user: UserThresholds) {
  return Object.fromEntries(
    ALL_DETECTORS.map((id) => {
      const r = replay(frames, id, timing, user, id === 'D5');
      return [id, { closures: r.closures, bands: r.segments.map((s) => s.band), text: r.text }];
    }),
  );
}
