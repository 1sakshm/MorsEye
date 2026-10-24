import { describe, expect, it } from 'vitest';
import {
  band,
  DEFAULT_TIMING as T,
  presetTiming,
  scaleTiming,
  segment,
  validTiming,
} from '../src/segment/segmenter';

describe('segmenter bands', () => {
  it.each([
    [0, 'reject'],
    [150, 'reject'],
    [T.rejectMs - 1, 'reject'],
    [T.rejectMs, 'dot'],
    [400, 'dot'],
    [T.dotMaxMs - 1, 'dot'],
    [T.dotMaxMs, 'dash'],
    [1000, 'dash'],
    [T.dashMaxMs - 1, 'dash'],
    [T.dashMaxMs, 'hold'],
    [T.cmdMs - 1, 'hold'],
    [T.cmdMs, 'backspace'],
    [5000, 'backspace'],
  ] as const)('%i ms -> %s', (d, expected) => {
    expect(band(d, T)).toBe(expected);
  });

  it('turns closures into segments with the same times', () => {
    const s = segment({ start_ms: 100, end_ms: 500, duration_ms: 400, eye: 'both' }, T);
    expect(s).toEqual({ band: 'dot', start_ms: 100, end_ms: 500, duration_ms: 400, eye: 'both' });
  });

  it('presets scale every value', () => {
    expect(presetTiming('medium')).toEqual(T);
    expect(presetTiming('slow').dotMaxMs).toBe(900);
    expect(presetTiming('fast').rejectMs).toBe(140);
    expect(scaleTiming(T, 2).wordGapMs).toBe(6000);
  });

  it('validates band ordering', () => {
    expect(validTiming(T)).toBe(true);
    expect(validTiming({ ...T, dotMaxMs: 100 })).toBe(false);
    expect(validTiming({ ...T, letterGapMs: 4000 })).toBe(false);
  });
});
