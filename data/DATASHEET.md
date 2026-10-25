# Datasheet: MorsEye blink-closure features

Structure follows Gebru et al., _Datasheets for Datasets_ (2021). Filled in by the AI agent on 25 Oct 2026 from the
session log, its setup notes and `analysis/out/results.json`; Saksham checks it. Fields still marked **[HUMAN]**
need his answer.

Licence: **CC BY 4.0** (see `LICENSE-DATA`). Code is MIT (see `LICENSE`).

---

## Motivation

- **For what purpose was the dataset created?** To measure how well a consumer webcam can separate _deliberate_
  eye closures (used as Morse "key presses") from _spontaneous_ blinks. It was meant to be part of a preregistered
  multi-session single-person study; data collection stopped after the first session (see the preregistration's
  Deviations), so the dataset is that one session.
- **Who created it, and on whose behalf?** Saksham Sharma, BITS Pilani, for the MorsEye research project.
- **Who funded it?** [HUMAN] (for example "No external funding.")

## Composition

- **What do the instances represent?** One Study A session of one participant: per-frame features from MediaPipe
  FaceLandmarker, block and cue events, and the participant's check of the response type to each cue.
- **How many instances?** One session (P01, session 1): about 9.6 minutes, 84 cues (26 short, 26 long, 16 left
  wink, 16 right wink).
- **What does each instance contain?**
  - `P01_A_2026-10-24.jsonl`: the `morseye-log/1` log exactly as downloaded from Study Mode (schema:
    `src/study/schema.ts`; SHA-256 `d30cf5ec26c1dd4e027246127f8b2830cfa77eb35e0584c22b1c66951d1af9b8`). A header
    (participant ID, session, seed, setup notes, camera label, segmenter timing, and a `consent` field kept for
    format compatibility), then per frame: timestamp (ms), face found, EAR left/right, `eyeBlinkLeft/Right`
    blendshape scores, head yaw/pitch/roll, number of faces, and the 12 eye landmark points (6 per eye, normalised
    x/y). Block, cue and measured-fps lines.
  - `P01_A_cue_types.csv`: one row per cue: `cue_ms, cue, block, response_type, labeller, labelled_at`.
    `response_type` is the type of closure the participant made in response (`short`, `long`, `wink-L`,
    `wink-R`, or `none`), as checked by the participant in the labelling tool.
  - `P01_A_cue_types_meta.json`: how the CSV was built.
- **What is NOT included?** No images, video or audio; no face landmarks other than the 12 eye points; no names or
  contact details. **No closure onset/offset labels**: the session was labelled with response types only.
- **Is there a label or target?** Only the per-cue response types above. They are not closure times, so the
  analysis never uses them as ground truth for detection; closure durations reported in the paper are measured by
  the detectors.
- **Is any information missing?** Frames where no face was found are logged with `face: false` (0.3% of frames).
  0.06% of frames are missing, judged against the local frame interval (`analysis/load.py`).
- **Recommended splits?** None. The calibration block is the only block meant for fitting thresholds.
- **Errors, noise or redundancies?** The camera did not deliver 30 fps: about 16.5 fps in the calibration and cued
  blocks, dropping to about 10 fps for the last minute of the first reading block and the whole mixed block (median
  15.0 fps). The response types were checked against placeholder cue windows, not exact closure times. Feature
  values depend on `@mediapipe/tasks-vision` 0.10.21 and model `face_landmarker.task` (float16, v1).
- **Is the dataset self-contained?** Yes.
- **Confidential or sensitive data?** No images or video. Eye-landmark and blink timing data are
  biometric-adjacent; the only participant is the author, who recorded and publishes the data.

## Collection process

- **How was the data acquired?** In the MorsEye app's Study Mode (`/study`), in the browser, on the author's
  laptop. All processing ran on the device; nothing was uploaded. The log was downloaded at the end of the session.
- **Who were the participants?** One able-bodied adult, the author (P01), aged 18–24, no glasses.
  **The system has not been tested with people with motor impairments, and no clinical claim is made.**
- **Devices and setting.** Built-in 1080p laptop camera (reported as "USB2.0 FHD UVC WebCam"), 1280 × 720, about
  45 cm away, front lighting.
- **Over what timeframe?** One session, 24 Oct 2026.
- **Protocol.** Calibration block (10 cued short, 10 cued long closures, 15 s eyes open); spontaneous block (3 min
  reading, no cues); deliberate block (40 randomised cues SHORT / LONG / WINK-L / WINK-R, 2–4 s apart); mixed block
  (3 min reading with corner cues). The cue schedule is generated from the seed in the log header.
- **Ethical review.** None was sought: the only participant is the author. The public comparison videos
  (Eyeblink8) are used under their published licence and are not part of this dataset.
- **Consent.** No consent form was used, because the only participant is the author.

## Preprocessing, cleaning and labelling

- **Preprocessing.** None beyond what the app computes per frame. The log is published unchanged.
- **Labelling.** The author checked the response type of every cue in the labelling tool (`/labeler`) against
  the local video, in about 21 minutes of active labelling. Cue drafts were imported with the cued type, and the
  author changed the type wherever the response differed. Closure onsets and offsets were not marked.
- **Is the raw data saved?** The local video used for checking stays on the author's laptop and is never
  published. The per-frame features are the raw data of this dataset.

## Uses

- **Used for:** the MorsEye paper's exploratory single-session results; every number is regenerated by
  `python -m analysis.case_study --data data/public`.
- **Other possible uses:** examples of cued deliberate closures and winks on a consumer webcam at a low frame
  rate; testing blink detectors and timing rules; teaching.
- **Uses to avoid:** identifying or re-identifying people; any clinical or diagnostic claim; inferring traits or
  states (fatigue, emotion, health) about the participant.

## Distribution

- **How is it distributed?** In this repository under `data/public/`, licence CC BY 4.0.
- **When?** 25 Oct 2026.

## Maintenance

- **Maintainer:** Saksham Sharma (contact through the GitHub repository).
- **Errata and updates:** recorded in this file with dates.
