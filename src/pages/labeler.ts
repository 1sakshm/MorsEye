import '../site/layout';
import '../styles/study.css';
import '../styles/labeler.css';
import { load, save } from '../app/storage';
import { token } from '../site/layout';
import { download } from '../study/recorder';
import {
  parseJsonl,
  type CueLine,
  type FrameLine,
  type HeaderLine,
  type LogLine,
} from '../study/schema';

/**
 * Labelling tool (PRD §5.8). Local only: files are opened from disk and labels are downloaded.
 * Ground truth is ONLY what the human marks with [ and ] plus a type; cue candidates are guides.
 */

const TYPES = ['spontaneous', 'short', 'long', 'wink-L', 'wink-R'] as const;
type LabelType = (typeof TYPES)[number];

interface Label {
  onset_ms: number;
  offset_ms: number;
  type: LabelType | null;
  labelled_at: string;
  /** Imported from a cue; its times are the cue window until the labeller sets them with [ and ]. */
  draft?: boolean;
  /** Started as a cue draft (reported in the export metadata). */
  from_cue?: boolean;
}

const CUE_TYPE: Partial<Record<CueLine['cue'], LabelType>> = {
  SHORT: 'short',
  LONG: 'long',
  'WINK-L': 'wink-L',
  'WINK-R': 'wink-R',
};

interface Candidate {
  t0: number;
  t1: number;
  cue: CueLine['cue'];
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const video = $<HTMLVideoElement>('video');
const canvas = $<HTMLCanvasElement>('timeline');
const ctx = canvas.getContext('2d')!;
const scroll = $<HTMLInputElement>('scroll');
const announcer = $('lab-announce');

let header: HeaderLine | null = null;
let frames: FrameLine[] = [];
let candidates: Candidate[] = [];
let labels: Label[] = [];
let logName = '';
let cursor = 0; // t_ms
let pendingOnset: number | null = null;
let selected = -1;
let view = { start: 0, span: 10_000 };
let t0 = 0;
let tEnd = 1;

// ---------- Active-time counter (reported in the paper) ----------

let activeMs = 0;
let lastInput = 0;
const bump = () => (lastInput = performance.now());
['keydown', 'pointerdown', 'wheel'].forEach((ev) =>
  window.addEventListener(ev, bump, { passive: true }),
);
setInterval(() => {
  if (
    document.visibilityState === 'visible' &&
    performance.now() - lastInput < 60_000 &&
    frames.length
  ) {
    activeMs += 1000;
    const m = Math.floor(activeMs / 60000);
    const s = Math.floor((activeMs % 60000) / 1000);
    $('lab-time').textContent = `${m}:${String(s).padStart(2, '0')}`;
    persist();
  }
}, 1000);

// ---------- Persistence of work in progress ----------

const key = () => `morseye-labels:${logName}`;
function persist(): void {
  if (logName) save(key(), { labels, activeMs, labeller: $<HTMLInputElement>('labeller').value });
}
function restore(): void {
  const s = load<{ labels: Label[]; activeMs: number; labeller: string }>(key(), {
    labels: [],
    activeMs: 0,
    labeller: load<{ v: string }>('morseye-labeller', { v: '' }).v,
  });
  labels = s.labels;
  activeMs = s.activeMs;
  $<HTMLInputElement>('labeller').value = s.labeller;
}
$<HTMLInputElement>('labeller').addEventListener('change', (e) => {
  save('morseye-labeller', { v: (e.target as HTMLInputElement).value });
  persist();
});

// ---------- Loading ----------

$<HTMLInputElement>('f-log').addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const lines: LogLine[] = parseJsonl(await file.text());
  const h = lines.find((l): l is HeaderLine => l.type === 'header');
  if (!h) {
    alertInline('That file has no MorsEye header line.');
    return;
  }
  header = h;
  frames = lines.filter((l): l is FrameLine => l.type === 'frame');
  const cues = lines.filter((l): l is CueLine => l.type === 'cue' && l.cue !== 'OPEN');
  candidates = cues.map((c) => ({ t0: c.t_ms, t1: c.t_ms + 1800, cue: c.cue }));
  logName = file.name.replace(/\.jsonl?$/, '');
  t0 = frames[0]?.t_ms ?? 0;
  tEnd = frames[frames.length - 1]?.t_ms ?? 1;
  cursor = t0;
  view = { start: t0, span: 10_000 };
  restore();
  $('lab-file').textContent =
    `${logName} · ${frames.length} frames${h.video_start_ms === null ? ' · no video' : ''}`;
  ($('export') as HTMLButtonElement).disabled = false;
  ($('import-cues') as HTMLButtonElement).disabled = false;
  renderList();
  draw();
  canvas.focus();
});

