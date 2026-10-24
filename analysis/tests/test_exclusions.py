"""The preregistered Study A exclusions (docs/preregistration.md section 4)."""

from types import SimpleNamespace

from analysis import config
from analysis.study import exclusion_reason


def session(fps: float, blocks: tuple[str, ...] = ("calibration", "spontaneous")) -> SimpleNamespace:
    return SimpleNamespace(measured_fps=fps, blocks={b: (0.0, 1.0) for b in blocks}, labels=[])


def test_slow_camera_is_excluded():
    reason = exclusion_reason(session(config.MIN_MEDIAN_FPS - 1))
    assert reason is not None and "frame rate" in reason


def test_slow_but_usable_camera_is_kept():
    assert exclusion_reason(session(15.0)) is None
    assert exclusion_reason(session(30.0)) is None


def test_session_without_spontaneous_block_is_excluded():
    reason = exclusion_reason(session(30.0, ("calibration",)))
    assert reason is not None and "spontaneous" in reason
