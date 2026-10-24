"""Run the whole analysis: load -> Study A + B -> stats -> summary.json, site.json, figures, tables.

    python -m analysis.run --data data/public           real data
    python -m analysis.run --synthetic                   synthetic demo data (marked synthetic everywhere)

Outputs:
    analysis/out/summary.json        every number reported anywhere (the paper's source of truth)
    public/results/site.json + CSVs  what /research and the home page show
    paper/figures/F*.pdf|png         F1-F8 (PNG copies in public/results/figures/)
    paper/tables/*.tex               T1-T3, numbers.tex (\\ME{key} macros), status.tex
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import __version__, config
from .export_site import export
from .load import Dataset, load_dataset
from .replay import DEFAULT_TIMING, Timing, valid_timing
from .stats import CI
from .study import StudyA, StudyB, analyze_study_a, analyze_study_b

ROOT = Path(__file__).resolve().parent.parent


def _clean(x: Any) -> Any:
    """JSON-safe copy: CIs to dicts, NaN/inf to null, tuples to lists."""
    if isinstance(x, CI):
        return _clean(x.to_dict())
    if isinstance(x, dict):
        return {str(k): _clean(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [_clean(v) for v in x]
    if isinstance(x, float):
        return x if math.isfinite(x) else None
    return x


def build_summary(ds: Dataset, a: StudyA, b: StudyB | None, synthetic: bool, data_dir: str, timing: Timing) -> dict[str, Any]:
    parts = []
    for pa in a.participants:
        s = pa.session
        parts.append(
            {
                "p": pa.p,
                "file": s.path.name,
                "setup": s.header.get("setup", {}),
                "camera_label": s.header.get("camera_label", ""),
                "fps": s.measured_fps,
                "frame_interval_ms": s.median_dt,
                "missing_frac": s.missing_frac,
                "face_frac": s.face_frac,
                "n_frames": len(s.frames),
                "n_labels": pa.n_labels,
                "labelling_span_min": pa.labelling_span_min,
                "calibration": {
                    "source": pa.calib.source if pa.calib else None,
                    "n_closures": pa.calib.n_closures if pa.calib else 0,
                    "fits": {k: {"thr": v.thr, "h": v.h, "range": v.range, "ok": v.ok, "warning": v.warning} for k, v in pa.fits.items()},
                },
                "detectors": {
                    d: {
                        "tp": e.tp,
                        "fp": e.fp,
                        "fn": e.fn,
                        "precision": e.precision,
                        "recall": e.recall,
                        "f1": e.f1,
                        "f1_by_block": {blk: e.block_f1(blk) for blk in e.blocks},
                        "wink_triggers": sum(x.wink_triggers for x in e.blocks.values()),
                        "ftpm": e.ftpm,
                        "ftpm_no_reject": e.ftpm_no_reject,
                        "dur_err_abs": e.dur_err_abs,
                        "dur_err_signed": e.dur_err_signed,
                        "short_long_accuracy": e.short_long_accuracy,
                        "deliberate_rejected": e.deliberate_rejected,
                    }
                    for d, e in pa.evals.items()
                },
                "kshot": [
                    {"detector": det, "k": k, "f1": v.f1, "ftpm": v.ftpm, "draws": v.n_draws, "k_effective": v.k_eff, "poor_fit_frac": v.poor_fit_frac}
                    for (det, k), v in sorted(pa.kshot.items())
                ],
                "self_agreement": (
                    {
                        "kappa": pa.agreement.kappa,
                        "mean_abs_onset_ms": pa.agreement.mean_abs_onset_ms,
                        "mean_abs_offset_ms": pa.agreement.mean_abs_offset_ms,
                        "n_matched": pa.agreement.n_matched,
                        "n_unmatched": pa.agreement.n_unmatched,
                    }
                    if pa.agreement
                    else None
                ),
            }
        )

    dur = a.duration_set() if a.participants else {"spontaneous": [], "short": [], "long": [], "spontaneous_minutes": 0}

    def dstats(v: list[float]) -> dict[str, Any]:
        import numpy as np

        x = np.asarray(v, dtype=float)
        if x.size == 0:
            return {"n": 0}
        q = np.quantile(x, [0.05, 0.25, 0.5, 0.75, 0.95])
        return {"n": int(x.size), "mean": float(x.mean()), "p05": q[0], "p25": q[1], "median": q[2], "p75": q[3], "p95": q[4]}

    study_b = None
    if b is not None:
        study_b = {
            "n_participants": len(b.participants),
            "blocks": {blk: v for blk, v in b.blocks.items()},
            "tlx": b.tlx,
            "tests": [t.to_dict() for t in b.tests],
            "participants": [
                {"p": p.p, "blocks": p.blocks, "tlx": p.tlx, "n_phrases": len(p.phrases)} for p in b.participants
            ],
        }

    agreements = [pa.agreement for pa in a.participants if pa.agreement]
    return _clean(
        {
            "schema": "morseye-summary/1",
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "analysis_version": __version__,
            "synthetic": synthetic,
            "data_dir": data_dir,
            "config": {
                "timing": timing.to_dict(),
                "iou_min": config.IOU_MIN,
                "eval_blocks": config.EVAL_BLOCKS,
                "wink_policy_both_eye": config.WINK_POLICY_BOTH_EYE,
                "calibration_source": config.CALIBRATION_SOURCE,
                "ks": config.KS,
                "draws": config.DRAWS,
                "alpha": config.ALPHA,
                "n_boot": config.N_BOOT,
                "boot_seed": config.BOOT_SEED,
                "ci_method": config.CI_METHOD,
                "wilcoxon_alternative": config.WILCOXON_ALTERNATIVE,
                "headline": config.HEADLINE,
                "primary_detector": config.PRIMARY_DETECTOR,
                "max_missing_frac": config.MAX_MISSING_FRAC,
            },
            "rejected_files": [{"file": f, "reason": r} for f, r in ds.rejected],
            "warnings": ds.warnings,
            "study_a": {
                "n_participants": len(a.participants),
                "skipped": a.skipped,
                "n_labels_total": sum(sum(pa.n_labels.values()) for pa in a.participants),
                "detectors": {d: {m: v for m, v in x.items() if m != "per_participant"} for d, x in a.detectors.items()},
                "kshot": [{k: v for k, v in p.items() if k != "per_participant"} for p in a.kshot],
                "confusion": a.confusion,
                "durations": {k: dstats(v) for k, v in dur.items() if k != "spontaneous_minutes"},
                "spontaneous_minutes": dur["spontaneous_minutes"],
                "tests": [t.to_dict() for t in a.tests],
                "ftpm_ratio": a.ftpm_ratio,
                "self_agreement_mean_kappa": (sum(x.kappa for x in agreements) / len(agreements)) if agreements else None,
                "labelling_minutes_total_upper_bound": sum(pa.labelling_span_min for pa in a.participants if math.isfinite(pa.labelling_span_min)),
                "participants": parts,
            },
            "study_b": study_b,
            "headline": None,  # filled from site.json's rule below
        }
    )


def print_summary(summary: dict[str, Any]) -> None:
    sa = summary["study_a"]
    tag = "  [SYNTHETIC DATA: not study results]" if summary["synthetic"] else ""
    print(f"\nMorsEye analysis{tag}")
    print(f"Study A: {sa['n_participants']} participants, {sa['n_labels_total']} labelled closures, CI: {summary['config']['ci_method']}")

    def ci(c: dict[str, Any] | None, d: int = 2) -> str:
        if not c or c.get("mean") is None:
            return "n/a"
        return f"{c['mean']:.{d}f} [{c['lo']:.{d}f}, {c['hi']:.{d}f}]"

    rows = [("Detector", "F1", "Precision", "Recall", "FT/min", "FT/min v1")]
    for d, m in sa["detectors"].items():
        rows.append((f"{d} {config.DETECTOR_LABELS[d]}", ci(m["f1"]), ci(m["precision"]), ci(m["recall"]), ci(m["ftpm"], 1), ci(m["ftpm_no_reject"], 1)))
    widths = [max(len(r[i]) for r in rows) for i in range(len(rows[0]))]
    for r in rows:
        print("  " + "  ".join(c.ljust(w) for c, w in zip(r, widths)))
    print("  k-shot F1: " + "; ".join(f"{p['detector']} k={p['k']}: {ci(p['f1'])}" for p in sa["kshot"]))
    for t in sa["tests"]:
        p = t["p_holm"] if t["p_holm"] is not None else t["p"]
        print(f"  {t['hypothesis']:<3} {t['a']} vs {t['b']}: diff {ci(t['diff'], 3)}, p_holm={p if p is None else round(p, 4)} (n={t['n']})")
    if summary.get("study_b"):
        sb = summary["study_b"]
        print(f"Study B: {sb['n_participants']} participants")
        for blk, m in sb["blocks"].items():
            print(f"  {blk}: CPM {ci(m['cpm'], 1)}, uncorrected ER {ci(m['uncorrected'], 3)}")
    if summary["rejected_files"]:
        print("Refused files:")
        for r in summary["rejected_files"]:
            print(f"  {r['file']}: {r['reason']}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m analysis.run", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default="data/public", help="folder with session logs and label CSVs")
    ap.add_argument("--synthetic", action="store_true", help="generate synthetic data into a temp folder and analyse it")
    ap.add_argument("--n", type=int, default=10, help="synthetic participants")
    ap.add_argument("--seed", type=int, default=1, help="synthetic seed")
    ap.add_argument("--timing", help="JSON file with segmenter timing (default: the app's defaults)")
    ap.add_argument("--out", default=str(ROOT / "analysis" / "out"))
    ap.add_argument("--site", default=str(ROOT / "public" / "results"))
    ap.add_argument("--paper", default=str(ROOT / "paper"))
    ap.add_argument("--no-figures", action="store_true")
    ap.add_argument("--keep-synthetic", action="store_true", help="do not delete the synthetic data folder")
    args = ap.parse_args(argv)

    timing = DEFAULT_TIMING
    if args.timing:
        timing = Timing.from_dict(json.loads(Path(args.timing).read_text(encoding="utf-8")))
        if not valid_timing(timing):
            print(f"invalid timing in {args.timing}", file=sys.stderr)
            return 2

    tmp: str | None = None
    if args.synthetic:
        from .synth import generate

        tmp = tempfile.mkdtemp(prefix="morseye-synth-")
        generate(tmp, n=args.n, seed=args.seed)
        data_dir = tmp
        print(f"Synthetic data: {tmp}")
    else:
        data_dir = args.data

    try:
        ds = load_dataset(data_dir)
        if not ds.study_a and not ds.study_b:
            print(f"No usable session logs in {data_dir}. Study A data have not been collected yet.")
            print("Use --synthetic to exercise the pipeline on synthetic data.")
            for f, r in ds.rejected:
                print(f"  refused {f}: {r}")
            return 2
        synthetic = args.synthetic or ds.synthetic
        if synthetic and not args.synthetic:
            print("WARNING: the data folder contains synthetic logs; every output is marked synthetic.")

        a = analyze_study_a(ds.study_a, timing)
        b = analyze_study_b(ds.study_b)

        summary = build_summary(ds, a, b, synthetic, "<synthetic>" if args.synthetic else str(data_dir), timing)
        site_path = export(a, b, Path(args.site), synthetic, timing)
        site = json.loads(site_path.read_text(encoding="utf-8"))
        summary["headline"] = site["headline"]

        out = Path(args.out)
        out.mkdir(parents=True, exist_ok=True)
        (out / "summary.json").write_text(json.dumps(summary, indent=2, allow_nan=False) + "\n", encoding="utf-8")

        from .tables import write_all

        write_all(a, b, summary, Path(args.paper) / "tables", synthetic)
        if not args.no_figures:
            from .figures import make_all

            names = make_all(a, b, timing, Path(args.paper) / "figures", Path(args.site) / "figures", synthetic)
            print(f"Figures: {', '.join(names)}")
        print_summary(summary)
        print(f"\nWrote {out / 'summary.json'}, {site_path}, {Path(args.paper) / 'tables'}")
        return 0
    finally:
        if tmp and not args.keep_synthetic:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
