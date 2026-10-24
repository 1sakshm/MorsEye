from __future__ import annotations

import json
from pathlib import Path

import pytest

from analysis.load import (
    MissingFramesError,
    SchemaError,
    load_dataset,
    missing_fraction,
    read_labels,
    read_log,
)
import numpy as np

HEADER = {
    "type": "header",
    "schema": "morseye-log/1",
    "app_version": "test",
    "participant": "P01",
    "session": 1,
    "study": "A",
    "seed": 1,
    "timing": {"rejectMs": 200, "dotMaxMs": 600, "dashMaxMs": 1400, "cmdMs": 2000, "letterGapMs": 1200, "wordGapMs": 3000},
}


def frame(t: float, face: bool = True, **kw) -> dict:
    return {"type": "frame", "t_ms": t, "face": face, "earL": 0.3, "earR": 0.3, "blinkL": 0.1, "blinkR": 0.1, "yaw": 0, "pitch": 0, "roll": 0, **kw}


def write(path: Path, lines: list[dict]) -> Path:
    path.write_text("\n".join(json.dumps(l) for l in lines) + "\n", encoding="utf-8")
    return path


def test_reads_a_valid_log(tmp_path):
    lines = [HEADER, {"type": "block", "t_ms": 0, "block": "spontaneous", "phase": "start"}]
    lines += [frame(i * 33.3) for i in range(100)]
    lines += [{"type": "block", "t_ms": 3300, "block": "spontaneous", "phase": "end"}]
    s = read_log(write(tmp_path / "P01_A.jsonl", lines))
    assert s.participant == "P01" and len(s.frames) == 100
    assert s.blocks["spontaneous"] == (0, 3300)
    assert s.measured_fps == pytest.approx(30, rel=0.01)


def test_refuses_more_than_5_percent_missing_frames(tmp_path):
    ts = [i * 33.3 for i in range(100) if not (20 <= i < 28)]  # 8 of 100 missing
    with pytest.raises(MissingFramesError):
        read_log(write(tmp_path / "x.jsonl", [HEADER] + [frame(t) for t in ts]))
    ts = [i * 33.3 for i in range(100) if not (20 <= i < 23)]  # 3 of 100: fine
    assert read_log(write(tmp_path / "y.jsonl", [HEADER] + [frame(t) for t in ts])).missing_frac == pytest.approx(0.03)


def test_frames_without_a_face_are_not_missing(tmp_path):
    lines = [HEADER] + [frame(i * 33.3, face=i % 3 != 0) for i in range(60)]
    s = read_log(write(tmp_path / "z.jsonl", lines))
    assert s.missing_frac == 0 and s.face_frac == pytest.approx(40 / 60)


def test_missing_fraction():
    t = np.array([0, 33, 66, 165, 198], dtype=float)  # one gap of 3 intervals = 2 missing
    miss, med = missing_fraction(t)
    assert med == pytest.approx(33)
    assert miss == pytest.approx(2 / 7)


@pytest.mark.parametrize(
    "bad",
    [
        {**HEADER, "schema": "other/1"},
        {**HEADER, "participant": "Saksham"},  # names are refused
        {k: v for k, v in HEADER.items() if k != "seed"},
        {**HEADER, "study": "Z"},
    ],
)
def test_header_validation(tmp_path, bad):
    with pytest.raises(SchemaError):
        read_log(write(tmp_path / "bad.jsonl", [bad] + [frame(i * 33.3) for i in range(10)]))


def test_privacy_guard_on_landmarks(tmp_path):
    lines = [HEADER] + [frame(i * 33.3, eye_pts=[0.1] * 24) for i in range(5)]
    read_log(write(tmp_path / "ok.jsonl", lines))
    lines = [HEADER] + [frame(i * 33.3, eye_pts=[0.1] * 956) for i in range(5)]  # a full face mesh
    with pytest.raises(SchemaError):
        read_log(write(tmp_path / "face.jsonl", lines))


def test_non_increasing_timestamps(tmp_path):
    with pytest.raises(SchemaError):
        read_log(write(tmp_path / "t.jsonl", [HEADER, frame(0), frame(33), frame(33)]))


