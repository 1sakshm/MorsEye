"""Study A (detection) and Study B (text entry) analyses: per-participant metrics, then summaries
and paired tests across participants (PRD §3.4-3.6)."""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import numpy as np

from . import config
from .calibration import Calibration, CalibrationData, calibration_data, fit_user, k_shot_indices, kshot_seed
from .load import DELIBERATE, Session
from .metrics import BANDS, DetectionEval, PhraseResult, evaluate, label_durations, score_phrase
from .replay import DETECTOR_IDS, Timing, UserThresholds, detect_fast
from .stats import CI, Agreement, PairedTest, apply_holm, bootstrap_ci, paired_test, self_agreement

# ---------------------------------------------------------------------------------------------
# Study A
# ---------------------------------------------------------------------------------------------


@dataclass
class KShot:
    f1: float
    ftpm: float
    poor_fit_frac: float
    n_draws: int
    k_eff: int


@dataclass
class ParticipantA:
    p: str
    session: Session
    calib: CalibrationData | None
    fits: dict[str, Calibration]
    user: UserThresholds
    evals: dict[str, DetectionEval]
    kshot: dict[tuple[str, int], KShot]
    durations: dict[str, list[float]]
    agreement: Agreement | None
    labelling_span_min: float
    n_labels: dict[str, int]


def _mode(det: str) -> str:
    return "wink" if det == "D5" else "both"


def _labelling_span(session: Session) -> float:
    """Minutes from the first to the last label's `labelled_at` (an upper bound: includes breaks)."""
    times = []
    for l in session.labels or []:
        try:
            times.append(datetime.fromisoformat(l.labelled_at.replace("Z", "+00:00")))
        except ValueError:
            continue
    if len(times) < 2:
        return float("nan")
    return (max(times) - min(times)).total_seconds() / 60.0


def analyze_participant_a(s: Session, timing: Timing, ks: tuple[int, ...] = config.KS, draws: int = config.DRAWS) -> ParticipantA | None:
    if not s.labels:
        return None
    labels = s.labels
    fa = s.frames.arrays()
    cd = calibration_data(s)
    if cd is not None and cd.n_closures > 0:
        user, fits = fit_user(cd)
    else:
        user, fits = UserThresholds(), {}

    def run(det: str, u: UserThresholds) -> DetectionEval:
        return evaluate(detect_fast(fa, det, u), labels, s.blocks, timing, _mode(det))

    evals = {d: run(d, user) for d in DETECTOR_IDS}

    kshot: dict[tuple[str, int], KShot] = {}
    for k in ks:
        if k == 0:
            for det, base in (("D2", "D1"), ("D4", "D3")):
                e = evals[base]
                kshot[(det, 0)] = KShot(e.f1, e.ftpm, 0.0, 1, 0)
            continue
        if cd is None or cd.n_closures == 0:
            continue
        f1s: dict[str, list[float]] = {"D2": [], "D4": []}
        fts: dict[str, list[float]] = {"D2": [], "D4": []}
        poor: dict[str, int] = {"D2": 0, "D4": 0}
        draws_idx = k_shot_indices(cd.n_closures, k, draws, kshot_seed(s.seed, k))
        for idx in draws_idx:
            u, f = fit_user(cd, idx)
            for det, sig in (("D2", "earMean"), ("D4", "blendMax")):
                e = run(det, u)
                f1s[det].append(e.f1)
                fts[det].append(e.ftpm)
                poor[det] += 0 if f[sig].ok else 1
        for det in ("D2", "D4"):
            kshot[(det, k)] = KShot(
                f1=float(np.nanmean(f1s[det])) if np.isfinite(f1s[det]).any() else float("nan"),
                ftpm=float(np.nanmean(fts[det])) if np.isfinite(fts[det]).any() else float("nan"),
                poor_fit_frac=poor[det] / len(draws_idx),
                n_draws=len(draws_idx),
                k_eff=min(k, cd.n_closures),
            )

    durations = {
        "spontaneous": label_durations(labels, s.blocks, ["spontaneous"], ["spontaneous"]),
        "short": label_durations(labels, s.blocks, ["deliberate", "mixed"], ["short"]),
        "long": label_durations(labels, s.blocks, ["deliberate", "mixed"], ["long"]),
    }
    n_labels = {t: sum(1 for l in labels if l.type == t) for t in ("spontaneous", "short", "long", "wink-L", "wink-R")}
    return ParticipantA(
        p=s.participant,
        session=s,
        calib=cd,
        fits=fits,
        user=user,
        evals=evals,
        kshot=kshot,
        durations=durations,
        agreement=self_agreement(labels, s.relabels) if s.relabels else None,
        labelling_span_min=_labelling_span(s),
        n_labels=n_labels,
    )


