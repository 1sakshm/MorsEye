import type { EngineFrame } from '../app/engine';
import {
  type ActionLine,
  type BlockLine,
  type CueLine,
  type FrameLine,
  type HeaderLine,
  type LogLine,
  type PhraseLine,
  type TlxLine,
} from './schema';

/**
 * Session recorder (PRD §5.7): every frame's features + eye points, cue/block/phrase/TLX events,
 * and optionally a local webm via MediaRecorder. Everything stays in memory until the experimenter
 * downloads it. Nothing is uploaded.
 */
export class Recorder {
  private lines: string[] = [];
  private chunks: Blob[] = [];
  private media: MediaRecorder | null = null;
  videoStartMs: number | null = null;
  frames = 0;
  faceFrames = 0;

  constructor(public header: HeaderLine) {}

  frame(f: EngineFrame): void {
    const line: FrameLine = {
      type: 'frame',
      ...f.features,
      n_faces: f.nFaces,
      eye_pts: f.eyePts,
    };
    this.lines.push(JSON.stringify(line));
    this.frames++;
    if (f.features.face) this.faceFrames++;
  }

  event(
    e: BlockLine | CueLine | PhraseLine | ActionLine | TlxLine | Extract<LogLine, { type: 'fps' }>,
  ): void {
    this.lines.push(JSON.stringify(e));
  }

  /** Start local video recording (only when the setup screen's video box is ticked). */
  startVideo(stream: MediaStream): void {
    const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t) =>
      MediaRecorder.isTypeSupported(t),
    );
    this.media = new MediaRecorder(
      stream,
      type ? { mimeType: type, videoBitsPerSecond: 2_500_000 } : {},
    );
    this.media.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
    this.media.onstart = () => {
      this.videoStartMs = performance.now();
    };
    this.media.start(1000);
  }

  stopVideo(): Promise<void> {
    const m = this.media;
    if (!m || m.state === 'inactive') return Promise.resolve();
    return new Promise((r) => {
      m.onstop = () => r();
      m.stop();
    });
  }

  get hasVideo(): boolean {
    return this.chunks.length > 0;
  }

  /** Fraction of frames with a face. */
  get faceRate(): number {
    return this.frames ? this.faceFrames / this.frames : 0;
  }

  jsonl(): Blob {
    const header: HeaderLine = { ...this.header, video_start_ms: this.videoStartMs };
    return new Blob([JSON.stringify(header) + '\n' + this.lines.join('\n') + '\n'], {
      type: 'application/x-ndjson',
    });
  }

  webm(): Blob {
    return new Blob(this.chunks, { type: 'video/webm' });
  }

  /** P07_A_2026-11-03 */
  baseName(): string {
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const s = this.header.session > 1 ? `_s${this.header.session}` : '';
    return `${this.header.participant}_${this.header.study}${s}_${date}`;
  }
}

export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
