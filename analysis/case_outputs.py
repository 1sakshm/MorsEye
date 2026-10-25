"""Outputs of analysis/case_study.py: public/results/case.json, paper/tables/case_*.tex and figures C1-C3.

Every number in these files comes from analysis/out/results.json. Session 1 numbers are exploratory (one
session); Eyeblink8 numbers are a secondary, not blind analysis.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

from .figures import COL, WIDE, C, Writer, _style, f1_pipeline  # noqa: E402

TYPES = ("short", "long")
# Distinct line colours per detector for the C figures.
DC = {"D1": C["muted"], "D2": C["trace"], "D3": C["band-dot"], "D4": C["signal"]}


# ---------------------------------------------------------------------------------------------
# Site
# ---------------------------------------------------------------------------------------------


def write_site(res: dict[str, Any], site_dir: Path) -> Path:
    """public/results/case.json: the `CaseResults` shape in src/site/case.ts."""
    pub, ses = res["public"], res["session"]
    out: dict[str, Any] = {"generated_at": res["generated_at"], "timing": res["timing"], "public": None, "session": None}
    if pub:
        out["public"] = {
            "dataset": pub["dataset"],
            "n_videos": pub["n_videos"],
            "n_people": pub["n_people"],
            "minutes": pub["minutes"],
            "n_blinks": pub["n_blinks"],
            "annotated_blink_ms": pub["annotated_blink_ms"],
            "annotated_frac_below_reject": pub["annotated_frac_below_reject"],
            "detectors": {
                d: {k: x.get(k) for k in ("label", "ftpm_no_reject", "ftpm", "ratio_of_means", "meets_halving_criterion", "wilcoxon_p", "blink_recall", "frac_closed_below_reject", "halving_reject_ms", "annotated_frac_below_halving")}
                for d, x in pub["detectors"].items()
            },
            "videos": pub["videos"],
        }
    if ses:
        out["session"] = {
            "fps": ses["fps"],
            "fps_by_block": ses["fps_by_block"],
            "face_frac": ses["face_frac"],
            "responses": ses["responses"],
            "reading": {d: {k: x[k] for k in ("n_closures", "ftpm_no_reject", "ftpm")} for d, x in ses["reading"].items()},
            "cue_response": {d: {k: x[k] for k in ("n", "correct", "accuracy", "confusion")} for d, x in ses["cue_response"].items()},
            "duration_pct": ses["duration_pct"],
            "dot_sweep": {d: {k: x[k] for k in ("n", "best_accuracy", "best_from_ms", "best_to_ms", "accuracy_at_default")} for d, x in ses["dot_sweep"].items()},
        }
    site_dir.mkdir(parents=True, exist_ok=True)
    p = site_dir / "case.json"
    p.write_text(json.dumps(out, indent=1) + "\n", encoding="utf-8")
    return p


# ---------------------------------------------------------------------------------------------
# LaTeX
# ---------------------------------------------------------------------------------------------


def _f(x: Any, d: int = 1) -> str:
    return f"{x:.{d}f}" if isinstance(x, (int, float)) and math.isfinite(x) else "--"


def _ci(c: dict[str, Any] | None, d: int = 1) -> str:
    if not c or c.get("mean") is None:
        return "--"
    return f"{c['mean']:.{d}f} [{c['lo']:.{d}f}, {c['hi']:.{d}f}]"


def _pct(x: float, d: int = 0) -> str:
    return _f(100 * x, d) + r"\%" if isinstance(x, (int, float)) else "--"


def t_public(pub: dict[str, Any]) -> str:
    rows = []
    for v in pub["videos"]:
        rows.append(
            " & ".join(
                [
                    str(v["video"]),
                    "yes" if str(v["glasses"]).lower() in ("1", "yes", "true") else "no",
                    _f(v["minutes"], 1),
                    _f(v["fps"], 1),
                    str(v["n_blinks"]),
                    f"{_f(v['D1_ftpm_no_reject'])} $\\to$ {_f(v['D1_ftpm'])}",
                    f"{_f(v['D3_ftpm_no_reject'])} $\\to$ {_f(v['D3_ftpm'])}",
                ]
            )
            + r" \\"
        )
    d1, d3 = pub["detectors"]["D1"], pub["detectors"]["D3"]
    rows.append(r"\midrule")
    rows.append(
        rf"\multicolumn{{5}}{{l}}{{Mean [95\% CI] over videos}} & {_ci(d1['ftpm_no_reject'])} $\to$ {_ci(d1['ftpm'])} & {_ci(d3['ftpm_no_reject'])} $\to$ {_ci(d3['ftpm'])} \\"
    )
    head = r"Video & Glasses & Min & fps & Blinks & D1 FT/min & D3 FT/min \\"
    return "\\begin{tabular}{lllrrll}\n\\toprule\n" + head + "\n\\midrule\n" + "\n".join(rows) + "\n\\bottomrule\n\\end{tabular}\n"


def t_responses(ses: dict[str, Any]) -> str:
    cols = ("short", "long", "wink-L", "wink-R", "none")
    rows = []
    for cue in ("short", "long", "wink-L", "wink-R"):
        r = ses["responses"]["table"].get(cue, {})
        rows.append(" & ".join([cue, *[str(r.get(c, 0)) for c in cols]]) + r" \\")
    head = r"Cue & \multicolumn{5}{c}{Response checked by the author} \\" + "\n" + r" & " + " & ".join(cols) + r" \\"
    return "\\begin{tabular}{lrrrrr}\n\\toprule\n" + head + "\n\\midrule\n" + "\n".join(rows) + "\n\\bottomrule\n\\end{tabular}\n"


def t_session(ses: dict[str, Any], labels: dict[str, str]) -> str:
    rows = []
    for d in ("D1", "D2", "D3", "D4", "D5"):
        r, c = ses["reading"][d], ses["cue_response"][d]
        dp = ses["duration_pct"][d]
        med = lambda t: _f(dp[t]["median"], 0) if dp.get(t) else "--"  # noqa: E731
        rows.append(
            " & ".join(
                [
                    d,
                    labels[d],
                    f"{_f(r['ftpm_no_reject'])} $\\to$ {_f(r['ftpm'])}",
                    f"{c['correct']}/{c['n']}",
                    med("short") if d != "D5" else "--",
                    med("long") if d != "D5" else "--",
                ]
            )
            + r" \\"
        )
    head = r"ID & Detector & Reading FT/min & Correct band & Short (ms) & Long (ms) \\"
    return "\\begin{tabular}{llllrr}\n\\toprule\n" + head + "\n\\midrule\n" + "\n".join(rows) + "\n\\bottomrule\n\\end{tabular}\n"


def t_calibration(ses: dict[str, Any]) -> str:
    names = {"earMean": "EAR (mean of eyes)", "blendMax": "Blink score (max of eyes)", "blendL": "Blink score, left", "blendR": "Blink score, right"}
    fixed = {"earMean": "0.21", "blendMax": "0.5", "blendL": "0.5", "blendR": "0.5"}
    rows = []
    for k, v in ses["calibration"]["fits"].items():
        rows.append(" & ".join([names.get(k, k), _f(v["open_median"], 3), _f(v["closed_median"], 3), _f(v["thr"], 3), _f(v["h"], 3), fixed.get(k, "--")]) + r" \\")
    head = r"Signal & Open median & Closed median & Calibrated & Hysteresis & Fixed \\"
    return "\\begin{tabular}{lrrrrr}\n\\toprule\n" + head + "\n\\midrule\n" + "\n".join(rows) + "\n\\bottomrule\n\\end{tabular}\n"


def t_bands(pub: dict[str, Any]) -> str:
    bands = ("reject", "dot", "dash", "hold", "backspace")
    rows = []
    for d, x in pub["detectors"].items():
        rows.append(" & ".join([d, *[f"{x['bands'][b]} ({_f(x['bands_per_min'][b], 1)})" for b in bands]]) + r" \\")
    head = r"Detector & " + " & ".join(bands) + r" \\"
    return "\\begin{tabular}{lrrrrr}\n\\toprule\n" + head + "\n\\midrule\n" + "\n".join(rows) + "\n\\bottomrule\n\\end{tabular}\n"


def numbers(res: dict[str, Any]) -> str:
    """\\CS{key} prints a number from analysis/out/results.json."""
    out = [
        "% Generated by analysis/case_outputs.py from analysis/out/results.json. Do not edit.",
        "\\makeatletter",
        "\\newcommand{\\CS}[1]{\\@ifundefined{CS@#1}{\\textbf{??#1??}}{\\csname CS@#1\\endcsname}}",
    ]

    def put(k: str, v: str) -> None:
        out.append(f"\\expandafter\\def\\csname CS@{k}\\endcsname{{{v}}}")

    t = res["timing"]
    for k in ("rejectMs", "dotMaxMs", "dashMaxMs", "cmdMs"):
        put(k, _f(t[k], 0))
    pub = res["public"]
    if pub:
        put("pubVideos", str(pub["n_videos"]))
        put("pubPeople", str(pub["n_people"]))
        put("pubMinutes", _f(pub["minutes"], 0))
        put("pubBlinks", str(pub["n_blinks"]))
        put("pubFps", _f(pub["fps_median"], 0))
        a = pub["annotated_blink_ms"]
        for k in ("p5", "median", "p95"):
            put(f"pubBlink-{k}", _f(a[k], 0))
        put("pubBelowReject", _pct(pub["annotated_frac_below_reject"]))
        for d, x in pub["detectors"].items():
            put(f"pub-{d}-before", _ci(x["ftpm_no_reject"]))
            put(f"pub-{d}-after", _ci(x["ftpm"]))
            put(f"pub-{d}-before-mean", _f(x["ftpm_no_reject"]["mean"]))
            put(f"pub-{d}-after-mean", _f(x["ftpm"]["mean"]))
            put(f"pub-{d}-ratio", _f(x["ratio_of_means"], 2))
            put(f"pub-{d}-p", _f(x["wilcoxon_p"], 3))
            put(f"pub-{d}-recall", _pct(x["blink_recall"]))
            put(f"pub-{d}-closedMedian", _f(x["detected_closed_ms"]["median"], 0))
            put(f"pub-{d}-belowReject", _pct(x["frac_closed_below_reject"]))
            put(f"pub-{d}-meets", "yes" if x["meets_halving_criterion"] else "no")
            put(f"pub-{d}-halving", _f(x["halving_reject_ms"], 0) if x.get("halving_reject_ms") is not None else "--")
            if x.get("annotated_frac_below_halving") is not None:
                put(f"pub-{d}-belowHalving", _pct(x["annotated_frac_below_halving"]))
            if x.get("measured_minus_annotated_ms"):
                m = x["measured_minus_annotated_ms"]
                put(f"pub-{d}-diffMedian", _f(m["median"], 0))
                put(f"pub-{d}-diffMedianAbs", _f(abs(m["median"]), 0))
                put(f"pub-{d}-diffP25", _f(m["p25"], 0))
                put(f"pub-{d}-diffP75", _f(m["p75"], 0))
                put(f"pub-{d}-matchedAnnBelow", _pct(x["matched_annotated_frac_below_reject"]))
                put(f"pub-{d}-matchedMeasBelow", _pct(x["matched_measured_frac_below_reject"]))
            for b, v in x["bands_per_min"].items():
                put(f"pub-{d}-{b}-perMin", _f(v, 1))
            for b, v in x["bands"].items():
                put(f"pub-{d}-{b}-n", str(v))
    ses = res["session"]
    if ses:
        put("sFps", _f(ses["fps"], 1))
        for b, v in ses["fps_by_block"].items():
            put(f"sFps-{b}", _f(v, 1))
        put("sFace", _pct(ses["face_frac"], 1))
        put("sMissing", _pct(ses["missing_frac"], 2))
        put("sMinutes", _f(ses["minutes"], 1))
        put("sDistance", str(ses["setup"].get("distance_cm", "")))
        put("sCamera", str(ses["setup"].get("camera_model", "")))
        put("sCues", str(ses["responses"]["n_cues"]))
        put("sMatch", str(ses["responses"]["n_match"]))
        put("sCalib", str(ses["calibration"]["n_closures"]))
        for k, v in ses["calibration"]["fits"].items():
            for kk in ("thr", "open_median", "closed_median", "h"):
                put(f"sCal-{k}-{kk}", _f(v[kk], 3))
        for d, x in ses["dot_sweep"].items():
            put(f"s-{d}-dotN", str(x["n"]))
            put(f"s-{d}-dotBest", _pct(x["best_accuracy"]))
            put(f"s-{d}-dotBestFrom", _f(x["best_from_ms"], 0))
            put(f"s-{d}-dotBestTo", _f(x["best_to_ms"], 0))
            put(f"s-{d}-dotDefault", _pct(x["accuracy_at_default"]))
        rs = ses["reading_sweep"]
        for d, ys in rs["ftpm"].items():
            for r in (100, 300):
                put(f"s-{d}-reading-at{r}", _f(ys[rs["reject_ms"].index(r)], 1))
        wk = ses["winks"]
        put("sWinks", str(wk["n"]))
        put("sWinksOtherAbove", str(wk["other_eye_above_0_5"]))
        put("sWinksOtherAtPeak", str(wk["other_eye_above_0_3_at_peak"]))
        put("sWinkPeak", _f(wk["winking_eye_peak_median"], 2))
        put("sWinkOtherPeak", _f(wk["other_eye_at_peak_median"], 2))
        n_bl = sum(sum(v.values()) for v in ses["cue_response"]["D4"]["confusion"].values())
        put("sBothEyeCues", str(n_bl))
        for d in ("D1", "D2", "D3", "D4"):
            cf = ses["cue_response"][d]["confusion"]
            put(f"s-{d}-short-n", str(sum(cf["short"].values())))
            put(f"s-{d}-long-n", str(sum(cf["long"].values())))
        for d, r in ses["reading"].items():
            put(f"s-{d}-reading-before", _f(r["ftpm_no_reject"]))
            put(f"s-{d}-reading-after", _f(r["ftpm"]))
            put(f"s-{d}-reading-n", str(r["n_closures"]))
            put(f"s-{d}-reading-rejected", str(r["bands"]["reject"]))
            if r["closed_ms"]:
                put(f"s-{d}-reading-median", _f(r["closed_ms"]["median"], 0))
                put(f"s-{d}-reading-p95", _f(r["closed_ms"]["p95"], 0))
        for d, c in ses["cue_response"].items():
            put(f"s-{d}-correct", f"{c['correct']}/{c['n']}")
            for t in ("short", "long"):
                if t in c["confusion"]:
                    for b, n in c["confusion"][t].items():
                        put(f"s-{d}-{t}-{b}", str(n))
        for d, x in ses["duration_pct"].items():
            for t, p in x.items():
                if p:
                    for k in ("p5", "median", "p95"):
                        put(f"s-{d}-{t}-{k}", _f(p[k], 0))
    out.append("\\makeatother")
    return "\n".join(out) + "\n"


def write_tables(res: dict[str, Any], out_dir: Path) -> list[Path]:
    from . import config

    out_dir.mkdir(parents=True, exist_ok=True)
    files = {"case_numbers.tex": numbers(res)}
    if res["public"]:
        files["case_public.tex"] = t_public(res["public"])
        files["case_bands.tex"] = t_bands(res["public"])
    if res["session"]:
        files["case_responses.tex"] = t_responses(res["session"])
        files["case_session.tex"] = t_session(res["session"], config.DETECTOR_LABELS)
        files["case_calibration.tex"] = t_calibration(res["session"])
    paths = []
    for name, text in files.items():
        p = out_dir / name
        p.write_text(text, encoding="utf-8")
        paths.append(p)
    return paths


# ---------------------------------------------------------------------------------------------
# Figures
# ---------------------------------------------------------------------------------------------


def c1_public(w: Writer, pub: dict[str, Any]) -> None:
    fig, axes = plt.subplots(1, 2, figsize=(COL, 2.1), sharey=True)
    for ax, d in zip(axes, ("D1", "D3")):
        x = pub["detectors"][d]
        for v in pub["videos"]:
            ax.plot([0, 1], [v[f"{d}_ftpm_no_reject"], v[f"{d}_ftpm"]], color=C["muted"], alpha=0.45, lw=0.8, marker="o", ms=2.5)
        for i, key in enumerate(("ftpm_no_reject", "ftpm")):
            c = x[key]
            ax.errorbar([i + (0.08 if i else -0.08)], [c["mean"]], yerr=[[c["mean"] - c["lo"]], [c["hi"] - c["mean"]]], fmt="s", color=C["signal"], ms=4, capsize=2, lw=1.2)
        ax.set_xticks([0, 1], ["no reject", f"reject <{w_reject(pub)} ms"])
        ax.set_xlim(-0.35, 1.35)
        ax.set_title(f"{d} ({x['label']})", fontsize=7)
    axes[0].set_ylabel("False triggers per minute")
    fig.tight_layout()
    w.save(fig, "C1_public_false_triggers")


def w_reject(pub: dict[str, Any]) -> str:
    return f"{pub['reject_ms']:g}"


def c2_durations(w: Writer, res: dict[str, Any]) -> None:
    t = res["timing"]
    pub, ses = res["public"], res["session"]
    fig, ax = plt.subplots(figsize=(WIDE * 0.62, 2.6))
    bins = np.arange(0, 2001, 50)
    if pub:
        blink = np.concatenate([np.asarray(v, float) for v in _public_blinks(res)])
        ax.hist(blink, bins=bins, density=True, histtype="stepfilled", alpha=0.35, color=C["band-reject"], label=f"Eyeblink8 natural blinks (annotated, n = {blink.size})")
    if ses:
        for typ, col in (("short", C["band-dot"]), ("long", C["band-dash"])):
            v = np.asarray(ses["durations"]["D4"][typ], float)
            if v.size:
                ax.hist(v, bins=bins, density=True, histtype="step", lw=1.4, color=col, label=f"Session 1 {typ} responses (D4-measured, n = {v.size})")
    for k, name in (("rejectMs", "reject"), ("dotMaxMs", "dot | dash"), ("dashMaxMs", "dash | hold")):
        ax.axvline(t[k], color=C["ink"], lw=0.8, ls="--")
        ax.text(t[k] + 15, ax.get_ylim()[1] * 0.92, name, fontsize=6.5, color=C["ink"])
    ax.set_xlim(0, 2000)
    ax.set_xlabel("Closure duration (ms)")
    ax.set_ylabel("Density")
    ax.legend(loc="lower left", frameon=False, bbox_to_anchor=(0.0, 1.02), ncol=1)
    fig.tight_layout()
    w.save(fig, "C2_durations")


def _public_blinks(res: dict[str, Any]) -> list[list[float]]:
    return res["public"]["blink_ms_by_video"]


def c3_fps(w: Writer, ses: dict[str, Any]) -> None:
    fig, ax = plt.subplots(figsize=(COL, 1.6))
    tr = np.asarray(ses["fps_trace"], float)
    shade = {"calibration": C["tape"], "spontaneous": "#ffffff", "deliberate": C["tape"], "mixed": "#ffffff"}
    for name, (a, b) in ses["blocks"].items():
        ax.axvspan(a / 60000, b / 60000, color=shade.get(name, "#ffffff"), zorder=0)
        ax.text((a + b) / 2 / 60000, 2, name, ha="center", fontsize=6, color=C["muted"])
    if tr.size:
        ax.plot(tr[:, 0] / 60000, tr[:, 1], color=C["trace"], lw=1.2)
    ax.axhline(12, color=C["signal"], lw=0.8, ls="--")
    ax.set_ylim(0, 20)
    ax.set_xlabel("Minutes into the session")
    ax.set_ylabel("Measured fps")
    fig.tight_layout()
    w.save(fig, "C3_session_fps")


def c4_reject_sweep(w: Writer, res: dict[str, Any]) -> None:
    pub, ses = res["public"], res["session"]
    fig, axes = plt.subplots(1, 2, figsize=(WIDE, 2.1))
    ax = axes[0]
    for d, col in (("D1", DC["D1"]), ("D3", DC["D3"])):
        sw = pub["detectors"][d]["sweep"]
        ax.plot(sw["reject_ms"], sw["ftpm"], color=col, lw=1.6, label=f"{d} ({pub['detectors'][d]['label']})")
        ax.axhline(0.5 * sw["ftpm"][0], color=col, lw=0.6, ls=":")
    ax.set_title(f"Eyeblink8: {pub['n_videos']} videos, mean over videos")
    ax2 = axes[1]
    rs = ses["reading_sweep"]
    for d, col in DC.items():
        ax2.plot(rs["reject_ms"], rs["ftpm"][d], color=col, lw=1.4, label=d)
    ax2.set_title("Session 1: reading block, no cues")
    for a in axes:
        a.axvline(res["timing"]["rejectMs"], color=C["ink"], lw=0.8, ls="--")
        a.set_xlabel("Reject window (ms)")
        a.set_xlim(0, 600)
        a.set_ylim(bottom=0)
        a.legend(frameon=False, loc="upper right")
    axes[0].set_ylabel("False triggers per minute")
    fig.tight_layout()
    w.save(fig, "C4_reject_sweep")


def c5_measured(w: Writer, pub: dict[str, Any], reject: float) -> None:
    fig, axes = plt.subplots(1, 2, figsize=(WIDE * 0.75, 2.5), sharex=True, sharey=True)
    for ax, d in zip(axes, ("D1", "D3")):
        p = np.asarray(pub["detectors"][d]["pairs"], float)
        ax.scatter(p[:, 0], p[:, 1], s=5, color=C["trace"], alpha=0.45, lw=0)
        ax.plot([0, 1000], [0, 1000], color=C["ink"], lw=0.8)
        ax.axhline(reject, color=C["signal"], lw=0.8, ls="--")
        ax.set_title(f"{d} ({pub['detectors'][d]['label']}), n = {len(p)}")
        ax.set_xlabel("Annotated blink (ms)")
        ax.set_xlim(0, 1000)
        ax.set_ylim(0, 1000)
        ax.set_aspect("equal")
    axes[0].set_ylabel("Measured closure (ms)")
    fig.tight_layout()
    w.save(fig, "C5_measured_vs_annotated")


def c6_trace(w: Writer, ses: dict[str, Any], timing: dict[str, Any]) -> None:
    tr = ses["trace"]
    t = np.asarray(tr["t"], float) / 1000
    face = np.asarray(tr["face"], bool)
    ear = np.where(face, tr["earMean"], np.nan)
    bl = np.where(face, tr["blendMax"], np.nan)
    fig, axes = plt.subplots(2, 1, figsize=(WIDE, 3.0), sharex=True)
    band_col = {"reject": C["band-reject"], "dot": C["band-dot"], "dash": C["band-dash"], "hold": C["band-hold"], "backspace": C["band-delete"]}
    for ax, y, (fd, cd), name in ((axes[0], ear, ("D1", "D2"), "EAR"), (axes[1], bl, ("D3", "D4"), "Blink score")):
        ax.plot(t, y, color=C["trace"], lw=1.1)
        ax.axhline(tr["thr"][fd], color=C["muted"], lw=0.8, ls=":", label=f"{fd} fixed {tr['thr'][fd]:.2f}")
        if tr["thr"][cd] is not None:
            ax.axhline(tr["thr"][cd], color=C["signal"], lw=0.8, ls="--", label=f"{cd} calibrated {tr['thr'][cd]:.2f}")
        ax.set_ylabel(name)
        ax.legend(frameon=False, loc="center left", bbox_to_anchor=(1.0, 0.5), fontsize=6.5)
        for c in tr["cues"]:
            ax.axvline(c["t"] / 1000, color=C["ink"], lw=0.6, alpha=0.5)
    for a, b, bnd in tr["closures"]["D4"]:
        axes[1].axvspan(a / 1000, b / 1000, color=band_col.get(bnd, C["muted"]), alpha=0.25, lw=0)
    for c in tr["cues"]:
        axes[0].text(c["t"] / 1000 + 0.08, axes[0].get_ylim()[1] * 0.97, f"{c['cue'].lower()}", fontsize=6.5, va="top", color=C["ink"])
    axes[1].set_xlabel("Seconds (start of the cued block)")
    axes[0].set_xlim(0, t.max())
    fig.tight_layout()
    w.save(fig, "C6_trace")


def c7_dot_sweep(w: Writer, ses: dict[str, Any], timing: dict[str, Any]) -> None:
    fig, ax = plt.subplots(figsize=(COL, 1.9))
    for d, col in DC.items():
        x = ses["dot_sweep"][d]
        ax.plot(x["dot_max_ms"], np.asarray(x["accuracy"]) * 100, color=col, lw=1.3, label=f"{d} (n = {x['n']})")
    ax.axvline(timing["dotMaxMs"], color=C["ink"], lw=0.8, ls="--")
    ax.set_xlabel("Dot | dash boundary (ms)")
    ax.set_ylabel("Short/long correct (%)")
    ax.set_ylim(0, 100)
    ax.legend(frameon=False, loc="lower right", fontsize=6.5)
    fig.tight_layout()
    w.save(fig, "C7_dot_sweep")


def write_figures(res: dict[str, Any], paper_dir: Path, site_dir: Path) -> list[str]:
    _style()
    w = Writer(paper_dir, site_dir, synthetic=False)
    f1_pipeline(w)  # a diagram, not data: drawn without the synthetic watermark
    if res["public"]:
        c1_public(w, res["public"])
    if res["public"] or res["session"]:
        c2_durations(w, res)
    if res["session"]:
        c3_fps(w, res["session"])
        c6_trace(w, res["session"], res["timing"])
        c7_dot_sweep(w, res["session"], res["timing"])
    if res["public"] and res["session"]:
        c4_reject_sweep(w, res)
    if res["public"]:
        c5_measured(w, res["public"], res["timing"]["rejectMs"])
    return w.written