def test_labels_and_aliases(tmp_path):
    p = tmp_path / "P01_A_labels.csv"
    p.write_text(
        "onset_ms,offset_ms,type,labeller,labelled_at\n"
        "500,700,deliberate-short,SS,2026-11-01T10:00:00\n"
        "100,250,spontaneous,SS,2026-11-01T10:00:05\n"
        "900,1300,wink-l,SS,2026-11-01T10:00:09\n",
        encoding="utf-8",
    )
    labs = read_labels(p)
    assert [l.type for l in labs] == ["spontaneous", "short", "wink-L"]  # sorted by onset
    assert labs[1].duration_ms == 200
    p.write_text("onset_ms,offset_ms,type\n500,400,short\n", encoding="utf-8")
    with pytest.raises(SchemaError):
        read_labels(p)
    p.write_text("onset_ms,offset_ms,type\n500,600,blink\n", encoding="utf-8")
    with pytest.raises(SchemaError):
        read_labels(p)


def test_dataset_attaches_labels_and_records_refusals(tmp_path):
    write(tmp_path / "P01_A_2026-11-03.jsonl", [HEADER] + [frame(i * 33.3) for i in range(50)])
    (tmp_path / "P01_A_labels.csv").write_text("onset_ms,offset_ms,type\n100,300,short\n", encoding="utf-8")
    (tmp_path / "P01_A_labels_relabel.csv").write_text("onset_ms,offset_ms,type\n110,290,short\n", encoding="utf-8")
    write(tmp_path / "P02_A_2026-11-04.jsonl", [{**HEADER, "participant": "P02"}] + [frame(i * 33.3) for i in range(50)])
    gappy = [frame(i * 33.3) for i in range(50)] + [frame(3000 + i * 33.3) for i in range(10)]  # ~30% missing
    write(tmp_path / "P03_A_2026-11-05.jsonl", [{**HEADER, "participant": "P03"}] + gappy)
    (tmp_path / "broken.jsonl").write_text("{not json\n", encoding="utf-8")
    ds = load_dataset(tmp_path)
    assert [s.participant for s in ds.study_a] == ["P01", "P02"]
    p1 = ds.study_a[0]
    assert p1.labels is not None and len(p1.labels) == 1 and p1.relabels is not None
    assert ds.study_a[1].labels is None and any("no label file" in w for w in ds.warnings)
    refused = {Path(f).name: why for f, why in ds.rejected}
    assert "broken.jsonl" in refused
    assert "missing" in refused["P03_A_2026-11-05.jsonl"]


def test_cue_types_file_is_never_ground_truth(tmp_path):
    write(tmp_path / "P01_A_2026-11-03.jsonl", [HEADER] + [frame(i * 33.3) for i in range(50)])
    (tmp_path / "P01_A_cue_types.csv").write_text(
        "cue_ms,cue,block,response_type,labeller,labelled_at\n100,SHORT,deliberate,short,P01s,\n", encoding="utf-8"
    )
    ds = load_dataset(tmp_path)
    assert ds.study_a[0].labels is None
    assert any("types only" in w for w in ds.warnings)


def test_later_session_never_uses_session_one_labels(tmp_path):
    from analysis.load import _label_candidates

    s2 = tmp_path / "P01_A_s2_2026-10-29.jsonl"
    first, second = _label_candidates(s2, {"participant": "P01", "study": "A", "session": 2})
    assert tmp_path / "P01_A_s2_labels.csv" in first
    assert tmp_path / "P01_A_labels.csv" not in first
    assert tmp_path / "P01_A_s2_labels_relabel.csv" in second
    s1 = tmp_path / "P01_A_2026-10-28.jsonl"
    first, _ = _label_candidates(s1, {"participant": "P01", "study": "A", "session": 1})
    assert tmp_path / "P01_A_labels.csv" in first


def test_unit_of_analysis(monkeypatch):
    from analysis import load
    from analysis.load import Session

    s = Session.__new__(Session)
    s.header = {"participant": "P01", "session": 3, "study": "A"}
    monkeypatch.setattr(load, "UNIT", "participant")
    assert s.unit_id == "P01"
    monkeypatch.setattr(load, "UNIT", "session")
    assert s.unit_id == "P01-s3"


def test_slower_camera_is_not_missing_frames():
    # 60 s at 16.6 fps, then 60 s at 10 fps (the camera lengthening its exposure), then 16.6 fps again.
    fast = np.arange(0, 60000, 60.0)
    slow = 60000 + np.arange(0, 60000, 100.0)
    again = 120000 + np.arange(0, 60000, 60.0)
    t = np.concatenate([fast, slow, again])
    miss, _ = missing_fraction(t)
    assert miss == 0.0
    # A real dropout inside the slow stretch is still counted: 4 frames missing out of a 1 s gap at 10 fps.
    t2 = np.delete(t, np.arange(1100, 1104))
    miss2, _ = missing_fraction(t2)
    assert miss2 > 0
