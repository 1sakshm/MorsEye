"""What the completed project can report (preregistration, Deviations of 25 Oct 2026).

Data collection stopped after one detection session (P01 session 1) with cue-response types but no closure
times, so the confirmatory Part A tests and Part B were not run. This module computes what remains:

* **Part C, Eyeblink8** (secondary, not blind): false triggers per minute on other people's natural blinks, with
  and without the reject window, per video; read from ``analysis/out/public_blinks.json``, which
  ``python -m analysis.public_blinks`` writes.
* **Session 1** (exploratory, one session, no CIs): measured frame rate by block, the cue-versus-response table
  from the author's type checks, false triggers per minute while reading (the spontaneous block has no cues, so
  every closure there counts as spontaneous), and, for each cue the author responded to, what each detector
  found in the cue window. Closure durations here are *detector-measured*, not labelled.

    python -m analysis.case_study --data data/raw

Writes analysis/out/results.json, public/results/case.json, paper/tables/case_*.tex and figures C1-C3.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

from . import __version__, config
from .calibration import calibration_data, fit_user
from .load import Session, load_dataset
from .replay import DEFAULT_TIMING, Timing, band, detect_fast
from .stats import bootstrap_ci, wilcoxon

ROOT = Path(__file__).resolve().parent.parent
BOTH_EYE = ("D1", "D2", "D3", "D4")
DETECTORS = (*BOTH_EYE, "D5")
CUE_TO_TYPE = {"SHORT": "short", "LONG": "long", "WINK-L": "wink-L", "WINK-R": "wink-R"}
BAND_TO_TYPE = {"dot": "short", "dash": "long"}
OUTCOMES = ("none", "reject", "dot", "dash", "hold", "backspace")


# ---------------------------------------------------------------------------------------------
# Part C: Eyeblink8
# ---------------------------------------------------------------------------------------------


def public_summary(pb: dict[str, Any]) -> dict[str, Any]:
    """Per-video false triggers with and without the reject window, summarised over videos."""
    videos = pb["videos"]
    reject_ms = pb["timing"]["rejectMs"]
    blink = np.concatenate([np.asarray(v["blink_ms"], float) for v in videos])
    out: dict[str, Any] = {
        "dataset": pb["dataset"],
        "status": "secondary, not blind (preregistration section 2)",
        "n_videos": pb["n_videos"],
        "n_people": pb["n_people"],
        "minutes": pb["minutes"],
        "n_blinks": pb["n_blinks"],
        "fps_median": float(np.median([v["fps"] for v in videos])),
        "annotated_blink_ms": pb["annotated_blink_ms"],
        "annotated_frac_below_reject": float(np.mean(blink < reject_ms)),
        "blink_ms_by_video": [v["blink_ms"] for v in videos],
        "reject_ms": reject_ms,
        "videos": [
            {
                "video": v["video"],
                "glasses": v["glasses"],
                "minutes": v["minutes"],
                "fps": v["fps"],
                "n_blinks": v["n_blinks"],
                **{
                    f"{d}_{k}": v["detectors"][d][k]
                    for d in pb["detectors"]
                    for k in ("ftpm_no_reject", "ftpm", "blinks_detected", "n_detected")
                },
            }
            for v in videos
        ],
        "detectors": {},
    }
    for d, s in pb["detectors"].items():
        before = [v["detectors"][d]["ftpm_no_reject"] for v in videos]
        after = [v["detectors"][d]["ftpm"] for v in videos]
        b, a = bootstrap_ci(before), bootstrap_ci(after)
        _, p, n = wilcoxon(np.asarray(after), np.asarray(before))
        out["detectors"][d] = {
            "label": config.DETECTOR_LABELS[d],
            "ftpm_no_reject": b.to_dict(),
            "ftpm": a.to_dict(),
            "ratio_of_means": a.mean / b.mean if b.mean else float("nan"),
            # The preregistered H3b criterion, applied descriptively: Eyeblink8 is not a test of H3b.
            "meets_halving_criterion": bool(a.mean <= 0.5 * b.mean),
            "wilcoxon_p": p,
            "wilcoxon_n": n,
            "pooled_reduction": s["reduction"],
            "blink_recall": s["blink_recall"],
            "detected_closed_ms": s["detected_closed_ms"],
            "frac_closed_below_reject": s["frac_closed_below_reject"],
            "bands": s["bands"],
        }
    return out


# ---------------------------------------------------------------------------------------------
# Session 1
# ---------------------------------------------------------------------------------------------


def read_cue_types(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8", newline="") as fh:
        return [{**r, "cue_ms": float(r["cue_ms"])} for r in csv.DictReader(fh)]


def block_fps(s: Session) -> dict[str, float]:
    out = {}
    for name, (t0, t1) in s.blocks.items():
        t = s.frames.t[s.frames.select(t0, t1)]
        out[name] = 1000.0 / float(np.median(np.diff(t))) if t.size > 2 else float("nan")
    return out


def _window(c: dict[str, Any]) -> tuple[float, float]:
    return c["t_ms"], c["t_ms"] + c.get("duration_ms", 1500) + config.CUE_WINDOW_SLACK_MS


def session_summary(s: Session, cue_types: list[dict[str, Any]], timing: Timing) -> dict[str, Any]:
    fa = s.frames.arrays()
    cd = calibration_data(s, "cues")
    user, fits = fit_user(cd) if cd and cd.n_closures else (None, {})
    closures = {d: detect_fast(fa, d, user) for d in DETECTORS}

    # Cue-versus-response table (the author's type checks; no closure times).
    by_cue = {round(r["cue_ms"], 1): r for r in cue_types}
    cues = [c for c in s.cues if c.get("cue") in CUE_TO_TYPE]
    responses = []
    for c in cues:
        r = by_cue.get(round(c["t_ms"], 1))
        responses.append({"cue": c, "response": r["response_type"] if r else None})
    table: dict[str, dict[str, int]] = {}
    for x in responses:
        cue_t = CUE_TO_TYPE[x["cue"]["cue"]]
        table.setdefault(cue_t, {})
        key = x["response"] or "unchecked"
        table[cue_t][key] = table[cue_t].get(key, 0) + 1
    n_match = sum(1 for x in responses if x["response"] == CUE_TO_TYPE[x["cue"]["cue"]])

    # False triggers while reading: the spontaneous block has no cues.
    sp = s.blocks.get("spontaneous")
    sp_min = s.block_minutes("spontaneous")
    reading: dict[str, Any] = {}
    for d in DETECTORS:
        cs = [c for c in closures[d] if sp and sp[0] <= c.start_ms < sp[1]]
        bands = [band(c.duration_ms, timing) for c in cs]
        reading[d] = {
            "n_closures": len(cs),
            "bands": {k: bands.count(k) for k in OUTCOMES if k != "none"},
            "ftpm_no_reject": len(cs) / sp_min,
            "ftpm": sum(b != "reject" for b in bands) / sp_min,
            "closed_ms": _pct([c.duration_ms for c in cs]),
        }

    # Detector output in the window of each cue the author responded to (deliberate and mixed blocks).
    cue_response: dict[str, Any] = {}
    durations: dict[str, dict[str, list[float]]] = {}
    for d in DETECTORS:
        targets = ("short", "long") if d in BOTH_EYE else ("wink-L", "wink-R")
        conf: dict[str, dict[str, int]] = {t: {k: 0 for k in OUTCOMES} for t in targets}
        durs: dict[str, list[float]] = {t: [] for t in targets}
        for x in responses:
            if x["cue"].get("block") not in ("deliberate", "mixed") or x["response"] not in targets:
                continue
            w0, w1 = _window(x["cue"])
            cs = [c for c in closures[d] if w0 <= c.start_ms < w1]
            if d == "D5":
                want = "left" if x["response"] == "wink-L" else "right"
                cs = [c for c in cs if c.eye == want]
            if not cs:
                conf[x["response"]]["none"] += 1
                continue
            c = max(cs, key=lambda c: c.duration_ms)  # the response, not a blink just before it
            conf[x["response"]][band(c.duration_ms, timing)] += 1
            durs[x["response"]].append(c.duration_ms)
        n = sum(sum(v.values()) for v in conf.values())
        if d in BOTH_EYE:
            correct = sum(conf[t][b] for b, t in BAND_TO_TYPE.items())
        else:
            correct = sum(conf[t][b] for t in targets for b in ("dot", "dash", "hold", "backspace"))
        cue_response[d] = {"n": n, "correct": correct, "accuracy": correct / n if n else float("nan"), "confusion": conf}
        durations[d] = {t: [round(v, 1) for v in vs] for t, vs in durs.items()}

    return {
        "status": "exploratory, one session, no confidence intervals",
        "unit": s.unit_id,
        "file": s.path.name,
        "setup": s.header.get("setup", {}),
        "camera_label": s.header.get("camera_label", ""),
        "fps": s.measured_fps,
        "fps_by_block": block_fps(s),
        "missing_frac": s.missing_frac,
        "face_frac": s.face_frac,
        "minutes": float((s.frames.t[-1] - s.frames.t[0]) / 60000.0),
        "spontaneous_minutes": sp_min,
        "calibration": {
            "source": cd.source if cd else None,
            "n_closures": cd.n_closures if cd else 0,
            "fits": {k: {"thr": v.thr, "ok": v.ok, "warning": v.warning} for k, v in fits.items()},
        },
        "responses": {"n_cues": len(responses), "n_match": n_match, "table": table},
        "reading": reading,
        "cue_response": cue_response,
        "durations": durations,
        "duration_pct": {d: {t: _pct(v) for t, v in x.items()} for d, x in durations.items()},
        "fps_trace": [[round(f["t_ms"] - s.frames.t[0], 1), f["fps"]] for f in s.fps_lines],
        "blocks": {k: [v[0] - s.frames.t[0], v[1] - s.frames.t[0]] for k, v in s.blocks.items()},
    }


def _pct(x: list[float]) -> dict[str, float] | None:
    v = np.asarray(x, float)
    if not v.size:
        return None
    q = np.percentile(v, [5, 25, 50, 75, 95])
    return {"n": int(v.size), **{k: float(x) for k, x in zip(("p5", "p25", "median", "p75", "p95"), q)}}


def _clean(x: Any) -> Any:
    if isinstance(x, dict):
        return {str(k): _clean(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [_clean(v) for v in x]
    if isinstance(x, (np.floating, float)):
        return float(x) if math.isfinite(x) else None
    if isinstance(x, np.integer):
        return int(x)
    if isinstance(x, np.bool_):
        return bool(x)
    return x


# ---------------------------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------------------------


def run(data: Path, public: Path, timing: Timing) -> dict[str, Any]:
    out: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "analysis_version": __version__,
        "timing": timing.to_dict(),
        "public": public_summary(json.loads(public.read_text(encoding="utf-8"))) if public.exists() else None,
        "session": None,
    }
    ds = load_dataset(data)
    for s in ds.study_a:
        if s.participant == "P01" and int(s.header.get("session") or 1) == 1:
            p = data / "P01_A_cue_types.csv"
            out["session"] = session_summary(s, read_cue_types(p) if p.exists() else [], timing)
    out["warnings"] = ds.warnings
    return _clean(out)


def main() -> None:
    ap = argparse.ArgumentParser(prog="python -m analysis.case_study", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default=str(ROOT / "data" / "raw"))
    ap.add_argument("--public", default=str(ROOT / "analysis" / "out" / "public_blinks.json"))
    ap.add_argument("--out", default=str(ROOT / "analysis" / "out" / "results.json"))
    ap.add_argument("--site", default=str(ROOT / "public" / "results"))
    ap.add_argument("--paper", default=str(ROOT / "paper"))
    ap.add_argument("--no-figures", action="store_true")
    args = ap.parse_args()

    res = run(Path(args.data), Path(args.public), DEFAULT_TIMING)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(res, indent=2) + "\n", encoding="utf-8")

    from .case_outputs import write_figures, write_site, write_tables

    write_site(res, Path(args.site))
    write_tables(res, Path(args.paper) / "tables")
    if not args.no_figures:
        write_figures(res, Path(args.paper) / "figures", Path(args.site) / "figures")

    pub, ses = res["public"], res["session"]
    if pub:
        print(f"Eyeblink8: {pub['n_videos']} videos, {pub['n_blinks']} blinks, {pub['minutes']} min")
        for d, x in pub["detectors"].items():
            print(
                f"  {d}: FT/min {x['ftpm_no_reject']['mean']:.2f} -> {x['ftpm']['mean']:.2f} "
                f"(ratio {x['ratio_of_means']:.2f}, Wilcoxon p = {x['wilcoxon_p']:.3g}, n = {x['wilcoxon_n']})"
            )
    if ses:
        print(f"Session 1: {ses['fps']:.1f} fps; {ses['responses']['n_match']}/{ses['responses']['n_cues']} responses matched the cue")
        for d, x in ses["reading"].items():
            print(f"  {d}: reading FT/min {x['ftpm_no_reject']:.1f} -> {x['ftpm']:.1f}; cue-window accuracy {ses['cue_response'][d]['accuracy']:.2f} (n = {ses['cue_response'][d]['n']})")
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
