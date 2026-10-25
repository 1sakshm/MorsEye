# Preregistration: MorsEye single-person case study and public-data check

> **Status: approved by Saksham on 24 Oct 2026, and committed before the first recorded session** (the commit date
> is the evidence).
> Once committed, the sections above "Deviations" are never edited; changes go under "Deviations" with a date.

- **Author:** Saksham Sharma
- **Approved by:** Saksham Sharma, 24 Oct 2026.
- **Date committed:** the date of the commit that adds this line.
- **Planned data collection:** detection sessions 28 Oct – 4 Nov 2026; typing sessions on 5 days between
  5 and 12 Nov 2026.

## 0. Why this design

The original plan (PRD §3.5) needed about 10 volunteers. This study instead has **one participant, the author**,
recorded many times, plus a **public video dataset** of other people's natural blinks. This answers the same
questions for one person, and the natural-blink question for several people, but it **cannot** say how well the
system works for people in general. Everything below is stated with that limit.

What the author's double role means: he is participant, experimenter, labeller and designer, and he knows the
hypotheses. His deliberate closures follow cues, so knowing the hypotheses matters less for them; his natural
blinking while reading may change because he knows it is measured. The public data partly address this, because
those people did not know about MorsEye.

## 1. Research questions

- **RQ1 (detection).** For one person on a consumer laptop webcam (about 30 fps), how accurately do
  landmark-based detectors find deliberate eye closures while ignoring spontaneous blinks, and how much does
  calibration from k example closures (k = 0, 1, 3, 5, 10) improve this, across repeated sessions and lighting?
- **RQ2 (timing).** What are the durations of this person's spontaneous blinks and deliberate short and long
  closures, what reject, dot and dash thresholds do they imply, and how do natural blinks of **other people**
  (public data) fall relative to those thresholds?
- **RQ3 (text entry).** What entry and error rates does a novice reach over five days of short practice?

## 2. Hypotheses

Confirmatory, on the author's sessions (section 3, part A):

- **H1.** A calibrated detector has a higher event-level F1 for deliberate closures than the fixed EAR threshold of
  0.21 (D1). Tested for D2 (EAR, calibrated) and D4 (blendshape, calibrated) at k = 3, 5 and 10, each against D1.
- **H2.** Blendshape scores detect deliberate closures at least as well as EAR. Non-inferiority with a margin of
  **0.05 F1**: supported for a pair if the lower bound of the 95% CI of the paired difference (blendshape minus EAR)
  is above −0.05. Pairs: D3 vs D1 (fixed) and D4 vs D2 (calibrated on the full calibration block).
- **H3a.** A minimum-duration reject window at least halves false triggers per minute while reading, compared with
  the v1 app (D1 with no reject window). Supported if the mean with the reject window is at most half the mean
  without it **and** the paired test is significant after Holm correction. Tested for D1 and for D4 (k = 5).

Confirmatory, on public data (section 3, part C), **only if the Researcher's Night dataset is received before
any of it is analysed**:

- **H3b.** On other people's natural blinks, the reject window at least halves false triggers per minute, for D1
  and for D3 (the fixed detectors; the public data contain no deliberate closures to calibrate from). Same
  criterion as H3a, with the video as the unit.

Secondary, not blind (section 3, part C): the same H3b measures on **Eyeblink8**, parts of which were computed
before this document was written (see `docs/public-data.md`). Reported, but not counted as a test of H3b.

Descriptive (no test, because five days is too few for one): **H5.** Entry rate rises and the uncorrected error
rate falls from day 1 to day 5.

Exploratory: **H4.** Wink mode (D5) produces fewer false triggers per minute than D2 and D4 while reading.

## 3. Design

