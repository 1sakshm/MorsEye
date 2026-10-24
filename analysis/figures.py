"""Paper and site figures F1-F8 (PRD §8.3). Matplotlib only; colours come from the site's design
tokens in src/styles/base.css (light theme), so figures and the web charts match.

Each figure is written as vector PDF (paper/figures/) and PNG (paper/figures/ and
public/results/figures/). Figures made from synthetic data carry a visible SYNTHETIC watermark.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Callable

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from matplotlib.figure import Figure  # noqa: E402
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch  # noqa: E402

from . import config  # noqa: E402
from .replay import FIXED_BLEND, FIXED_EAR, Timing  # noqa: E402
from .study import StudyA, StudyB  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
TOKENS_CSS = ROOT / "src" / "styles" / "base.css"

DEFAULT_TOKENS = {
    "paper": "#f3f5f2",
    "ink": "#13202b",
    "muted": "#5b6873",
    "tape": "#e4e9e3",
    "signal": "#d9480f",
    "trace": "#1c7c8c",
    "band-reject": "#7a858e",
    "band-dot": "#1f5fbf",
    "band-dash": "#b45309",
    "band-hold": "#5b6873",
    "band-delete": "#c62828",
}


def load_tokens(css: Path = TOKENS_CSS) -> dict[str, str]:
    """Hex colour tokens from the first :root block of the site stylesheet (the light theme)."""
    tokens = dict(DEFAULT_TOKENS)
    try:
        text = css.read_text(encoding="utf-8")
    except OSError:
        return tokens
    m = re.search(r":root\s*\{(.*?)\}", text, re.S)
    if m:
        for name, value in re.findall(r"--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;", m.group(1)):
            tokens[name] = value
    return tokens


C = load_tokens()
TYPE_COLOUR = {"spontaneous": C["band-reject"], "short": C["band-dot"], "long": C["band-dash"]}
DET_COLOUR = {"D1": C["muted"], "D2": C["trace"], "D3": C["band-reject"], "D4": C["signal"], "D5": C["band-dot"]}

COL = 3.33  # ACM single column width, inches
WIDE = 7.0


def _style() -> None:
    plt.rcParams.update(
        {
            "font.family": "sans-serif",
            "font.sans-serif": ["DejaVu Sans"],
            "font.size": 8,
            "axes.titlesize": 8.5,
            "axes.labelsize": 8,
            "xtick.labelsize": 7,
            "ytick.labelsize": 7,
            "legend.fontsize": 7,
            "axes.edgecolor": C["muted"],
            "axes.labelcolor": C["ink"],
            "text.color": C["ink"],
            "xtick.color": C["muted"],
            "ytick.color": C["muted"],
            "axes.spines.top": False,
            "axes.spines.right": False,
            "axes.grid": True,
            "grid.color": C["tape"],
            "grid.linewidth": 0.6,
            "figure.facecolor": "white",
            "axes.facecolor": "white",
            "savefig.facecolor": "white",
            "pdf.fonttype": 42,
        }
    )


def _watermark(fig: Figure) -> None:
    fig.text(
        0.5,
        0.5,
        "SYNTHETIC DATA\nnot study results",
        ha="center",
        va="center",
        rotation=18,
        fontsize=15,
        fontweight="bold",
        color=C["signal"],
        alpha=0.2,
        zorder=100,
    )


class Writer:
    def __init__(self, paper_dir: Path, site_dir: Path | None, synthetic: bool) -> None:
        self.paper_dir = paper_dir
        self.site_dir = site_dir
        self.synthetic = synthetic
        self.written: list[str] = []
        paper_dir.mkdir(parents=True, exist_ok=True)
        if site_dir:
            site_dir.mkdir(parents=True, exist_ok=True)

    def save(self, fig: Figure, name: str) -> None:
        if self.synthetic:
            _watermark(fig)
        fig.savefig(self.paper_dir / f"{name}.pdf", bbox_inches="tight")
        fig.savefig(self.paper_dir / f"{name}.png", dpi=220, bbox_inches="tight")
        if self.site_dir:
            fig.savefig(self.site_dir / f"{name}.png", dpi=180, bbox_inches="tight")
        plt.close(fig)
        self.written.append(name)


def _ci_err(ci) -> tuple[float, list[list[float]]]:
    m = ci.mean
    return m, [[max(0.0, m - ci.lo)], [max(0.0, ci.hi - m)]]


# ---------------------------------------------------------------------------------------------


def f1_pipeline(w: Writer) -> None:
    fig, ax = plt.subplots(figsize=(WIDE, 1.3))
    ax.set_axis_off()
    ax.set_xlim(0, 7)
    ax.set_ylim(-0.05, 1)
    steps = [
        ("Webcam", "~30 fps,\nframe timestamps"),
        ("Landmarks", "MediaPipe: 478\npoints, blendshapes"),
        ("Features", "EAR (6 pts/eye),\neyeBlink scores"),
        ("Detector", "threshold +\nhysteresis"),
        ("Segmenter", "duration →\nreject/dot/dash/cmd"),
        ("Decoder", "gaps → letters,\nwords, commands"),
        ("Output", "text,\nspeech"),
    ]
    for i, (title, sub) in enumerate(steps):
        x = 0.06 + i * 0.99
        edge = C["signal"] if title in ("Detector", "Segmenter") else C["ink"]
        ax.add_patch(FancyBboxPatch((x, 0.18), 0.88, 0.72, boxstyle="round,pad=0.02,rounding_size=0.06", fc="white", ec=edge, lw=1.1))
        ax.text(x + 0.44, 0.7, title, ha="center", va="center", fontsize=7, fontweight="bold")
        ax.text(x + 0.44, 0.4, sub, ha="center", va="center", fontsize=5.4, color=C["muted"], linespacing=1.25)
        if i < len(steps) - 1:
            ax.add_patch(FancyArrowPatch((x + 0.9, 0.54), (x + 0.99, 0.54), arrowstyle="-|>", mutation_scale=6, color=C["muted"], lw=0.8))
    ax.text(3.5, -0.02, "everything runs in the browser; no camera frame leaves the device", ha="center", va="bottom", fontsize=6, color=C["muted"], style="italic")
    w.save(fig, "F1_pipeline")


def f2_trace(w: Writer, a: StudyA, window_s: float = 24.0) -> None:
    pa = a.participants[0]
    s = pa.session
    blk = s.blocks.get("deliberate") or next(iter(s.blocks.values()))
    t0 = blk[0] + 2000
    t1 = t0 + window_s * 1000
    m = s.frames.select(t0, t1) & s.frames.face
    t = (s.frames.t[m] - t0) / 1000
    ear = (s.frames.earL[m] + s.frames.earR[m]) / 2
    bl = np.maximum(s.frames.blinkL[m], s.frames.blinkR[m])
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(WIDE, 2.7), sharex=True, layout="constrained")
    labs = [l for l in (s.labels or []) if t0 <= l.onset_ms < t1]
    shade = {**TYPE_COLOUR, "wink-L": C["band-hold"], "wink-R": C["band-hold"]}
    for ax in (ax1, ax2):
        for l in labs:
            x0, x1 = (l.onset_ms - t0) / 1000, (l.offset_ms - t0) / 1000
            if l.type in ("wink-L", "wink-R"):
                ax.axvspan(x0, x1, facecolor="none", edgecolor=C["band-hold"], hatch="////", lw=0, alpha=0.6)
            else:
                ax.axvspan(x0, x1, color=shade[l.type], alpha=0.18, lw=0)
    ax1.plot(t, ear, color=C["trace"], lw=0.9)
    ax1.axhline(FIXED_EAR.thr, color=C["muted"], ls="--", lw=0.8, label=f"fixed {FIXED_EAR.thr}")
    if pa.user.ear:
        ax1.axhline(pa.user.ear.thr, color=C["signal"], lw=0.9, label=f"calibrated {pa.user.ear.thr:.3f}")
    ax1.set_ylabel("mean EAR")
    ax2.plot(t, bl, color=C["trace"], lw=0.9)
    ax2.axhline(FIXED_BLEND.thr, color=C["muted"], ls="--", lw=0.8, label=f"fixed {FIXED_BLEND.thr}")
    if pa.user.blend:
        ax2.axhline(pa.user.blend.thr, color=C["signal"], lw=0.9, label=f"calibrated {pa.user.blend.thr:.3f}")
    ax2.set_ylabel("max eyeBlink")
    ax2.set_xlabel("time (s)")
    ax2.legend(loc="upper right", ncol=2, frameon=False)
    handles = [plt.Rectangle((0, 0), 1, 1, color=shade[k], alpha=0.35) for k in ("spontaneous", "short", "long")]
    handles.append(plt.Rectangle((0, 0), 1, 1, facecolor="none", edgecolor=C["band-hold"], hatch="////", lw=0))
    ax1.legend(handles + ax1.get_legend_handles_labels()[0], ["spontaneous", "short", "long", "wink"] + ax1.get_legend_handles_labels()[1], loc="lower left", ncol=6, frameon=False, bbox_to_anchor=(0, 1.0))
    ax1.set_title(f"{pa.p}, deliberate block (shaded: human labels)", loc="left", pad=16)
    w.save(fig, "F2_trace")


def f3_durations(w: Writer, a: StudyA, timing: Timing) -> None:
    ds = a.duration_set()
    fig, ax = plt.subplots(figsize=(COL, 2.2), layout="constrained")
    bins = np.arange(0, 2050, 40)
    for key, label in (("spontaneous", "spontaneous"), ("short", "deliberate short"), ("long", "deliberate long")):
        v = np.asarray(ds[key])
        if v.size:
            ax.hist(np.clip(v, 0, 2000), bins=bins, color=TYPE_COLOUR[key], alpha=0.55, label=f"{label} (n={v.size})")
    edges = [0, timing.rejectMs, timing.dotMaxMs, timing.dashMaxMs, timing.cmdMs]
    for x in edges[1:]:
        ax.axvline(x, color=C["ink"], lw=0.7, ls=":")
    for (x0, x1), name in zip(zip(edges[:-1], edges[1:]), ("reject", "dot", "dash", "hold")):
        ax.text((x0 + x1) / 2, 1.01, name, transform=ax.get_xaxis_transform(), ha="center", va="bottom", fontsize=6, color=C["muted"])
    ax.set_xlabel("labelled closure duration (ms)")
    ax.set_ylabel("closures")
    ax.set_xlim(0, 2000)
    ax.legend(frameon=False, loc="upper right")
    w.save(fig, "F3_durations")


def _dot_ci(ax, x: float, ci, pp: dict[str, float], colour: str, jitter_rng: np.random.Generator) -> None:
    vals = np.array([v for v in pp.values() if np.isfinite(v)])
    if vals.size:
        ax.scatter(x + jitter_rng.uniform(-0.12, 0.12, vals.size), vals, s=8, color=colour, alpha=0.3, lw=0)
    if np.isfinite(ci.mean):
        m, err = _ci_err(ci)
        ax.errorbar([x], [m], yerr=err, fmt="o", color=colour, ms=4.5, capsize=2.5, lw=1.2)


def f4_detectors(w: Writer, a: StudyA) -> None:
    fig, ax = plt.subplots(figsize=(COL, 2.2))
    rng = np.random.default_rng(0)
    ids = list(a.detectors)
    for i, d in enumerate(ids):
        _dot_ci(ax, i, a.detectors[d]["f1"], a.detectors[d]["per_participant"]["f1"], DET_COLOUR[d], rng)
    short = {"D1": "EAR\nfixed", "D2": "EAR\ncalibrated", "D3": "Blend.\nfixed", "D4": "Blend.\ncalibrated", "D5": "Wink\ncalibrated"}
    ax.set_xticks(range(len(ids)), [f"{d}\n{short[d]}" for d in ids], fontsize=6)
    ax.set_ylabel("event F1 (deliberate closures)")
    ax.set_ylim(0, 1.02)
    w.save(fig, "F4_detectors")


def f5_kshot(w: Writer, a: StudyA) -> None:
    fig, ax = plt.subplots(figsize=(COL, 2.1))
    for det, off in (("D2", -0.08), ("D4", 0.08)):
        pts = [p for p in a.kshot if p["detector"] == det]
        if not pts:
            continue
        ks = [p["k"] for p in pts]
        xs = np.arange(len(ks)) + off
        means = [p["f1"].mean for p in pts]
        err = np.array([[max(0, p["f1"].mean - p["f1"].lo) for p in pts], [max(0, p["f1"].hi - p["f1"].mean) for p in pts]])
        ax.errorbar(xs, means, yerr=err, fmt="-o", color=DET_COLOUR[det], ms=3.5, capsize=2, lw=1.1, label=f"{det}: {config.DETECTOR_LABELS[det]}")
        ax.set_xticks(np.arange(len(ks)), [("0\n(fixed)" if k == 0 else str(k)) for k in ks])
    ax.set_xlabel("calibration closures k")
    ax.set_ylabel("event F1")
    ax.legend(frameon=False, loc="lower right")
    w.save(fig, "F5_kshot")


def f6_false_triggers(w: Writer, a: StudyA) -> None:
    fig, ax = plt.subplots(figsize=(COL, 2.1))
    ids = list(a.detectors)
    x = np.arange(len(ids))
    for off, metric, colour, label in ((-0.13, "ftpm_no_reject", C["muted"], "no reject window (v1 app)"), (0.13, "ftpm", C["signal"], "with reject window")):
        cis = [a.detectors[d][metric] for d in ids]
        means = [c.mean for c in cis]
        err = np.array([[max(0, c.mean - c.lo) for c in cis], [max(0, c.hi - c.mean) for c in cis]])
        ax.errorbar(x + off, means, yerr=err, fmt="o", color=colour, ms=4, capsize=2, lw=1.1, label=label)
    ax.set_xticks(x, ids)
    ax.set_ylabel("false triggers / min while reading")
    ax.set_ylim(bottom=0)
    ax.legend(frameon=False, loc="upper right")
    w.save(fig, "F6_false_triggers")


def f7_text_entry(w: Writer, b: StudyB) -> None:
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(WIDE * 0.7, 2.1), layout="constrained")
    blocks = ["B1", "B2", "B3"]
    for p in b.participants:
        ax1.plot([1, 2, 3], [p.blocks.get(k, {}).get("cpm", np.nan) for k in blocks], color=C["trace"], alpha=0.25, lw=0.8)
        ax2.plot([1, 2, 3], [100 * p.blocks.get(k, {}).get("uncorrected", np.nan) for k in blocks], color=C["signal"], alpha=0.25, lw=0.8)
    for ax, metric, colour, scale, ylabel in ((ax1, "cpm", C["trace"], 1, "characters per minute"), (ax2, "uncorrected", C["signal"], 100, "uncorrected error rate (%)")):
        cis = [b.blocks[k][metric] for k in blocks]
        means = [c.mean * scale for c in cis]
        err = np.array([[max(0, (c.mean - c.lo) * scale) for c in cis], [max(0, (c.hi - c.mean) * scale) for c in cis]])
        ax.errorbar([1, 2, 3], means, yerr=err, fmt="-o", color=colour, ms=4, capsize=2.5, lw=1.4)
        ax.set_xticks([1, 2, 3], ["block 1", "block 2", "block 3"])
        ax.set_ylabel(ylabel)
        ax.set_ylim(bottom=0)
    w.save(fig, "F7_text_entry")


def f8_fps(w: Writer, a: StudyA) -> None:
    det = config.PRIMARY_DETECTOR
    fps = np.array([pa.session.measured_fps for pa in a.participants])
    err = np.array([pa.evals[det].dur_err_abs for pa in a.participants])
    fig, ax = plt.subplots(figsize=(COL, 2.1))
    ax.scatter(fps, err, s=14, color=C["trace"], zorder=3, label=f"participants ({det})")
    xs = np.linspace(max(5, np.nanmin(fps) - 3), np.nanmax(fps) + 3, 50)
    ax.plot(xs, 1000 / xs, color=C["muted"], ls="--", lw=0.9, label="one frame interval")
    ax.plot(xs, 500 / xs, color=C["muted"], ls=":", lw=0.9, label="half a frame")
    ax.set_xlabel("measured frame rate (fps)")
    ax.set_ylabel("mean |duration error| (ms)")
    ax.set_ylim(bottom=0)
    ax.legend(frameon=False, loc="upper right")
    w.save(fig, "F8_fps")


def make_all(a: StudyA | None, b: StudyB | None, timing: Timing, paper_dir: Path, site_dir: Path | None, synthetic: bool) -> list[str]:
    _style()
    w = Writer(paper_dir, site_dir, synthetic)
    f1_pipeline(w)
    jobs: list[Callable[[], None]] = []
    if a and a.participants:
        jobs += [
            lambda: f2_trace(w, a),
            lambda: f3_durations(w, a, timing),
            lambda: f4_detectors(w, a),
            lambda: f5_kshot(w, a),
            lambda: f6_false_triggers(w, a),
            lambda: f8_fps(w, a),
        ]
    if b and b.participants:
        jobs.append(lambda: f7_text_entry(w, b))
    for job in jobs:
        job()
    return w.written
