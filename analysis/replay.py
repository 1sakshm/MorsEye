"""Python port of the TypeScript detection pipeline.

Line-for-line ports (names follow the TypeScript so the two can be read side by side):
  src/detect/detector.ts   -> HysteresisDetector, WinkDetector, make_detector, detect_all
  src/segment/segmenter.ts -> Timing, DEFAULT_TIMING, band, segment
  src/decode/decoder.ts    -> MORSE, Decoder, encode
  src/pipeline.ts          -> replay, replay_all

Plus a vectorised detector (``detect_fast``) used for bulk analysis. It is tested to give exactly the
same closures as the line-for-line port (analysis/tests/test_replay_parity.py), and the line-for-line
port is tested to give exactly the TypeScript output on tests/fixtures/replay_sample.jsonl.

Run as a script to replay a log, like ``npm run replay``:
    python -m analysis.replay path/to/log.jsonl [--detector D1]
"""

from __future__ import annotations

import json
import math
import sys
from dataclasses import asdict, dataclass, field
from typing import Any, Callable, Iterable, Mapping, Sequence

import numpy as np

# ---------------------------------------------------------------------------------------------
# Closures (src/types.ts)
# ---------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Closure:
    start_ms: float  # timestamp of the first closed frame
    end_ms: float  # timestamp of the first open frame after the closure
    duration_ms: float
    eye: str  # 'both' | 'left' | 'right'

    def to_dict(self) -> dict[str, Any]:
        return {
            "start_ms": self.start_ms,
            "end_ms": self.end_ms,
            "duration_ms": self.duration_ms,
            "eye": self.eye,
        }


# ---------------------------------------------------------------------------------------------
# Segmenter (src/segment/segmenter.ts)
# ---------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Timing:
    # Field names match the TypeScript / JSON exactly.
    rejectMs: float
    dotMaxMs: float
    dashMaxMs: float
    cmdMs: float
    letterGapMs: float
    wordGapMs: float

    @staticmethod
    def from_dict(d: Mapping[str, Any]) -> "Timing":
        return Timing(**{k: d[k] for k in Timing.__dataclass_fields__})

    def to_dict(self) -> dict[str, float]:
        return asdict(self)


DEFAULT_TIMING = Timing(
    rejectMs=200, dotMaxMs=600, dashMaxMs=1400, cmdMs=2000, letterGapMs=1200, wordGapMs=3000
)

PRESETS = {"slow": 1.5, "medium": 1.0, "fast": 0.7}


def _js_round(x: float) -> int:
    """Math.round: halves round towards +infinity (Python's round() rounds halves to even)."""
    return math.floor(x + 0.5)


def scale_timing(t: Timing, factor: float) -> Timing:
    return Timing(**{k: _js_round(v * factor) for k, v in asdict(t).items()})


def valid_timing(t: Timing) -> bool:
    return (
        t.rejectMs >= 0
        and t.rejectMs < t.dotMaxMs
        and t.dotMaxMs < t.dashMaxMs
        and t.dashMaxMs <= t.cmdMs
        and t.letterGapMs > 0
        and t.letterGapMs < t.wordGapMs
    )


BANDS = ("reject", "dot", "dash", "hold", "backspace")


def band(duration_ms: float, t: Timing) -> str:
    if duration_ms < t.rejectMs:
        return "reject"
    if duration_ms < t.dotMaxMs:
        return "dot"
    if duration_ms < t.dashMaxMs:
        return "dash"
    if duration_ms < t.cmdMs:
        return "hold"
    return "backspace"


def bands_array(durations: np.ndarray, t: Timing) -> np.ndarray:
    """Vectorised ``band`` (same thresholds, same strict/non-strict edges)."""
    d = np.asarray(durations, dtype=float)
    out = np.full(d.shape, "backspace", dtype=object)
    out[d < t.cmdMs] = "hold"
    out[d < t.dashMaxMs] = "dash"
    out[d < t.dotMaxMs] = "dot"
    out[d < t.rejectMs] = "reject"
    return out