$<HTMLInputElement>('f-video').addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  video.src = URL.createObjectURL(file);
  $('no-video').hidden = true;
  await new Promise((r) => video.addEventListener('loadedmetadata', r, { once: true }));
  // MediaRecorder webm files often report duration = Infinity until seeked to the end.
  if (!Number.isFinite(video.duration)) {
    video.currentTime = 1e9;
    await new Promise((r) => video.addEventListener('timeupdate', r, { once: true }));
    video.currentTime = 0;
  }
  video.playbackRate = Number($<HTMLSelectElement>('rate').value);
  seek(cursor);
});

function alertInline(msg: string): void {
  $('lab-file').textContent = msg;
  announcer.textContent = msg;
}

// ---------- Time mapping ----------

const hasVideo = () => !!video.src && header?.video_start_ms != null;
const videoToT = (s: number) => (header?.video_start_ms ?? 0) + s * 1000;
const tToVideo = (t: number) => (t - (header?.video_start_ms ?? 0)) / 1000;

function seek(t: number): void {
  cursor = Math.max(t0, Math.min(tEnd, t));
  if (hasVideo()) video.currentTime = Math.max(0, tToVideo(cursor));
  keepInView();
  draw();
}

function keepInView(): void {
  if (cursor < view.start || cursor > view.start + view.span) {
    view.start = cursor - view.span * 0.3;
  }
  clampView();
}

function clampView(): void {
  view.span = Math.max(1000, Math.min(Math.max(1000, tEnd - t0), view.span));
  view.start = Math.max(t0, Math.min(tEnd - view.span, view.start));
  const total = tEnd - t0 - view.span;
  scroll.value = String(total > 0 ? ((view.start - t0) / total) * 1000 : 0);
}

video.addEventListener('timeupdate', () => {
  if (!video.paused) {
    cursor = videoToT(video.currentTime);
    keepInView();
    draw();
  }
});
function playLoop(): void {
  if (video.paused) return;
  cursor = videoToT(video.currentTime);
  if (cursor > view.start + view.span * 0.8) view.start = cursor - view.span * 0.2;
  clampView();
  draw();
  requestAnimationFrame(playLoop);
}
function togglePlay(): void {
  if (!hasVideo()) return;
  if (video.paused) {
    void video.play().then(playLoop);
    $('play').textContent = 'Pause';
  } else {
    video.pause();
    $('play').textContent = 'Play';
    seek(videoToT(video.currentTime));
  }
}
$('play').addEventListener('click', togglePlay);
$<HTMLSelectElement>('rate').addEventListener('change', (e) => {
  video.playbackRate = Number((e.target as HTMLSelectElement).value);
});

/** Index of the frame at or before t. */
function frameIndex(t: number): number {
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid]!.t_ms <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function stepFrames(n: number): void {
  if (!frames.length) return;
  const i = Math.max(0, Math.min(frames.length - 1, frameIndex(cursor + 0.01) + n));
  seek(frames[i]!.t_ms);
}

// ---------- Labelling ----------

function setOnset(): void {
  pendingOnset = cursor;
  announcer.textContent = `onset at ${Math.round(cursor - t0)} ms`;
  draw();
}

function setOffset(): void {
  if (pendingOnset === null) {
    announcer.textContent = 'Press [ for the onset first.';
    return;
  }
  const a = Math.min(pendingOnset, cursor);
  const b = Math.max(pendingOnset, cursor);
  if (b - a < 1) return;
  // A selected draft that overlaps the new times takes them and becomes a confirmed event.
  const d = labels[selected];
  if (d?.draft && a <= d.offset_ms && b >= d.onset_ms) {
    d.onset_ms = round(a);
    d.offset_ms = round(b);
    d.draft = false;
    d.labelled_at = new Date().toISOString();
    labels.sort((x, y) => x.onset_ms - y.onset_ms);
    selected = labels.indexOf(d);
    pendingOnset = null;
    announcer.textContent = `draft confirmed as ${d.type}, ${Math.round(b - a)} ms`;
    changed();
    return;
  }
  labels.push({
    onset_ms: round(a),
    offset_ms: round(b),
    type: null,
    labelled_at: new Date().toISOString(),
  });
  labels.sort((x, y) => x.onset_ms - y.onset_ms);
  selected = labels.findIndex((l) => l.onset_ms === round(a));
  pendingOnset = null;
  announcer.textContent = `event created, ${Math.round(b - a)} ms. Press 1 to 5 for its type.`;
  changed();
}

