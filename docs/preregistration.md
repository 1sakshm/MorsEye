# Preregistration: MorsEye Study A and Study B

> **Status: NOT YET COMMITTED.** [HUMAN] Saksham writes the final wording of every section below and commits this
> file **before the first participant** (PRD §3.3). The commit date is the evidence. After that, never edit the
> sections above "Deviations"; add dated entries under "Deviations" instead.
>
> The quoted "PRD reference" blocks are the planning notes from `PRD.md`, kept here only so nothing is forgotten.
> Delete each one once you have written the section in your own words.

- **Author:** Saksham Sharma
- **Date committed:** [HUMAN]
- **Planned data collection:** [HUMAN] (PRD: 29 Oct – 4 Nov 2026 for Study A)

## 1. Research questions

[HUMAN]

> PRD reference (§3.2): RQ1 detection of deliberate vs spontaneous blinks on a ~30 fps webcam, and the effect of
> k-shot calibration (k = 0, 1, 3, 5, 10). RQ2 duration distributions and the thresholds they imply; frame-rate
> limits on timing. RQ3 novice entry and error rates across three practice blocks.

## 2. Hypotheses

[HUMAN] One numbered, testable statement each, with its direction.

> PRD reference (§3.3): H1 calibrated (k ≥ 3) > fixed EAR 0.21 on event F1. H2 blendshape ≥ EAR. H3 a minimum-duration
> reject window halves false characters per minute while reading, vs the v1 app. H4 (exploratory) wink mode has fewer
> false triggers at higher effort. H5 entry rate rises and error rate falls from block 1 to block 3.

## 3. Design

[HUMAN] Within-subject; blocks; what is manipulated (detector is an *offline* factor: all detectors are run on the same
recordings); counterbalancing (the app supports a seeded order of blocks 3–5; say whether you use it).

## 4. Participants and stopping rule

[HUMAN] Inclusion (adults 18+, able-bodied volunteers), exclusion (e.g. > 5% missing frames, withdrawn consent),
target N and the rule for stopping (date or count, whichever first). State that the power is low.

## 5. Measured variables

[HUMAN] Event-level P/R/F1 (IoU ≥ 0.3), false triggers per minute in the spontaneous block, duration error,
short/long confusion; Study B: CPM, WPM, MSD error rate (uncorrected and corrected), closures per character, raw TLX.

## 6. Ground truth

[HUMAN] Who labels (you, 100%), with what tool, the label types, and the self-agreement check (re-label 2
participants one week later; Cohen's κ for type and mean absolute onset difference).

## 7. Analysis plan

[HUMAN] Per-participant metrics, then mean and 95% bootstrap CI over participants (10,000 resamples). Paired
Wilcoxon signed-rank tests for detector comparisons with Holm correction — list exactly which comparisons. k-shot:
20 random draws per k, evaluated on the participant's other blocks.

**Open analysis choices to fix here** — they are defaults in `analysis/config.py`, each marked [HUMAN]; whatever you
decide, make the file match this document before running the real analysis:

- how both-eye detectors (D1–D4) treat a detection that matches a labelled wink (`WINK_POLICY_BOTH_EYE`);
- where the k-shot "closed" examples come from: your labels or the cue windows (`CALIBRATION_SOURCE`);
- which blocks the detection metrics cover (`EVAL_BLOCKS`);
- the headline comparison and k (`HEADLINE`), and the detector used for the frame-rate analysis (`PRIMARY_DETECTOR`);
- one- or two-sided tests (`WILCOXON_ALTERNATIVE`) and the Holm families;
- what counts as a "false trigger" (the analysis counts any closure the reject band does not remove, holds included)
  and the "v1 app" baseline for H3 (D1 without a reject band).

## 8. Threshold selection

[HUMAN] How you will choose the final reject/dot/dash bands from Study A before Study B, and that you will record
the reasoning in `docs/decisions.md`.

## 9. Exploratory analyses

[HUMAN] Everything not covered above is exploratory and will be labelled so (e.g. glasses subgroup, wink mode, fps).

## Deviations

[HUMAN] Dated entries only, after the commit above. Example: `2026-11-02 — P04 excluded: camera ran at 12 fps.`
