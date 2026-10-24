# Datasheet: MorsEye blink-closure features

Structure follows Gebru et al., *Datasheets for Datasets* (2021). Fields marked **[HUMAN]** are filled in
by Saksham from the session logs and his notebook once data collection is complete. Numbers should be
copied from `analysis/out/summary.json` (for example `study_a.n_participants`,
`study_a.n_labels_total`, `study_a.participants[].fps`) so they match the paper.

Licence: **CC BY 4.0** (see `LICENSE-DATA`). Code is MIT (see `LICENSE`).

---

## Motivation

- **For what purpose was the dataset created?**
  To measure how well a consumer webcam can separate *deliberate* eye closures (used as Morse "key
  presses") from *spontaneous* blinks, how much a few seconds of per-user calibration helps, and how fast
  people can type with blink-based Morse input (PRD §3).
- **Who created it, and on whose behalf?** [HUMAN] Saksham Sharma, [institution].
- **Who funded it?** [HUMAN] (e.g. "No external funding.")

## Composition

- **What do the instances represent?** One Study A or Study B session of one participant: per-frame
  features from MediaPipe FaceLandmarker plus event logs, and (Study A) human labels of every eye closure.
- **How many instances?** [HUMAN] N = __ participants in Study A, __ in Study B; __ labelled closures
  (spontaneous __, deliberate short __, deliberate long __, wink-L __, wink-R __).
- **What does each instance contain?**
  - `P07_A_<date>.jsonl`: `morseye-log/1` log (schema: `src/study/schema.ts`). A header (participant ID,
    session, seed, measured setup, consent flags, segmenter timing), then per frame: timestamp (ms),
    face found, EAR left/right, `eyeBlinkLeft/Right` blendshape scores, head yaw/pitch/roll, number of
    faces, and the 12 eye landmark points (6 per eye, normalised x/y). Block, cue and fps lines.
  - `P07_A_labels.csv`: `onset_ms, offset_ms, type, labeller, labelled_at`; type is one of
    `spontaneous`, `short`, `long`, `wink-L`, `wink-R`.
  - `P07_A_labels_relabel.csv` (two participants): the second labelling pass used for self-agreement.
  - `P07_B_<date>.jsonl`: Study B log with phrase, decoder-action and NASA-TLX lines.
- **What is NOT included?** No images, no video, no audio, no face landmarks other than the 12 eye
  points, no names, no contact details. Participant IDs are not linked to identities anywhere in the
  repository; the only ID-to-name mapping, if any, is kept offline on paper.
- **Is there a label or target?** Yes: the human-labelled closure onsets/offsets and types (Study A).
  Labels were made by the experimenter (the author), which is a known source of bias; self-agreement
  is reported (Cohen's kappa [HUMAN] __, mean absolute onset difference [HUMAN] __ ms).
- **Is any information missing?** Frames where no face was found are logged with `face: false`. Logs with
  more than 5% missing frames were excluded by `analysis/load.py`. [HUMAN] List any excluded sessions and why.
- **Recommended splits?** None. Analyses are per participant; calibration uses the calibration block only.
- **Errors, noise or redundancies?** Label timing is limited by the video frame rate (about one frame,
  33 ms at 30 fps). Feature values depend on MediaPipe version `@mediapipe/tasks-vision` [HUMAN: version]
  and model `face_landmarker.task` (float16, v1).
- **Is the dataset self-contained?** Yes.
- **Confidential or sensitive data?** No raw images or video. Eye-landmark and blink timing data are
  biometric-adjacent; they are published only with explicit consent for data sharing.

## Collection process

- **How was the data acquired?** In the MorsEye app's Study Mode (`/study`), in the browser, on the
  participant's or experimenter's laptop. All processing ran on the device; nothing was uploaded.
  The experimenter downloaded the log at the end of each session.
- **Who were the participants?** [HUMAN] __ able-bodied adult volunteers (18+), recruited as a
  convenience sample (friends/classmates). Age ranges: [HUMAN]. Glasses: [HUMAN] __ of N.
  **The system has not been tested with people with motor impairments, and no clinical claim is made.**
- **Devices and setting.** [HUMAN] Camera models: __. Measured frame rates: __–__ fps (median __).
  Distance about 50–70 cm. Lighting: [HUMAN] (normal room light; describe any variation).
- **Over what timeframe?** [HUMAN] Study A sessions __ to __ 2026; Study B __ to __.
- **Protocol.** Study A (about 12 minutes): consent; calibration block (10 cued short, 10 cued long
  closures, 15 s eyes open); spontaneous block (3 min reading); deliberate block (40 randomised cues
  SHORT / LONG / WINK-L / WINK-R, 2–4 s apart); mixed block (3 min reading with corner cues). Study B
  (about 20 minutes): 15 MacKenzie & Soukoreff (2003) phrases in 3 blocks of 5, raw NASA-TLX after
  each block. Cue schedules are generated from the seed stored in each log header.
- **Ethical review.** [HUMAN] See `docs/ethics.md` (who was asked, when, and the answer).
- **Consent.** Participants consented on paper and in the app (`docs/consent.md`): purpose, what is
  recorded, a separate opt-in for local video (used only for labelling and deleted afterwards unless
  consent says otherwise), the right to withdraw and have data deleted, no payment.

## Preprocessing, cleaning and labelling

- **Preprocessing.** None beyond what the app computes per frame. Video, where recorded for labelling,
  is never part of the dataset. [HUMAN] Confirm video was deleted after labelling (date).
- **Labelling.** Every closure was labelled by Saksham in the labelling tool (`/labeler`) from the local
  video and the signal traces; cue-based candidates were shown but only human-confirmed events were
  exported. Labelling time: [HUMAN] about __ minutes per participant. Two participants were re-labelled
  about a week later to measure self-agreement.
- **Is the raw data saved?** Raw video is not kept (see consent). The per-frame features are the raw data
  of this dataset.

## Uses

- **Used for:** the MorsEye paper (detector comparison, few-shot calibration, duration distributions,
  text-entry evaluation); every number is regenerated by `python -m analysis.run --data data/public`.
- **Other possible uses:** blink-detection benchmarks on consumer webcams; studies of blink-duration
  distributions; teaching.
- **Uses to avoid:** identifying or re-identifying people; any clinical or diagnostic claim; inferring
  traits or states (fatigue, emotion, health) about the individual participants.

## Distribution

- **How is it distributed?** In this repository under `data/public/`, licence CC BY 4.0.
- **When?** [HUMAN] With the paper preprint.

## Maintenance

- **Maintainer:** [HUMAN] Saksham Sharma, [contact email].
- **Withdrawal:** a participant who withdraws has their files removed from the repository and from any
  later release; [HUMAN] describe how (and that git history is rewritten only for this purpose, if at all).
- **Errata and updates:** recorded in this file with dates.
