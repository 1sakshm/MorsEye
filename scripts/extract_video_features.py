"""Run MediaPipe FaceLandmarker over a recorded video and write the app's per-frame features.

Used for public blink datasets (docs/public-data.md), never for participant video. The features match
src/vision/features.ts: EAR from the same 6 landmarks per eye in pixel space, and the eyeBlinkLeft /
eyeBlinkRight blendshape scores, from the same model file and MediaPipe version as the app.

Needs its own environment (MediaPipe and OpenCV are not part of requirements.txt):
    uv venv --python 3.11 .venv-video
    uv pip install --python .venv-video -r requirements-video.txt
    .venv-video/Scripts/python scripts/extract_video_features.py VIDEO.avi --times VIDEO.txt --out OUT.jsonl

--times is a file with "<frame index> <seconds>" per line (the Eyeblink8 format). Without it, frame
times come from the video's nominal frame rate.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import cv2
import mediapipe as mp
from mediapipe.tasks import python as mp_tasks
from mediapipe.tasks.python import vision

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "public" / "models" / "face_landmarker.task"

# src/vision/features.ts
EAR_IDX_LEFT = (33, 160, 158, 133, 153, 144)
EAR_IDX_RIGHT = (362, 385, 387, 263, 373, 380)


def ear(lms, idx, w: int, h: int) -> float:
    p = [(lms[i].x * w, lms[i].y * h) for i in idx]
    d = lambda a, b: math.hypot(a[0] - b[0], a[1] - b[1])  # noqa: E731
    horizontal = d(p[0], p[3])
    return 0.0 if horizontal == 0 else (d(p[1], p[5]) + d(p[2], p[4])) / (2 * horizontal)


def read_times(path: Path) -> list[float]:
    times: dict[int, float] = {}
    for line in path.read_text(encoding="latin-1").splitlines():
        parts = line.split()
        if len(parts) >= 2:
            times[int(parts[0])] = float(parts[1]) * 1000.0
    return [times[k] for k in sorted(times)]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("video")
    ap.add_argument("--times", help="per-frame timestamps file: '<frame> <seconds>' per line")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    cap = cv2.VideoCapture(args.video)
    if not cap.isOpened():
        raise SystemExit(f"cannot open {args.video}")
    nominal_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    times = read_times(Path(args.times)) if args.times else None

    options = vision.FaceLandmarkerOptions(
        base_options=mp_tasks.BaseOptions(model_asset_path=str(MODEL)),
        running_mode=vision.RunningMode.VIDEO,
        num_faces=1,
        output_face_blendshapes=True,
    )
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    n = n_face = 0
    last_ts = -1
    with vision.FaceLandmarker.create_from_options(options) as lm, out.open("w", encoding="utf-8") as fh:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            if times is not None and n >= len(times):
                break
            t_ms = times[n] if times is not None else n * 1000.0 / nominal_fps
            ts = max(last_ts + 1, int(round(t_ms)))  # MediaPipe needs strictly increasing integer ms
            last_ts = ts
            h, w = frame.shape[:2]
            image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            res = lm.detect_for_video(image, ts)
            rec = {"frame": n, "t_ms": round(t_ms, 3), "face": False}
            if res.face_landmarks:
                lms = res.face_landmarks[0]
                blink = {c.category_name: c.score for c in (res.face_blendshapes[0] if res.face_blendshapes else [])}
                rec.update(
                    face=True,
                    earL=round(ear(lms, EAR_IDX_LEFT, w, h), 5),
                    earR=round(ear(lms, EAR_IDX_RIGHT, w, h), 5),
                    blinkL=round(blink.get("eyeBlinkLeft", 0.0), 5),
                    blinkR=round(blink.get("eyeBlinkRight", 0.0), 5),
                )
                n_face += 1
            fh.write(json.dumps(rec) + "\n")
            n += 1
    if times is not None and n != len(times):
        print(f"warning: {n} video frames but {len(times)} timestamps")
    print(f"{args.video}: {n} frames, face found in {n_face / max(n, 1):.1%}")


if __name__ == "__main__":
    main()