@dataclass(frozen=True)
class Segment:
    band: str
    start_ms: float
    end_ms: float
    duration_ms: float
    eye: str


def segment(c: Closure, t: Timing) -> Segment:
    return Segment(
        band=band(c.duration_ms, t),
        start_ms=c.start_ms,
        end_ms=c.end_ms,
        duration_ms=c.duration_ms,
        eye=c.eye,
    )


# ---------------------------------------------------------------------------------------------
# Detectors (src/detect/detector.ts)
# ---------------------------------------------------------------------------------------------

Frame = Mapping[str, Any]  # a FrameFeatures record: t_ms, face, earL, earR, blinkL, blinkR, ...


@dataclass(frozen=True)
class Signal:
    kind: str  # 'ear' (low = closed) | 'blend' (high = closed)
    read: Callable[[Frame], float]
    name: str


SIGNALS: dict[str, Signal] = {
    "earMean": Signal("ear", lambda f: (f["earL"] + f["earR"]) / 2, "earMean"),
    "blendMax": Signal("blend", lambda f: max(f["blinkL"], f["blinkR"]), "blendMax"),
    "blendMin": Signal("blend", lambda f: min(f["blinkL"], f["blinkR"]), "blendMin"),
    "blendL": Signal("blend", lambda f: f["blinkL"], "blendL"),
    "blendR": Signal("blend", lambda f: f["blinkR"], "blendR"),
}


@dataclass(frozen=True)
class Threshold:
    thr: float
    h: float


FIXED_EAR = Threshold(thr=0.21, h=0.02)
FIXED_BLEND = Threshold(thr=0.5, h=0.1)


def is_closed_side(kind: str, value: float, level: float) -> bool:
    return value < level if kind == "ear" else value > level


def release_level(kind: str, t: Threshold) -> float:
    return t.thr + t.h if kind == "ear" else t.thr - t.h


class HysteresisDetector:
    def __init__(self, signal: Signal, threshold: Threshold, eye: str = "both") -> None:
        self.signal = signal
        self.threshold = threshold
        self.eye = eye
        self.state = "open"  # 'open' | 'closed' | 'face_lost'
        self.closed_since: float | None = None

    def update(self, f: Frame) -> Closure | None:
        if not f["face"]:
            # Pause: drop any partial closure rather than ending it at the wrong time.
            self.state = "face_lost"
            self.closed_since = None
            return None
        v = self.signal.read(f)
        kind = self.signal.kind

        if self.state == "face_lost":
            # Re-acquire. If the eye is already closed we cannot know when it closed, so wait for open.
            if is_closed_side(kind, v, self.threshold.thr):
                return None
            self.state = "open"
            return None

        if self.state == "open":
            if is_closed_side(kind, v, self.threshold.thr):
                self.state = "closed"
                self.closed_since = f["t_ms"]
            return None

        # state == 'closed'
        if not is_closed_side(kind, v, release_level(kind, self.threshold)):
            start = self.closed_since if self.closed_since is not None else f["t_ms"]
            self.state = "open"
            self.closed_since = None
            return Closure(start, f["t_ms"], f["t_ms"] - start, self.eye)
        return None

    def reset(self) -> None:
        self.state = "open"
        self.closed_since = None


