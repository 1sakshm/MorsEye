import '../site/layout';
import '../styles/try.css';
import {
  loadCalibration,
  N_CLOSURES,
  runCalibration,
  saveCalibration,
  type StoredCalibration,
} from '../app/calibrate';
import { Engine, STATUS_TEXT, type EngineFrame, type Status } from '../app/engine';
import { load, save } from '../app/storage';
import { CAMERA_HELP, CameraError } from '../capture/camera';
import { Decoder, MORSE, type DecoderAction } from '../decode/decoder';
import {
  FIXED_BLEND,
  FIXED_EAR,
  HysteresisDetector,
  SIGNALS,
  WinkDetector,
  type Threshold,
} from '../detect/detector';
import { click } from '../output/sound';
import { speak, speakLetter } from '../output/speech';
import {
  DEFAULT_TIMING,
  presetTiming,
  segment,
  validTiming,
  type Preset,
  type Timing,
} from '../segment/segmenter';
import { token } from '../site/layout';
import { Ring } from '../ui/ring';
import { Trace } from '../ui/trace';

// ---------- Settings ----------

interface Settings {
  preset: Preset | 'custom';
  custom: Timing;
  signal: 'blend' | 'ear';
  winks: boolean;
  speakLetters: boolean;
  speakWords: boolean;
  sound: boolean;
  keys: boolean;
  camera: boolean;
}

const SETTINGS_KEY = 'morseye-settings';
const settings = load<Settings>(SETTINGS_KEY, {
  preset: 'medium',
  custom: DEFAULT_TIMING,
  signal: 'blend',
  winks: false,
  speakLetters: true,
  speakWords: true,
  sound: false,
  keys: true,
  camera: true,
});
const persist = () => save(SETTINGS_KEY, settings);

function timing(): Timing {
  if (settings.preset === 'custom')
    return validTiming(settings.custom) ? settings.custom : DEFAULT_TIMING;
  return presetTiming(settings.preset);
}

// ---------- DOM ----------

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const video = $<HTMLVideoElement>('video');
const overlay = $<HTMLCanvasElement>('overlay');
const octx = overlay.getContext('2d')!;
const decodedEl = $('decoded');
const patternEl = $('pattern');
const bigLetter = $('big-letter');
const announcer = $('announcer');
const fpsChip = $('fps-chip');
const banner = $('status-banner');
const pausedBadge = $('paused-badge');

const ring = new Ring($('ring'));
const trace = new Trace($<HTMLCanvasElement>('trace'));

// ---------- Pipeline state ----------

const engine = new Engine(video);
let calib: StoredCalibration | null = loadCalibration();
let main: HysteresisDetector;
let wink: WinkDetector | null = null;
const decoder = new Decoder(timing(), settings.winks);
let calibrating = false;

function threshold(): Threshold {
  if (settings.signal === 'ear') return calib?.ear.ok ? calib.ear : FIXED_EAR;
  const c = settings.winks ? calib?.blendMin : calib?.blend;
  return c?.ok ? c : FIXED_BLEND;
}

function buildDetectors(): void {
  const signal =
    settings.signal === 'ear'
      ? SIGNALS.earMean
      : settings.winks
        ? SIGNALS.blendMin
        : SIGNALS.blendMax;
  main = new HysteresisDetector(signal, threshold());
  wink = settings.winks
    ? new WinkDetector(
        calib?.blendL.ok ? calib.blendL : FIXED_BLEND,
        calib?.blendR.ok ? calib.blendR : FIXED_BLEND,
      )
    : null;
  trace.range = settings.signal === 'ear' ? [0, 0.42] : [0, 1];
  $('trace-label').textContent =
    settings.signal === 'ear'
      ? 'Eye aspect ratio (lower = closed)'
      : 'Blink score (higher = closed)';
}

function applyTiming(): void {
  const t = timing();
  decoder.timing = t;
  decoder.winks = settings.winks;
  ring.setTiming(t);
  renderCommands(t);
}

// ---------- Frame loop ----------