@dataclass
class StudyA:
    participants: list[ParticipantA]
    skipped: list[str]
    timing: Timing
    detectors: dict[str, dict[str, Any]] = field(default_factory=dict)
    kshot: list[dict[str, Any]] = field(default_factory=list)
    confusion: dict[str, dict[str, dict[str, int]]] = field(default_factory=dict)
    tests: list[PairedTest] = field(default_factory=list)
    ftpm_ratio: dict[str, Any] = field(default_factory=dict)

    def pp(self, det: str, metric: str) -> dict[str, float]:
        return {pa.p: getattr(pa.evals[det], metric) for pa in self.participants}

    def pp_kshot(self, det: str, k: int, metric: str = "f1") -> dict[str, float]:
        return {pa.p: getattr(pa.kshot[(det, k)], metric) for pa in self.participants if (det, k) in pa.kshot}

    def duration_set(self, pa: ParticipantA | None = None) -> dict[str, Any]:
        group = [pa] if pa else self.participants
        return {
            "spontaneous": [d for x in group for d in x.durations["spontaneous"]],
            "short": [d for x in group for d in x.durations["short"]],
            "long": [d for x in group for d in x.durations["long"]],
            "spontaneous_minutes": float(sum(x.session.block_minutes("spontaneous") for x in group if "spontaneous" in x.session.blocks)),
        }


METRICS = ("f1", "precision", "recall", "ftpm", "ftpm_no_reject", "dur_err_abs", "dur_err_signed", "short_long_accuracy", "deliberate_rejected")


def bootstrap_ratio_of_means(after: dict[str, float], before: dict[str, float]) -> dict[str, Any]:
    keys = sorted(k for k in after if k in before and math.isfinite(after[k]) and math.isfinite(before[k]))
    if not keys:
        return {"ratio": float("nan"), "lo": float("nan"), "hi": float("nan"), "n": 0}
    a = np.array([after[k] for k in keys])
    b = np.array([before[k] for k in keys])
    ratio = float(a.mean() / b.mean()) if b.mean() > 0 else float("nan")
    rng = np.random.default_rng(config.BOOT_SEED)
    idx = rng.integers(0, len(keys), size=(config.N_BOOT, len(keys)))
    with np.errstate(divide="ignore", invalid="ignore"):
        r = a[idx].mean(axis=1) / b[idx].mean(axis=1)
    r = r[np.isfinite(r)]
    lo, hi = (np.quantile(r, [0.025, 0.975]).tolist() if r.size else [float("nan")] * 2)
    return {"ratio": ratio, "lo": float(lo), "hi": float(hi), "n": len(keys)}


def analyze_study_a(sessions: list[Session], timing: Timing) -> StudyA:
    parts: list[ParticipantA] = []
    skipped: list[str] = []
    for s in sorted(sessions, key=lambda x: x.participant):
        pa = analyze_participant_a(s, timing)
        if pa is None:
            skipped.append(f"{s.participant}: no labels")
        else:
            parts.append(pa)
    st = StudyA(participants=parts, skipped=skipped, timing=timing)
    if not parts:
        return st

    for det in DETECTOR_IDS:
        st.detectors[det] = {m: bootstrap_ci(list(st.pp(det, m).values())) for m in METRICS}
        st.detectors[det]["per_participant"] = {m: st.pp(det, m) for m in METRICS}
        conf: dict[str, dict[str, int]] = {t: {b: 0 for b in (*BANDS, "missed")} for t in DELIBERATE}
        for pa in parts:
            for t, row in pa.evals[det].confusion.items():
                for b, n in row.items():
                    conf[t][b] += n
        st.confusion[det] = conf if det != "D5" else {}

    for det in ("D2", "D4"):
        for k in config.KS:
            f1 = st.pp_kshot(det, k, "f1")
            if not f1:
                continue
            ft = st.pp_kshot(det, k, "ftpm")
            poor = [pa.kshot[(det, k)].poor_fit_frac for pa in parts if (det, k) in pa.kshot]
            st.kshot.append(
                {
                    "detector": det,
                    "k": k,
                    "f1": bootstrap_ci(list(f1.values())),
                    "ftpm": bootstrap_ci(list(ft.values())),
                    "poor_fit_frac": float(np.mean(poor)) if poor else float("nan"),
                    "per_participant": f1,
                }
            )

    # Confirmatory tests (Holm within the family). [HUMAN] keep in line with docs/preregistration.md.
    f1 = lambda det: st.pp(det, "f1")  # noqa: E731
    tests: list[PairedTest] = []
    for k in (3, 5, 10):
        for det in ("D2", "D4"):
            if any((det, k) in pa.kshot for pa in parts):
                tests.append(paired_test("A", "H1", "f1", f"{det}@k={k}", st.pp_kshot(det, k), "D1", f1("D1")))
    tests.append(paired_test("A", "H2", "f1", "D3", f1("D3"), "D1", f1("D1"), note="non-inferiority: compare the CI of the difference with the margin set in the preregistration"))
    tests.append(paired_test("A", "H2", "f1", "D4", f1("D4"), "D2", f1("D2"), note="non-inferiority: compare the CI of the difference with the margin set in the preregistration"))
    before = st.pp("D1", "ftpm_no_reject")
    tests.append(paired_test("A", "H3", "ftpm", "D1 + reject window", st.pp("D1", "ftpm"), "D1, no reject window (v1 app)", before))
    hd, hk = config.HEADLINE["calibrated"], config.HEADLINE["k"]
    after = st.pp_kshot(hd, hk, "ftpm")
    if after:
        tests.append(paired_test("A", "H3", "ftpm", f"{hd}@k={hk} + reject window", after, "D1, no reject window (v1 app)", before))
    apply_holm(tests)
    explore = [
        paired_test("A-exploratory", "H4", "ftpm", "D5", st.pp("D5", "ftpm"), "D2", st.pp("D2", "ftpm")),
        paired_test("A-exploratory", "H4", "ftpm", "D5", st.pp("D5", "ftpm"), "D4", st.pp("D4", "ftpm")),
    ]
    apply_holm(explore)
    st.tests = tests + explore
    st.ftpm_ratio = {
        "D1_reject_vs_v1": bootstrap_ratio_of_means(st.pp("D1", "ftpm"), before),
        f"{hd}_k{hk}_vs_v1": bootstrap_ratio_of_means(after, before) if after else {},
    }
    return st


