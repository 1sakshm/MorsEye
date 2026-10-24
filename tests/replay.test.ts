import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { replayAll } from '../src/pipeline';
import { framesOf, parseJsonl } from '../src/study/schema';

// Synthetic fixture made by `npm run replay -- --make-fixture`. If the pipeline changes on purpose,
// regenerate it and check the diff; analysis/tests/test_replay_parity.py uses the same files.
const jsonl = readFileSync('tests/fixtures/replay_sample.jsonl', 'utf8');
const expected = JSON.parse(readFileSync('tests/fixtures/replay_expected.json', 'utf8'));

describe('replay', () => {
  it('reproduces the stored output for every detector', () => {
    const got = replayAll(framesOf(parseJsonl(jsonl)), expected.timing, expected.user);
    expect(JSON.parse(JSON.stringify(got))).toEqual(expected.results);
  });

  it('decodes the fixture message with the EAR baseline', () => {
    // The fixture types "HI SOS"; its left wink is seen as an extra dot (E) by a both-eye detector.
    expect(expected.results.D1.text).toBe('HI SOSE ');
    expect(expected.results.D1.bands).toContain('reject');
  });
});