engine.onFrame((f) => {
  fpsChip.textContent = `${f.fps ? f.fps.toFixed(0) : '--'} fps`;
  fpsChip.dataset.low = String(f.fps > 0 && f.fps < 20);
  drawOverlay(f);
  // While the calibration dialog is open (including practice), nothing is typed.
  if (calibrating || !calibEl.hidden) {
    ring.update(null, decoder.timing);
    return;
  }

  const c = main.update(f.features);
  const w = wink?.update(f.features) ?? null;
  const actions: DecoderAction[] = [];
  if (w) actions.push(...decoder.push(segment(w, decoder.timing)));
  if (c) actions.push(...decoder.push(segment(c, decoder.timing)));
  const busy = main.state !== 'open' || wink?.state === 'closed';
  actions.push(...decoder.tick(f.features.t_ms, busy));
  actions.forEach(handle);

  const since = main.closedSince ?? (wink?.state === 'closed' ? wink.closedSince : null);
  ring.update(since === null ? null : f.features.t_ms - since, decoder.timing);

  trace.push(main.value(f.features), main.state === 'closed');
  trace.draw(main.threshold.thr, main.threshold.h, main.signal.kind === 'blend');
  renderPattern();
});

engine.onStatus(showStatus);

function showStatus(s: Status): void {
  const info = STATUS_TEXT[s];
  banner.hidden = !info;
  banner.dataset.status = s;
  if (info) {
    $('status-title').textContent = info.title;
    $('status-body').textContent = ' ' + info.body;
  }
}

function drawOverlay(f: EngineFrame): void {
  const w = overlay.clientWidth;
  const h = overlay.clientHeight;
  const dpr = window.devicePixelRatio || 1;
  if (overlay.width !== Math.round(w * dpr)) {
    overlay.width = Math.round(w * dpr);
    overlay.height = Math.round(h * dpr);
  }
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  octx.clearRect(0, 0, w, h);
  if (!f.eyePts.length || !video.videoWidth) return;
  // The video is shown with object-fit: cover and mirrored; map normalised points the same way.
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const scale = Math.max(w / vw, h / vh);
  const ox = (w - vw * scale) / 2;
  const oy = (h - vh * scale) / 2;
  const closed = main.state === 'closed';
  octx.fillStyle = closed ? token('--signal') : token('--trace');
  for (let i = 0; i < f.eyePts.length; i += 2) {
    const x = w - (ox + f.eyePts[i]! * vw * scale);
    const y = oy + f.eyePts[i + 1]! * vh * scale;
    octx.beginPath();
    octx.arc(x, y, 2.6, 0, Math.PI * 2);
    octx.fill();
  }
}

// ---------- Decoder actions -> output ----------

function handle(a: DecoderAction): void {
  switch (a.type) {
    case 'symbol':
      if (settings.sound) click(a.symbol === '.' ? 880 : 620, a.symbol === '.' ? 40 : 90);
      tick(a.symbol === '.' ? '·' : '−');
      break;
    case 'letter':
      renderText(true);
      flashLetter(a.char);
      announce(a.char);
      if (settings.speakLetters) speakLetter(a.char);
      break;
    case 'unknown':
      flashLetter('?', true);
      announce('unknown pattern');
      speak('unknown', { interrupt: true });
      break;
    case 'space': {
      renderText(false);
      announce('space');
      const word = decoder.text.trimEnd().split(' ').pop();
      if (settings.speakWords && word) speak(word);
      break;
    }
    case 'backspace':
      renderText(false);
      announce(
        a.what === 'pattern'
          ? 'letter cancelled'
          : `deleted ${a.removed === ' ' ? 'space' : a.removed}`,
      );
      flashLetter('⌫', true);
      break;
    case 'pause':
      pausedBadge.hidden = !a.paused;
      announce(a.paused ? 'input paused' : 'input resumed');
      speak(a.paused ? 'paused' : 'resumed', { interrupt: true });
      break;
    case 'speak':
      speak(a.text || 'nothing typed yet', { interrupt: true });
      break;
    case 'ignored':
      break;
  }
}

function renderText(animateLast: boolean): void {
  const text = decoder.text;
  decodedEl.textContent = '';
  const body = document.createElement('span');
  body.textContent = animateLast ? text.slice(0, -1) : text;
  decodedEl.append(body);
  if (animateLast && text) {
    const last = document.createElement('span');
    last.className = 'ink';
    last.textContent = text.slice(-1);
    decodedEl.append(last);
  }
  const caret = document.createElement('span');
  caret.className = 'caret';
  caret.setAttribute('aria-hidden', 'true');
  decodedEl.append(caret);
  decodedEl.scrollTop = decodedEl.scrollHeight;
}

function renderPattern(): void {
  const p = decoder.pattern.replace(/\./g, '·').replace(/-/g, '−');
  if (patternEl.textContent !== (p || ' ')) patternEl.textContent = p || ' ';
}

let flashTimer = 0;
function flashLetter(ch: string, warn = false): void {
  bigLetter.textContent = ch;
  bigLetter.classList.toggle('warn', warn);
  bigLetter.classList.remove('show');
  void bigLetter.offsetWidth;
  bigLetter.classList.add('show');
  clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => bigLetter.classList.remove('show'), 900);
}

