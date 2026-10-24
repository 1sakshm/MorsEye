import type { Band, Timing } from '../segment/segmenter';
import { liveBand } from '../segment/segmenter';

/**
 * Progress ring shown while the eye is closed (PRD §5.3, §6.7). It fills over CMD_MS and takes
 * the colour of the band the closure is currently in, so the user sees a dot turn into a dash.
 * Tick marks show where each band starts. A band change pulses the ring once.
 */

const R = 54;
const C = 2 * Math.PI * R;

export const BAND_LABEL: Record<Band, string> = {
  reject: 'blink',
  dot: 'dot',
  dash: 'dash',
  hold: 'pause?',
  backspace: 'delete',
};

export class Ring {
  readonly el: SVGSVGElement;
  private arc: SVGCircleElement;
  private ticks: SVGGElement;
  private label: SVGTextElement;
  private lastBand: Band | null = null;

  constructor(host: HTMLElement) {
    host.innerHTML = `
      <svg class="ring" viewBox="0 0 128 128" aria-hidden="true">
        <circle class="ring-track" cx="64" cy="64" r="${R}" />
        <circle class="ring-arc" cx="64" cy="64" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${C}" />
        <g class="ring-ticks"></g>
        <text class="ring-label" x="64" y="70" text-anchor="middle"></text>
      </svg>`;
    this.el = host.querySelector('svg')!;
    this.arc = host.querySelector('.ring-arc')!;
    this.ticks = host.querySelector('.ring-ticks')!;
    this.label = host.querySelector('.ring-label')!;
  }

  setTiming(t: Timing): void {
    const marks = [t.rejectMs, t.dotMaxMs, t.dashMaxMs].map((ms) => ms / t.cmdMs);
    this.ticks.innerHTML = marks
      .map((f) => {
        const a = f * 2 * Math.PI - Math.PI / 2;
        const x1 = 64 + Math.cos(a) * (R - 9);
        const y1 = 64 + Math.sin(a) * (R - 9);
        const x2 = 64 + Math.cos(a) * (R + 9);
        const y2 = 64 + Math.sin(a) * (R + 9);
        return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" />`;
      })
      .join('');
  }

  /** elapsed = null when the eye is open. */
  update(elapsedMs: number | null, t: Timing): void {
    if (elapsedMs === null) {
      this.arc.style.strokeDashoffset = String(C);
      this.el.dataset.band = '';
      this.label.textContent = '';
      this.lastBand = null;
      return;
    }
    const { band, progress } = liveBand(elapsedMs, t);
    this.arc.style.strokeDashoffset = String(C * (1 - progress));
    this.el.dataset.band = band;
    this.label.textContent = BAND_LABEL[band];
    if (this.lastBand !== null && band !== this.lastBand) {
      this.el.classList.remove('pulse');
      void this.el.getBoundingClientRect(); // restart the animation
      this.el.classList.add('pulse');
    }
    this.lastBand = band;
  }
}