class WinkDetector:
    """D5: one eye closed while the other stays open (score below other_open_max) for the whole closure."""

    def __init__(self, thr_l: Threshold, thr_r: Threshold, other_open_max: float = 0.3) -> None:
        self.left = HysteresisDetector(SIGNALS["blendL"], thr_l, "left")
        self.right = HysteresisDetector(SIGNALS["blendR"], thr_r, "right")
        self.other_open_max = other_open_max
        self.left_clean = True
        self.right_clean = True

    @property
    def state(self) -> str:
        if self.left.state == "face_lost":
            return "face_lost"
        return "closed" if self.left.state == "closed" or self.right.state == "closed" else "open"

    @property
    def closed_since(self) -> float | None:
        return self.left.closed_since if self.left.closed_since is not None else self.right.closed_since

    def update(self, f: Frame) -> Closure | None:
        l = self.left.update(f)
        r = self.right.update(f)
        if f["face"]:
            if self.left.state == "closed" and f["blinkR"] >= self.other_open_max:
                self.left_clean = False
            if self.right.state == "closed" and f["blinkL"] >= self.other_open_max:
                self.right_clean = False
        out: Closure | None = None
        if l is not None:
            if self.left_clean:
                out = l
            self.left_clean = True
        if r is not None:
            if self.right_clean:
                out = out if out is not None else r
            self.right_clean = True
        if not f["face"]:
            self.left_clean = True
            self.right_clean = True
        return out

    def reset(self) -> None:
        self.left.reset()
        self.right.reset()
        self.left_clean = True
        self.right_clean = True


@dataclass
class UserThresholds:
    ear: Threshold | None = None
    blend: Threshold | None = None
    blendL: Threshold | None = None
    blendR: Threshold | None = None

    @staticmethod
    def from_dict(d: Mapping[str, Any] | None) -> "UserThresholds":
        d = d or {}
        mk = lambda x: Threshold(thr=x["thr"], h=x["h"]) if x else None  # noqa: E731
        return UserThresholds(
            ear=mk(d.get("ear")), blend=mk(d.get("blend")), blendL=mk(d.get("blendL")), blendR=mk(d.get("blendR"))
        )


DETECTOR_IDS = ("D1", "D2", "D3", "D4", "D5")


def _first(*xs: Threshold | None) -> Threshold:
    for x in xs:
        if x is not None:
            return x
    raise AssertionError("unreachable")


def detector_spec(det_id: str, user: UserThresholds | None = None) -> tuple[str, Threshold]:
    """(signal name, threshold) for a both-eye detector D1-D4."""
    user = user or UserThresholds()
    if det_id == "D1":
        return "earMean", FIXED_EAR
    if det_id == "D2":
        return "earMean", _first(user.ear, FIXED_EAR)
    if det_id == "D3":
        return "blendMax", FIXED_BLEND
    if det_id == "D4":
        return "blendMax", _first(user.blend, FIXED_BLEND)
    raise ValueError(f"not a both-eye detector: {det_id}")


def wink_thresholds(user: UserThresholds | None = None) -> tuple[Threshold, Threshold]:
    user = user or UserThresholds()
    return _first(user.blendL, user.blend, FIXED_BLEND), _first(user.blendR, user.blend, FIXED_BLEND)


def make_detector(det_id: str, user: UserThresholds | None = None) -> HysteresisDetector | WinkDetector:
    if det_id == "D5":
        thr_l, thr_r = wink_thresholds(user)
        return WinkDetector(thr_l, thr_r)
    sig, thr = detector_spec(det_id, user)
    return HysteresisDetector(SIGNALS[sig], thr)


def detect_all(det: HysteresisDetector | WinkDetector, frames: Iterable[Frame]) -> list[Closure]:
    out: list[Closure] = []
    for f in frames:
        c = det.update(f)
        if c is not None:
            out.append(c)
    return out


# ---------------------------------------------------------------------------------------------
# Decoder (src/decode/decoder.ts)
# ---------------------------------------------------------------------------------------------

MORSE: dict[str, str] = {
    ".-": "A", "-...": "B", "-.-.": "C", "-..": "D", ".": "E", "..-.": "F", "--.": "G", "....": "H",
    "..": "I", ".---": "J", "-.-": "K", ".-..": "L", "--": "M", "-.": "N", "---": "O", ".--.": "P",
    "--.-": "Q", ".-.": "R", "...": "S", "-": "T", "..-": "U", "...-": "V", ".--": "W", "-..-": "X",
    "-.--": "Y", "--..": "Z",
    ".----": "1", "..---": "2", "...--": "3", "....-": "4", ".....": "5",
    "-....": "6", "--...": "7", "---..": "8", "----.": "9", "-----": "0",
    ".-.-.-": ".", "--..--": ",", "..--..": "?",
}  # fmt: skip
REVERSE_MORSE = {v: k for k, v in MORSE.items()}

