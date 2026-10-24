/**
 * Webcam capture with per-frame timestamps and measured fps (PRD §3.4, §5.6).
 *
 * Timestamps come from requestVideoFrameCallback metadata: `captureTime` (when the camera
 * captured the frame, on the performance.now() clock) where the browser provides it,
 * else `expectedDisplayTime`, else the callback time. Cue and event logs use performance.now(),
 * so everything shares one clock.
 */

export type CameraErrorKind =
  | 'insecure'
  | 'denied'
  | 'not_found'
  | 'in_use'
  | 'unsupported'
  | 'model'
  | 'other';

export class CameraError extends Error {
  constructor(
    readonly kind: CameraErrorKind,
    message: string,
  ) {
    super(message);
  }
}

export const CAMERA_HELP: Record<CameraErrorKind, { title: string; fixes: string[] }> = {
  insecure: {
    title: 'The camera needs a secure page',
    fixes: ['Open MorsEye over https:// or on http://localhost.'],
  },
  denied: {
    title: 'Camera permission was refused',
    fixes: [
      'Click the camera icon in the address bar and choose "Allow", then reload.',
      'On Windows, check Settings → Privacy & security → Camera, and allow your browser.',
    ],
  },
  not_found: {
    title: 'No camera was found',
    fixes: ['Plug in a webcam, or check that the built-in camera is enabled.'],
  },
  in_use: {
    title: 'The camera is busy',
    fixes: ['Close other apps or tabs that use the camera (video calls, camera app), then retry.'],
  },
  unsupported: {
    title: 'This browser cannot use the camera here',
    fixes: ['Use a current version of Chrome, Edge or Firefox.'],
  },
  model: {
    title: 'The face model could not load',
    fixes: [
      'Check your connection and reload the page (the model is about 4 MB, loaded once).',
      'Use a current Chrome, Edge or Firefox; the model needs WebAssembly.',
    ],
  },
  other: {
    title: 'The camera could not start',
    fixes: ['Reload the page and try again.', 'Try another browser.'],
  },
};

function classify(e: unknown): CameraError {
  const name = (e as { name?: string })?.name ?? '';
  const msg = (e as { message?: string })?.message ?? String(e);
  if (name === 'NotAllowedError' || name === 'SecurityError') return new CameraError('denied', msg);
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return new CameraError('not_found', msg);
  if (name === 'NotReadableError' || name === 'AbortError') return new CameraError('in_use', msg);
  return new CameraError('other', msg);
}

export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!window.isSecureContext) throw new CameraError('insecure', 'insecure context');
  if (!navigator.mediaDevices?.getUserMedia)
    throw new CameraError('unsupported', 'no getUserMedia');
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
        facingMode: 'user',
      },
      audio: false,
    });
  } catch (e) {
    throw classify(e);
  }
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  if (!video.videoWidth) {
    await new Promise<void>((r) =>
      video.addEventListener('loadedmetadata', () => r(), { once: true }),
    );
  }
  return stream;
}

export function stopCamera(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}

export function cameraLabel(stream: MediaStream): string {
  return stream.getVideoTracks()[0]?.label ?? '';
}

export type ClockSource = 'captureTime' | 'expectedDisplayTime' | 'callback';

export interface FrameTick {
  t_ms: number;
  clock: ClockSource;
}

/** Rolling fps over the last second of frame timestamps. */
export class FpsMeter {
  private times: number[] = [];
  push(t: number): void {
    this.times.push(t);
    while (this.times.length > 2 && t - this.times[0]! > 1000) this.times.shift();
  }
  get fps(): number {
    const n = this.times.length;
    if (n < 2) return 0;
    return ((n - 1) * 1000) / (this.times[n - 1]! - this.times[0]!);
  }
}

/**
 * Calls `onFrame` once per new video frame. Returns a stop function.
 * Uses requestVideoFrameCallback when available, else requestAnimationFrame with a
 * currentTime check so a frame is never processed twice.
 */
export function onVideoFrames(
  video: HTMLVideoElement,
  onFrame: (tick: FrameTick) => void,
): () => void {
  let stopped = false;
  let last = -1;
  type RVFC = (cb: (now: number, meta: VideoFrameCallbackMetadata) => void) => number;
  const rvfc = (video as HTMLVideoElement & { requestVideoFrameCallback?: RVFC })
    .requestVideoFrameCallback;

  if (rvfc) {
    const loop = (now: number, meta: VideoFrameCallbackMetadata) => {
      if (stopped) return;
      let t = now;
      let clock: ClockSource = 'callback';
      if (typeof meta.captureTime === 'number' && meta.captureTime > 0) {
        t = meta.captureTime;
        clock = 'captureTime';
      } else if (typeof meta.expectedDisplayTime === 'number') {
        t = meta.expectedDisplayTime;
        clock = 'expectedDisplayTime';
      }
      if (t <= last) t = last + 0.001; // detectForVideo needs strictly increasing timestamps
      last = t;
      onFrame({ t_ms: t, clock });
      rvfc.call(video, loop);
    };
    rvfc.call(video, loop);
  } else {
    let lastMedia = -1;
    const loop = () => {
      if (stopped) return;
      if (video.currentTime !== lastMedia) {
        lastMedia = video.currentTime;
        let t = performance.now();
        if (t <= last) t = last + 0.001;
        last = t;
        onFrame({ t_ms: t, clock: 'callback' });
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  return () => {
    stopped = true;
  };
}

/** Mean luminance (0–255) of the frame, from a tiny reused canvas. Used for the TOO_DARK state. */
export class BrightnessProbe {
  private canvas: OffscreenCanvas | HTMLCanvasElement;
  private ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  constructor(
    private w = 32,
    private h = 18,
  ) {
    this.canvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(w, h)
        : Object.assign(document.createElement('canvas'), { width: w, height: h });
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true }) as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null;
  }
  measure(video: HTMLVideoElement): number {
    if (!this.ctx) return 255;
    this.ctx.drawImage(video, 0, 0, this.w, this.h);
    const d = this.ctx.getImageData(0, 0, this.w, this.h).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4)
      sum += 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
    return sum / (d.length / 4);
  }
}
