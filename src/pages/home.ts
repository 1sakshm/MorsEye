import '../site/layout';
import '../styles/home.css';
import { PAUSE_WINDOW_MS } from '../decode/decoder';
import { DEFAULT_TIMING as T } from '../segment/segmenter';
import { caseValues, fillSlots, loadCase } from '../site/case';
import { mountHero } from '../site/hero';

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

// ---- results: every number comes from public/results/case.json (analysis/case_outputs.py)
void loadCase().then((r) => {
  const cards = $('#result-cards');
  if (r && cards) fillSlots(document, caseValues(r));
});