PAUSE_WINDOW_MS = 4000

Action = dict[str, Any]


class Decoder:
    def __init__(self, timing: Timing, winks: bool = False) -> None:
        self.timing = timing
        self.winks = winks
        self.text = ""
        self.pattern = ""
        self.paused = False
        self._last_end: float | None = None
        self._space_armed = False
        self._last_hold_end: float | None = None

    def push(self, seg: Segment) -> list[Action]:
        out = self.tick(seg.start_ms, False)

        if seg.band == "reject":
            out.append({"type": "ignored", "band": seg.band})
            return out

        if seg.band == "hold" and seg.eye == "both":
            if self._last_hold_end is not None and seg.start_ms - self._last_hold_end <= PAUSE_WINDOW_MS:
                self._last_hold_end = None
                self.paused = not self.paused
                if self.paused:
                    out.extend(self.commit_letter())
                self._last_end = seg.end_ms
                out.append({"type": "pause", "paused": self.paused})
            else:
                self._last_hold_end = seg.end_ms
                out.append({"type": "ignored", "band": seg.band})
            return out
        self._last_hold_end = None

        if self.paused:
            out.append({"type": "ignored", "band": seg.band})
            return out

        if seg.eye != "both":
            if not self.winks:
                out.append({"type": "ignored", "band": seg.band})
                return out
            self._last_end = seg.end_ms
            if seg.eye == "left":
                out.extend(self.commit_letter())
                out.extend(self.insert_space())
            else:
                out.append({"type": "speak", "text": self.text.strip()})
            return out

        self._last_end = seg.end_ms
        if seg.band in ("dot", "dash"):
            symbol = "." if seg.band == "dot" else "-"
            self.pattern += symbol
            out.append({"type": "symbol", "symbol": symbol, "pattern": self.pattern})
        elif seg.band == "backspace":
            out.append(self.backspace())
        return out

    def tick(self, t_ms: float, closed: bool) -> list[Action]:
        if self.paused or closed or self._last_end is None:
            return []
        gap = t_ms - self._last_end
        out: list[Action] = []
        if self.pattern and gap >= self.timing.letterGapMs:
            out.extend(self.commit_letter())
        if self._space_armed and gap >= self.timing.wordGapMs:
            out.extend(self.insert_space())
        return out

    def flush(self) -> list[Action]:
        if self._last_end is None:
            return []
        return self.tick(self._last_end + self.timing.wordGapMs, False)

    def commit_letter(self) -> list[Action]:
        if not self.pattern:
            return []
        pattern = self.pattern
        self.pattern = ""
        char = MORSE.get(pattern)
        if char is None:
            return [{"type": "unknown", "pattern": pattern}]
        self.text += char
        self._space_armed = True
        return [{"type": "letter", "char": char, "pattern": pattern}]

    def insert_space(self) -> list[Action]:
        self._space_armed = False
        if not self.text or self.text.endswith(" "):
            return []
        self.text += " "
        return [{"type": "space"}]

    def backspace(self) -> Action:
        if self.pattern:
            removed = self.pattern
            self.pattern = ""
            return {"type": "backspace", "removed": removed, "what": "pattern"}
        removed = self.text[-1:]
        self.text = self.text[:-1]
        self._space_armed = False
        return {"type": "backspace", "removed": removed, "what": "char"}

    def clear(self) -> None:
        self.text = ""
        self.pattern = ""
        self._last_end = None
        self._space_armed = False
        self._last_hold_end = None


def encode(text: str) -> str:
    words = [w for w in text.upper().split() if w]
    return " / ".join(" ".join(REVERSE_MORSE[c] for c in w if c in REVERSE_MORSE) for w in words)


