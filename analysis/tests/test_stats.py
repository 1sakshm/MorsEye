from __future__ import annotations

import math

import numpy as np
import pytest

from analysis.load import Label
from analysis.stats import apply_holm, bootstrap_ci, cohen_kappa, holm, paired_test, self_agreement, wilcoxon


def test_bootstrap_constant_data_has_zero_width():
    ci = bootstrap_ci([0.7] * 10)
    assert ci.mean == pytest.approx(0.7) and ci.lo == pytest.approx(0.7) and ci.hi == pytest.approx(0.7)
    assert ci.n == 10


def test_bootstrap_ignores_nan_and_is_deterministic():
    vals = [0.5, 0.6, float("nan"), 0.9, 0.4]
    a, b = bootstrap_ci(vals), bootstrap_ci(vals)
    assert a == b
    assert a.n == 4
    assert a.lo <= a.mean <= a.hi


def test_bootstrap_covers_the_mean_of_normal_data():
    rng = np.random.default_rng(3)
    ci = bootstrap_ci(rng.normal(10, 1, 50).tolist())
    assert ci.lo < 10 < ci.hi


def test_bootstrap_empty():
    assert math.isnan(bootstrap_ci([]).mean)


def test_holm():
    # Sorted 0.005, 0.01, 0.03, 0.04 -> x4, x3, x2, x1 with a running maximum.
    assert holm([0.01, 0.04, 0.03, 0.005]) == pytest.approx([0.03, 0.06, 0.06, 0.02])
    assert holm([0.5]) == [0.5]
    out = holm([0.01, float("nan"), 0.02])
    assert out[0] == pytest.approx(0.02) and math.isnan(out[1]) and out[2] == pytest.approx(0.02)
    assert holm([0.6, 0.7]) == pytest.approx([1.0, 1.0])


def test_wilcoxon_all_zero_differences():
    assert wilcoxon(np.ones(5), np.ones(5)) == (0.0, 1.0, 0)


def test_wilcoxon_exact_small_sample():
    W, p, n = wilcoxon(np.array([1.0, 2, 3, 4, 5, 6]), np.zeros(6))
    assert n == 6
    assert p == pytest.approx(2 / 64)  # all six differences positive: exact two-sided p


def test_paired_test_and_holm_family():
    a = {f"P{i:02d}": 0.8 + 0.01 * i for i in range(8)}
    b = {f"P{i:02d}": 0.6 for i in range(8)}
    t1 = paired_test("A", "H1", "f1", "x", a, "y", b)
    t2 = paired_test("A", "H1", "f1", "x", b, "y", b)
    apply_holm([t1, t2])
    assert t1.n == 8 and t1.diff.mean == pytest.approx(0.235)
    assert t1.p_holm == pytest.approx(min(1, 2 * t1.p))
    assert t2.p == 1.0 and t2.p_holm == 1.0


def test_cohen_kappa():
    assert cohen_kappa(list("aabbab"), list("abbbab")) == pytest.approx(2 / 3)
    assert cohen_kappa(list("abc"), list("abc")) == 1.0


def test_self_agreement():
    first = [Label(0, 100, "short"), Label(1000, 1500, "long"), Label(3000, 3100, "spontaneous")]
    second = [Label(10, 110, "short"), Label(1020, 1480, "short"), Label(5000, 5100, "spontaneous")]
    ag = self_agreement(first, second)
    assert ag.n_matched == 2 and ag.n_unmatched == 2
    assert ag.mean_abs_onset_ms == pytest.approx(15)
    assert ag.mean_abs_offset_ms == pytest.approx(15)
    assert ag.kappa < 1
