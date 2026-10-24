import { describe, expect, it } from 'vitest';
import { PHRASES, studyA, studyBPhrases } from '../src/study/protocol';

describe('study protocol', () => {
  it('is deterministic for a seed', () => {
    expect(studyA(42)).toEqual(studyA(42));
    expect(studyA(42)).not.toEqual(studyA(43));
  });

  it('follows the Study A design (PRD §3.5)', () => {
    const [calib, spont, delib, mixed] = studyA(7);
    expect(calib!.name).toBe('calibration');
    expect(calib!.cues.filter((c) => c.cue === 'SHORT')).toHaveLength(10);
    expect(calib!.cues.filter((c) => c.cue === 'LONG')).toHaveLength(10);
    expect(calib!.cues[0]).toMatchObject({ cue: 'OPEN', duration_ms: 15000 });
    expect(spont!.cues).toHaveLength(0);
    expect(spont!.duration_ms).toBe(180_000);
    expect(delib!.cues).toHaveLength(40);
    for (const k of ['SHORT', 'LONG', 'WINK-L', 'WINK-R']) {
      expect(delib!.cues.filter((c) => c.cue === k)).toHaveLength(10);
    }
    const gaps = delib!.cues.slice(1).map((c, i) => c.at_ms - delib!.cues[i]!.at_ms);
    for (const g of gaps) {
      expect(g).toBeGreaterThanOrEqual(2000);
      expect(g).toBeLessThanOrEqual(4000);
    }
    expect(mixed!.reading && mixed!.cornerCues).toBe(true);
    expect(mixed!.cues.every((c) => c.at_ms + c.duration_ms <= mixed!.duration_ms)).toBe(true);
  });

  it('counterbalancing keeps calibration first', () => {
    for (let s = 0; s < 20; s++) expect(studyA(s, true)[0]!.name).toBe('calibration');
  });

  it('Study B uses all 15 phrases once, in 3 blocks of 5', () => {
    const blocks = studyBPhrases(3);
    expect(blocks.map((b) => b.length)).toEqual([5, 5, 5]);
    expect(new Set(blocks.flat())).toEqual(new Set(PHRASES));
    expect(PHRASES.every((p) => p === p.toLowerCase())).toBe(true);
  });
});
