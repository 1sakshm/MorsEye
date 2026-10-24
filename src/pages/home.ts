import '../site/layout';
import '../styles/home.css';
import { PAUSE_WINDOW_MS } from '../decode/decoder';
import { DEFAULT_TIMING as T } from '../segment/segmenter';
import { fmtCI, hasRealResults, loadResults, pct } from '../site/data';
import { mountHero } from '../site/hero';
import type { SiteResults } from '../site/results';

const $ = <E extends Element = HTMLElement>(sel: string) => document.querySelector<E>(sel);

// ---- hero: driven by the same timing the app uses
const eyeSvg = $<SVGSVGElement>('#hero-eye');
const traceSvg = $<SVGSVGElement>('#hero-trace');
const tapeSvg = $<SVGSVGElement>('#hero-tape');
const toggle = $<HTMLButtonElement>('#hero-toggle');
if (eyeSvg && traceSvg && tapeSvg && toggle) {
  const { schedule } = mountHero({ eyeSvg, traceSvg, tapeSvg, toggle, text: 'HI', timing: T });
  const spec = $('#hero-spec');
  if (spec) {
    spec.textContent =
      `Each closure in this animation lasts ${schedule.dotMs} ms, inside the dot band ` +
      `(${T.rejectMs}–${T.dotMaxMs} ms), and a letter appears when the eyes have been open for ` +
      `${T.letterGapMs} ms. The animation is generated from the app’s current settings and its own decoder.`;
  }
}

// ---- timing table, filled from the segmenter so it can never drift from the code
const ms = (x: number) => `${x} ms`;
const bandText: Record<string, string> = {
  reject: `under ${ms(T.rejectMs)}`,
  dot: `${T.rejectMs}–${ms(T.dotMaxMs)}`,
  dash: `${T.dotMaxMs}–${ms(T.dashMaxMs)}`,
  hold: `${T.dashMaxMs}–${ms(T.cmdMs)}`,
  backspace: `${ms(T.cmdMs)} or more`,
  letter: ms(T.letterGapMs),
  word: ms(T.wordGapMs),
};
document.querySelectorAll<HTMLElement>('[data-band]').forEach((td) => {
  const v = bandText[td.dataset.band ?? ''];
  if (v) td.textContent = v;
});
const holdRow = $('[data-band="hold"]')?.nextElementSibling;
if (holdRow) {
  holdRow.lastChild!.textContent = `Nothing; two of these within ${PAUSE_WINDOW_MS / 1000} s pause or resume input`;
}

// ---- headline results: only real (non-synthetic) results are ever shown as numbers
function fillCard(key: string, value: string, text: string): void {
  const card = $(`[data-result="${key}"]`);
  if (!card) return;
  const v = card.querySelector('[data-slot="value"]');
  const t = card.querySelector('[data-slot="text"]');
  if (v) v.textContent = value;
  if (t) t.textContent = text;
}

function showResults(r: SiteResults): void {
  const h = r.headline;
  if (!h) return;
  const status = $('#results-status');
  if (status) status.textContent = `Study A results · N = ${r.n_participants}`;
  const lede = $('#results-lede');
  if (lede) {
    lede.textContent =
      `Participants were ${r.n_participants} able-bodied adult volunteers. The system has not been ` +
      'tested with people with motor impairments, and no clinical claim is made.';
  }
  const note = $('#results-note');
  if (note) {
    note.textContent = `Means across participants; brackets give ${r.ci_method}. Every number is generated from the logged data by the analysis scripts.`;
    note.hidden = false;
  }
  fillCard(
    'f1',
    `${h.f1_uncalibrated.mean.toFixed(2)} → ${h.f1_calibrated.mean.toFixed(2)}`,
    `Event-level F1 for deliberate closures: ${h.f1_uncalibrated.detector} ${fmtCI(h.f1_uncalibrated)} ` +
      `versus ${h.f1_calibrated.detector} calibrated from k = ${h.f1_calibrated.k} closures ` +
      `${fmtCI(h.f1_calibrated)}.`,
  );
  fillCard(
    'ftpm',
    `${h.ftpm_before.mean.toFixed(1)} → ${h.ftpm_after.mean.toFixed(1)} per min`,
    `False triggers per minute of reading: ${fmtCI(h.ftpm_before, 1)} with the original app ` +
      `versus ${fmtCI(h.ftpm_after, 1)} with the reject window.`,
  );
  if (h.cpm_block3 && h.error_block3) {
    fillCard(
      'cpm',
      `${h.cpm_block3.mean.toFixed(1)} CPM · ${pct(h.error_block3.mean)} errors`,
      `Characters per minute in block 3: ${fmtCI(h.cpm_block3, 1)}; uncorrected error rate ` +
        `${pct(h.error_block3.mean)} [${pct(h.error_block3.lo)}, ${pct(h.error_block3.hi)}].`,
    );
  } else {
    fillCard(
      'cpm',
      'Pending',
      'The text-entry study (Study B) has not been analysed yet. Characters per minute and error rate will appear here.',
    );
  }
  document.querySelectorAll('.result-value .pending').forEach((el) => el.remove());
}

loadResults().then((r) => {
  if (hasRealResults(r) && r.headline) showResults(r);
});
