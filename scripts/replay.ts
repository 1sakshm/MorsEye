/**
 * Replays a recorded .jsonl log through the TypeScript detector/segmenter/decoder, in Node.
 *
 *   npm run replay -- <log.jsonl> [--detector D1] [--out result.json]
 *   npm run replay -- --make-fixture     (regenerates tests/fixtures/replay_*.{jsonl,json})
 *
 * The fixture is synthetic (generated below), never participant data. Its expected output is the
 * reference for both tests/replay.test.ts and the Python port's parity test (analysis/tests).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { DEFAULT_TIMING } from '../src/segment/segmenter';
import { replayAll } from '../src/pipeline';
import {
  framesOf,
  LOG_SCHEMA,
  parseJsonl,
  type FrameLine,
  type HeaderLine,
} from '../src/study/schema';
import { mulberry32 } from '../src/detect/calibration';

/** Per-user thresholds used for the fixture's calibrated detectors. */
const FIXTURE_USER = {
  ear: { thr: 0.19, h: 0.018 },
  blend: { thr: 0.45, h: 0.085 },
  blendL: { thr: 0.45, h: 0.085 },
  blendR: { thr: 0.45, h: 0.085 },
};

function runAll(text: string) {
  return replayAll(framesOf(parseJsonl(text)), DEFAULT_TIMING, FIXTURE_USER);
}

/** A synthetic 30 fps session: "HI SOS", spontaneous blinks, a wink, a face loss and sensor noise. */
function makeFixture(): string {
  const rng = mulberry32(2026);
  const noise = () => (rng() - 0.5) * 0.02;
  type Ev = { s: number; d: number; eye: 'both' | 'L' | 'R' };
  const ev: Ev[] = [];
  let t = 800;
  const sym = (d: number) => {
    ev.push({ s: t, d, eye: 'both' });
    t += d + 350;
  };
  const letter = (p: string) => {
    for (const c of p) sym(c === '.' ? 380 : 950);
    t += 1300;
  };
  letter('....');
  letter('..');
  t += 2200; // word gap
  ev.push({ s: t, d: 140, eye: 'both' }); // spontaneous blink, rejected
  t += 900;
  letter('...');
  letter('---');
  letter('...');
  ev.push({ s: t, d: 500, eye: 'L' }); // left wink
  t += 1500;
  ev.push({ s: t, d: 600, eye: 'both' }); // closure interrupted by face loss
  const lost = [t + 200, t + 500];
  t += 2000;
  const total = t + 4000;

  const header: HeaderLine = {
    type: 'header',
    schema: LOG_SCHEMA,
    app_version: 'fixture',
    participant: 'SYNTH',
    session: 1,
    study: 'A',
    seed: 2026,
    started_at: '2026-10-24T00:00:00',
    clock: 'callback',
    camera_label: 'synthetic',
    video_width: 640,
    video_height: 480,
    setup: {
      age_range: '',
      glasses: '',
      lighting: '',
      camera_model: '',
      distance_cm: '',
      notes: 'synthetic fixture',
    },
    consent: { data: true, video: false, consented_at: '2026-10-24T00:00:00' },
    timing: DEFAULT_TIMING,
    video_start_ms: null,
  };
  const lines: string[] = [JSON.stringify(header)];
  const dt = 1000 / 30;
  for (let i = 0; i * dt <= total; i++) {
    const tm = Math.round(i * dt * 100) / 100;
    const face = !(tm >= lost[0]! && tm < lost[1]!);
    const active = ev.find((e) => tm >= e.s && tm < e.s + e.d);
    const lClosed = !!active && active.eye !== 'R';
    const rClosed = !!active && active.eye !== 'L';
    const f: FrameLine = {
      type: 'frame',
      t_ms: tm,
      face,
      earL: face ? +((lClosed ? 0.08 : 0.3) + noise()).toFixed(4) : 0,
      earR: face ? +((rClosed ? 0.08 : 0.3) + noise()).toFixed(4) : 0,
      blinkL: face ? +((lClosed ? 0.88 : 0.06) + noise()).toFixed(4) : 0,
      blinkR: face ? +((rClosed ? 0.88 : 0.06) + noise()).toFixed(4) : 0,
      yaw: 0,
      pitch: 0,
      roll: 0,
      n_faces: face ? 1 : 0,
      eye_pts: [],
    };
    lines.push(JSON.stringify(f));
  }
  return lines.join('\n') + '\n';
}

const args = process.argv.slice(2);
if (args.includes('--make-fixture')) {
  const jsonl = makeFixture();
  writeFileSync('tests/fixtures/replay_sample.jsonl', jsonl);
  const expected = { timing: DEFAULT_TIMING, user: FIXTURE_USER, results: runAll(jsonl) };
  writeFileSync('tests/fixtures/replay_expected.json', JSON.stringify(expected, null, 2) + '\n');
  console.log('wrote tests/fixtures/replay_sample.jsonl and replay_expected.json');
} else if (args[0]) {
  const out = runAll(readFileSync(args[0], 'utf8'));
  const i = args.indexOf('--out');
  const det = args.indexOf('--detector');
  const result = det >= 0 ? out[args[det + 1]!] : out;
  if (i >= 0) writeFileSync(args[i + 1]!, JSON.stringify(result, null, 2));
  else console.log(JSON.stringify(result, null, 2));
}
