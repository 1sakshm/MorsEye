"""Read and validate session logs (``morseye-log/1`` JSONL, see src/study/schema.ts) and label CSVs.

A log is refused (``MissingFramesError``) when more than 5% of its frames are missing, judged from
gaps against the median frame interval. Frames without a face are *not* missing: they are logged
with ``face: false``.

Expected files in a data directory (any sub-folder):
    P07_A_2026-11-03.jsonl            Study A session log (the recorder's file name)
    P07_A_labels.csv                  human labels for it (or <log stem>_labels.csv)
    P07_A_labels_relabel.csv          optional second labelling pass, for self-agreement
    P07_B_2026-11-09.jsonl            Study B session log
"""

from __future__ import annotations

import csv
import json
import re
import warnings
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

import numpy as np

from .config import MAX_MISSING_FRAC
from .replay import FrameArrays

LOG_SCHEMA = "morseye-log/1"

LABEL_TYPES = ("spontaneous", "short", "long", "wink-L", "wink-R")
LABEL_ALIASES = {
    "deliberate-short": "short",
    "deliberate_short": "short",
    "deliberate-long": "long",
    "deliberate_long": "long",
    "wink-l": "wink-L",
    "wink_l": "wink-L",
    "winkl": "wink-L",
    "wink-r": "wink-R",
    "wink_r": "wink-R",
    "winkr": "wink-R",
    "spont": "spontaneous",
}
DELIBERATE = ("short", "long")
WINKS = ("wink-L", "wink-R")

HEADER_REQUIRED = ("schema", "participant", "session", "study", "seed", "timing")
FRAME_REQUIRED = ("t_ms", "face", "earL", "earR", "blinkL", "blinkR", "yaw", "pitch", "roll")
KNOWN_TYPES = {"header", "frame", "block", "cue", "phrase", "action", "tlx", "fps"}
ID_RE = re.compile(r"^[A-Z][A-Z0-9_-]*$")
PUBLIC_ID_RE = re.compile(r"^P\d{2,}$")
MAX_EYE_PTS = 24  # 12 eye points (6 per eye), x and y: the only landmarks the public data may hold


class LogError(Exception):
    """A log or label file that cannot be used."""


class SchemaError(LogError):
    pass


class MissingFramesError(LogError):
    pass


@dataclass(frozen=True)
class Label:
    onset_ms: float
    offset_ms: float
    type: str
    labeller: str = ""
    labelled_at: str = ""

    @property
    def duration_ms(self) -> float:
        return self.offset_ms - self.onset_ms


@dataclass
class Frames:
    t: np.ndarray
    face: np.ndarray
    earL: np.ndarray
    earR: np.ndarray
    blinkL: np.ndarray
    blinkR: np.ndarray
    yaw: np.ndarray
    pitch: np.ndarray
    roll: np.ndarray
    n_faces: np.ndarray

    def __len__(self) -> int:
        return int(self.t.size)

    def arrays(self) -> FrameArrays:
        return FrameArrays(t=self.t, face=self.face, earL=self.earL, earR=self.earR, blinkL=self.blinkL, blinkR=self.blinkR)

    def select(self, t0: float, t1: float) -> np.ndarray:
        """Boolean mask of frames with t0 <= t < t1."""
        return (self.t >= t0) & (self.t < t1)


