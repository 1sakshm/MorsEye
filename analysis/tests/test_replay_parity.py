"""The Python port must reproduce the TypeScript pipeline exactly (PRD §9: max difference 0 events).

The fixture and its expected output are made by `npm run replay -- --make-fixture`
(scripts/replay.ts) and are also checked by tests/replay.test.ts on the TypeScript side.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from analysis.load import read_log
from analysis.replay import (
    DETECTOR_IDS,
    FrameArrays,
    Threshold,
    Timing,
    UserThresholds,
    decode_segments,
    detect_all,
    detect_fast,
    make_detector,
    replay,
    replay_all,
    segment,
)

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "tests" / "fixtures" / "replay_sample.jsonl"
EXPECTED = ROOT / "tests" / "fixtures" / "replay_expected.json"


@pytest.fixture(scope="module")
def fixture():
    lines = [json.loads(l) for l in FIXTURE.read_text(encoding="utf-8").splitlines() if l.strip()]
    frames = [l for l in lines if l["type"] == "frame"]
    expected = json.loads(EXPECTED.read_text(encoding="utf-8"))
    return frames, expected


def test_line_for_line_port_matches_typescript(fixture):
    frames, expected = fixture
    got = replay_all(frames, Timing.from_dict(expected["timing"]), UserThresholds.from_dict(expected["user"]))
    assert set(got) == set(expected["results"])
    for det in DETECTOR_IDS:
        want = expected["results"][det]
        assert len(got[det]["closures"]) == len(want["closures"]), det  # 0 events difference
        assert got[det]["closures"] == want["closures"], det
        assert got[det]["bands"] == want["bands"], det
        assert got[det]["text"] == want["text"], det


def test_vectorised_detectors_match_typescript(fixture):
    frames, expected = fixture
    timing = Timing.from_dict(expected["timing"])
    user = UserThresholds.from_dict(expected["user"])
    fa = FrameArrays.from_dicts(frames)
    for det in DETECTOR_IDS:
        fast = detect_fast(fa, det, user)
        assert [c.to_dict() for c in fast] == expected["results"][det]["closures"], det
        text, _ = decode_segments([segment(c, timing) for c in fast], timing, det == "D5")
        assert text == expected["results"][det]["text"], det


def test_fixture_passes_log_validation():
    s = read_log(FIXTURE)
    assert s.study == "A"
    assert s.missing_frac == 0
    assert len(s.frames) == sum(1 for l in FIXTURE.read_text(encoding="utf-8").splitlines() if '"frame"' in l)


def _random_frames(rng: np.random.Generator, n: int) -> list[dict]:
    """Noisy open/closed signal with face losses: stresses hysteresis edges and re-acquisition."""
    t = np.cumsum(rng.uniform(25, 45, n))
    closed = np.zeros(n, dtype=bool)
    i = 0
    while i < n:
        i += int(rng.integers(5, 40))
        closed[i : i + int(rng.integers(1, 30))] = True
        i += 30
    face = rng.random(n) > 0.02
    for _ in range(3):
        k = int(rng.integers(0, n - 10))
        face[k : k + int(rng.integers(1, 8))] = False
    wink = rng.random(n) < 0.15
    out = []
    for k in range(n):
        if not face[k]:
            out.append({"t_ms": float(t[k]), "face": False, "earL": 0.0, "earR": 0.0, "blinkL": 0.0, "blinkR": 0.0})
            continue
        e = (0.1 if closed[k] else 0.3) + rng.normal(0, 0.04)
        b = (0.85 if closed[k] else 0.1) + rng.normal(0, 0.15)
        bl, br = (b, 0.1 + rng.normal(0, 0.1)) if wink[k] else (b, b + rng.normal(0, 0.1))
        out.append({"t_ms": float(t[k]), "face": True, "earL": e, "earR": e + rng.normal(0, 0.02), "blinkL": bl, "blinkR": br})
    return out


@pytest.mark.parametrize("seed", range(12))
def test_vectorised_equals_line_for_line_on_random_data(seed):
    rng = np.random.default_rng(seed)
    frames = _random_frames(rng, 3000)
    fa = FrameArrays.from_dicts(frames)
    h = 0.0 if seed % 4 == 0 else float(rng.uniform(0.005, 0.05))
    user = UserThresholds(
        ear=Threshold(float(rng.uniform(0.15, 0.25)), h),
        blend=Threshold(float(rng.uniform(0.3, 0.7)), h * 4),
        blendL=Threshold(float(rng.uniform(0.3, 0.7)), h * 4),
        blendR=Threshold(float(rng.uniform(0.3, 0.7)), h * 4),
    )
    timing = Timing(rejectMs=200, dotMaxMs=600, dashMaxMs=1400, cmdMs=2000, letterGapMs=1200, wordGapMs=3000)
    for det in DETECTOR_IDS:
        ref = detect_all(make_detector(det, user), frames)
        assert detect_fast(fa, det, user) == ref, det
        r = replay(frames, det, timing, user, det == "D5")
        text, actions = decode_segments([segment(c, timing) for c in ref], timing, det == "D5")
        assert text == r.text, det
        assert actions == r.actions, det
