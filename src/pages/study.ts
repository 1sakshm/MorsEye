import '../site/layout';
import '../styles/try.css';
import '../styles/study.css';
import { fitAll } from '../app/calibrate';
import { Engine, STATUS_TEXT, type EngineFrame } from '../app/engine';
import { CAMERA_HELP, CameraError } from '../capture/camera';
import { Decoder, MORSE, type DecoderAction } from '../decode/decoder';
import { mulberry32 } from '../detect/calibration';
import { makeDetector, type Detector, type DetectorId } from '../detect/detector';
import { DEFAULT_TIMING, segment, validTiming, type Timing } from '../segment/segmenter';
import type { FrameFeatures } from '../types';
import { calibrationBlock, studyA, studyBPhrases, type Block } from '../study/protocol';
import { download, Recorder } from '../study/recorder';
import { LOG_SCHEMA, type BlockName, type HeaderLine, type TlxLine } from '../study/schema';

const APP_VERSION = '2.0.0';
const LEAD_IN_MS = 3000;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const screens = ['s-setup', 's-check', 's-intro', 's-tlx', 's-end'];
function show(id: string | null): void {
  screens.forEach((s) => ($(s).hidden = s !== id));
  $('stage').hidden = id !== null;
  document.body.classList.toggle('on-stage', id === null);
  if (id) $(id).querySelector<HTMLElement>('h1')?.setAttribute('tabindex', '-1');
  if (id) $(id).querySelector<HTMLElement>('h1')?.focus();
}

// ---------- 1. Setup ----------

interface Setup {
  participant: string;
  session: number;
  study: 'A' | 'B';
  seed: number;
  counterbalance: boolean;
  detector: DetectorId;
  timing: Timing;
  setup: HeaderLine['setup'];
  /** Record a local video of the face for labelling. */
  video: boolean;
}

const form = $<HTMLFormElement>('setup-form');
const seedInput = form.elements.namedItem('seed') as HTMLInputElement;
const idInput = form.elements.namedItem('participant') as HTMLInputElement;
const studySelect = form.elements.namedItem('study') as HTMLSelectElement;

/** Deterministic seed from the participant ID and session (FNV-1a). */
function seedFor(id: string, session: number): number {
  let h = 0x811c9dc5;
  for (const c of `${id}:${session}`) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193);
  return (h >>> 0) % 1_000_000;
}
const updateSeed = () => {
  const s = Number((form.elements.namedItem('session') as HTMLInputElement).value) || 1;
  seedInput.value = String(seedFor(idInput.value.trim().toUpperCase(), s));
};
idInput.addEventListener('input', updateSeed);
(form.elements.namedItem('session') as HTMLInputElement).addEventListener('input', updateSeed);
updateSeed();

studySelect.addEventListener('change', () => {
  form.querySelector<HTMLElement>('.study-b-only')!.hidden = studySelect.value !== 'B';
});
$('timing-grid').innerHTML = (Object.keys(DEFAULT_TIMING) as (keyof Timing)[])
  .map(
    (k) =>
      `<label>${k}<input name="t_${k}" type="number" value="${DEFAULT_TIMING[k]}" min="0" step="10" /></label>`,
  )
  .join('');

let setup: Setup;
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const v = (n: string) => ((form.elements.namedItem(n) as HTMLInputElement).value ?? '').trim();
  const participant = v('participant').toUpperCase();
  const err = $('setup-error');
  if (!/^P\d{2,3}$/.test(participant)) {
    err.textContent = 'Participant ID must look like P01. Do not enter names.';
    idInput.focus();
    return;
  }
  const timing = Object.fromEntries(
    (Object.keys(DEFAULT_TIMING) as (keyof Timing)[]).map((k) => [k, Number(v(`t_${k}`))]),
  ) as unknown as Timing;
  if (v('study') === 'B' && !validTiming(timing)) {
    err.textContent = 'The timing bands must increase in order.';
    return;
  }
  err.textContent = '';
  setup = {
    participant,
    session: Number(v('session')) || 1,
    study: v('study') as 'A' | 'B',
    seed: Number(v('seed')),
    counterbalance: (form.elements.namedItem('counterbalance') as HTMLInputElement).checked,
    detector: v('detector') as DetectorId,
    timing: v('study') === 'B' ? timing : DEFAULT_TIMING,
    setup: {
      age_range: v('age_range'),
      glasses: v('glasses') as '' | 'yes' | 'no',
      lighting: v('lighting'),
      camera_model: v('camera_model'),
      distance_cm: v('distance_cm'),
      notes: (form.elements.namedItem('notes') as HTMLTextAreaElement).value.trim(),
    },
    video: (form.elements.namedItem('video') as HTMLInputElement).checked,
  };
  void cameraCheck();
});