@dataclass
class Session:
    path: Path
    header: dict[str, Any]
    frames: Frames
    blocks: dict[str, tuple[float, float]]
    cues: list[dict[str, Any]] = field(default_factory=list)
    phrases: list[dict[str, Any]] = field(default_factory=list)
    actions: list[dict[str, Any]] = field(default_factory=list)
    tlx: list[dict[str, Any]] = field(default_factory=list)
    fps_lines: list[dict[str, Any]] = field(default_factory=list)
    missing_frac: float = 0.0
    median_dt: float = float("nan")
    labels: list[Label] | None = None
    relabels: list[Label] | None = None
    label_path: Path | None = None
    warnings: list[str] = field(default_factory=list)

    @property
    def participant(self) -> str:
        return str(self.header["participant"])

    @property
    def study(self) -> str:
        return str(self.header["study"])

    @property
    def seed(self) -> int:
        return int(self.header["seed"])

    @property
    def synthetic(self) -> bool:
        notes = str(self.header.get("setup", {}).get("notes", ""))
        return self.header.get("app_version") == "synthetic" or "SYNTHETIC" in notes.upper()

    @property
    def measured_fps(self) -> float:
        return 1000.0 / self.median_dt if self.median_dt and np.isfinite(self.median_dt) else float("nan")

    @property
    def face_frac(self) -> float:
        return float(self.frames.face.mean()) if len(self.frames) else float("nan")

    def frame_dicts(self) -> list[dict[str, Any]]:
        f = self.frames
        return [
            {
                "t_ms": float(f.t[i]),
                "face": bool(f.face[i]),
                "earL": float(f.earL[i]),
                "earR": float(f.earR[i]),
                "blinkL": float(f.blinkL[i]),
                "blinkR": float(f.blinkR[i]),
                "yaw": float(f.yaw[i]),
                "pitch": float(f.pitch[i]),
                "roll": float(f.roll[i]),
            }
            for i in range(len(f))
        ]

    def block_minutes(self, name: str) -> float:
        b = self.blocks.get(name)
        return (b[1] - b[0]) / 60000.0 if b else float("nan")

    def cues_in(self, block: str) -> list[dict[str, Any]]:
        return [c for c in self.cues if c.get("block") == block]


def _num(x: Any) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def missing_fraction(t: np.ndarray) -> tuple[float, float]:
    """(fraction of frames missing, median frame interval). Gaps longer than 1.5 median intervals
    count round(gap / median) - 1 missing frames."""
    if t.size < 2:
        return 0.0, float("nan")
    dt = np.diff(t)
    med = float(np.median(dt))
    if med <= 0:
        return 0.0, med
    gaps = dt[dt > 1.5 * med]
    missing = float(np.sum(np.maximum(0, np.floor(gaps / med + 0.5) - 1)))
    return missing / (t.size + missing), med