# ---------------------------------------------------------------------------------------------
# Study B
# ---------------------------------------------------------------------------------------------

TLX_KEYS = ("mental", "physical", "temporal", "performance", "effort", "frustration")


@dataclass
class ParticipantB:
    p: str
    phrases: list[PhraseResult]
    blocks: dict[str, dict[str, float]]  # B1..B3 -> metric -> value
    tlx: dict[str, float]  # block -> raw TLX (mean of the 6 subscales)


def analyze_participant_b(s: Session) -> ParticipantB:
    starts = {(p["block"], p["index"]): p for p in s.phrases if p.get("phase") == "start"}
    ends = {(p["block"], p["index"]): p for p in s.phrases if p.get("phase") == "end"}
    results: list[PhraseResult] = []
    for key in sorted(starts, key=lambda k: starts[k]["t_ms"]):
        st, en = starts[key], ends.get(key)
        if en is None:
            continue
        t0, t1 = float(st["t_ms"]), float(en["t_ms"])
        acts = [{**a["action"], "t_ms": a["t_ms"]} for a in s.actions if a.get("block") == key[0] and t0 <= a["t_ms"] <= t1]
        results.append(score_phrase(key[0], int(key[1]), str(st.get("target", en.get("target", ""))), str(en.get("typed", "")), acts))
    blocks: dict[str, dict[str, float]] = {}
    for b in ("B1", "B2", "B3"):
        rs = [r for r in results if r.block == b]
        if not rs:
            continue
        chars = sum(r.n_chars for r in rs)
        blocks[b] = {
            "cpm": _nanmean([r.cpm for r in rs]),
            "wpm": _nanmean([r.cpm for r in rs]) / 5,
            "uncorrected": _nanmean([r.errors.uncorrected for r in rs]),
            "corrected": _nanmean([r.errors.corrected for r in rs]),
            "total_er": _nanmean([r.errors.total_er for r in rs]),
            "closures_per_char": sum(r.closures for r in rs) / chars if chars else float("nan"),
            "n_phrases": float(len(rs)),
        }
    tlx = {}
    for t in s.tlx:
        vals = [float(t[k]) for k in TLX_KEYS if k in t]
        if len(vals) == len(TLX_KEYS):
            tlx[str(t["block"])] = float(np.mean(vals))
    return ParticipantB(p=s.participant, phrases=results, blocks=blocks, tlx=tlx)


def _nanmean(xs: list[float]) -> float:
    a = np.asarray(xs, dtype=float)
    return float(np.nanmean(a)) if np.isfinite(a).any() else float("nan")


@dataclass
class StudyB:
    participants: list[ParticipantB]
    blocks: dict[str, dict[str, CI]] = field(default_factory=dict)
    tlx: dict[str, CI] = field(default_factory=dict)
    tests: list[PairedTest] = field(default_factory=list)

    def pp(self, block: str, metric: str) -> dict[str, float]:
        return {x.p: x.blocks[block][metric] for x in self.participants if block in x.blocks}


def analyze_study_b(sessions: list[Session]) -> StudyB | None:
    parts = [analyze_participant_b(s) for s in sorted(sessions, key=lambda x: x.participant)]
    parts = [p for p in parts if p.blocks]
    if not parts:
        return None
    sb = StudyB(participants=parts)
    for b in ("B1", "B2", "B3"):
        sb.blocks[b] = {m: bootstrap_ci(list(sb.pp(b, m).values())) for m in ("cpm", "wpm", "uncorrected", "corrected", "total_er", "closures_per_char")}
        sb.tlx[b] = bootstrap_ci([x.tlx[b] for x in parts if b in x.tlx])
    sb.tests = [
        paired_test("B", "H5", "cpm", "B3", sb.pp("B3", "cpm"), "B1", sb.pp("B1", "cpm")),
        paired_test("B", "H5", "uncorrected", "B3", sb.pp("B3", "uncorrected"), "B1", sb.pp("B1", "uncorrected")),
    ]
    apply_holm(sb.tests)
    return sb