function setType(i: number): void {
  const l = labels[selected];
  if (!l) return;
  l.type = TYPES[i]!;
  l.labelled_at = new Date().toISOString();
  announcer.textContent = `type ${l.type}`;
  changed();
}

function removeSelected(): void {
  if (selected < 0) return;
  labels.splice(selected, 1);
  selected = Math.min(selected, labels.length - 1);
  announcer.textContent = 'event removed';
  changed();
}

/** Turn every cue into a draft event with the cue's type, skipping cues that already overlap an event. */
function importCues(): void {
  let n = 0;
  for (const c of candidates) {
    const type = CUE_TYPE[c.cue];
    if (!type) continue;
    if (labels.some((l) => l.onset_ms <= c.t1 && l.offset_ms >= c.t0)) continue;
    labels.push({
      onset_ms: round(c.t0),
      offset_ms: round(c.t1),
      type,
      labelled_at: new Date().toISOString(),
      draft: true,
      from_cue: true,
    });
    n++;
  }
  labels.sort((x, y) => x.onset_ms - y.onset_ms);
  alertInline(`Imported ${n} cue drafts. Press D to go to the next one.`);
  changed();
}
$('import-cues').addEventListener('click', importCues);

function nextDraft(): void {
  const i = labels.findIndex((l, j) => l.draft && j !== selected && l.onset_ms >= cursor - 400);
  const j = i >= 0 ? i : labels.findIndex((l) => l.draft);
  if (j < 0) {
    announcer.textContent = 'No drafts left.';
    return;
  }
  selected = j;
  // Zoom in so the lid movement, not the 1.8 s cue window, fills the timeline.
  view.span = 3000;
  seek(labels[j]!.onset_ms - 300);
  renderList();
  announcer.textContent = `draft ${labels[j]!.type}: set its onset and offset with [ and ]`;
}

function jumpCandidate(dir: 1 | -1): void {
  const list =
    dir > 0
      ? candidates.filter((c) => c.t0 > cursor + 1)
      : candidates.filter((c) => c.t0 < cursor - 1).reverse();
  const c = list[0];
  if (c) {
    seek(c.t0 - 300);
    announcer.textContent = `cue ${c.cue}`;
  }
}

function changed(): void {
  persist();
  renderList();
  draw();
}

const round = (x: number) => Math.round(x * 100) / 100;

window.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  if (t.closest('input, select, textarea')) return;
  if (!frames.length) return;
  const k = e.key;
  let handled = true;
  if (k === '[') setOnset();
  else if (k === ']') setOffset();
  else if (/^[1-5]$/.test(k)) setType(Number(k) - 1);
  else if (k === 'ArrowLeft') stepFrames(e.shiftKey ? -10 : -1);
  else if (k === 'ArrowRight') stepFrames(e.shiftKey ? 10 : 1);
  else if (k === ' ') togglePlay();
  else if (k === 'Delete') removeSelected();
  else if (k === 'n' || k === 'N') jumpCandidate(1);
  else if (k === 'd' || k === 'D') nextDraft();
  else if (k === 'b' || k === 'B') jumpCandidate(-1);
  else if (k === '+' || k === '=') zoom(0.7);
  else if (k === '-' || k === '_') zoom(1 / 0.7);
  else if (k === 'Escape') pendingOnset = null;
  else if (k === 'Tab' && document.activeElement === canvas && labels.length) {
    selected = (selected + (e.shiftKey ? -1 + labels.length : 1)) % labels.length;
    const l = labels[selected]!;
    seek(l.onset_ms);
    renderList();
  } else handled = false;
  if (handled) e.preventDefault();
});

function zoom(f: number, around = cursor): void {
  const frac = (around - view.start) / view.span;
  view.span *= f;
  view.start = around - frac * view.span;
  clampView();
  draw();
}

// ---------- Timeline drawing ----------

const PAD = 28;

