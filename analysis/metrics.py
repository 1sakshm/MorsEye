"""Metrics (PRD §3.5, §3.6).

Detection: one-to-one event matching at IoU >= 0.3, precision / recall / F1 for deliberate closures,
false triggers per minute while reading, duration error, short/long confusion.

Text entry (Soukoreff & MacKenzie, 2003): MSD (Levenshtein) between the presented phrase P and the
transcribed text T, and the unified error rates over the input stream:
    C   = max(|P|, |T|) - MSD(P, T)      correct
    INF = MSD(P, T)                      incorrect, not fixed
    IF  = characters entered then erased incorrect (or correct) but fixed
    uncorrected ER = INF / (C + INF + IF),  corrected ER = IF / (C + INF + IF)
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Sequence

import numpy as np

from . import config
from .load import DELIBERATE, WINKS, Label
from .replay import BANDS, Closure, Timing, bands_array

# ---------------------------------------------------------------------------------------------
# Event matching
# ---------------------------------------------------------------------------------------------


def iou(a0: float, a1: float, b0: float, b1: float) -> float:
    inter = max(0.0, min(a1, b1) - max(a0, b0))
    union = (a1 - a0) + (b1 - b0) - inter
    return inter / union if union > 0 else 0.0


def match_events(
    det: Sequence[tuple[float, float]], lab: Sequence[tuple[float, float]], min_iou: float = config.IOU_MIN
) -> list[tuple[int, int, float]]:
    """Greedy one-to-one matching by descending IoU. Returns (detection index, label index, IoU).
    Ties are broken by detection index, then label index, so the result is deterministic."""
    if not det or not lab:
        return []
    d = np.asarray(det, dtype=float).reshape(-1, 2)
    g = np.asarray(lab, dtype=float).reshape(-1, 2)
    inter = np.clip(np.minimum(d[:, None, 1], g[None, :, 1]) - np.maximum(d[:, None, 0], g[None, :, 0]), 0, None)
    union = (d[:, None, 1] - d[:, None, 0]) + (g[None, :, 1] - g[None, :, 0]) - inter
    with np.errstate(invalid="ignore", divide="ignore"):
        m = np.where(union > 0, inter / union, 0.0)
    ii, jj = np.nonzero(m >= min_iou)
    if ii.size == 0:
        return []
    vals = m[ii, jj]
    order = np.lexsort((jj, ii, -vals))
    used_d: set[int] = set()
    used_g: set[int] = set()
    out: list[tuple[int, int, float]] = []
    for o in order.tolist():
        i, j = int(ii[o]), int(jj[o])
        if i in used_d or j in used_g:
            continue
        used_d.add(i)
        used_g.add(j)
        out.append((i, j, float(vals[o])))
    return out


def prf(tp: int, fp: int, fn: int) -> tuple[float, float, float]:
    p = tp / (tp + fp) if tp + fp else float("nan")
    r = tp / (tp + fn) if tp + fn else float("nan")
    f = 2 * tp / (2 * tp + fp + fn) if (2 * tp + fp + fn) else float("nan")
    return p, r, f


# ---------------------------------------------------------------------------------------------
# Detection evaluation for one participant
# ---------------------------------------------------------------------------------------------


@dataclass
class BlockCounts:
    tp: int = 0
    fp: int = 0
    fn: int = 0
    wink_triggers: int = 0


@dataclass
class DetectionEval:
    """Detection metrics for one participant and one detector (+ threshold)."""

    mode: str  # 'both' (D1-D4: targets short/long) | 'wink' (D5: targets wink-L/wink-R)
    blocks: dict[str, BlockCounts] = field(default_factory=dict)
    duration_errors: list[float] = field(default_factory=list)  # detected - labelled, ms, matched hits
    false_triggers: int = 0  # spontaneous block, non-rejected, not a hit
    false_triggers_no_reject: int = 0  # same, with no reject window (every closure is a symbol)
    spontaneous_minutes: float = float("nan")
    confusion: dict[str, dict[str, int]] = field(default_factory=dict)  # label type -> band/'missed' -> n

    @property
    def tp(self) -> int:
        return sum(b.tp for b in self.blocks.values())

    @property
    def fp(self) -> int:
        return sum(b.fp for b in self.blocks.values())

    @property
    def fn(self) -> int:
        return sum(b.fn for b in self.blocks.values())

    @property
    def precision(self) -> float:
        return prf(self.tp, self.fp, self.fn)[0]

    @property
    def recall(self) -> float:
        return prf(self.tp, self.fp, self.fn)[1]

    @property
    def f1(self) -> float:
        return prf(self.tp, self.fp, self.fn)[2]

    def block_f1(self, name: str) -> float:
        b = self.blocks.get(name)
        return prf(b.tp, b.fp, b.fn)[2] if b else float("nan")

    @property
    def ftpm(self) -> float:
        m = self.spontaneous_minutes
        return self.false_triggers / m if m and math.isfinite(m) and m > 0 else float("nan")

    @property
    def ftpm_no_reject(self) -> float:
        m = self.spontaneous_minutes
        return self.false_triggers_no_reject / m if m and math.isfinite(m) and m > 0 else float("nan")

    @property
    def dur_err_abs(self) -> float:
        return float(np.mean(np.abs(self.duration_errors))) if self.duration_errors else float("nan")

    @property
    def dur_err_signed(self) -> float:
        return float(np.mean(self.duration_errors)) if self.duration_errors else float("nan")

    @property
    def short_long_accuracy(self) -> float:
        """Among deliberate closures detected as a dot or a dash: short -> dot and long -> dash."""
        c = self.confusion
        ok = c.get("short", {}).get("dot", 0) + c.get("long", {}).get("dash", 0)
        n = sum(c.get(t, {}).get(b, 0) for t in ("short", "long") for b in ("dot", "dash"))
        return ok / n if n else float("nan")

    @property
    def deliberate_rejected(self) -> float:
        """Share of labelled deliberate closures the reject window threw away."""
        c = self.confusion
        n = sum(sum(c.get(t, {}).values()) for t in DELIBERATE)
        r = sum(c.get(t, {}).get("reject", 0) for t in DELIBERATE)
        return r / n if n else float("nan")


def _hit(mode: str, lab_type: str, eye: str) -> bool:
    if mode == "both":
        return lab_type in DELIBERATE
    return (lab_type == "wink-L" and eye == "left") or (lab_type == "wink-R" and eye == "right")


def _target(mode: str, lab_type: str) -> bool:
    return lab_type in DELIBERATE if mode == "both" else lab_type in WINKS


def evaluate(
    closures: Sequence[Closure],
    labels: Sequence[Label],
    blocks: dict[str, tuple[float, float]],
    timing: Timing,
    mode: str,
    eval_blocks: Sequence[str] = config.EVAL_BLOCKS,
    wink_policy: str = config.WINK_POLICY_BOTH_EYE,
    min_iou: float = config.IOU_MIN,
) -> DetectionEval:
    ev = DetectionEval(mode=mode)
    dstart = np.array([c.start_ms for c in closures], dtype=float)
    dend = np.array([c.end_ms for c in closures], dtype=float)
    deye = [c.eye for c in closures]
    dband = bands_array(dend - dstart, timing) if closures else np.array([], dtype=object)
    lon = np.array([l.onset_ms for l in labels], dtype=float)

    confusion: dict[str, dict[str, int]] = {t: {b: 0 for b in (*BANDS, "missed")} for t in DELIBERATE}

    for name in eval_blocks:
        if name not in blocks:
            continue
        b0, b1 = blocks[name]
        di = np.flatnonzero((dstart >= b0) & (dstart < b1)).tolist()
        li = np.flatnonzero((lon >= b0) & (lon < b1)).tolist()
        bl = [labels[j] for j in li]
        counts = BlockCounts()

        # F1: detections that would produce a symbol (not rejected) against all labels.
        act = [i for i in di if dband[i] != "reject"]
        pairs = match_events([(dstart[i], dend[i]) for i in act], [(l.onset_ms, l.offset_ms) for l in bl], min_iou)
        matched_det = {a: j for a, j, _ in pairs}
        hit_labels: set[int] = set()
        for a, i in enumerate(act):
            j = matched_det.get(a)
            if j is not None and _hit(mode, bl[j].type, deye[i]):
                counts.tp += 1
                hit_labels.add(j)
                ev.duration_errors.append(float((dend[i] - dstart[i]) - bl[j].duration_ms))
            elif j is not None and mode == "both" and bl[j].type in WINKS and wink_policy == "ignore":
                counts.wink_triggers += 1
            else:
                counts.fp += 1
        counts.fn = sum(1 for j, l in enumerate(bl) if _target(mode, l.type) and j not in hit_labels)
        ev.blocks[name] = counts

        # Every closure, rejected or not, against the labels: confusion and "no reject window" triggers.
        allp = match_events([(dstart[i], dend[i]) for i in di], [(l.onset_ms, l.offset_ms) for l in bl], min_iou)
        if mode == "both":
            by_label = {j: di[a] for a, j, _ in allp}
            for j, l in enumerate(bl):
                if l.type in DELIBERATE:
                    i = by_label.get(j)
                    confusion[l.type]["missed" if i is None else str(dband[i])] += 1

        # False triggers while reading: closures in the spontaneous block that are not hits.
        if name == "spontaneous":
            ev.spontaneous_minutes = (b1 - b0) / 60000.0
            ev.false_triggers = len(act) - counts.tp
            hits_nr = sum(1 for a, j, _ in allp if _hit(mode, bl[j].type, deye[di[a]]))
            ev.false_triggers_no_reject = len(di) - hits_nr
    ev.confusion = confusion if mode == "both" else {}
    return ev


def label_durations(labels: Sequence[Label], blocks: dict[str, tuple[float, float]], block_names: Sequence[str], types: Sequence[str]) -> list[float]:
    out: list[float] = []
    for name in block_names:
        if name not in blocks:
            continue
        b0, b1 = blocks[name]
        out += [l.duration_ms for l in labels if b0 <= l.onset_ms < b1 and l.type in types]
    return out


# ---------------------------------------------------------------------------------------------
# Text entry
# ---------------------------------------------------------------------------------------------


def msd(a: str, b: str) -> int:
    """Minimum string distance (Levenshtein: insertions, deletions, substitutions all cost 1)."""
    if len(a) < len(b):
        a, b = b, a
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        cur = [i]
        for j, cb in enumerate(b, start=1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def msd_error_rate(p: str, t: str) -> float:
    n = max(len(p), len(t))
    return msd(p, t) / n if n else 0.0


@dataclass(frozen=True)
class TextErrors:
    C: int
    INF: int
    IF: int
    F: int

    @property
    def total(self) -> int:
        return self.C + self.INF + self.IF

    @property
    def uncorrected(self) -> float:
        return self.INF / self.total if self.total else float("nan")

    @property
    def corrected(self) -> float:
        return self.IF / self.total if self.total else float("nan")

    @property
    def total_er(self) -> float:
        return (self.INF + self.IF) / self.total if self.total else float("nan")


def normalise_text(s: str) -> str:
    return " ".join(s.lower().split())


def text_errors(presented: str, transcribed: str, erased_chars: int, fixes: int) -> TextErrors:
    p, t = normalise_text(presented), normalise_text(transcribed)
    inf = msd(p, t)
    return TextErrors(C=max(len(p), len(t)) - inf, INF=inf, IF=erased_chars, F=fixes)


def cpm(n_chars: int, ms: float) -> float:
    return n_chars / (ms / 60000.0) if ms > 0 and n_chars > 0 else float("nan")


def wpm(cpm_value: float) -> float:
    return cpm_value / 5.0


NON_REJECT_BANDS = ("dot", "dash", "hold", "backspace")


@dataclass
class PhraseResult:
    block: str
    index: int
    target: str
    typed: str
    n_chars: int
    ms: float
    cpm: float
    errors: TextErrors
    closures: int
    pattern_cancels: int
    unknown: int

    @property
    def closures_per_char(self) -> float:
        return self.closures / self.n_chars if self.n_chars else float("nan")


def score_phrase(block: str, index: int, target: str, typed: str, actions: Sequence[dict[str, Any]]) -> PhraseResult:
    """Score one Study B phrase from its decoder actions (action dicts with t_ms added).

    Entry time runs from the first closure to the last committed letter. When the log carries
    closure records (``{"type": "segment", "start_ms": ...}``) the first closure's start is used;
    otherwise the first symbol's commit time (the end of the first closure)."""
    kinds = [a.get("type") for a in actions]
    segs = [a for a in actions if a.get("type") == "segment"]
    syms = [a for a in actions if a.get("type") == "symbol"]
    letters = [a for a in actions if a.get("type") == "letter"]
    erased = sum(1 for a in actions if a.get("type") == "backspace" and a.get("what") == "char" and a.get("removed"))
    cancels = sum(1 for a in actions if a.get("type") == "backspace" and a.get("what") == "pattern")
    if segs:
        closures = sum(1 for a in segs if a.get("band") != "reject")
        t0 = min(float(a["start_ms"]) for a in segs)
    else:
        closures = (
            kinds.count("symbol")
            + kinds.count("backspace")
            + kinds.count("pause")
            + sum(1 for a in actions if a.get("type") == "ignored" and a.get("band") in NON_REJECT_BANDS)
        )
        firsts = syms or letters
        t0 = float(firsts[0]["t_ms"]) if firsts else float("nan")
    t1 = float(letters[-1]["t_ms"]) if letters else float("nan")
    t_norm = normalise_text(typed)
    ms = t1 - t0 if math.isfinite(t0) and math.isfinite(t1) else float("nan")
    errs = text_errors(target, typed, erased, erased)
    return PhraseResult(
        block=block,
        index=index,
        target=target,
        typed=typed,
        n_chars=len(t_norm),
        ms=ms,
        cpm=cpm(len(t_norm), ms) if math.isfinite(ms) else float("nan"),
        errors=errs,
        closures=closures,
        pattern_cancels=cancels,
        unknown=kinds.count("unknown"),
    )
