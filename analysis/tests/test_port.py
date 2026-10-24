"""Port checks against the TypeScript unit tests (tests/*.test.ts) and JS-generated test vectors."""

from __future__ import annotations

import pytest

from analysis.calibration import (
    closure_peak,
    fit_threshold,
    k_shot_indices,
    k_shot_thresholds,
    mad,
    median,
    mulberry32,
    sample,
)
from analysis.replay import DEFAULT_TIMING as T
from analysis.replay import PAUSE_WINDOW_MS, Closure, Decoder, band, encode, scale_timing, segment, valid_timing

# --- PRNG and sampling: vectors printed by the TypeScript implementation (node) ---------------


def test_mulberry32_matches_javascript():
    r = mulberry32(7)
    assert [r() for _ in range(5)] == [
        0.011704753153026104,
        0.06195825757458806,
        0.97690763277933,
        0.6990287057124078,
        0.5214452685322613,
    ]
    r2 = mulberry32(0xDEADBEEF)
    assert [r2() for _ in range(3)] == [0.9413696140982211, 0.26719574979506433, 0.772033357527107]


def test_sample_matches_javascript():
    assert sample([1, 2, 3, 4, 5], 3, mulberry32(7)) == [4, 2, 3]
    assert sample([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 4, mulberry32(42)) == [10, 80, 40, 60]


def test_k_shot_matches_javascript():
    fits = k_shot_thresholds("ear", [0.3, 0.31, 0.29], [0.05, 0.08, 0.1, 0.12, 0.07, 0.09], 3, 3, 1)
    assert [[f.thr, f.h, f.closedMedian] for f in fits] == [[0.19, 0.022, 0.08], [0.185, 0.023, 0.07], [0.19, 0.022, 0.08]]


def test_k_shot_indices_follow_the_same_draws():
    peaks = [0.05, 0.08, 0.1, 0.12, 0.07, 0.09]
    idx = k_shot_indices(len(peaks), 3, 3, 1)
    fits = k_shot_thresholds("ear", [0.3, 0.31, 0.29], peaks, 3, 3, 1)
    for i, f in zip(idx, fits):
        assert fit_threshold("ear", [0.3, 0.31, 0.29], [peaks[j] for j in i]).thr == f.thr


# --- calibration (tests/calibration.test.ts) ---------------------------------------------------


def test_median_mad():
    assert median([3, 1, 2]) == 2
    assert median([4, 1, 2, 3]) == 2.5
    assert mad([1, 2, 3, 4, 100]) == 1


def test_fit_threshold_ear_and_blend():
    c = fit_threshold("ear", [0.3, 0.31, 0.29, 0.3], [0.1, 0.09, 0.11])
    assert c.thr == pytest.approx(0.2) and c.h == pytest.approx(0.02) and c.ok
    b = fit_threshold("blend", [0.05, 0.1, 0.05], [0.85, 0.95, 0.9])
    assert b.thr == pytest.approx(0.475) and b.h == pytest.approx(0.085) and b.ok


def test_fit_threshold_warnings():
    assert not fit_threshold("ear", [0.25, 0.26], [0.23, 0.24]).ok
    assert "too similar" in fit_threshold("ear", [0.25, 0.26], [0.23, 0.24]).warning
    assert not fit_threshold("blend", [0.8], [0.1]).ok
    assert not fit_threshold("ear", [], []).ok


def test_closure_peak():
    assert closure_peak("ear", [0.3, 0.1, 0.2]) == 0.1
    assert closure_peak("blend", [0.3, 0.9, 0.2]) == 0.9


# --- segmenter (tests/segmenter.test.ts) -------------------------------------------------------


@pytest.mark.parametrize(
    "d,expected",
    [(0, "reject"), (199, "reject"), (200, "dot"), (599, "dot"), (600, "dash"), (1399, "dash"), (1400, "hold"), (1999, "hold"), (2000, "backspace")],
)
def test_bands(d, expected):
    assert band(d, T) == expected


def test_presets_round_like_javascript():
    assert scale_timing(T, 1.5).dotMaxMs == 900
    assert scale_timing(T, 0.7).rejectMs == 140
    assert valid_timing(T)


# --- decoder (tests/decoder.test.ts) -----------------------------------------------------------

DUR = {"reject": 120, "dot": 350, "dash": 900, "hold": 1600, "backspace": 2300}


class Driver:
    def __init__(self) -> None:
        self.dec = Decoder(T, True)
        self.t = 0.0
        self.actions: list[dict] = []

    def close(self, b: str, eye: str = "both") -> "Driver":
        d = DUR[b]
        self.actions += self.dec.push(segment(Closure(self.t, self.t + d, d, eye), T))
        self.t += d
        return self

    def wait(self, ms: float) -> "Driver":
        end = self.t + ms
        while self.t < end:
            self.actions += self.dec.tick(self.t, False)
            self.t += 33
        self.t = end
        self.actions += self.dec.tick(self.t, False)
        return self

    def letter(self, pattern: str, gap: float = 300) -> "Driver":
        for i, s in enumerate(pattern):
            self.close("dot" if s == "." else "dash")
            if i < len(pattern) - 1:
                self.wait(gap)
        return self


def test_hello_world():
    d = Driver()
    for p in ["....", ".", ".-..", ".-..", "---"]:
        d.letter(p).wait(T.letterGapMs)
    d.wait(T.wordGapMs)
    for p in [".--", "---", ".-.", ".-..", "-.."]:
        d.letter(p).wait(T.letterGapMs)
    assert d.dec.text == "HELLO WORLD"


def test_unknown_backspace_and_spaces():
    d = Driver()
    d.letter("......").wait(T.letterGapMs)
    assert d.dec.text == "" and {"type": "unknown", "pattern": "......"} in d.actions
    d.letter(".-").wait(T.letterGapMs).letter("..").wait(300).close("backspace").wait(T.letterGapMs)
    assert d.dec.text == "A"
    d.wait(T.wordGapMs * 3)
    assert d.dec.text == "A "
    d.close("backspace").wait(T.wordGapMs * 2)
    assert d.dec.text == "A"


def test_pause_toggle_and_winks():
    d = Driver()
    d.close("hold").wait(1000).close("hold")
    assert d.dec.paused
    d.wait(500).letter("...").wait(T.letterGapMs)
    assert d.dec.text == ""
    d.close("hold").wait(800).close("hold").wait(500)
    assert not d.dec.paused
    d.letter("....").wait(300).close("dot", "left")
    assert d.dec.text == "H "
    d.close("dot", "right")
    assert {"type": "speak", "text": "H"} in d.actions
    e = Driver()
    e.close("hold").wait(PAUSE_WINDOW_MS + 100).close("hold")
    assert not e.dec.paused


def test_encode():
    assert encode("hi") == ".... .."
    assert encode("sos sos") == "... --- ... / ... --- ..."