# ---------------------------------------------------------------------------------------------
# Pipeline (src/pipeline.ts)
# ---------------------------------------------------------------------------------------------


@dataclass
class ReplayResult:
    closures: list[Closure] = field(default_factory=list)
    segments: list[Segment] = field(default_factory=list)
    actions: list[Action] = field(default_factory=list)
    text: str = ""


def replay(
    frames: Sequence[Frame],
    detector_id: str,
    timing: Timing,
    user: UserThresholds | None = None,
    winks: bool = False,
) -> ReplayResult:
    det = make_detector(detector_id, user)
    dec = Decoder(timing, winks)
    res = ReplayResult()
    for f in frames:
        c = det.update(f)
        if c is not None:
            res.closures.append(c)
            s = segment(c, timing)
            res.segments.append(s)
            res.actions.extend(dec.push(s))
        res.actions.extend(dec.tick(f["t_ms"], det.state == "closed"))
    res.actions.extend(dec.flush())
    res.text = dec.text
    return res


def replay_all(frames: Sequence[Frame], timing: Timing, user: UserThresholds | None) -> dict[str, Any]:
    """Every detector (D5 with winks on), in the shape of tests/fixtures/replay_expected.json."""
    out: dict[str, Any] = {}
    for det_id in DETECTOR_IDS:
        r = replay(frames, det_id, timing, user, det_id == "D5")
        out[det_id] = {
            "closures": [c.to_dict() for c in r.closures],
            "bands": [s.band for s in r.segments],
            "text": r.text,
        }
    return out


def decode_segments(segments: Sequence[Segment], timing: Timing, winks: bool = False) -> tuple[str, list[Action]]:
    """Decoder over segments only (no per-frame ticks). Gives the same text and actions as ``replay``,
    because a tick only commits what ``push`` would commit at the next closure's start or ``flush``."""
    dec = Decoder(timing, winks)
    actions: list[Action] = []
    for s in segments:
        actions.extend(dec.push(s))
    actions.extend(dec.flush())
    return dec.text, actions


# ---------------------------------------------------------------------------------------------
# Vectorised detectors (bulk analysis). Same results as the classes above, much faster.
# ---------------------------------------------------------------------------------------------


@dataclass
class FrameArrays:
    """Columnar frames. Values in frames without a face are ignored (they are 0 in the logs)."""

    t: np.ndarray
    face: np.ndarray
    earL: np.ndarray
    earR: np.ndarray
    blinkL: np.ndarray
    blinkR: np.ndarray

    @staticmethod
    def from_dicts(frames: Sequence[Frame]) -> "FrameArrays":
        def col(k: str, dtype: Any = float) -> np.ndarray:
            return np.fromiter((f[k] for f in frames), dtype=dtype, count=len(frames))

        return FrameArrays(
            t=col("t_ms"), face=col("face", bool), earL=col("earL"), earR=col("earR"), blinkL=col("blinkL"), blinkR=col("blinkR")
        )

    def signal(self, name: str) -> np.ndarray:
        if name == "earMean":
            return (self.earL + self.earR) / 2
        if name == "blendMax":
            return np.maximum(self.blinkL, self.blinkR)
        if name == "blendMin":
            return np.minimum(self.blinkL, self.blinkR)
        if name == "blendL":
            return self.blinkL
        if name == "blendR":
            return self.blinkR
        raise KeyError(name)


def _face_runs(face: np.ndarray) -> list[tuple[int, int]]:
    """Maximal [a, b) runs of consecutive frames with a face."""
    f = np.concatenate(([False], face.astype(bool), [False]))
    d = np.diff(f.astype(np.int8))
    starts = np.flatnonzero(d == 1)
    ends = np.flatnonzero(d == -1)
    return list(zip(starts.tolist(), ends.tolist()))