function tick(sym: string): void {
  patternEl.classList.remove('tick');
  void patternEl.offsetWidth;
  patternEl.classList.add('tick');
  patternEl.dataset.last = sym;
}

function announce(msg: string): void {
  announcer.textContent = msg;
}

// ---------- Output controls ----------

$('copy-btn').addEventListener('click', async () => {
  const status = $('copy-status');
  try {
    await navigator.clipboard.writeText(decoder.text.trim());
    status.textContent = 'Copied.';
  } catch {
    status.textContent = 'Copy failed. Select the text and copy it instead.';
  }
  setTimeout(() => (status.textContent = ''), 2500);
});

$('speak-btn').addEventListener('click', () =>
  speak(decoder.text.trim() || 'nothing typed yet', { interrupt: true }),
);

const clearConfirm = $('clear-confirm');
$('clear-btn').addEventListener('click', () => {
  clearConfirm.hidden = false;
  $('clear-no').focus();
});
$('clear-no').addEventListener('click', () => {
  clearConfirm.hidden = true;
  $('clear-btn').focus();
});
$('clear-yes').addEventListener('click', () => {
  decoder.clear();
  renderText(false);
  announce('text cleared');
  clearConfirm.hidden = true;
  $('clear-btn').focus();
});

// Optional keyboard helpers; never needed for typing.
window.addEventListener('keydown', (e) => {
  if (!settings.keys || calibrating) return;
  const t = e.target as HTMLElement;
  if (t.closest('input, textarea, select, button, [contenteditable]')) return;
  if (e.code === 'Space') {
    e.preventDefault();
    [...decoder.commitLetter(), ...decoder.insertSpace()].forEach(handle);
  } else if (e.code === 'Backspace') {
    e.preventDefault();
    handle(decoder.backspace());
  } else if (e.code === 'KeyP') {
    decoder.paused = !decoder.paused;
    handle({ type: 'pause', paused: decoder.paused });
  }
});

// ---------- Settings UI ----------

function renderCommands(t: Timing): void {
  const s = (ms: number) => `${(ms / 1000).toFixed(ms % 100 ? 2 : 1)} s`;
  const rows: [string, string, string][] = [
    [`under ${s(t.rejectMs)}`, 'ignored (a normal blink)', 'reject'],
    [`${s(t.rejectMs)} – ${s(t.dotMaxMs)}`, 'dot ·', 'dot'],
    [`${s(t.dotMaxMs)} – ${s(t.dashMaxMs)}`, 'dash −', 'dash'],
    [
      `${s(t.dashMaxMs)} – ${s(t.cmdMs)}`,
      '“pause” hold: two within 4 s turn input off or on',
      'hold',
    ],
    [`${s(t.cmdMs)} or more`, 'delete the last letter', 'backspace'],
  ];
  $('bands-body').innerHTML = rows
    .map(
      ([d, r, b]) =>
        `<tr><td class="mono">${d}</td><td><span class="swatch" data-band="${b}"></span>${r}</td></tr>`,
    )
    .join('');
  $('gaps-text').textContent =
    `Keep your eyes open for ${s(t.letterGapMs)} to finish a letter, and ${s(t.wordGapMs)} to add a space.`;
  $('wink-text').hidden = !settings.winks;
}

const CUSTOM_FIELDS: [keyof Timing, string, number, number][] = [
  ['rejectMs', 'Ignore closures shorter than', 50, 600],
  ['dotMaxMs', 'Dot ends at', 200, 1500],
  ['dashMaxMs', 'Dash ends at', 400, 3000],
  ['cmdMs', 'Delete from', 600, 4000],
  ['letterGapMs', 'Letter gap', 300, 4000],
  ['wordGapMs', 'Word gap', 800, 8000],
];

function renderCustom(): void {
  const panel = $('custom-panel');
  panel.hidden = settings.preset !== 'custom';
  if (panel.hidden) return;
  panel.innerHTML =
    CUSTOM_FIELDS.map(
      ([k, label, min, max]) => `
    <label class="slider">
      <span>${label} <output class="mono" id="out-${k}">${settings.custom[k]} ms</output></span>
      <input type="range" min="${min}" max="${max}" step="10" value="${settings.custom[k]}" data-key="${k}" />
    </label>`,
    ).join('') +
    '<p class="muted" id="custom-warn" hidden>Bands must increase in order; using defaults until they do.</p>';
  panel.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const k = inp.dataset.key as keyof Timing;
      settings.custom = { ...settings.custom, [k]: Number(inp.value) };
      $(`out-${k}`).textContent = `${inp.value} ms`;
      $('custom-warn').hidden = validTiming(settings.custom);
      persist();
      applyTiming();
    });
  });
}

