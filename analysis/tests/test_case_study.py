"""analysis/case_study.py: the Eyeblink8 summary and the exploratory single-session summary."""

from pathlib import Path

import pytest

from analysis.case_outputs import numbers, write_site
from analysis.case_study import public_summary, run, session_summary
from analysis.load import load_dataset
from analysis.replay import DEFAULT_TIMING
from analysis.synth import generate


def fake_public(before: list[float], after: list[float]) -> dict:
    videos = [
        {
            "video": str(i),
            "glasses": "NO",
            "minutes": 5.0,
            "fps": 30.0,
            "n_blinks": 10,
            "blink_ms": [150.0, 250.0, 300.0],
            "detectors": {
                "D1": {
                    "ftpm_no_reject": b,
                    "ftpm": a,
                    "blinks_detected": 8,
                    "n_detected": 9,
                    "closed_ms_all": [100.0, 150.0, 250.0, 400.0],
                    "matched_pairs_ms": [[250.0, 200.0], [300.0, 260.0]],
                }
            },
        }
        for i, (b, a) in enumerate(zip(before, after))
    ]
    det = {"reduction": 0.5, "blink_recall": 0.8, "detected_closed_ms": {"median": 200.0}, "frac_closed_below_reject": 0.4, "bands": {}}
    return {
        "dataset": "test",
        "n_videos": len(videos),
        "n_people": 2,
        "minutes": 5.0 * len(videos),
        "n_blinks": 10 * len(videos),
        "timing": DEFAULT_TIMING.to_dict(),
        "annotated_blink_ms": {"p5": 150.0, "median": 250.0, "p95": 300.0},
        "detectors": {"D1": det},
        "videos": videos,
    }


def test_public_summary_means_and_halving_criterion():
    s = public_summary(fake_public([10, 12, 8, 10], [4, 6, 4, 6]))
    d = s["detectors"]["D1"]
    # Sweep: at 0 ms all 4 closures count (4 / 5 min); at 200 ms two remain.
    assert d["sweep"]["ftpm"][0] == pytest.approx(0.8)
    assert d["sweep"]["ftpm"][d["sweep"]["reject_ms"].index(200)] == pytest.approx(0.4)
    assert d["halving_reject_ms"] == 160
    assert d["measured_minus_annotated_ms"]["median"] == pytest.approx(-45.0)
    assert d["ftpm_no_reject"]["mean"] == pytest.approx(10.0)
    assert d["ftpm"]["mean"] == pytest.approx(5.0)
    assert d["meets_halving_criterion"] is True
    assert s["annotated_frac_below_reject"] == pytest.approx(1 / 3)


def test_public_summary_not_halved():
    s = public_summary(fake_public([10, 10, 10], [8, 7, 9]))
    assert s["detectors"]["D1"]["meets_halving_criterion"] is False


@pytest.fixture(scope="module")
def synth_session(tmp_path_factory):
    d = tmp_path_factory.mktemp("synth")
    generate(d, n=1, seed=3, study_b=False, relabel=0)
    return load_dataset(d).study_a[0]


def test_session_summary_counts_every_cue(synth_session):
    cue_types = [
        {"cue_ms": c["t_ms"], "response_type": {"SHORT": "short", "LONG": "long", "WINK-L": "wink-L", "WINK-R": "wink-R"}[c["cue"]]}
        for c in synth_session.cues
        if c.get("cue") in ("SHORT", "LONG", "WINK-L", "WINK-R")
    ]
    s = session_summary(synth_session, cue_types, DEFAULT_TIMING)
    assert s["responses"]["n_cues"] == len(cue_types) == s["responses"]["n_match"]
    for d in ("D1", "D2", "D3", "D4", "D5"):
        r = s["reading"][d]
        assert r["ftpm"] <= r["ftpm_no_reject"]
        c = s["cue_response"][d]
        assert 0 <= c["correct"] <= c["n"]
    assert s["calibration"]["source"] == "cues"


def test_outputs_have_no_undefined_macros(tmp_path, synth_session):
    res = run(Path(synth_session.path).parent, tmp_path / "missing.json", DEFAULT_TIMING)
    assert res["public"] is None
    tex = numbers(res)
    assert "\\CS" in tex and "nan" not in tex.lower()
    assert (write_site(res, tmp_path)).exists()
