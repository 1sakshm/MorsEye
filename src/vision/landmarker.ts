import type { FaceLandmarker, FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import type { FrameFeatures } from '../types';
import {
  EAR_IDX_LEFT,
  EAR_IDX_RIGHT,
  ear,
  eyePoints,
  headPose,
  NO_FACE,
  pickBlinks,
  type Point,
} from './features';

/**
 * MediaPipe FaceLandmarker wrapper -> FrameFeatures (PRD §5.1, §5.2).
 * The library, its WASM and the model are all self-hosted (public/wasm, public/models), and the
 * library is imported lazily so only /try and /study pay for it.
 */

export interface FrameResult {
  features: FrameFeatures;
  nFaces: number;
  /** All landmarks of the first face (normalised), for drawing. Empty without a face. */
  landmarks: Point[];
  /** 6 EAR points per eye, normalised, left then right: [x1,y1,…]. Empty without a face. */
  eyePts: number[];
}

export interface Landmarker {
  detect(video: HTMLVideoElement, t_ms: number): FrameResult;
  close(): void;
  delegate: 'GPU' | 'CPU';
}

const BASE = import.meta.env.BASE_URL;

export async function createLandmarker(): Promise<Landmarker> {
  const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
  const fileset = await FilesetResolver.forVisionTasks(`${BASE}wasm`);
  const make = (delegate: 'GPU' | 'CPU') =>
    FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${BASE}models/face_landmarker.task`, delegate },
      runningMode: 'VIDEO',
      numFaces: 2, // to detect MULTIPLE_FACES; only the first face is used
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    });

  let fl: FaceLandmarker;
  let delegate: 'GPU' | 'CPU' = 'GPU';
  try {
    fl = await make('GPU');
  } catch {
    delegate = 'CPU';
    fl = await make('CPU');
  }

  return {
    delegate,
    detect(video, t_ms) {
      const r = fl.detectForVideo(video, t_ms);
      return toFrame(r, t_ms, video.videoWidth, video.videoHeight);
    },
    close() {
      fl.close();
    },
  };
}

export function toFrame(r: FaceLandmarkerResult, t_ms: number, w: number, h: number): FrameResult {
  const lms = r.faceLandmarks[0];
  if (!lms || lms.length < 468) {
    return { features: NO_FACE(t_ms), nFaces: r.faceLandmarks.length, landmarks: [], eyePts: [] };
  }
  const left = eyePoints(lms, EAR_IDX_LEFT, w, h);
  const right = eyePoints(lms, EAR_IDX_RIGHT, w, h);
  const { blinkL, blinkR } = pickBlinks(r.faceBlendshapes[0]?.categories ?? []);
  const m = r.facialTransformationMatrixes?.[0]?.data;
  const pose = m ? headPose(m) : { yaw: 0, pitch: 0, roll: 0 };
  const eyePts: number[] = [];
  for (const i of [...EAR_IDX_LEFT, ...EAR_IDX_RIGHT]) {
    const p = lms[i]!;
    eyePts.push(round(p.x, 5), round(p.y, 5));
  }
  return {
    features: {
      t_ms,
      face: true,
      earL: round(ear(left), 5),
      earR: round(ear(right), 5),
      blinkL: round(blinkL, 5),
      blinkR: round(blinkR, 5),
      yaw: round(pose.yaw, 2),
      pitch: round(pose.pitch, 2),
      roll: round(pose.roll, 2),
    },
    nFaces: r.faceLandmarks.length,
    landmarks: lms,
    eyePts,
  };
}

function round(x: number, d: number): number {
  const f = 10 ** d;
  return Math.round(x * f) / f;
}