// ---------- 2. Camera check ----------

const video = $<HTMLVideoElement>('video');
const engine = new Engine(video);
let recorder: Recorder;
let clockSeen: HeaderLine['clock'] = 'callback';

async function cameraCheck(): Promise<void> {
  show('s-check');
  $('check-video').textContent = setup.video ? 'yes' : 'no';
  try {
    await engine.start();
  } catch (e) {
    const help = CAMERA_HELP[e instanceof CameraError ? e.kind : 'other'];
    $('check-status').textContent = `${help.title}. ${help.fixes.join(' ')}`;
    return;
  }
  $('check-camera').textContent = engine.cameraLabel || 'unknown';
  let n = 0;
  const off = engine.onFrame((f) => {
    if ($('s-check').hidden) return off();
    n++;
    clockSeen = f.clock;
    $('check-fps').textContent = f.fps.toFixed(1);
    $('check-clock').textContent = f.clock;
    $('check-status').textContent = STATUS_TEXT[f.status]?.title ?? 'face found, OK';
    ($('check-go') as HTMLButtonElement).disabled = n < 30;
  });
}

$('check-go').addEventListener('click', () => void run());

// ---------- 3–6. Running the protocol ----------

function header(): HeaderLine {
  return {
    type: 'header',
    schema: LOG_SCHEMA,
    app_version: APP_VERSION,
    participant: setup.participant,
    session: setup.session,
    study: setup.study,
    seed: setup.seed,
    started_at: new Date().toISOString(),
    clock: clockSeen,
    camera_label: engine.cameraLabel,
    video_width: video.videoWidth,
    video_height: video.videoHeight,
    setup: setup.setup,
    // The field name is kept so old and new logs share one format; there is no consent screen since 25 Oct 2026.
    consent: { data: true, video: setup.video, consented_at: new Date().toISOString() },
    timing: setup.timing,
    video_start_ms: null,
  };
}

let aborted = false;

async function run(): Promise<void> {
  recorder = new Recorder(header());
  if (setup.video && engine.stream) recorder.startVideo(engine.stream);
  engine.onFrame((f) => recorder.frame(f));
  let fpsTimer = window.setInterval(
    () =>
      recorder.event({
        type: 'fps',
        t_ms: performance.now(),
        fps: Math.round(engine.fps.fps * 10) / 10,
      }),
    5000,
  );

  try {
    if (setup.study === 'A') {
      const blocks = studyA(setup.seed, setup.counterbalance);
      for (const [i, b] of blocks.entries()) {
        await intro(`Block ${i + 1} of ${blocks.length}`, b.title, b.instructions);
        await runBlock(b);
      }
    } else {
      const calib = calibrationBlock(mulberry32(setup.seed));
      await intro('Calibration', calib.title, calib.instructions);
      const frames = await runBlock(calib);
      const detector = makeStudyBDetector(calib, frames);
      const phraseBlocks = studyBPhrases(setup.seed);
      for (const [i, phrases] of phraseBlocks.entries()) {
        const name = `B${i + 1}` as BlockName;
        await intro(
          `Typing block ${i + 1} of 3`,
          'Type the phrases',
          'Type each phrase in Morse with your eyes. Mistakes are fine; you can delete with a long hold. ' +
            'Tell the experimenter when you have finished a phrase.',
        );
        await runTyping(name, phrases, detector());
        await tlx(name);
      }
    }
  } catch (e) {
    if (!aborted) throw e;
  } finally {
    clearInterval(fpsTimer);
    fpsTimer = 0;
    await recorder.stopVideo();
    engine.stop();
    finish();
  }
}

/** Builds the fixed Study B detector, fitting per-user thresholds from the calibration block. */
function makeStudyBDetector(calib: Block, frames: FrameFeatures[]): () => Detector {
  const t0 = blockStartT;
  const open = frames.filter((f) => f.face && f.t_ms - t0 >= 1000 && f.t_ms - t0 < 15_000);
  const closures = calib.cues
    .filter((c) => c.cue === 'SHORT' || c.cue === 'LONG')
    .map((c) => frames.filter((f) => f.t_ms - t0 >= c.at_ms && f.t_ms - t0 < c.at_ms + 2000));
  const fit = fitAll(open, closures);
  recorder.event({
    type: 'action',
    t_ms: performance.now(),
    block: 'calibration',
    action: { type: 'calibration_fit', detector: setup.detector, ear: fit.ear, blend: fit.blend },
  });
  return () =>
    makeDetector(setup.detector, {
      ...(fit.ear.ok ? { ear: fit.ear } : {}),
      ...(fit.blend.ok ? { blend: fit.blend } : {}),
    });
}

