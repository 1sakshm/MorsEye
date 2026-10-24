"""Write public/results/site.json (the `SiteResults` shape in src/site/results.ts) and the CSV
downloads next to it. The site reads only this file; never edit it by hand.

`headline` is null whenever the data are synthetic, so no synthetic number can reach the home page.
"""

from __future__ import annotations

import csv
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import config
from .replay import Timing
from .stats import CI
from .study import StudyA, StudyB

SITE_SCHEMA = "morseye-site/1"


def _f(x: Any) -> float | None:
    """JSON-safe number: NaN/inf become null."""
    if x is None:
        return None
    x = float(x)
    return x if math.isfinite(x) else None


def _ci(c: CI | None) -> dict[str, float | None] | None:
    if c is None:
        return None
    return {"mean": _f(c.mean), "lo": _f(c.lo), "hi": _f(c.hi)}


def _pp(d: dict[str, float]) -> list[dict[str, Any]]:
    return [{"p": p, "value": round(v, 4)} for p, v in sorted(d.items()) if v is not None and math.isfinite(v)]


def _dur_set(ds: dict[str, Any]) -> dict[str, Any]:
    return {
        "spontaneous": [round(x) for x in ds["spontaneous"]],
        "short": [round(x) for x in ds["short"]],
        "long": [round(x) for x in ds["long"]],
        "spontaneous_minutes": round(ds["spontaneous_minutes"], 3),
    }


def site_results(a: StudyA | None, b: StudyB | None, synthetic: bool, timing: Timing) -> dict[str, Any]:
    detectors = []
    kshot = []
    fps = []
    durations = {"pooled": {"spontaneous": [], "short": [], "long": [], "spontaneous_minutes": 0}, "participants": {}}
    if a and a.participants:
        for d, m in a.detectors.items():
            detectors.append(
                {
                    "id": d,
                    "label": config.DETECTOR_LABELS[d],
                    "f1": _ci(m["f1"]),
                    "f1_pp": _pp(m["per_participant"]["f1"]),
                    "ftpm": _ci(m["ftpm"]),
                    "ftpm_pp": _pp(m["per_participant"]["ftpm"]),
                    "precision": _ci(m["precision"]),
                    "recall": _ci(m["recall"]),
                }
            )
        kshot = [{"detector": p["detector"], "k": p["k"], "f1": _ci(p["f1"])} for p in a.kshot]
        durations = {
            "pooled": _dur_set(a.duration_set()),
            "participants": {pa.p: _dur_set(a.duration_set(pa)) for pa in a.participants},
        }
        for pa in a.participants:
            fps.append(
                {
                    "p": pa.p,
                    "fps": _f(round(pa.session.measured_fps, 2)),
                    "duration_error_ms": _f(pa.evals[config.PRIMARY_DETECTOR].dur_err_abs),
                    "frame_interval_ms": _f(round(pa.session.median_dt, 2)),
                }
            )

    text_entry = None
    if b and b.participants:
        text_entry = {
            "blocks": [
                {"block": i + 1, "cpm": _ci(b.blocks[k]["cpm"]), "error": _ci(b.blocks[k]["uncorrected"])}
                for i, k in enumerate(("B1", "B2", "B3"))
                if k in b.blocks
            ],
            "per_participant": [
                {
                    "p": p.p,
                    "cpm": [_f(p.blocks.get(k, {}).get("cpm")) for k in ("B1", "B2", "B3")],
                    "error": [_f(p.blocks.get(k, {}).get("uncorrected")) for k in ("B1", "B2", "B3")],
                }
                for p in b.participants
            ],
        }

    headline = None
    if not synthetic and a and a.participants:
        hd, hk = config.HEADLINE["calibrated"], config.HEADLINE["k"]
        cal = next((p for p in a.kshot if p["detector"] == hd and p["k"] == hk), None)
        unc = a.detectors[config.HEADLINE["uncalibrated"]]
        if cal is not None:
            headline = {
                "f1_uncalibrated": {**_ci(unc["f1"]), "detector": config.HEADLINE["uncalibrated"]},
                "f1_calibrated": {**_ci(cal["f1"]), "detector": hd, "k": hk},
                "ftpm_before": _ci(a.detectors["D1"]["ftpm_no_reject"]),
                "ftpm_after": _ci(cal["ftpm"]),
                "cpm_block3": _ci(b.blocks["B3"]["cpm"]) if b and "B3" in b.blocks else None,
                "error_block3": _ci(b.blocks["B3"]["uncorrected"]) if b and "B3" in b.blocks else None,
            }

    return {
        "schema": SITE_SCHEMA,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "synthetic": synthetic,
        "n_participants": len(a.participants) if a else 0,
        "unit": config.UNIT,
        "ci_method": config.ci_method(),
        "timing": timing.to_dict(),
        "headline": headline,
        "durations": durations,
        "detectors": detectors,
        "kshot": kshot,
        "text_entry": text_entry,
        "fps": fps,
        "downloads": {},
    }


