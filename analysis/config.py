"""Analysis settings in one place.

Everything marked [PREREG] is an analysis decision fixed in docs/preregistration.md (section 7) *before*
the data are analysed; the values here match that document. Changing one afterwards is a deviation:
record it, with the date, in the preregistration's "Deviations" section.
"""

from __future__ import annotations

# [PREREG] The unit of analysis: "participant" (one value per person) or "session" (one value per
# session, for the single-person design in docs/preregistration.md). Bootstrap CIs and paired tests
# resample this unit.
UNIT = "session"

# --- Event matching (PRD §3.5) ---
IOU_MIN = 0.3  # a detection matches a labelled event if the intervals overlap with IoU >= 0.3

# Blocks the detection metrics are computed over (calibration is used only to fit thresholds).
EVAL_BLOCKS = ("spontaneous", "deliberate", "mixed")

# [PREREG] How both-eye detectors (D1-D4) treat a detection that matches a labelled *wink*:
#   "ignore": neither a hit nor a false alarm (winks are D5's targets); counted as `wink_triggers`.
#   "fp":     a false alarm.
WINK_POLICY_BOTH_EYE = "ignore"

# [PREREG] Where the "closed" calibration examples come from:
#   "labels": the human-labelled short/long closures in the calibration block (default);
#   "cues":   the cue windows (what the live app can do without labels).
CALIBRATION_SOURCE = "labels"
CUE_WINDOW_SLACK_MS = 1000  # cue windows run from cue onset to onset + duration + slack

# --- Few-shot calibration (PRD §3.4) ---
KS = (0, 1, 3, 5, 10)  # k = 0 is the fixed threshold (D1 for EAR, D3 for blendshapes)
DRAWS = 20  # random draws of k calibration closures per k
ALPHA = 0.5  # thr = open_median - ALPHA * (open_median - closed_median)

# --- Statistics (PRD §3.5) ---
N_BOOT = 10_000
BOOT_SEED = 2026
CI_LEVEL = 0.95


def ci_method() -> str:
    """How intervals are computed, in words, for the current unit of analysis."""
    return f"95% percentile bootstrap over {UNIT}s, 10,000 resamples"
WILCOXON_ALTERNATIVE = "two-sided"  # [PREREG] one-sided only if the preregistration says so

# [PREREG] Which numbers are the headline (home page, abstract, CV). Fix before analysis.
HEADLINE = {"uncalibrated": "D1", "calibrated": "D4", "k": 5}
# Detector whose duration error is plotted against frame rate (F8).
PRIMARY_DETECTOR = "D4"

# --- Data validation (PRD §9) ---
MAX_MISSING_FRAC = 0.05  # refuse logs with more than 5% missing frames
# [PREREG] Study A exclusions (docs/preregistration.md section 4), applied in analysis/study.py.
PILOT_IDS = ("P00",)  # pilot sessions, never analysed
MIN_MEDIAN_FPS = 12.0  # exclude a session whose median measured frame rate is below this
MIN_CALIB_CLOSURES = 5  # exclude a session with fewer usable calibration closures

DETECTOR_LABELS = {
    "D1": "EAR, fixed 0.21",
    "D2": "EAR, calibrated",
    "D3": "Blendshape, fixed 0.5",
    "D4": "Blendshape, calibrated",
    "D5": "Wink (blendshape, calibrated)",
}