function intro(step: string, title: string, text: string): Promise<void> {
  show('s-intro');
  $('intro-step').textContent = step;
  $('intro-title').textContent = title;
  $('intro-text').textContent = text;
  return new Promise((resolve) => {
    const go = () => {
      window.removeEventListener('keydown', key);
      $('intro-go').removeEventListener('click', go);
      resolve();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        go();
      }
    };
    window.addEventListener('keydown', key);
    $('intro-go').addEventListener('click', go);
  });
}

const center = $('stage-center');
const corner = $('stage-corner');
const bar = $('stage-bar');

const CUE_TEXT: Record<string, string> = {
  OPEN: '',
  SHORT: 'SHORT',
  LONG: 'LONG',
  'WINK-L': 'WINK LEFT',
  'WINK-R': 'WINK RIGHT',
};

async function leadIn(): Promise<void> {
  show(null);
  $('stage-reading').hidden = true;
  $('stage-b').hidden = true;
  corner.textContent = '';
  for (const n of [3, 2, 1]) {
    center.innerHTML = `<span class="count">${n}</span>`;
    await sleep(LEAD_IN_MS / 3);
    if (aborted) throw new Error('aborted');
  }
  center.textContent = '';
}

let blockStartT = 0;

/** Runs one timed block with cues. Resolves with the frames recorded during it. */
async function runBlock(b: Block): Promise<FrameFeatures[]> {
  await leadIn();
  const frames: FrameFeatures[] = [];
  const off = engine.onFrame((f: EngineFrame) => frames.push(f.features));
  const reading = $('stage-reading');
  reading.hidden = !b.reading;
  if (b.reading) {
    reading.innerHTML = b.reading
      .split('\n\n')
      .map((p) => `<p>${p}</p>`)
      .join('');
    reading.scrollTop = 0;
  }
  blockStartT = performance.now();
  recorder.event({ type: 'block', t_ms: blockStartT, block: b.name, phase: 'start' });
  const shown = new Set<number>();

  await new Promise<void>((resolve, reject) => {
    const frame = () => {
      if (aborted) return reject(new Error('aborted'));
      const now = performance.now();
      const el = now - blockStartT;
      bar.style.width = `${Math.min(100, (el / b.duration_ms) * 100)}%`;
      let active: string | null = null;
      b.cues.forEach((c, i) => {
        if (el >= c.at_ms && el < c.at_ms + c.duration_ms) {
          active = c.cue;
          if (!shown.has(i)) {
            shown.add(i);
            recorder.event({
              type: 'cue',
              t_ms: now,
              block: b.name,
              index: i,
              cue: c.cue,
              duration_ms: c.duration_ms,
            });
          }
        }
      });
      const target = b.cornerCues ? corner : center;
      const html =
        active === 'OPEN'
          ? '<span class="dot-target"></span><span class="cue-sub">Eyes open, look at the dot</span>'
          : active
            ? `<span class="cue cue--${String(active).toLowerCase()}">${CUE_TEXT[active]}</span>`
            : b.name === 'calibration'
              ? '<span class="dot-target dim"></span>'
              : '';
      if (target.dataset.html !== html) {
        target.innerHTML = html;
        target.dataset.html = html;
      }
      if (el >= b.duration_ms) return resolve();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });

  off();
  recorder.event({ type: 'block', t_ms: performance.now(), block: b.name, phase: 'end' });
  center.textContent = '';
  corner.textContent = '';
  center.dataset.html = '';
  corner.dataset.html = '';
  return frames;
}

/** Study B typing block: one phrase at a time; the experimenter presses Enter to move on. */
async function runTyping(block: BlockName, phrases: string[], det: Detector): Promise<void> {
  await leadIn();
  $('stage-b').hidden = false;
  $('stage-morse').innerHTML = Object.entries(MORSE)
    .filter(([, c]) => /[A-Z]/.test(c))
    .map(([p, c]) => `<li><b>${c}</b><span>${p.replace(/\./g, '·').replace(/-/g, '−')}</span></li>`)
    .join('');
  recorder.event({ type: 'block', t_ms: performance.now(), block, phase: 'start' });
  for (const [i, target] of phrases.entries()) {
    bar.style.width = `${(i / phrases.length) * 100}%`;
    const dec = new Decoder(setup.timing);
    det.reset();
    $('phrase-target').textContent = target;
    $('phrase-typed').textContent = '';
    recorder.event({
      type: 'phrase',
      t_ms: performance.now(),
      block,
      index: i,
      phase: 'start',
      target,
    });
    const log = (t_ms: number, action: Record<string, unknown>) =>
      recorder.event({ type: 'action', t_ms, block, action: { ...action, text: dec.text } });
    const off = engine.onFrame((f) => {
      const c = det.update(f.features);
      const acts: DecoderAction[] = [];
      if (c) {
        // Every closure, including rejected ones, so entry time can start at the first closure.
        const s = segment(c, setup.timing);
        log(f.features.t_ms, { type: 'segment', ...s });
        acts.push(...dec.push(s));
      }
      acts.push(...dec.tick(f.features.t_ms, det.state !== 'open'));
      for (const a of acts) log(f.features.t_ms, a);
      $('phrase-typed').textContent = dec.text.toLowerCase() || ' ';
      $('phrase-pattern').textContent = dec.pattern.replace(/\./g, '·').replace(/-/g, '−') || ' ';
    });
    await waitEnter();
    off();
    // Commit a pending letter, then log the final transcription.
    for (const a of dec.commitLetter()) log(performance.now(), a);
    recorder.event({
      type: 'phrase',
      t_ms: performance.now(),
      block,
      index: i,
      phase: 'end',
      target,
      typed: dec.text.trim().toLowerCase(),
    });
  }
  recorder.event({ type: 'block', t_ms: performance.now(), block, phase: 'end' });
  $('stage-b').hidden = true;
}

function waitEnter(): Promise<void> {
  return new Promise((resolve, reject) => {
    const key = (e: KeyboardEvent) => {
      if (aborted) {
        window.removeEventListener('keydown', key);
        reject(new Error('aborted'));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        window.removeEventListener('keydown', key);
        resolve();
      }
    };
    window.addEventListener('keydown', key);
  });
}

const TLX: [keyof Omit<TlxLine, 'type' | 't_ms' | 'block'>, string, string, string][] = [
  ['mental', 'Mental demand', 'How mentally demanding was the task?', 'Very low|Very high'],
  ['physical', 'Physical demand', 'How physically demanding was the task?', 'Very low|Very high'],
  ['temporal', 'Temporal demand', 'How hurried or rushed was the pace?', 'Very low|Very high'],
  [
    'performance',
    'Performance',
    'How successful were you in doing what you were asked?',
    'Perfect|Failure',
  ],
  [
    'effort',
    'Effort',
    'How hard did you have to work to reach your level of performance?',
    'Very low|Very high',
  ],
  [
    'frustration',
    'Frustration',
    'How insecure, discouraged, irritated, stressed or annoyed were you?',
    'Very low|Very high',
  ],
];

function tlx(block: BlockName): Promise<void> {
  show('s-tlx');
  const f = $<HTMLFormElement>('tlx-form');
  f.innerHTML =
    TLX.map(([k, title, q, ends]) => {
      const [lo, hi] = ends.split('|');
      return `<fieldset class="tlx-item"><legend>${title}</legend><p>${q}</p>
        <input type="range" name="${k}" min="0" max="100" step="5" value="50" aria-label="${title}" />
        <div class="tlx-ends"><span>${lo}</span><span>${hi}</span></div></fieldset>`;
    }).join('') + '<button class="btn btn--primary" type="submit">Continue</button>';
  return new Promise((resolve) => {
    f.onsubmit = (e) => {
      e.preventDefault();
      const val = (k: string) => Number((f.elements.namedItem(k) as HTMLInputElement).value);
      recorder.event({
        type: 'tlx',
        t_ms: performance.now(),
        block,
        mental: val('mental'),
        physical: val('physical'),
        temporal: val('temporal'),
        performance: val('performance'),
        effort: val('effort'),
        frustration: val('frustration'),
      });
      resolve();
    };
  });
}

function finish(): void {
  show('s-end');
  const name = recorder.baseName();
  $('end-stats').innerHTML = `
    <dt>Frames</dt><dd class="mono">${recorder.frames}</dd>
    <dt>Face found</dt><dd class="mono">${(recorder.faceRate * 100).toFixed(1)}%</dd>
    <dt>Status</dt><dd>${aborted ? 'aborted (partial session)' : 'complete'}</dd>`;
  $('dl-jsonl').onclick = () => download(recorder.jsonl(), `${name}.jsonl`);
  $('dl-webm').hidden = !recorder.hasVideo;
  $('dl-webm').onclick = () => download(recorder.webm(), `${name}.webm`);
}

$('stage-abort').addEventListener('click', () => {
  aborted = true;
  // Unblock any waiting key handler.
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
});

window.addEventListener('beforeunload', (e) => {
  if (recorder && recorder.frames > 0) e.preventDefault();
});

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

show('s-setup');