function bindSettings(): void {
  document.querySelectorAll<HTMLInputElement>('input[name=preset]').forEach((r) => {
    r.checked = r.value === settings.preset;
    r.addEventListener('change', () => {
      settings.preset = r.value as Settings['preset'];
      persist();
      renderCustom();
      applyTiming();
    });
  });
  document.querySelectorAll<HTMLInputElement>('input[name=signal]').forEach((r) => {
    r.checked = r.value === settings.signal;
    r.addEventListener('change', () => {
      settings.signal = r.value as Settings['signal'];
      persist();
      buildDetectors();
    });
  });
  const check = (
    id: string,
    key: 'winks' | 'speakLetters' | 'speakWords' | 'sound' | 'keys' | 'camera',
    after?: () => void,
  ) => {
    const el = $<HTMLInputElement>(id);
    el.checked = settings[key];
    el.addEventListener('change', () => {
      settings[key] = el.checked;
      persist();
      after?.();
    });
  };
  check('opt-winks', 'winks', () => {
    buildDetectors();
    applyTiming();
  });
  check('opt-speak-letters', 'speakLetters');
  check('opt-speak-words', 'speakWords');
  check('opt-sound', 'sound');
  check('opt-keys', 'keys');
  check('opt-camera', 'camera', () =>
    document.body.classList.toggle('hide-camera', !settings.camera),
  );
  document.body.classList.toggle('hide-camera', !settings.camera);
  renderCustom();
}

function renderMorseList(): void {
  $('morse-list').innerHTML = Object.entries(MORSE)
    .filter(([, c]) => /[A-Z0-9]/.test(c))
    .map(([p, c]) => `<li><b>${c}</b><span>${p.replace(/\./g, '·').replace(/-/g, '−')}</span></li>`)
    .join('');
}

// ---------- Calibration ----------

const calibEl = $('calib');
const calibMsg = $('calib-msg');
const calibTarget = $('calib-target');
const calibTrace = new Trace($<HTMLCanvasElement>('calib-trace'), [0, 1], 180);
let calibAbort: AbortController | null = null;
let practiceOff: (() => void) | null = null;
let lastFocus: HTMLElement | null = null;

function openCalibration(): void {
  lastFocus = document.activeElement as HTMLElement;
  calibEl.hidden = false;
  $('calib-step').textContent = 'Calibration';
  $('calib-title').textContent = 'Let MorsEye learn your eyes';
  calibMsg.textContent =
    `First, look at the dot with your eyes open for 5 seconds. Then close your eyes each time the circle ` +
    `turns blue (you will also hear a tone), and open them after about a second. ${N_CLOSURES} times.`;
  calibTarget.dataset.state = 'idle';
  $('calib-go').hidden = false;
  $('calib-retry').hidden = true;
  $('calib-warning').hidden = true;
  $('calib-trace').hidden = true;
  $('calib-ticks').hidden = true;
  $('calib-skip').textContent = calib ? 'Cancel' : 'Skip (use default thresholds)';
  $('calib-go').textContent = 'Begin';
  $('calib-go').focus();
}

function closeCalibration(): void {
  practiceOff?.();
  practiceOff = null;
  calibAbort?.abort();
  calibAbort = null;
  calibrating = false;
  calibEl.hidden = true;
  buildDetectors();
  lastFocus?.focus();
}

calibEl.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeCalibration();
  if (e.key === 'Tab') {
    // Keep focus inside the dialog.
    const f = [...calibEl.querySelectorAll<HTMLElement>('button:not([hidden])')];
    const first = f[0];
    const last = f[f.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});

let toneCtx: AudioContext | null = null;
function tone(on: boolean): void {
  calibTarget.dataset.state = on ? 'close' : 'ready';
  if (!on) return;
  try {
    toneCtx ??= new AudioContext();
    const o = toneCtx.createOscillator();
    const g = toneCtx.createGain();
    o.frequency.value = 660;
    g.gain.setValueAtTime(0.06, toneCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, toneCtx.currentTime + 0.18);
    o.connect(g).connect(toneCtx.destination);
    o.start();
    o.stop(toneCtx.currentTime + 0.2);
  } catch {
    /* no audio */
  }
}

