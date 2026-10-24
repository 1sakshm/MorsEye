"""Per-user threshold fitting and few-shot calibration (port of src/detect/calibration.ts).

    thr = open_median - alpha * (open_median - closed_median),  alpha = 0.5
    h   = 10% of |open_median - closed_median|

"Closed" values are one per calibration closure: the deepest point of the signal inside it
(min EAR / max blendshape). The k-shot draws use the same seeded PRNG (mulberry32) and the same
Fisher-Yates sampling as the app, so a draw can be reproduced in TypeScript.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Callable, Sequence, TypeVar

import numpy as np

from . import config
from .load import DELIBERATE, Label, Session
from .replay import Threshold, UserThresholds

T = TypeVar("T")

ALPHA = 0.5
HYSTERESIS_FRACTION = 0.1
MIN_RANGE = {"ear": 0.06, "blend": 0.3}

_M32 = 0xFFFFFFFF


def median(xs: Sequence[float]) -> float:
    if len(xs) == 0:
        return float("nan")
    s = sorted(xs)
    mid = len(s) >> 1
    return s[mid] if len(s) % 2 else (s[mid - 1] + s[mid]) / 2


def mad(xs: Sequence[float]) -> float:
    m = median(xs)
    return median([abs(x - m) for x in xs])


@dataclass(frozen=True)
class Calibration:
    kind: str
    thr: float
    h: float
    openMedian: float
    openMad: float
    closedMedian: float
    closedMad: float
    range: float
    ok: bool
    warning: str | None = None

    @property
    def threshold(self) -> Threshold:
        return Threshold(thr=self.thr, h=self.h)


def closure_peak(kind: str, samples: Sequence[float]) -> float:
    if len(samples) == 0:
        return float("nan")
    return min(samples) if kind == "ear" else max(samples)


def fit_threshold(kind: str, open_samples: Sequence[float], closed_peaks: Sequence[float], alpha: float = ALPHA) -> Calibration:
    open_median = median(open_samples)
    closed_median = median(closed_peaks)
    rng = abs(open_median - closed_median)
    thr = open_median - alpha * (open_median - closed_median)
    h = HYSTERESIS_FRACTION * rng

    right_way = closed_median < open_median if kind == "ear" else closed_median > open_median
    warning: str | None = None
    if not math.isfinite(rng) or len(open_samples) == 0 or len(closed_peaks) == 0:
        warning = "Not enough calibration data. Keep your face in view and try again."
    elif not right_way or rng < MIN_RANGE[kind]:
        warning = (
            "Your open and closed eyes look too similar to the camera. Try more light on your face, "
            "tilt glasses to cut glare, or move a little closer, then recalibrate."
        )
    return Calibration(
        kind=kind,
        thr=thr,
        h=h,
        openMedian=open_median,
        openMad=mad(open_samples),
        closedMedian=closed_median,
        closedMad=mad(closed_peaks),
        range=rng,
        ok=warning is None,
        warning=warning,
    )


def _imul(a: int, b: int) -> int:
    return ((a & _M32) * (b & _M32)) & _M32


def mulberry32(seed: int) -> Callable[[], float]:
    """Bit-exact port of the TypeScript mulberry32 (all arithmetic on uint32)."""
    a = seed & _M32

    def rng() -> float:
        nonlocal a
        a = (a + 0x6D2B79F5) & _M32
        t = a
        t = _imul(t ^ (t >> 15), t | 1)
        t ^= (t + _imul(t ^ (t >> 7), t | 61)) & _M32
        t &= _M32
        return ((t ^ (t >> 14)) & _M32) / 4294967296

    return rng


def sample(xs: Sequence[T], k: int, rng: Callable[[], float]) -> list[T]:
    """Draw k items without replacement (Fisher-Yates over the whole list, as in the TS)."""
    a = list(xs)
    for i in range(len(a) - 1, 0, -1):
        j = math.floor(rng() * (i + 1))
        a[i], a[j] = a[j], a[i]
    return a[: min(k, len(a))]


def k_shot_thresholds(
    kind: str, open_samples: Sequence[float], closed_peaks: Sequence[float], k: int, draws: int, seed: int
) -> list[Calibration]:
    rng = mulberry32(seed)
    return [fit_threshold(kind, open_samples, sample(closed_peaks, k, rng)) for _ in range(draws)]


def k_shot_indices(n: int, k: int, draws: int, seed: int) -> list[list[int]]:
    """The closure indices each draw uses (same sequence as k_shot_thresholds on a list of n items)."""
    rng = mulberry32(seed)
    return [sample(range(n), k, rng) for _ in range(draws)]


def kshot_seed(participant_seed: int, k: int) -> int:
    """Seed for participant x k. D2 and D4 share it, so both see the same calibration closures."""
    return (participant_seed * 31 + k) & _M32


# ---------------------------------------------------------------------------------------------
# Calibration data from a Study A session
# ---------------------------------------------------------------------------------------------

SIGNAL_KIND = {"earMean": "ear", "blendMax": "blend", "blendL": "blend", "blendR": "blend"}


@dataclass
class CalibrationData:
    """Open samples and per-closure peaks for each signal, from the calibration block."""

    open: dict[str, np.ndarray]  # signal -> values in eyes-open frames
    peaks: dict[str, np.ndarray]  # signal -> one value per calibration closure (same order for all signals)
    n_closures: int
    source: str  # 'labels' | 'cues'


def _signals(s: Session) -> dict[str, np.ndarray]:
    fa = s.frames.arrays()
    return {name: fa.signal(name) for name in SIGNAL_KIND}


def _inside_any(t: np.ndarray, labels: Sequence[Label]) -> np.ndarray:
    mask = np.zeros(t.shape, dtype=bool)
    for lab in labels:
        mask |= (t >= lab.onset_ms) & (t <= lab.offset_ms)
    return mask


def calibration_data(s: Session, source: str = config.CALIBRATION_SOURCE) -> CalibrationData | None:
    blk = s.blocks.get("calibration")
    if blk is None:
        return None
    t, face = s.frames.t, s.frames.face
    sig = _signals(s)
    labels = [l for l in (s.labels or []) if blk[0] <= l.onset_ms < blk[1]]

    # Eyes-open frames: the OPEN cue window (or the whole block), minus any labelled closure.
    open_cues = [c for c in s.cues_in("calibration") if c.get("cue") == "OPEN"]
    if open_cues:
        c = open_cues[0]
        win = (t >= c["t_ms"]) & (t < c["t_ms"] + c.get("duration_ms", 15000))
    else:
        win = (t >= blk[0]) & (t < blk[1])
    open_mask = win & face & ~_inside_any(t, s.labels or [])

    # Closed examples: labelled deliberate closures, or the cue windows.
    windows: list[tuple[float, float]]
    used = source
    lab_windows = [(l.onset_ms, l.offset_ms) for l in labels if l.type in DELIBERATE]
    if source == "labels" and lab_windows:
        windows = lab_windows
    else:
        used = "cues"
        windows = [
            (c["t_ms"], c["t_ms"] + c.get("duration_ms", 1500) + config.CUE_WINDOW_SLACK_MS)
            for c in s.cues_in("calibration")
            if c.get("cue") in ("SHORT", "LONG")
        ]

    peaks: dict[str, list[float]] = {k: [] for k in sig}
    for w0, w1 in windows:
        m = (t >= w0) & (t <= w1) & face
        if not m.any():
            continue  # no face during this closure: unusable for every signal
        for name, v in sig.items():
            peaks[name].append(closure_peak(SIGNAL_KIND[name], v[m].tolist()))

    return CalibrationData(
        open={k: v[open_mask] for k, v in sig.items()},
        peaks={k: np.asarray(v) for k, v in peaks.items()},
        n_closures=len(peaks["earMean"]),
        source=used,
    )


def fit_user(cd: CalibrationData, idx: Sequence[int] | None = None) -> tuple[UserThresholds, dict[str, Calibration]]:
    """Fit every per-user threshold from all calibration closures, or from the closures in ``idx``."""
    fits: dict[str, Calibration] = {}
    for name, kind in SIGNAL_KIND.items():
        peaks = cd.peaks[name]
        chosen = peaks if idx is None else peaks[list(idx)]
        fits[name] = fit_threshold(kind, cd.open[name].tolist(), chosen.tolist())

    def usable(c: Calibration) -> Threshold | None:
        # Fall back to the fixed threshold only when no threshold could be computed at all.
        return c.threshold if math.isfinite(c.thr) and math.isfinite(c.h) else None

    user = UserThresholds(
        ear=usable(fits["earMean"]),
        blend=usable(fits["blendMax"]),
        blendL=usable(fits["blendL"]),
        blendR=usable(fits["blendR"]),
    )
    return user, fits
