"""Statistics over participants (PRD §3.5): percentile bootstrap CIs, Wilcoxon signed-rank tests with
Holm correction, Cohen's kappa and labelling self-agreement.

The unit of analysis is the participant: every metric is first computed per participant, then
summarised across participants. With N around 10 the tests have low power; say so when reporting.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Mapping, Sequence

import numpy as np
from scipy import stats as sps

from . import config
from .load import Label
from .metrics import match_events


@dataclass(frozen=True)
class CI:
    mean: float
    lo: float
    hi: float
    n: int

    def to_dict(self) -> dict[str, Any]:
        return {"mean": self.mean, "lo": self.lo, "hi": self.hi, "n": self.n}

    def fmt(self, digits: int = 2) -> str:
        if not math.isfinite(self.mean):
            return "n/a"
        return f"{self.mean:.{digits}f} [{self.lo:.{digits}f}, {self.hi:.{digits}f}]"


def _clean(values: Sequence[float]) -> np.ndarray:
    v = np.asarray([x for x in values if x is not None], dtype=float)
    return v[np.isfinite(v)]


def bootstrap_ci(
    values: Sequence[float],
    n_boot: int = config.N_BOOT,
    seed: int = config.BOOT_SEED,
    level: float = config.CI_LEVEL,
) -> CI:
    """Mean and percentile bootstrap CI, resampling participants with replacement."""
    v = _clean(values)
    n = int(v.size)
    if n == 0:
        return CI(float("nan"), float("nan"), float("nan"), 0)
    mean = float(v.mean())
    if n == 1 or np.all(v == v[0]):
        return CI(mean, mean, mean, n)
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, n, size=(n_boot, n))
    means = v[idx].mean(axis=1)
    a = (1 - level) / 2
    lo, hi = np.quantile(means, [a, 1 - a])
    return CI(mean, float(lo), float(hi), n)


def paired(a: Mapping[str, float], b: Mapping[str, float]) -> tuple[list[str], np.ndarray, np.ndarray]:
    """Participants with a finite value in both, and the two value arrays in that order."""
    keys = sorted(k for k in a if k in b and _finite(a[k]) and _finite(b[k]))
    return keys, np.array([a[k] for k in keys], dtype=float), np.array([b[k] for k in keys], dtype=float)


def _finite(x: Any) -> bool:
    return x is not None and isinstance(x, (int, float)) and math.isfinite(x)


def wilcoxon(x: np.ndarray, y: np.ndarray, alternative: str = config.WILCOXON_ALTERNATIVE) -> tuple[float, float, int]:
    """Wilcoxon signed-rank test on paired samples. Returns (W, p, number of non-zero differences).
    All-zero differences give p = 1."""
    d = np.asarray(x, dtype=float) - np.asarray(y, dtype=float)
    nz = int(np.count_nonzero(d))
    if nz == 0:
        return 0.0, 1.0, 0
    res = sps.wilcoxon(d, zero_method="wilcox", alternative=alternative)
    return float(res.statistic), float(res.pvalue), nz


def holm(pvals: Sequence[float]) -> list[float]:
    """Holm step-down adjusted p-values, in the input order. NaNs are left out of the family."""
    p = np.asarray(pvals, dtype=float)
    out = np.full(p.shape, np.nan)
    ok = np.flatnonzero(np.isfinite(p))
    m = ok.size
    if m == 0:
        return out.tolist()
    order = ok[np.argsort(p[ok], kind="stable")]
    running = 0.0
    for rank, i in enumerate(order):
        adj = min(1.0, (m - rank) * p[i])
        running = max(running, adj)
        out[i] = running
    return out.tolist()


def cohen_kappa(a: Sequence[str], b: Sequence[str]) -> float:
    if len(a) != len(b):
        raise ValueError("rating lists must have the same length")
    n = len(a)
    if n == 0:
        return float("nan")
    cats = sorted(set(a) | set(b))
    po = sum(1 for x, y in zip(a, b) if x == y) / n
    pe = sum((list(a).count(c) / n) * (list(b).count(c) / n) for c in cats)
    if pe == 1:
        return 1.0 if po == 1 else float("nan")
    return (po - pe) / (1 - pe)


@dataclass(frozen=True)
class Agreement:
    kappa: float
    mean_abs_onset_ms: float
    mean_abs_offset_ms: float
    n_matched: int
    n_unmatched: int


def self_agreement(first: Sequence[Label], second: Sequence[Label], min_iou: float = config.IOU_MIN) -> Agreement:
    """Agreement between two labelling passes of the same session. Events are matched at IoU >= 0.3;
    an event found in only one pass counts as type 'none' in the other for kappa."""
    pairs = match_events([(l.onset_ms, l.offset_ms) for l in first], [(l.onset_ms, l.offset_ms) for l in second], min_iou)
    m1 = {i for i, _, _ in pairs}
    m2 = {j for _, j, _ in pairs}
    ra = [first[i].type for i, _, _ in pairs] + [first[i].type for i in range(len(first)) if i not in m1]
    rb = [second[j].type for _, j, _ in pairs] + ["none" for i in range(len(first)) if i not in m1]
    ra += ["none" for j in range(len(second)) if j not in m2]
    rb += [second[j].type for j in range(len(second)) if j not in m2]
    on = [abs(first[i].onset_ms - second[j].onset_ms) for i, j, _ in pairs]
    off = [abs(first[i].offset_ms - second[j].offset_ms) for i, j, _ in pairs]
    return Agreement(
        kappa=cohen_kappa(ra, rb),
        mean_abs_onset_ms=float(np.mean(on)) if on else float("nan"),
        mean_abs_offset_ms=float(np.mean(off)) if off else float("nan"),
        n_matched=len(pairs),
        n_unmatched=(len(first) - len(m1)) + (len(second) - len(m2)),
    )


@dataclass
class PairedTest:
    family: str
    hypothesis: str
    metric: str
    a: str
    b: str
    n: int
    mean_a: float
    mean_b: float
    diff: CI  # mean of (a - b) across participants, bootstrap CI
    W: float
    p: float
    p_holm: float = float("nan")
    note: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "family": self.family,
            "hypothesis": self.hypothesis,
            "metric": self.metric,
            "a": self.a,
            "b": self.b,
            "n": self.n,
            "mean_a": self.mean_a,
            "mean_b": self.mean_b,
            "diff": self.diff.to_dict(),
            "W": self.W,
            "p": self.p,
            "p_holm": self.p_holm,
            "note": self.note,
        }


def paired_test(family: str, hypothesis: str, metric: str, a_name: str, a: Mapping[str, float], b_name: str, b: Mapping[str, float], note: str = "") -> PairedTest:
    keys, x, y = paired(a, b)
    if len(keys) == 0:
        nan = float("nan")
        return PairedTest(family, hypothesis, metric, a_name, b_name, 0, nan, nan, CI(nan, nan, nan, 0), nan, nan, note=note)
    W, p, _ = wilcoxon(x, y)
    return PairedTest(
        family=family,
        hypothesis=hypothesis,
        metric=metric,
        a=a_name,
        b=b_name,
        n=len(keys),
        mean_a=float(x.mean()),
        mean_b=float(y.mean()),
        diff=bootstrap_ci((x - y).tolist()),
        W=W,
        p=p,
        note=note,
    )


def apply_holm(tests: list[PairedTest]) -> None:
    """Holm within each family, in place."""
    for fam in {t.family for t in tests}:
        group = [t for t in tests if t.family == fam]
        for t, adj in zip(group, holm([t.p for t in group])):
            t.p_holm = adj