def hysteresis_intervals(face: np.ndarray, v: np.ndarray, kind: str, thr: Threshold) -> list[tuple[int, int]]:
    """Frame-index intervals [start, end) of completed closures: start = first closed frame,
    end = first open frame. Exactly the HysteresisDetector state machine, vectorised per face run."""
    if thr.h < 0:
        raise ValueError("hysteresis width must be >= 0")
    level = release_level(kind, thr)
    if kind == "ear":
        enter = v < thr.thr
        leave = ~(v < level)
    else:
        enter = v > thr.thr
        leave = ~(v > level)
    out: list[tuple[int, int]] = []
    for a, b in _face_runs(face):
        i = a
        if a > 0:
            # Re-acquired after a face loss: wait for the first frame that is not closed.
            not_closed = np.flatnonzero(~enter[a:b])
            if not_closed.size == 0:
                continue
            i = a + int(not_closed[0])
        n = b - i
        if n <= 0:
            continue
        marks = np.full(n, -1, dtype=np.int8)
        marks[leave[i:b]] = 0
        marks[enter[i:b]] = 1  # disjoint from `leave` when h >= 0
        idx = np.where(marks >= 0, np.arange(n), -1)
        np.maximum.accumulate(idx, out=idx)
        closed = np.where(idx >= 0, marks[np.maximum(idx, 0)], 0) == 1
        c = closed.astype(np.int8)
        dc = np.diff(np.concatenate(([0], c)))
        starts = np.flatnonzero(dc == 1)
        ends = np.flatnonzero(dc == -1)
        # A closure still in progress at the end of the run is dropped (face lost / end of recording).
        for s, e in zip(starts.tolist(), ends.tolist()):
            out.append((i + s, i + e))
    return out


def detect_fast(fa: FrameArrays, det_id: str, user: UserThresholds | None = None) -> list[Closure]:
    t = fa.t
    if det_id != "D5":
        sig, thr = detector_spec(det_id, user)
        kind = SIGNALS[sig].kind
        iv = hysteresis_intervals(fa.face, fa.signal(sig), kind, thr)
        return [Closure(float(t[s]), float(t[e]), float(t[e] - t[s]), "both") for s, e in iv]

    thr_l, thr_r = wink_thresholds(user)
    other_open_max = 0.3
    left = hysteresis_intervals(fa.face, fa.blinkL, "blend", thr_l)
    right = hysteresis_intervals(fa.face, fa.blinkR, "blend", thr_r)
    by_end: dict[int, Closure] = {}
    # Left first: when both eyes end a clean closure on the same frame, the TS keeps the left one.
    for (s, e) in left:
        if np.all(fa.blinkR[s:e] < other_open_max):
            by_end[e] = Closure(float(t[s]), float(t[e]), float(t[e] - t[s]), "left")
    for (s, e) in right:
        if e not in by_end and np.all(fa.blinkL[s:e] < other_open_max):
            by_end[e] = Closure(float(t[s]), float(t[e]), float(t[e] - t[s]), "right")
    return [by_end[e] for e in sorted(by_end)]


# ---------------------------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------------------------


def _main(argv: list[str]) -> int:
    from .load import read_log  # local import: load depends on numpy only

    if not argv:
        print(__doc__)
        return 2
    path = argv[0]
    s = read_log(path, require_frames=True, max_missing=1.0)
    frames = s.frame_dicts()
    timing = Timing.from_dict(s.header["timing"]) if "timing" in s.header else DEFAULT_TIMING
    out = replay_all(frames, timing, None)
    if "--detector" in argv:
        out = out[argv[argv.index("--detector") + 1]]
    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))


__all__ = [
    "Closure",
    "Timing",
    "DEFAULT_TIMING",
    "band",
    "bands_array",
    "segment",
    "Segment",
    "Threshold",
    "FIXED_EAR",
    "FIXED_BLEND",
    "HysteresisDetector",
    "WinkDetector",
    "UserThresholds",
    "make_detector",
    "detect_all",
    "Decoder",
    "MORSE",
    "encode",
    "replay",
    "replay_all",
    "decode_segments",
    "FrameArrays",
    "detect_fast",
]