def read_log(path: str | Path, require_frames: bool = True, max_missing: float = MAX_MISSING_FRAC) -> Session:
    path = Path(path)
    header: dict[str, Any] | None = None
    frames: list[dict[str, Any]] = []
    blocks_start: dict[str, float] = {}
    blocks_end: dict[str, float] = {}
    cues: list[dict[str, Any]] = []
    phrases: list[dict[str, Any]] = []
    actions: list[dict[str, Any]] = []
    tlx: list[dict[str, Any]] = []
    fps_lines: list[dict[str, Any]] = []
    warns: list[str] = []
    unknown: dict[str, int] = {}

    with path.open(encoding="utf-8") as fh:
        for lineno, raw in enumerate(fh, start=1):
            if not raw.strip():
                continue
            try:
                line = json.loads(raw)
            except json.JSONDecodeError as e:
                raise SchemaError(f"{path.name}:{lineno}: not JSON ({e.msg})") from None
            if not isinstance(line, dict) or "type" not in line:
                raise SchemaError(f"{path.name}:{lineno}: each line must be an object with a 'type'")
            kind = line["type"]
            if header is None:
                if kind != "header":
                    raise SchemaError(f"{path.name}:{lineno}: the first line must be the header")
                missing = [k for k in HEADER_REQUIRED if k not in line]
                if missing:
                    raise SchemaError(f"{path.name}: header is missing {missing}")
                if line["schema"] != LOG_SCHEMA:
                    raise SchemaError(f"{path.name}: schema {line['schema']!r}, expected {LOG_SCHEMA!r}")
                pid = str(line["participant"])
                if not ID_RE.match(pid):
                    raise SchemaError(f"{path.name}: participant ID {pid!r} must look like P01 (never a name)")
                if not PUBLIC_ID_RE.match(pid):
                    warns.append(f"participant ID {pid!r} is not of the form P01")
                if line["study"] not in ("A", "B", "calib"):
                    raise SchemaError(f"{path.name}: unknown study {line['study']!r}")
                header = line
                continue
            if kind == "header":
                raise SchemaError(f"{path.name}:{lineno}: second header line")
            if kind == "frame":
                bad = [k for k in FRAME_REQUIRED if k not in line]
                if bad:
                    raise SchemaError(f"{path.name}:{lineno}: frame is missing {bad}")
                if not _num(line["t_ms"]) or not isinstance(line["face"], bool):
                    raise SchemaError(f"{path.name}:{lineno}: frame t_ms must be a number and face a boolean")
                pts = line.get("eye_pts", [])
                if not isinstance(pts, list) or len(pts) not in (0, MAX_EYE_PTS):
                    raise SchemaError(
                        f"{path.name}:{lineno}: eye_pts must hold 0 or {MAX_EYE_PTS} numbers (12 eye points only)"
                    )
                frames.append(line)
            elif kind == "block":
                (blocks_start if line.get("phase") == "start" else blocks_end)[str(line["block"])] = float(line["t_ms"])
            elif kind == "cue":
                cues.append(line)
            elif kind == "phrase":
                phrases.append(line)
            elif kind == "action":
                actions.append(line)
            elif kind == "tlx":
                tlx.append(line)
            elif kind == "fps":
                fps_lines.append(line)
            else:
                unknown[kind] = unknown.get(kind, 0) + 1

    if header is None:
        raise SchemaError(f"{path.name}: empty file")
    for k, n in unknown.items():
        warns.append(f"ignored {n} line(s) of unknown type {k!r}")

    if require_frames and len(frames) < 2:
        raise SchemaError(f"{path.name}: no frames")

    def col(k: str, dtype: Any = float, default: Any = 0) -> np.ndarray:
        return np.fromiter((f.get(k, default) for f in frames), dtype=dtype, count=len(frames))

    fr = Frames(
        t=col("t_ms"),
        face=col("face", bool, False),
        earL=col("earL"),
        earR=col("earR"),
        blinkL=col("blinkL"),
        blinkR=col("blinkR"),
        yaw=col("yaw"),
        pitch=col("pitch"),
        roll=col("roll"),
        n_faces=col("n_faces", int, 1),
    )
    if fr.t.size > 1 and np.any(np.diff(fr.t) <= 0):
        i = int(np.flatnonzero(np.diff(fr.t) <= 0)[0])
        raise SchemaError(f"{path.name}: frame timestamps must increase (frame {i + 1})")

    miss, med = missing_fraction(fr.t)
    if fr.t.size and miss > max_missing:
        raise MissingFramesError(
            f"{path.name}: {miss:.1%} of frames missing (limit {max_missing:.0%}, median interval {med:.1f} ms)"
        )

    last_t = float(fr.t[-1]) if fr.t.size else max(
        [float(x["t_ms"]) for x in [*cues, *phrases, *actions, *tlx]] or [0.0]
    )
    blocks: dict[str, tuple[float, float]] = {}
    for name, start in blocks_start.items():
        end = blocks_end.get(name)
        if end is None:
            warns.append(f"block {name!r} has no end line; using the last frame")
            end = last_t
        blocks[name] = (start, end)

    return Session(
        path=path,
        header=header,
        frames=fr,
        blocks=blocks,
        cues=sorted(cues, key=lambda c: c["t_ms"]),
        phrases=phrases,
        actions=sorted(actions, key=lambda a: a["t_ms"]),
        tlx=tlx,
        fps_lines=fps_lines,
        missing_frac=miss,
        median_dt=med,
        warnings=warns,
    )


def normalise_type(raw: str) -> str:
    s = raw.strip()
    if s in LABEL_TYPES:
        return s
    a = LABEL_ALIASES.get(s.lower())
    if a is None:
        raise SchemaError(f"unknown label type {raw!r} (expected one of {', '.join(LABEL_TYPES)})")
    return a


