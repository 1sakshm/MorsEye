from __future__ import annotations

import math

import pytest

from analysis.load import Label
from analysis.metrics import (
    cpm,
    evaluate,
    iou,
    match_events,
    msd,
    msd_error_rate,
    prf,
    score_phrase,
    text_errors,
)
from analysis.replay import DEFAULT_TIMING, Closure

BLOCKS = {"spontaneous": (0.0, 60000.0), "deliberate": (60000.0, 120000.0)}


def C(s: float, e: float, eye: str = "both") -> Closure:
    return Closure(s, e, e - s, eye)


def test_iou():
    assert iou(0, 10, 0, 10) == 1
    assert iou(0, 10, 5, 15) == pytest.approx(5 / 15)
    assert iou(0, 10, 10, 20) == 0
    assert iou(0, 10, 20, 30) == 0


def test_match_is_one_to_one_and_respects_threshold():
    det = [(0, 100), (90, 200), (500, 600)]
    lab = [(0, 110), (520, 900)]
    pairs = match_events(det, lab, 0.3)
    assert [(i, j) for i, j, _ in pairs] == [(0, 0)]  # (500,600) vs (520,900): IoU 80/400 = 0.2 < 0.3
    # Two detections on one label: the better one wins, the other stays unmatched.
    pairs = match_events([(0, 100), (10, 100)], [(10, 100)], 0.3)
    assert [(i, j) for i, j, _ in pairs] == [(1, 0)]


def test_match_at_exactly_the_threshold():
    # IoU = 30/100 = 0.3 exactly counts as a match.
    assert match_events([(0, 100)], [(70, 100)], 0.3) != []


def test_prf():
    assert prf(8, 2, 2) == (0.8, 0.8, pytest.approx(0.8))
    assert prf(0, 0, 5)[2] == 0
    assert math.isnan(prf(0, 0, 0)[2])


def test_evaluate_both_eye_detector():
    labels = [
        Label(10000, 10150, "spontaneous"),
        Label(20000, 20350, "spontaneous"),  # long spontaneous blink: survives the reject window
        Label(61000, 61400, "short"),
        Label(65000, 66000, "long"),
        Label(70000, 70500, "wink-L"),
        Label(80000, 80400, "short"),  # missed
    ]
    closures = [
        C(10010, 10140),  # rejected (< 200 ms): no false trigger
        C(20020, 20340),  # false trigger while reading
        C(61020, 61390),  # hit, dot
        C(65030, 65980),  # hit, dash
        C(70010, 70480),  # matches a wink label: ignored by default policy
        C(90000, 90400),  # unmatched: false alarm
    ]
    ev = evaluate(closures, labels, BLOCKS, DEFAULT_TIMING, "both")
    assert (ev.tp, ev.fp, ev.fn) == (2, 2, 1)
    assert ev.blocks["deliberate"].wink_triggers == 1
    assert ev.false_triggers == 1
    assert ev.false_triggers_no_reject == 2
    assert ev.ftpm == pytest.approx(1.0)
    assert ev.ftpm_no_reject == pytest.approx(2.0)
    assert ev.duration_errors == [pytest.approx(-30), pytest.approx(-50)]
    assert ev.confusion["short"]["dot"] == 1 and ev.confusion["short"]["missed"] == 1
    assert ev.confusion["long"]["dash"] == 1
    assert ev.short_long_accuracy == 1.0

    strict = evaluate(closures, labels, BLOCKS, DEFAULT_TIMING, "both", wink_policy="fp")
    assert strict.fp == 3


def test_evaluate_wink_detector_requires_the_right_eye():
    labels = [Label(61000, 61500, "wink-L"), Label(70000, 70500, "wink-R"), Label(80000, 80400, "short")]
    closures = [C(61010, 61490, "left"), C(70010, 70490, "left"), C(80010, 80390, "right")]
    ev = evaluate(closures, labels, BLOCKS, DEFAULT_TIMING, "wink")
    assert (ev.tp, ev.fp, ev.fn) == (1, 2, 1)


def test_msd_examples():
    # Soukoreff & MacKenzie's example: "quickly" entered as "qucehkly" has MSD 3.
    assert msd("quickly", "qucehkly") == 3
    assert msd_error_rate("quickly", "qucehkly") == pytest.approx(3 / 8)
    assert msd("the quick brown fox", "the quixk brown fox") == 1
    assert msd("", "") == 0
    assert msd("abc", "") == 3


def test_unified_error_rates():
    # P = "the cat", T = "the bat" (1 uncorrected), 2 characters erased and retyped on the way.
    e = text_errors("the cat", "THE BAT ", erased_chars=2, fixes=2)
    assert (e.C, e.INF, e.IF) == (6, 1, 2)
    assert e.uncorrected == pytest.approx(1 / 9)
    assert e.corrected == pytest.approx(2 / 9)
    assert e.total_er == pytest.approx(3 / 9)


def test_cpm():
    assert cpm(10, 60000) == 10
    assert math.isnan(cpm(0, 60000))


def test_score_phrase_from_actions():
    acts = [
        {"type": "symbol", "symbol": ".", "pattern": ".", "t_ms": 1000},
        {"type": "letter", "char": "E", "pattern": ".", "t_ms": 2500},
        {"type": "symbol", "symbol": "-", "pattern": "-", "t_ms": 3000},
        {"type": "letter", "char": "T", "pattern": "-", "t_ms": 4500},
        {"type": "backspace", "removed": "T", "what": "char", "t_ms": 7000},
        {"type": "symbol", "symbol": "-", "pattern": "-", "t_ms": 8000},
        {"type": "symbol", "symbol": "-", "pattern": "--", "t_ms": 9000},
        {"type": "letter", "char": "M", "pattern": "--", "t_ms": 13000},
        {"type": "ignored", "band": "reject", "t_ms": 13500},
    ]
    r = score_phrase("B1", 0, "em", "EM", acts)
    assert r.n_chars == 2
    assert r.ms == 12000
    assert r.cpm == pytest.approx(10)
    assert (r.errors.INF, r.errors.IF) == (0, 1)
    assert r.closures == 5  # 4 symbols + 1 backspace; the rejected blink does not count
    assert r.closures_per_char == 2.5


def test_score_phrase_prefers_closure_records_for_timing():
    acts = [
        {"type": "segment", "band": "dot", "start_ms": 600, "t_ms": 1000},
        {"type": "symbol", "symbol": ".", "pattern": ".", "t_ms": 1000},
        {"type": "letter", "char": "E", "pattern": ".", "t_ms": 6600},
    ]
    r = score_phrase("B1", 0, "e", "E", acts)
    assert r.ms == 6000
    assert r.cpm == pytest.approx(10)
