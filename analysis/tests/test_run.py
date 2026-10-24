"""End-to-end smoke test on a small synthetic dataset."""

from __future__ import annotations

import json

from analysis.run import main


def test_run_synthetic_end_to_end(tmp_path):
    out, site, paper = tmp_path / "out", tmp_path / "site", tmp_path / "paper"
    code = main(["--synthetic", "--n", "3", "--no-figures", "--out", str(out), "--site", str(site), "--paper", str(paper)])
    assert code == 0
    s = json.loads((site / "site.json").read_text(encoding="utf-8"))
    assert s["schema"] == "morseye-site/1"
    assert s["synthetic"] is True
    assert s["headline"] is None  # synthetic numbers never reach the home page
    assert s["n_participants"] == 3
    assert {d["id"] for d in s["detectors"]} == {"D1", "D2", "D3", "D4", "D5"}
    assert {p["k"] for p in s["kshot"]} == {0, 1, 3, 5, 10}
    assert len(s["durations"]["participants"]) == 3
    assert s["text_entry"] is not None and len(s["text_entry"]["blocks"]) == 3
    assert set(s["downloads"]) >= {"durations", "detectors", "kshot", "fps", "text_entry"}
    summary = json.loads((out / "summary.json").read_text(encoding="utf-8"))
    assert summary["synthetic"] is True and summary["study_a"]["n_participants"] == 3
    assert "\\synthetictrue" in (paper / "tables" / "status.tex").read_text(encoding="utf-8")


def test_run_without_data_explains_itself(tmp_path, capsys):
    assert main(["--data", str(tmp_path), "--no-figures"]) == 2
    assert "--synthetic" in capsys.readouterr().out