**Part A — detection sessions (author only, code P01).** At least 6 and up to 8 Study A sessions (session numbers
1, 2, …), each about 12 minutes, on at least 4 different days, in Study Mode with the usual protocol: a
calibration block (10 cued short closures, 10 cued long closures, 15 s eyes open), a spontaneous block (3 min of
reading), a deliberate block (40 randomised cues SHORT / LONG / WINK-L / WINK-R, 2–4 s apart) and a mixed block
(3 min of reading with corner cues). "Counterbalance the order of blocks 3–5" is ticked for every session.

Lighting is varied on purpose and recorded in each session's setup notes: about half the sessions in normal room
light, the rest split between bright and dim light. Same laptop and camera, about 50–70 cm away. If the author
wears glasses, about half the sessions are with them and half without.

The detector is an **offline** factor: all five detectors (D1–D5) are run afterwards on the same recordings.

**Part B — typing over five days (author only, code P01).** One Study B session a day on 5 different days, each
about 20 minutes: the 15 MacKenzie & Soukoreff (2003) phrases in 3 blocks of 5, phrase order shuffled per session,
the Morse card on screen, raw NASA-TLX after each block. The same 15 phrases are used every day, so some of the
improvement may come from remembering them; this is reported. The system is fixed before the first typing session
(section 8).

**Part C — public data.** The fixed detectors (D1, D3) and the segmenter are run on the per-frame features of public
videos with annotated natural blinks: Eyeblink8 (8 videos, 4 people) and, if access is granted in time,
Researcher's Night (107 videos). Method in `docs/public-data.md`.

**Pilot.** One pilot session is recorded first under code **P00** to check the procedure. P00 is excluded from all
analyses.

**Other volunteers.** If anyone else takes part, their sessions are stored in a separate folder and analysed with
the original multi-person plan, as an exploratory addition. They never enter the confirmatory analyses above.

## 4. Inclusion, exclusion and stopping

- **Exclusion** (applied by the analysis code, or recorded under Deviations): the pilot (P00); more than 5% missing
  frames; a median measured frame rate below 12 fps (slower but usable cameras stay in, because frame rate is part
  of RQ2); a calibration block with fewer than 5 usable closures; no spontaneous block in the log.
- **Stopping rule:** detection sessions stop at 8 included sessions or at the end of 4 Nov 2026, whichever comes
  first; at least 6 are needed. Excluded sessions are replaced if time allows. Typing sessions: 5 days.
- **Power:** with 6–8 sessions of one person, the paired tests can detect only large and consistent differences.
  Non-significant results are reported as inconclusive. Results describe this person, not people in general.

## 5. Measured variables

Part A, per session, over the spontaneous, deliberate and mixed blocks (the calibration block only fits
thresholds): event-level precision, recall and F1 for deliberate closures (IoU ≥ 0.3, one-to-one matching); false
triggers per minute in the spontaneous block (detected closures not removed by the reject band, holds included,
that match no deliberate label); duration error (detected minus labelled, ms) against the frame interval;
short/long accuracy and confusion; measured frame rate and lighting.

Part B, per session and block: CPM, WPM (= CPM / 5), MSD character error rate (uncorrected and corrected),
closures per character including deletions, raw NASA-TLX.

Part C, per video: annotated natural blink durations; for D1 and D3 the detected closed durations, the share of
annotated blinks detected, and false triggers per minute with and without the reject window.

## 6. Ground truth

The author labels 100% of his Study A closures in the labelling tool (`/labeler`), from the local video and the
signal traces: onset, offset and type (spontaneous, short, long, wink-L, wink-R). Cue-based candidates may be shown,
but only events he confirms are exported. No automatic labels count as ground truth. Labelling time is recorded.

**Self-agreement:** two sessions, chosen at random (seed 2026) once all are labelled, are labelled again at least
one week later without looking at the first labels. Reported: Cohen's κ for type and mean absolute onset
difference (ms).

Public data use the datasets' own published annotations.

## 7. Analysis plan

