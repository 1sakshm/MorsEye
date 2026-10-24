import '../site/layout';
import '../styles/how.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { PAUSE_WINDOW_MS } from '../decode/decoder';
import { DEFAULT_TIMING as T, type Timing } from '../segment/segmenter';
import { svgEl } from '../site/eye';
import { makeStep, signalSummary, STAGE, type Step } from '../site/story';

gsap.registerPlugin(ScrollTrigger);

// Numbers in the text come from the code, so the story cannot drift from the app.
document.querySelectorAll<HTMLElement>('[data-t]').forEach((el) => {
  const key = el.dataset.t as keyof Timing;
  if (key in T) el.textContent = String(T[key]);
});
document.querySelectorAll('.band-list li').forEach((li) => {
  if (li.textContent?.includes('within 4 s')) {
    li.lastChild!.textContent = ` ms: no symbol; two of these within ${PAUSE_WINDOW_MS / 1000} s pause or resume input`;
  }
});
const sum = signalSummary();
const numbers = document.getElementById('signal-numbers');
if (numbers) {
  numbers.textContent =
    ` In this example the fixed line finds ${sum.fixedCount} closures where there are ` +
    `${sum.realCount}; the calibrated line (${sum.calibrated.thr.toFixed(2)}) finds ${sum.calibratedCount}.`;
}

const stepEls = [...document.querySelectorAll<HTMLElement>('.story-step')];
const stage = document.getElementById('story-svg') as SVGSVGElement | null;
const ticks = [...document.querySelectorAll<HTMLElement>('#story-progress li')];
/** Progress at which each step is shown as a still figure. */
const STILL = [1, 0.84, 1, 1, 1, 0];

function setupAnimated(): () => void {
  if (!stage) return () => {};
  document.documentElement.classList.add('story-animated');
  const layers: SVGGElement[] = [];
  const steps: Step[] = [];
  for (let i = 0; i < stepEls.length; i++) {
    const g = svgEl('g', { class: 'story-layer' }, stage);
    layers.push(g);
    const step = makeStep(i, g, `stage-${i}`);
    step.render(0);
    steps.push(step);
  }
  const setActive = (i: number) => {
    layers.forEach((g, k) => g.classList.toggle('is-active', k === i));
    ticks.forEach((t, k) => t.classList.toggle('is-active', k <= i));
  };
  setActive(0);

  stepEls.forEach((el, i) => {
    const proxy = { p: 0 };
    gsap.to(proxy, {
      p: 1,
      ease: 'none',
      onUpdate: () => steps[i]!.render(proxy.p),
      scrollTrigger: {
        trigger: el,
        // The first step is already part-way through when the story comes into view.
        start: i === 0 ? 'top bottom' : 'top 65%',
        end: i === 0 ? 'center 45%' : 'bottom 55%',
        scrub: 0.4,
        onToggle: (self) => {
          if (self.isActive) setActive(i);
        },
      },
    });
  });

  return () => {
    stage.replaceChildren();
    document.documentElement.classList.remove('story-animated');
  };
}

function setupStatic(): () => void {
  const created: Element[] = [];
  stepEls.forEach((el, i) => {
    const holder = el.querySelector('.story-static');
    if (!holder) return;
    const svg = svgEl(
      'svg',
      { viewBox: `0 0 ${STAGE.width} ${STAGE.height}`, class: 'story-svg' },
      holder,
    );
    const g = svgEl('g', { class: 'story-layer is-active' }, svg);
    makeStep(i, g, `still-${i}`).render(STILL[i] ?? 1);
    created.push(svg);
  });
  return () => created.forEach((n) => n.remove());
}

const mm = gsap.matchMedia();
mm.add(
  {
    animated: '(min-width: 900px) and (prefers-reduced-motion: no-preference)',
    still: '(max-width: 899.98px), (prefers-reduced-motion: reduce)',
  },
  (ctx) => {
    const { animated } = ctx.conditions as { animated: boolean; still: boolean };
    return animated ? setupAnimated() : setupStatic();
  },
);