async function startCalibration(): Promise<void> {
  practiceOff?.();
  practiceOff = null;
  calibAbort?.abort();
  calibAbort = new AbortController();
  calibrating = true;
  $('calib-go').hidden = true;
  $('calib-retry').hidden = true;
  $('calib-warning').hidden = true;
  $('calib-trace').hidden = true;
  $('calib-ticks').hidden = true;
  calibTarget.dataset.state = 'open';
  try {
    const result = await runCalibration(
      engine,
      (s) => {
        if (s.step === 'open') {
          $('calib-step').textContent = 'Step 1 of 3';
          calibMsg.textContent = `Keep your eyes open and look at the dot… ${Math.ceil(s.remainingMs / 1000)}`;
        } else if (s.step === 'ready') {
          $('calib-step').textContent = 'Step 2 of 3';
          calibMsg.textContent =
            s.index >= N_CLOSURES
              ? 'Done. Open your eyes.'
              : `Get ready… closure ${s.index + 1} of ${N_CLOSURES}`;
        } else if (s.step === 'close') {
          calibMsg.textContent = `Close your eyes now (${s.index + 1} of ${N_CLOSURES})`;
        }
      },
      tone,
      calibAbort.signal,
    );
    showFit(result);
  } catch (e) {
    if ((e as DOMException).name !== 'AbortError') throw e;
  }
}

function showFit(result: StoredCalibration): void {
  const c =
    settings.signal === 'ear' ? result.ear : settings.winks ? result.blendMin : result.blend;
  $('calib-step').textContent = 'Step 3 of 3';
  calibTarget.dataset.state = 'idle';
  if (!c.ok) {
    calibrating = false;
    $('calib-title').textContent = 'That did not separate well';
    const w = $('calib-warning');
    w.hidden = false;
    w.textContent = c.warning ?? 'Calibration quality is low.';
    calibMsg.textContent = '';
    $('calib-retry').hidden = false;
    $('calib-retry').focus();
    return;
  }
  calib = result;
  saveCalibration(result);
  buildDetectors();
  calibrating = false;
  practice(c);
}

/** Five practice closures with the fitted threshold, shown as green ticks on a live trace. */
function practice(c: Threshold): void {
  $('calib-title').textContent = 'Practice: close your eyes five times';
  calibMsg.textContent =
    'Each deliberate closure gets a tick. The dashed line is your personal threshold.';
  const ticks = $('calib-ticks');
  ticks.hidden = false;
  ticks.innerHTML = Array.from(
    { length: 5 },
    (_, i) => `<li aria-label="practice ${i + 1}"></li>`,
  ).join('');
  $('calib-trace').hidden = false;
  calibTrace.range = settings.signal === 'ear' ? [0, 0.42] : [0, 1];
  calibTrace.clear();
  const det = new HysteresisDetector(main.signal, c);
  let n = 0;
  const t = timing();
  const off = engine.onFrame(({ features: f }) => {
    if (calibEl.hidden) {
      off();
      return;
    }
    const cl = det.update(f);
    calibTrace.push(det.value(f), det.state === 'closed');
    calibTrace.draw(c.thr, c.h, det.signal.kind === 'blend');
    if (cl && cl.duration_ms >= t.rejectMs && n < 5) {
      ticks.children[n]!.classList.add('ok');
      n++;
      announce(`practice ${n} of 5`);
      if (n === 5) {
        calibMsg.textContent = 'All five registered. You are ready to type.';
        $('calib-skip').textContent = 'Start typing';
        $('calib-skip').focus();
        off();
      }
    }
  });
  practiceOff = () => void off();
  $('calib-skip').textContent = 'Start typing';
  $('calib-retry').hidden = false;
}

$('calib-go').addEventListener('click', () => void startCalibration());
$('calib-retry').addEventListener('click', () => void startCalibration());
$('calib-skip').addEventListener('click', closeCalibration);
$('recalibrate').addEventListener('click', openCalibration);

// ---------- Start ----------

async function start(): Promise<void> {
  $('start-panel').hidden = true;
  $('camera-error').hidden = true;
  $('app').hidden = false;
  showStatus('LOADING');
  try {
    await engine.start();
  } catch (e) {
    $('app').hidden = true;
    const kind = e instanceof CameraError ? e.kind : 'other';
    const help = CAMERA_HELP[kind];
    $('camera-error-title').textContent = help.title;
    $('camera-error-fixes').innerHTML = help.fixes.map((f) => `<li>${f}</li>`).join('');
    $('camera-error').hidden = false;
    $('camera-retry').focus();
    return;
  }
  if (!calib) openCalibration();
}

$('start-btn').addEventListener('click', () => void start());
$('camera-retry').addEventListener('click', () => void start());

bindSettings();
renderMorseList();
buildDetectors();
applyTiming();
renderText(false);