- **Unit of analysis.** Parts A and B: the **session** (`UNIT = "session"` in `analysis/config.py`). Sessions of
  one person are not independent samples of a population; CIs and tests describe variation across this person's
  sessions. Part C: the video.
- Summaries: mean and 95% percentile bootstrap CI over units (10,000 resamples, seed 2026).
- Paired comparisons: two-sided Wilcoxon signed-rank tests, α = 0.05, Holm correction within each family:
  - **Part A family** (10 tests): H1 — D2 and D4 at k = 3, 5, 10 vs D1 (6 tests); H2 — D3 vs D1 and D4 vs D2
    (2 tests, also judged by the non-inferiority CI); H3a — D1 with vs without the reject window, and D4 (k = 5) with
    the reject window vs D1 without it (2 tests).
  - **Part C family** (Researcher's Night only, 2 tests): H3b for D1 and D3, with vs without the reject window.
  - **Exploratory:** H4 — D5 vs D2 and D5 vs D4 on false triggers per minute; everything on Eyeblink8; the H5
    tests the code computes are shown but not interpreted.
- **k-shot calibration:** per session and k, 20 random draws of k calibration closures; threshold
  `thr = open_median − 0.5 · (open_median − closed_median)`; evaluated on that session's other blocks; the session
  value is the mean over draws. k = 0 is the fixed threshold.

Analysis choices fixed here, and set in `analysis/config.py` to match:

| Choice | Setting | Why |
|---|---|---|
| Unit (`UNIT`) | `session` | One participant |
| Matched wink, both-eye detectors (`WINK_POLICY_BOTH_EYE`) | `ignore`: neither a hit nor a false alarm; counted separately | Winks are D5's targets |
| Calibration examples (`CALIBRATION_SOURCE`) | `labels` | Measures what calibration can achieve with correct examples; cue windows are exploratory |
| Blocks for detection metrics (`EVAL_BLOCKS`) | spontaneous, deliberate, mixed | The calibration block is training data |
| Headline comparison (`HEADLINE`) | D1 vs D4 at k = 5 | A few seconds of calibration in practice |
| Frame-rate analysis detector (`PRIMARY_DETECTOR`) | D4 | Same as the headline |
| Test sidedness (`WILCOXON_ALTERNATIVE`) | two-sided | Conservative; each hypothesis still states its direction |
| "v1 app" baseline for H3 | D1 with no reject window | What the v1 app did |

Part A is analysed with the app's default segmenter timing (reject < 200 ms, dot < 600 ms, dash < 1400 ms, hold
< 2000 ms, backspace ≥ 2000 ms). The thresholds chosen in section 8 are used for Part B and reported for Parts A and
C as a secondary analysis, labelled as chosen after seeing the data.

## 8. Threshold selection (between Part A and Part B)

From the author's labelled Part A durations, pooled over sessions:

- **Reject:** the 95th percentile of spontaneous blink durations, rounded up to the next 10 ms. If that is above the
  5th percentile of deliberate short closures, use the midpoint of those two values instead, and report both.
- **Dot/dash boundary:** the duration that minimises short/long misclassification, rounded to the nearest 50 ms.
- **Dash maximum:** the 95th percentile of deliberate long closures, rounded up to the next 100 ms; backspace stays
  600 ms above it.
- **Letter and word gaps:** unchanged (1200 ms and 3000 ms) unless the pilot shows a clear problem.
- **Typing detector:** the calibrated detector (D2 or D4) with the higher mean F1 at k = 5; D4 if the CIs overlap and
  the means are within 0.02.

Also reported: what share of the public-data natural blinks, as measured by the chosen detector, would pass the
chosen reject window, as an estimate of how the thresholds would behave for other people. The values, the
percentiles and the reasoning go into `docs/decisions.md`, committed before the first typing session.

## 9. Exploratory analyses

Everything not listed above: lighting and glasses effects, frame-rate effects beyond the duration-error plot,
cue-window calibration, head pose, wink mode beyond H4, the learning-curve shape, and any data from other
volunteers.

