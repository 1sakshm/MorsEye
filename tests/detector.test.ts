import { describe, expect, it } from 'vitest';
import {
  detectAll,
  FIXED_EAR,
  HysteresisDetector,
  makeDetector,
  SIGNALS,
  WinkDetector,
} from '../src/detect/detector';
import type { FrameFeatures } from '../src/types';
import { synthFrames } from './synth';

const frame = (t: number, e: number): FrameFeatures => ({
  t_ms: t,
  face: true,
  earL: e,
  earR: e,
  blinkL: 0,
  blinkR: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
});

describe('detectors', () => {
  it('D1 times closures from the first closed to the first open frame', () => {
    const frames = synthFrames(3000, [[1000, 400]], { fps: 50 }); // 20 ms frames
    const cs = detectAll(makeDetector('D1'), frames);
    expect(cs).toHaveLength(1);
    expect(cs[0]).toMatchObject({ start_ms: 1000, end_ms: 1400, duration_ms: 400 });
  });

  it('EAR and blendshape detectors agree on clean data', () => {
    const frames = synthFrames(6000, [
      [500, 300],
      [2000, 900],
      [4000, 150],
    ]);
    const a = detectAll(makeDetector('D1'), frames).map((c) => c.duration_ms);
    const b = detectAll(makeDetector('D3'), frames).map((c) => c.duration_ms);
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
  });

  it('hysteresis ignores jitter around the threshold', () => {
    const det = new HysteresisDetector(SIGNALS.earMean, FIXED_EAR);
    // Closes below 0.21, only reopens above 0.23.
    const vals = [0.3, 0.2, 0.215, 0.205, 0.225, 0.3];
    const cs = detectAll(
      det,
      vals.map((v, i) => frame(i * 33, v)),
    );
    expect(cs).toHaveLength(1);
    expect(cs[0]).toMatchObject({ start_ms: 33, end_ms: 165 });
  });

  it('losing the face discards the partial closure', () => {
    const frames = synthFrames(4000, [[1000, 1000]], { faceLost: [[1300, 300]] });
    expect(detectAll(makeDetector('D1'), frames)).toHaveLength(0);
  });

  it('detects closures normally after the face comes back', () => {
    const frames = synthFrames(5000, [[3000, 400]], { faceLost: [[500, 500]] });
    expect(detectAll(makeDetector('D1'), frames)).toHaveLength(1);
  });

  it('D5 detects a left wink but not a both-eye closure', () => {
    const frames = synthFrames(4000, [
      [500, 400],
      [2000, 400],
    ]).map((f) => (f.t_ms >= 2000 && f.t_ms < 2400 ? { ...f, blinkR: 0.05, earR: 0.3 } : f));
    const cs = detectAll(new WinkDetector({ thr: 0.5, h: 0.1 }, { thr: 0.5, h: 0.1 }), frames);
    expect(cs).toHaveLength(1);
    expect(cs[0]!.eye).toBe('left');
    expect(cs[0]!.start_ms).toBe(2000);
  });
});