function draw(): void {
  $('cursor-t').textContent = frames.length
    ? `t = ${((cursor - t0) / 1000).toFixed(3)} s`
    : 't = —';
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (!frames.length) return;

  const x = (t: number) => ((t - view.start) / view.span) * w;
  const top = PAD;
  const half = (h - PAD - 8) / 2;
  const yEar = (v: number) => top + half - (Math.min(0.45, v) / 0.45) * (half - 6);
  const yBlink = (v: number) => top + 2 * half - v * (half - 6);
  const ink = token('--ink');
  const muted = token('--muted');

  // Cue candidates (dashed, never exported)
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = muted;
  ctx.fillStyle = muted;
  ctx.font = '11px "JetBrains Mono", monospace';
  for (const c of candidates) {
    if (c.t1 < view.start || c.t0 > view.start + view.span) continue;
    ctx.strokeRect(x(c.t0), top, x(c.t1) - x(c.t0), 2 * half);
    ctx.fillText(c.cue, x(c.t0) + 3, top + 12);
  }
  ctx.setLineDash([]);

  // Labels
  labels.forEach((l, i) => {
    if (l.offset_ms < view.start || l.onset_ms > view.start + view.span) return;
    ctx.fillStyle = token('--signal');
    ctx.globalAlpha = (i === selected ? 0.35 : 0.18) * (l.draft ? 0.5 : 1);
    ctx.fillRect(x(l.onset_ms), top, x(l.offset_ms) - x(l.onset_ms), 2 * half);
    ctx.globalAlpha = 1;
    if (i === selected || l.draft) {
      ctx.strokeStyle = token('--signal');
      ctx.lineWidth = i === selected ? 2 : 1;
      if (l.draft) ctx.setLineDash([6, 3]);
      ctx.strokeRect(x(l.onset_ms), top, x(l.offset_ms) - x(l.onset_ms), 2 * half);
      ctx.setLineDash([]);
    }
    ctx.fillStyle = ink;
    ctx.fillText(
      `${l.type ?? '? type'}${l.draft ? ' (draft)' : ''}`,
      x(l.onset_ms) + 3,
      top + 2 * half - 4,
    );
  });

  // Traces
  const i0 = Math.max(0, frameIndex(view.start) - 1);
  const i1 = Math.min(frames.length - 1, frameIndex(view.start + view.span) + 1);
  const line = (
    get: (f: FrameLine) => number,
    y: (v: number) => number,
    color: string,
    dash: number[],
  ) => {
    ctx.strokeStyle = color;
    ctx.setLineDash(dash);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let pen = false;
    for (let i = i0; i <= i1; i++) {
      const f = frames[i]!;
      if (!f.face) {
        pen = false;
        continue;
      }
      const px = x(f.t_ms);
      const py = y(get(f));
      if (pen) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
      pen = true;
    }
    ctx.stroke();
    ctx.setLineDash([]);
  };
  line((f) => f.earL, yEar, token('--trace'), []);
  line((f) => f.earR, yEar, token('--trace'), [3, 3]);
  line((f) => f.blinkL, yBlink, token('--band-dash'), []);
  line((f) => f.blinkR, yBlink, token('--band-dash'), [3, 3]);

  // Frame ticks when zoomed in
  if (view.span < 4000) {
    ctx.fillStyle = muted;
    for (let i = i0; i <= i1; i++) ctx.fillRect(x(frames[i]!.t_ms), top + 2 * half, 1, 5);
  }

  // Axis
  ctx.fillStyle = muted;
  ctx.font = '11px "JetBrains Mono", monospace';
  const step = niceStep(view.span / 8);
  for (
    let t = Math.ceil((view.start - t0) / step) * step;
    t0 + t < view.start + view.span;
    t += step
  ) {
    ctx.fillText(`${(t / 1000).toFixed(step < 1000 ? 1 : 0)}s`, x(t0 + t) + 2, 12);
    ctx.fillRect(x(t0 + t), 16, 1, 6);
  }
  ctx.fillText('EAR', 4, top + 12);
  ctx.fillText('blink', 4, top + half + 12);

  // Pending onset
  if (pendingOnset !== null) {
    ctx.strokeStyle = token('--signal');
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(x(pendingOnset), top);
    ctx.lineTo(x(pendingOnset), top + 2 * half);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // Cursor
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x(cursor), 16);
  ctx.lineTo(x(cursor), h);
  ctx.stroke();
}

function niceStep(raw: number): number {
  const steps = [100, 200, 500, 1000, 2000, 5000, 10000, 30000, 60000];
  return steps.find((s) => s >= raw) ?? 60000;
}