def _write_csv(path: Path, header: list[str], rows: list[list[Any]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh, lineterminator="\n")
        w.writerow(header)
        for r in rows:
            w.writerow(["" if (isinstance(x, float) and not math.isfinite(x)) else (round(x, 5) if isinstance(x, float) else x) for x in r])


def write_csvs(a: StudyA | None, b: StudyB | None, out: Path) -> dict[str, str]:
    links: dict[str, str] = {}
    if a and a.participants:
        rows = []
        for pa in a.participants:
            s = pa.session
            for name in ("calibration", "spontaneous", "deliberate", "mixed"):
                if name not in s.blocks:
                    continue
                b0, b1 = s.blocks[name]
                for l in s.labels or []:
                    if b0 <= l.onset_ms < b1:
                        rows.append([pa.p, name, l.type, round(l.onset_ms - b0, 1), round(l.duration_ms, 1)])
        _write_csv(out / "durations.csv", ["participant", "block", "type", "onset_in_block_ms", "duration_ms"], rows)
        links["durations"] = "/results/durations.csv"

        rows = []
        for pa in a.participants:
            for d, e in pa.evals.items():
                rows.append([pa.p, d, e.tp, e.fp, e.fn, e.precision, e.recall, e.f1, e.ftpm, e.ftpm_no_reject, e.dur_err_abs, e.dur_err_signed])
        _write_csv(out / "detectors.csv", ["participant", "detector", "tp", "fp", "fn", "precision", "recall", "f1", "ftpm", "ftpm_no_reject", "duration_error_abs_ms", "duration_error_signed_ms"], rows)
        links["detectors"] = "/results/detectors.csv"

        rows = [[pa.p, det, k, ks.f1, ks.ftpm, ks.n_draws, ks.k_eff, ks.poor_fit_frac] for pa in a.participants for (det, k), ks in sorted(pa.kshot.items())]
        _write_csv(out / "kshot.csv", ["participant", "detector", "k", "f1_mean_over_draws", "ftpm_mean_over_draws", "draws", "k_effective", "poor_fit_fraction"], rows)
        links["kshot"] = "/results/kshot.csv"

        rows = [[pa.p, pa.session.measured_fps, pa.session.median_dt, pa.evals[config.PRIMARY_DETECTOR].dur_err_abs, pa.evals[config.PRIMARY_DETECTOR].dur_err_signed] for pa in a.participants]
        _write_csv(out / "fps.csv", ["participant", "fps", "frame_interval_ms", "duration_error_abs_ms", "duration_error_signed_ms"], rows)
        links["fps"] = "/results/fps.csv"

    if b and b.participants:
        rows = []
        for p in b.participants:
            for r in p.phrases:
                rows.append([p.p, r.block, r.index, r.target, r.typed, r.n_chars, r.ms, r.cpm, r.errors.uncorrected, r.errors.corrected, r.errors.total_er, r.closures_per_char])
        _write_csv(out / "text_entry.csv", ["participant", "block", "phrase", "target", "typed", "chars", "ms", "cpm", "uncorrected_er", "corrected_er", "total_er", "closures_per_char"], rows)
        links["text_entry"] = "/results/text_entry.csv"
    return links


def export(a: StudyA | None, b: StudyB | None, out_dir: Path, synthetic: bool, timing: Timing) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    data = site_results(a, b, synthetic, timing)
    data["downloads"] = write_csvs(a, b, out_dir)
    path = out_dir / "site.json"
    path.write_text(json.dumps(data, allow_nan=False, separators=(",", ":")) + "\n", encoding="utf-8")
    return path
