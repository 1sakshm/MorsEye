/**
 * The single per-frame record every downstream module consumes (PRD §5.2).
 * Recorded logs contain exactly these fields, so the analysis can replay them
 * through the same detector/segmenter/decoder code the app runs.
 */
export interface FrameFeatures {
  /** Frame capture timestamp in ms (performance.now() clock, from requestVideoFrameCallback). */
  t_ms: number;
  /** A face was found in this frame. When false, all other values are 0 and must be ignored. */
  face: boolean;
  /** 6-point eye aspect ratio, left and right eye (MediaPipe's left/right, i.e. the subject's). */
  earL: number;
  earR: number;
  /** MediaPipe blendshape scores eyeBlinkLeft / eyeBlinkRight, 0..1. */
  blinkL: number;
  blinkR: number;
  /** Head pose in degrees, from the facial transformation matrix. */
  yaw: number;
  pitch: number;
  roll: number;
}

/** A completed eye closure as found by a detector. Times use the FrameFeatures clock. */
export interface Closure {
  /** Timestamp of the first closed frame. */
  start_ms: number;
  /** Timestamp of the first open frame after the closure. */
  end_ms: number;
  duration_ms: number;
  /** Which eye(s) closed. 'both' for D1–D4; 'left' / 'right' for wink detection (D5). */
  eye: 'both' | 'left' | 'right';
}
