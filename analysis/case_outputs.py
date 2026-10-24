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

from .figures import COL, WIDE, C, Writer, _style  # noqa: E402

TYPES = ("short", "long")


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
                d: {k: x[k] for k in ("label", "ftpm_no_reject", "ftpm", "ratio_of_means", "meets_halving_criterion", "wilcoxon_p", "blink_recall", "frac_closed_below_reject")}
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
            "cue_response": {d: {k: x[k] for k in ("n", "correct", "accuracy")} for d, x in ses["cue_response"].items()},
            "duration_pct": ses["duration_pct"],
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
    ses = res["session"]
    if ses:
        put("sFps", _f(ses["fps"], 1))
        for b, v in ses["fps_by_block"].items():
            put(f"sFps-{b}", _f(v, 1))
        put("sFace", _pct(ses["face_frac"], 1))
        put("sMissing", _pct(ses["missing_frac"], 2))
        put("sMinutes", _f(ses["minutes"], 1))
        put("sCues", str(ses["responses"]["n_cues"]))
        put("sMatch", str(ses["responses"]["n_match"]))
        put("sCalib", str(ses["calibration"]["n_closures"]))
        for d, r in ses["reading"].items():
            put(f"s-{d}-reading-before", _f(r["ftpm_no_reject"]))
            put(f"s-{d}-reading-after", _f(r["ftpm"]))
            put(f"s-{d}-reading-n", str(r["n_closures"]))
            put(f"s-{d}-reading-rejected", str(r["bands"]["reject"]))
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
    if res["session"]:
        files["case_responses.tex"] = t_responses(res["session"])
        files["case_session.tex"] = t_session(res["session"], config.DETECTOR_LABELS)
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


def write_figures(res: dict[str, Any], paper_dir: Path, site_dir: Path) -> list[str]:
    _style()
    w = Writer(paper_dir, site_dir, synthetic=False)
    if res["public"]:
        c1_public(w, res["public"])
    if res["public"] or res["session"]:
        c2_durations(w, res)
    if res["session"]:
        c3_fps(w, res["session"])
    return w.written