// Pointer: click to seek, drag to pan, wheel to zoom; click on a label selects it.
let drag: { x: number; start: number; moved: boolean } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, start: view.start, moved: false };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  if (Math.abs(dx) > 3) drag.moved = true;
  if (drag.moved) {
    view.start = drag.start - (dx / canvas.clientWidth) * view.span;
    clampView();
    draw();
  }
});
canvas.addEventListener('pointerup', (e) => {
  if (drag && !drag.moved) {
    const r = canvas.getBoundingClientRect();
    const t = view.start + ((e.clientX - r.left) / r.width) * view.span;
    const hit = labels.findIndex((l) => t >= l.onset_ms && t <= l.offset_ms);
    if (hit >= 0) {
      selected = hit;
      renderList();
    }
    seek(t);
  }
  drag = null;
});
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const t = view.start + ((e.clientX - r.left) / r.width) * view.span;
    zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, t);
  },
  { passive: false },
);
scroll.addEventListener('input', () => {
  view.start = t0 + (Number(scroll.value) / 1000) * (tEnd - t0 - view.span);
  clampView();
  draw();
});
window.addEventListener('resize', draw);
window.addEventListener('morseye:theme', draw);

// ---------- List + export ----------

function renderList(): void {
  $('events').innerHTML = labels
    .map(
      (l, i) => `<tr${i === selected ? ' class="sel"' : ''} data-i="${i}">
      <td class="num">${i + 1}</td><td class="num">${Math.round(l.onset_ms - t0)}</td>
      <td class="num">${Math.round(l.offset_ms - t0)}</td><td class="num">${Math.round(l.offset_ms - l.onset_ms)}</td>
      <td>${l.type ?? '<strong>needs type</strong>'}${l.draft ? ' <strong>(draft: set times)</strong>' : ''}</td></tr>`,
    )
    .join('');
  const counts = TYPES.map((t) => `${t}: ${labels.filter((l) => l.type === t).length}`).join(' · ');
  const drafts = labels.filter((l) => l.draft).length;
  $('lab-counts').textContent =
    `${labels.length} events · ${counts}` + (drafts ? ` · ${drafts} drafts to check` : '');
  $('sel-info').textContent = selected >= 0 ? `(selected #${selected + 1})` : '';
}

$('events').addEventListener('click', (e) => {
  const tr = (e.target as HTMLElement).closest('tr');
  if (!tr) return;
  selected = Number(tr.dataset.i);
  seek(labels[selected]!.onset_ms);
  renderList();
});

/** P07_A_2026-11-03 -> P07_A (PRD §5.8 file naming). */
const base = () => logName.replace(/_\d{4}-\d{2}-\d{2}$/, '');

$('export').addEventListener('click', () => {
  const labeller = $<HTMLInputElement>('labeller').value.trim();
  if (!labeller) {
    alertInline('Enter your initials as labeller before exporting.');
    $('labeller').focus();
    return;
  }
  if (!labels.length) {
    alertInline('No events marked yet. Mark each closure with [ and ], then give it a type (1–5).');
    return;
  }
  const drafts = labels.filter((l) => l.draft).length;
  if (drafts) {
    alertInline(
      `${drafts} draft(s) still have cue times. Select each (D), set its onset and offset with [ and ], or delete it.`,
    );
    return;
  }
  const untyped = labels.filter((l) => !l.type).length;
  if (untyped) {
    alertInline(
      `${untyped} event(s) have no type yet. Give every event a type (1–5) before exporting.`,
    );
    return;
  }
  // Times are exported on the log's frame clock (the same clock as t_ms in the .jsonl).
  const csv =
    'onset_ms,offset_ms,type,labeller,labelled_at\n' +
    labels
      .map((l) => `${l.onset_ms},${l.offset_ms},${l.type},${labeller},${l.labelled_at}`)
      .join('\n') +
    '\n';
  const meta = {
    log: logName,
    labeller,
    n_events: labels.length,
    n_from_cue_drafts: labels.filter((l) => l.from_cue).length,
    labelling_seconds: Math.round(activeMs / 1000),
    exported_at: new Date().toISOString(),
  };
  download(new Blob([csv], { type: 'text/csv' }), `${base()}_labels.csv`);
  download(
    new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' }),
    `${base()}_labels_meta.json`,
  );
  alertInline(`Exported ${labels.length} labels.`);
});

draw();
