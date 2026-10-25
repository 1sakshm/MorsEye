"""Natural blinks in a public video dataset (Eyeblink8): how often would each detector type a symbol?

Every blink in Eyeblink8 is spontaneous (people at home, mostly acting naturally), so every detected closure
that the segmenter does not reject is a false trigger. This gives a multi-person check of H3 and of the
spontaneous-blink duration distribution (RQ2), on recordings made by other people with other cameras.

Inputs:
    --dataset  the unpacked eyeblink8/ folder (per video: <name>.avi, <name>.tag annotations, <name>.txt times)
    --features per-video feature files from scripts/extract_video_features.py, named <folder>.jsonl

    python -m analysis.public_blinks --dataset path/to/eyeblink8 --features data/external/eyeblink8

Writes analysis/out/public_blinks.json. Only fixed-threshold detectors (D1, D3) are run: the dataset has no
deliberate closures, so a per-user threshold cannot be calibrated from it.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np

from .metrics import match_events
from .replay import DEFAULT_TIMING, Timing, band, detect_all, make_detector

ROOT = Path(__file__).resolve().parents[1]
DETECTORS = ("D1", "D3")


def read_times(path: Path) -> list[float]:
    times: dict[int, float] = {}
    for line in path.read_text(encoding="latin-1").splitlines():
        parts = line.split()
        if len(parts) >= 2:
            times[int(parts[0])] = float(parts[1]) * 1000.0
    return [times[k] for k in sorted(times)]


def read_tag(path: Path) -> tuple[dict[str, str], dict[int, list[int]]]:
    """Eyeblink8 .tag file -> (header fields, {blink id: [frame indices]})."""
    meta: dict[str, str] = {}
    blinks: dict[int, list[int]] = {}
    started = False
    for raw in path.read_text(encoding="latin-1").splitlines():
        line = raw.strip()
        if line == "#start":
            started = True
            continue
        if not started:
            if line.startswith("#") and ":" in line:
                k, v = line[1:].split(":", 1)
                meta[k.strip()] = v.strip()
            continue
        if not line or line.startswith("#"):
            continue
        f = line.split(":")
        fid, bid = int(f[0]), int(f[1])
        if bid >= 0:
            blinks.setdefault(bid, []).append(fid)
    return meta, blinks


def load_frames(path: Path) -> list[dict[str, Any]]:
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        r = json.loads(line)
        if not r["face"]:
            r.update(earL=0.0, earR=0.0, blinkL=0.0, blinkR=0.0)
        out.append(r)
    return out


def best_lag(frames: list[dict[str, Any]], closed_frames: set[int], max_lag: int = 6) -> int:
    """Frame offset that best lines up annotated blinks with dips in EAR; 0 means aligned."""
    ear = np.array([(f["earL"] + f["earR"]) / 2 if f["face"] else np.nan for f in frames])
    mask = np.zeros(len(frames), bool)
    for i in closed_frames:
        if i < len(frames):
            mask[i] = True
    scores = {}
    for lag in range(-max_lag, max_lag + 1):
        m = np.roll(mask, lag)
        scores[lag] = float(np.nanmean(ear[m]) - np.nanmean(ear[~m]))
    return min(scores, key=lambda k: scores[k])


def analyse_video(name: str, dataset: Path, features: Path, timing: Timing) -> dict[str, Any]:
    folder = dataset / name
    tag = next(folder.glob("*.tag"))
    times = read_times(tag.with_suffix(".txt"))
    meta, blinks = read_tag(tag)
    frames = load_frames(features / f"{name}.jsonl")
    n = len(frames)
    # Annotated blink intervals on the frame clock: first annotated frame to the first frame after it.
    labels = []
    for fr in blinks.values():
        a, b = min(fr), max(fr)
        if b + 1 < n:
            labels.append((times[a], times[b + 1]))
    labels.sort()
    minutes = (frames[-1]["t_ms"] - frames[0]["t_ms"]) / 60000.0
    lag = best_lag(frames, {i for fr in blinks.values() for i in fr})

    res: dict[str, Any] = {
        "video": name,
        "glasses": meta.get("glasses", "?"),
        "frames": n,
        "minutes": round(minutes, 3),
        "fps": round(1000.0 / float(np.median(np.diff([f["t_ms"] for f in frames]))), 2),
        "face_frac": round(sum(f["face"] for f in frames) / n, 4),
        "alignment_lag_frames": lag,
        "n_blinks": len(labels),
        "blink_ms": [round(b - a, 1) for a, b in labels],
        "detectors": {},
    }
    for det_id in DETECTORS:
        closures = detect_all(make_detector(det_id), frames)
        bands = [band(c.duration_ms, timing) for c in closures]
        m = match_events([(c.start_ms, c.end_ms) for c in closures], labels)
        typed = [b for b in bands if b != "reject"]
        res["detectors"][det_id] = {
            "n_detected": len(closures),
            "blinks_detected": len(m),
            "closed_ms_matched": [round(closures[i].duration_ms, 1) for i, _, _ in m],
            # (annotated, measured) duration of each matched blink, and every detected duration (for sweeps).
            "matched_pairs_ms": [[round(labels[j][1] - labels[j][0], 1), round(closures[i].duration_ms, 1)] for i, j, _ in m],
            "closed_ms_all": [round(c.duration_ms, 1) for c in closures],
            "bands": {k: bands.count(k) for k in ("reject", "dot", "dash", "hold", "backspace")},
            "ftpm_no_reject": round(len(closures) / minutes, 3),
            "ftpm": round(len(typed) / minutes, 3),
        }
    return res


def summarise(videos: list[dict[str, Any]], timing: Timing) -> dict[str, Any]:
    minutes = sum(v["minutes"] for v in videos)
    blink = np.concatenate([v["blink_ms"] for v in videos])
    out: dict[str, Any] = {
        "dataset": "Eyeblink8 (Fogelton & Benesova; blinkingmatters.com/research, GPL-3.0)",
        "n_videos": len(videos),
        "n_people": 4,
        "minutes": round(minutes, 2),
        "n_blinks": int(blink.size),
        "timing": timing.to_dict(),
        "annotated_blink_ms": _pct(blink),
        "detectors": {},
        "videos": videos,
    }
    for det_id in DETECTORS:
        ds = [v["detectors"][det_id] for v in videos]
        closed = np.concatenate([d["closed_ms_matched"] for d in ds]) if ds else np.array([])
        n_det = sum(d["n_detected"] for d in ds)
        n_typed = sum(n_det_v - d["bands"]["reject"] for d, n_det_v in ((d, d["n_detected"]) for d in ds))
        out["detectors"][det_id] = {
            "blink_recall": round(sum(d["blinks_detected"] for d in ds) / max(blink.size, 1), 4),
            "detected_closed_ms": _pct(closed),
            "frac_closed_below_reject": round(float(np.mean(closed < timing.rejectMs)), 4) if closed.size else None,
            "ftpm_no_reject": round(n_det / minutes, 3),
            "ftpm": round(n_typed / minutes, 3),
            "reduction": round(1 - n_typed / n_det, 4) if n_det else None,
            "ftpm_per_video": [d["ftpm"] for d in ds],
            "ftpm_no_reject_per_video": [d["ftpm_no_reject"] for d in ds],
            "bands": {k: sum(d["bands"][k] for d in ds) for k in ("reject", "dot", "dash", "hold", "backspace")},
        }
    return out


def _pct(x: np.ndarray) -> dict[str, float] | None:
    if not x.size:
        return None
    q = np.percentile(x, [5, 25, 50, 75, 95])
    keys = ("p5", "p25", "median", "p75", "p95")
    return {"n": int(x.size), **{k: round(float(v), 1) for k, v in zip(keys, q)}, "max": round(float(x.max()), 1)}


def main() -> None:
    ap = argparse.ArgumentParser(prog="python -m analysis.public_blinks", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dataset", required=True)
    ap.add_argument("--features", default=str(ROOT / "data" / "external" / "eyeblink8"))
    ap.add_argument("--timing", help="JSON file with segmenter timing (default: the app's defaults)")
    ap.add_argument("--out", default=str(ROOT / "analysis" / "out" / "public_blinks.json"))
    args = ap.parse_args()
    timing = Timing.from_dict(json.loads(Path(args.timing).read_text())) if args.timing else DEFAULT_TIMING
    dataset, features = Path(args.dataset), Path(args.features)
    names = sorted((p.stem for p in features.glob("*.jsonl")), key=lambda s: int(s) if s.isdigit() else s)
    videos = [analyse_video(n, dataset, features, timing) for n in names]
    s = summarise(videos, timing)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(s, indent=2) + "\n", encoding="utf-8")

    print(f"{s['n_videos']} videos, {s['minutes']} min, {s['n_blinks']} annotated blinks; annotated length {s['annotated_blink_ms']}")
    for v in videos:
        flag = "" if v["alignment_lag_frames"] == 0 else f"  (annotation lag {v['alignment_lag_frames']} frames)"
        print(f"  video {v['video']:>3}: {v['fps']} fps, face {v['face_frac']:.1%}, {v['n_blinks']} blinks{flag}")
    for det_id, d in s["detectors"].items():
        print(f"{det_id}: recall {d['blink_recall']:.2f}; closed ms {d['detected_closed_ms']}; "
              f"<{timing.rejectMs:g} ms {d['frac_closed_below_reject']}; false triggers/min {d['ftpm_no_reject']} -> {d['ftpm']} "
              f"(-{d['reduction']:.0%}); bands {d['bands']}")
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
