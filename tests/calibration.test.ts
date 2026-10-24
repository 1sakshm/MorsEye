import { describe, expect, it } from 'vitest';
import {
  closurePeak,
  fitThreshold,
  kShotThresholds,
  mad,
  median,
  mulberry32,
  sample,
} from '../src/detect/calibration';

describe('calibration', () => {
  it('median and MAD', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(mad([1, 2, 3, 4, 100])).toBe(1);
    expect(Number.isNaN(median([]))).toBe(true);
  });

  it('fits the PRD formula for EAR', () => {
    const c = fitThreshold('ear', [0.3, 0.31, 0.29, 0.3], [0.1, 0.09, 0.11]);
    expect(c.openMedian).toBeCloseTo(0.3);
    expect(c.closedMedian).toBeCloseTo(0.1);
    expect(c.thr).toBeCloseTo(0.2); // 0.3 - 0.5 * 0.2
    expect(c.h).toBeCloseTo(0.02);
    expect(c.ok).toBe(true);
  });

  it('fits blendshape scores (high = closed)', () => {
    const c = fitThreshold('blend', [0.05, 0.1, 0.05], [0.85, 0.95, 0.9]);
    expect(c.thr).toBeCloseTo(0.475); // 0.05 + 0.5 * 0.85
    expect(c.h).toBeCloseTo(0.085);
    expect(c.ok).toBe(true);
  });

  it('warns when open and closed are too close (degenerate case)', () => {
    const c = fitThreshold('ear', [0.25, 0.26], [0.23, 0.24]);
    expect(c.ok).toBe(false);
    expect(c.warning).toMatch(/too similar/);
  });

  it('warns when closed is on the wrong side', () => {
    expect(fitThreshold('blend', [0.8], [0.1]).ok).toBe(false);
  });

  it('warns with no data', () => {
    expect(fitThreshold('ear', [], []).ok).toBe(false);
  });

  it('closure peak is the deepest point', () => {
    expect(closurePeak('ear', [0.3, 0.1, 0.2])).toBe(0.1);
    expect(closurePeak('blend', [0.3, 0.9, 0.2])).toBe(0.9);
  });

  it('seeded RNG and sampling are deterministic and without replacement', () => {
    const a = sample([1, 2, 3, 4, 5], 3, mulberry32(7));
    const b = sample([1, 2, 3, 4, 5], 3, mulberry32(7));
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(3);
  });

  it('k-shot draws give one fit per draw', () => {
    const peaks = [0.05, 0.08, 0.1, 0.12, 0.07, 0.09];
    const fits = kShotThresholds('ear', [0.3, 0.3], peaks, 3, 20, 1);
    expect(fits).toHaveLength(20);
    for (const f of fits) expect(f.thr).toBeGreaterThan(0.15);
  });
});
