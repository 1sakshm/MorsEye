import type { Timing } from '../segment/segmenter';
import type { FrameFeatures } from '../types';

/**
 * JSONL session log format, "morseye-log/1". One JSON object per line; the first line is the header.
 * Every timestamp is on the same clock as FrameFeatures.t_ms (performance.now()).
 * analysis/load.py validates this schema; change both together.
 */
export const LOG_SCHEMA = 'morseye-log/1';

export type StudyId = 'A' | 'B' | 'calib';

export type BlockName = 'calibration' | 'spontaneous' | 'deliberate' | 'mixed' | 'B1' | 'B2' | 'B3';

export type CueKind = 'OPEN' | 'SHORT' | 'LONG' | 'WINK-L' | 'WINK-R';

export interface HeaderLine {
  type: 'header';
  schema: typeof LOG_SCHEMA;
  app_version: string;
  participant: string; // P01, P02, … never a name
  session: number;
  study: StudyId;
  seed: number;
  started_at: string; // ISO date-time, local
  clock: 'captureTime' | 'expectedDisplayTime' | 'callback';
  camera_label: string;
  video_width: number;
  video_height: number;
  /** Experimenter notes: age range, glasses, lighting, camera model, distance. No names. */
  setup: {
    age_range: string;
    glasses: 'yes' | 'no' | '';
    lighting: string;
    camera_model: string;
    distance_cm: string;
    notes: string;
  };
  consent: { data: boolean; video: boolean; consented_at: string };
  timing: Timing;
  /** Time (on the frame clock) when MediaRecorder started, if video is recorded. */
  video_start_ms: number | null;
}

/** Per-frame features plus the 12 eye points (6 per eye, normalised x,y), the only landmarks kept. */
export interface FrameLine extends FrameFeatures {
  type: 'frame';
  n_faces: number;
  /** [x1,y1,…,x6,y6] left eye then right eye, normalised image coordinates; empty without a face. */
  eye_pts: number[];
}

export interface BlockLine {
  type: 'block';
  t_ms: number;
  block: BlockName;
  phase: 'start' | 'end';
}

export interface CueLine {
  type: 'cue';
  t_ms: number;
  block: BlockName;
  index: number;
  cue: CueKind;
  /** For OPEN / calibration cues: how long the cue is shown. */
  duration_ms: number;
}

export interface PhraseLine {
  type: 'phrase';
  t_ms: number;
  block: BlockName;
  index: number;
  phase: 'start' | 'end';
  target: string;
  /** Final transcribed text, on phase 'end'. */
  typed?: string;
}

/**
 * Study B keystroke-level log: every decoder action (DecoderAction plus the text after it), and one
 * `{type: 'segment', band, start_ms, end_ms, duration_ms, eye}` per closure, rejected ones included,
 * so entry time can be measured from the start of the first closure (analysis/metrics.py score_phrase).
 */
export interface ActionLine {
  type: 'action';
  t_ms: number;
  block: BlockName;
  action: Record<string, unknown>;
}

export interface TlxLine {
  type: 'tlx';
  t_ms: number;
  block: BlockName;
  /** Raw TLX, 0–100 each. */
  mental: number;
  physical: number;
  temporal: number;
  performance: number;
  effort: number;
  frustration: number;
}

export interface FpsLine {
  type: 'fps';
  t_ms: number;
  fps: number;
}

export type LogLine =
  | HeaderLine
  | FrameLine
  | BlockLine
  | CueLine
  | PhraseLine
  | ActionLine
  | TlxLine
  | FpsLine;

export function parseJsonl(text: string): LogLine[] {
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as LogLine);
}

export function framesOf(lines: readonly LogLine[]): FrameFeatures[] {
  return lines
    .filter((l): l is FrameLine => l.type === 'frame')
    .map(({ t_ms, face, earL, earR, blinkL, blinkR, yaw, pitch, roll }) => ({
      t_ms,
      face,
      earL,
      earR,
      blinkL,
      blinkR,
      yaw,
      pitch,
      roll,
    }));
}