def read_labels(path: str | Path) -> list[Label]:
    path = Path(path)
    out: list[Label] = []
    with path.open(encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        cols = [c.strip() for c in (reader.fieldnames or [])]
        for need in ("onset_ms", "offset_ms", "type"):
            if need not in cols:
                raise SchemaError(f"{path.name}: missing column {need!r}")
        for i, row in enumerate(reader, start=2):
            row = {k.strip(): (v or "").strip() for k, v in row.items() if k is not None}
            try:
                on, off = float(row["onset_ms"]), float(row["offset_ms"])
            except ValueError:
                raise SchemaError(f"{path.name}:{i}: onset_ms/offset_ms must be numbers") from None
            if not off > on:
                raise SchemaError(f"{path.name}:{i}: offset_ms must be after onset_ms")
            try:
                typ = normalise_type(row["type"])
            except SchemaError as e:
                raise SchemaError(f"{path.name}:{i}: {e}") from None
            out.append(Label(on, off, typ, row.get("labeller", ""), row.get("labelled_at", "")))
    out.sort(key=lambda l: (l.onset_ms, l.offset_ms))
    return out


def _label_candidates(log: Path, header: dict[str, Any]) -> tuple[list[Path], list[Path]]:
    pid, study = header["participant"], header["study"]
    d = log.parent
    first = [d / f"{log.stem}_labels.csv", d / f"{pid}_{study}_labels.csv"]
    second = [d / f"{log.stem}_labels_relabel.csv", d / f"{pid}_{study}_labels_relabel.csv"]
    return first, second


@dataclass
class Dataset:
    study_a: list[Session]
    study_b: list[Session]
    rejected: list[tuple[str, str]]
    warnings: list[str]

    @property
    def synthetic(self) -> bool:
        return any(s.synthetic for s in [*self.study_a, *self.study_b])


def _logs(data_dir: Path) -> Iterable[Path]:
    return sorted(p for p in data_dir.rglob("*.jsonl") if p.is_file())


def load_dataset(data_dir: str | Path, max_missing: float = MAX_MISSING_FRAC) -> Dataset:
    data_dir = Path(data_dir)
    a: list[Session] = []
    b: list[Session] = []
    rejected: list[tuple[str, str]] = []
    warns: list[str] = []
    seen: set[tuple[str, str]] = set()
    for p in _logs(data_dir):
        try:
            # Study B is scored from the phrase/action log, so it may come without frames.
            with p.open(encoding="utf-8") as fh:
                first = json.loads(fh.readline() or "{}")
            s = read_log(p, require_frames=first.get("study") != "B", max_missing=max_missing)
        except LogError as e:
            rejected.append((str(p), str(e)))
            continue
        except (OSError, json.JSONDecodeError) as e:
            rejected.append((str(p), f"unreadable: {e}"))
            continue
        key = (s.participant, s.study)
        if key in seen:
            warns.append(f"{p.name}: a second {s.study} log for {s.participant}; sessions are kept separately")
        seen.add(key)
        for w in s.warnings:
            warns.append(f"{p.name}: {w}")
        if s.study == "A":
            first_c, second_c = _label_candidates(p, s.header)
            lp = next((c for c in first_c if c.exists()), None)
            if lp is not None:
                try:
                    s.labels = read_labels(lp)
                    s.label_path = lp
                except LogError as e:
                    rejected.append((str(lp), str(e)))
            else:
                warns.append(f"{p.name}: no label file; this session is skipped in the detection analysis")
            rp = next((c for c in second_c if c.exists()), None)
            if rp is not None:
                try:
                    s.relabels = read_labels(rp)
                except LogError as e:
                    rejected.append((str(rp), str(e)))
            a.append(s)
        elif s.study == "B":
            b.append(s)
    return Dataset(study_a=a, study_b=b, rejected=rejected, warnings=warns)


def warn_rejected(ds: Dataset) -> None:
    for path, why in ds.rejected:
        warnings.warn(f"refused {path}: {why}", stacklevel=2)
