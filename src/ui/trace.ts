import { token } from '../site/layout';

/**
 * Scrolling live trace of the detector signal with its threshold and hysteresis lines.
 * Draws on a canvas sized to its CSS box (device-pixel aware). Colours come from theme tokens.
 */
export class Trace {
  private ctx: CanvasRenderingContext2D;
  private values: number[] = [];
  private closed: boolean[] = [];

  constructor(
    readonly canvas: HTMLCanvasElement,
    public range: [number, number] = [0, 0.4],
    readonly length = 240,
  ) {
    this.ctx = canvas.getContext('2d')!;
  }

  push(v: number, isClosed: boolean): void {
    this.values.push(v);
    this.closed.push(isClosed);
    if (this.values.length > this.length) {
      this.values.shift();
      this.closed.shift();
    }
  }

  clear(): void {
    this.values = [];
    this.closed = [];
  }

  draw(thr: number | null, h = 0, invert = false): void {
    const { canvas, ctx } = this;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const hgt = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hgt * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(hgt * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hgt);
    const [lo, hi] = this.range;
    const y = (v: number) => hgt - ((v - lo) / (hi - lo)) * hgt;
    const x = (i: number) => (i / (this.length - 1)) * w;

    // Closed spans
    ctx.fillStyle = token('--signal');
    ctx.globalAlpha = 0.14;
    this.closed.forEach((c, i) => {
      if (c) ctx.fillRect(x(i), 0, w / this.length + 0.5, hgt);
    });
    ctx.globalAlpha = 1;

    if (thr !== null) {
      ctx.strokeStyle = token('--signal');
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(0, y(thr));
      ctx.lineTo(w, y(thr));
      ctx.stroke();
      if (h) {
        ctx.globalAlpha = 0.45;
        const rel = invert ? thr - h : thr + h;
        ctx.beginPath();
        ctx.moveTo(0, y(rel));
        ctx.lineTo(w, y(rel));
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.setLineDash([]);
    }

    ctx.strokeStyle = token('--trace');
    ctx.lineWidth = 2;
    ctx.beginPath();
    let pen = false;
    this.values.forEach((v, i) => {
      if (!Number.isFinite(v)) {
        pen = false;
        return;
      }
      const yy = Math.max(0, Math.min(hgt, y(v)));
      if (pen) ctx.lineTo(x(i), yy);
      else ctx.moveTo(x(i), yy);
      pen = true;
    });
    ctx.stroke();
  }
}
