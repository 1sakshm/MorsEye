import {
  BrightnessProbe,
  CameraError,
  cameraLabel,
  FpsMeter,
  onVideoFrames,
  startCamera,
  stopCamera,
  type ClockSource,
} from '../capture/camera';
import { createLandmarker, type FrameResult, type Landmarker } from '../vision/landmarker';

/**
 * Camera + landmarker loop shared by /try and /study. Emits one FrameResult per video frame,
 * plus a camera/face status (PRD §5.6).
 */

export type Status =
  | 'LOADING'
  | 'NO_CAMERA'
  | 'NO_FACE'
  | 'TOO_DARK'
  | 'MULTIPLE_FACES'
  | 'LOW_FPS'
  | 'OK';

export const LOW_FPS = 20;
export const DARK_LUMA = 40;

export interface EngineFrame extends FrameResult {
  status: Status;
  fps: number;
  clock: ClockSource;
}

export class Engine {
  stream: MediaStream | null = null;
  landmarker: Landmarker | null = null;
  readonly fps = new FpsMeter();
  status: Status = 'LOADING';
  clock: ClockSource = 'callback';
  brightness = 255;
  error: CameraError | null = null;

  private stopLoop: (() => void) | null = null;
  private probe = new BrightnessProbe();
  private frameCount = 0;
  private listeners = new Set<(f: EngineFrame) => void>();
  private statusListeners = new Set<(s: Status) => void>();

  constructor(readonly video: HTMLVideoElement) {}

  onFrame(fn: (f: EngineFrame) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onStatus(fn: (s: Status) => void): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  get cameraLabel(): string {
    return this.stream ? cameraLabel(this.stream) : '';
  }

  /** Start camera and model in parallel. Throws CameraError on camera failure. */
  async start(): Promise<void> {
    this.setStatus('LOADING');
    const model = createLandmarker();
    try {
      this.stream = await startCamera(this.video);
    } catch (e) {
      this.error = e instanceof CameraError ? e : new CameraError('other', String(e));
      this.setStatus('NO_CAMERA');
      model.then((m) => m.close()).catch(() => undefined);
      throw this.error;
    }
    try {
      this.landmarker = await model;
    } catch (e) {
      stopCamera(this.stream);
      this.stream = null;
      this.error = new CameraError('model', String(e));
      this.setStatus('NO_CAMERA');
      throw this.error;
    }
    this.stopLoop = onVideoFrames(this.video, ({ t_ms, clock }) => this.frame(t_ms, clock));
  }

  stop(): void {
    this.stopLoop?.();
    this.stopLoop = null;
    stopCamera(this.stream);
    this.stream = null;
    this.landmarker?.close();
    this.landmarker = null;
  }

  private frame(t_ms: number, clock: ClockSource): void {
    if (!this.landmarker || this.video.readyState < 2) return;
    this.clock = clock;
    this.fps.push(t_ms);
    let r: FrameResult;
    try {
      r = this.landmarker.detect(this.video, t_ms);
    } catch {
      return; // a dropped frame; the next one will come
    }
    if (this.frameCount++ % 15 === 0) this.brightness = this.probe.measure(this.video);
    const fps = this.fps.fps;
    let status: Status = 'OK';
    if (!r.features.face) status = this.brightness < DARK_LUMA ? 'TOO_DARK' : 'NO_FACE';
    else if (r.nFaces > 1) status = 'MULTIPLE_FACES';
    else if (this.brightness < DARK_LUMA) status = 'TOO_DARK';
    else if (this.frameCount > 60 && fps > 0 && fps < LOW_FPS) status = 'LOW_FPS';
    this.setStatus(status);
    const out: EngineFrame = { ...r, status, fps, clock };
    this.listeners.forEach((fn) => fn(out));
  }

  private setStatus(s: Status): void {
    if (s === this.status) return;
    this.status = s;
    this.statusListeners.forEach((fn) => fn(s));
  }
}

export const STATUS_TEXT: Record<Status, { title: string; body: string } | null> = {
  LOADING: {
    title: 'Starting the camera and face model…',
    body: 'This takes a few seconds the first time.',
  },
  NO_CAMERA: null, // shown by the camera error panel
  NO_FACE: {
    title: 'No face found',
    body: 'Centre your face in the frame, about an arm’s length from the screen. Input is paused.',
  },
  TOO_DARK: {
    title: 'It is too dark',
    body: 'Turn on a light in front of you (not behind you). Input may be unreliable.',
  },
  MULTIPLE_FACES: {
    title: 'More than one face',
    body: 'MorsEye follows one person. Make sure only you are in view.',
  },
  LOW_FPS: {
    title: 'Low frame rate',
    body: 'The camera is delivering under 20 frames a second, so timing is coarse. Close other tabs or use a slower preset.',
  },
  OK: null,
};