## Deviations

Dated entries only, after the commit above. Example: `2026-11-02 — session 5 excluded: camera ran at 10 fps.`

- `2026-10-24` — No separate P00 pilot was recorded. The first session was recorded on 24 Oct (after this
  document was committed, but before the planned 28 Oct start) as P01 session 1, with the full protocol. It is
  analysed as session 1 under the rules above.
- `2026-10-24` — In P01 session 1 the camera itself ran at about 16.6 fps, and at about 10 fps for most of both
  reading blocks (the recorded video shows the same pattern, so it is the camera's exposure, not the app). The
  median frame rate (15 fps) is above the 12 fps exclusion limit, so the session is kept; the per-block frame rate
  is reported.
- `2026-10-24` — Fix to how "missing frames" are counted (section 4), made after the loader wrongly rejected
  P01 session 1 with "8.2% of frames missing". The code compared every gap with the session-wide median interval
  (67 ms), so the camera's 10 fps stretches (100 ms per frame) looked like dropped frames. Gaps are now compared
  with the local frame interval (the median of the 31 intervals around them). The rule itself (exclude a session
  with more than 5% missing frames) is unchanged; with the fix, session 1 has 0.06% missing frames.
- `2026-10-25` — P01 session 1 has cue-response **types only, no closure times**. The author checked each cue's
  response type in the labelling tool but kept the tool's placeholder times (cue onset to +1.8 s) instead of
  marking onsets and offsets, and marked one natural blink. Those times are not closure times, so session 1 is
  **excluded from every confirmatory Study A analysis** (H1–H3, H5 and the duration results) and does not count
  towards the 8-session stopping rule. Its types are kept in `P01_A_cue_types.csv` (one row per cue; 1 of 84
  cues had no response) and may be reported only as an exploratory cue-versus-response table. Sessions 2 onward
  are labelled with real onsets and offsets.
- `2026-10-25` — **Data collection ends after P01 session 1** (the author's decision). No further detection
  sessions and no typing sessions (Part B) will be recorded. Consequences:
  - Session 1 has no labelled closure times (entry above), so no session qualifies for Part A. **H1, H2 and H3a
    are not tested** and are reported as not tested; the 6-session minimum in section 4 is not met.
  - Part B is not run: RQ3 is not answered and **H5 is not reported**. H4 (exploratory) is not run on own data.
  - What remains: **Part C** as planned (Eyeblink8 as a secondary, not blind analysis; H3b confirmatory only if
    the Researcher's Night dataset is received before any of it is analysed), and session 1 as an exploratory
    single-session case: the cue-versus-response table, the measured frame rate, and detector output on the
    unlabelled recording, all marked exploratory.
- `2026-10-25` — Correction to the second entry of 24 Oct: the per-block frame rates computed by
  `analysis/case_study.py` show the camera at about 16.5 fps for the calibration block, most of the spontaneous
  block and the deliberate block, dropping to about 10 fps for the last minute of the spontaneous block and the
  whole mixed block (median per block: calibration 16.4, spontaneous 15.1, deliberate 16.4, mixed 10.3 fps). The
  earlier entry said "most of both reading blocks", which was wrong for the spontaneous block.
- `2026-10-25` — The Researcher's Night dataset will not be requested (the author's decision), so the Part C
  confirmatory test (**H3b**) is not run. Eyeblink8 stays a secondary, not blind analysis. The analysis also
  reports, as exploratory (section 9), sweeps of the reject window and of the dot–dash boundary and a comparison
  of measured with annotated blink durations; these were added after seeing the data.
- `2026-10-25` — Wording only, at the author's request: the "Drafted by" line in the header and the name of who
  had looked at Eyeblink8 in section 2 were moved out of this document. No research question, hypothesis, rule or
  analysis changed. The text as committed is in commit 046207f.
