# MorsEye

Type Morse code by closing your eyes, in the browser, and a study of how well a webcam can tell a deliberate eye
closure from an ordinary blink.

**Live:** https://morseye.pages.dev · **Paper:** in preparation (see [`paper/`](paper/)) ·
**Dataset:** [`data/DATASHEET.md`](data/DATASHEET.md)

<!-- [HUMAN] Add a GIF of the hero animation here (no faces), e.g. docs/hero.gif. -->

## What it does

MorsEye reads your eyelids through an ordinary webcam with MediaPipe FaceLandmarker and turns deliberate closures
into Morse code: a short closure is a dot, a longer one a dash, and a very long one deletes. Natural blinks are
filtered out by a minimum-duration band, and a 20-second calibration fits the detector to your eyes. After setup it
needs no keyboard or mouse: delete, pause and (optionally) space and speech are all eye gestures.

**Status:** completed (25 Oct 2026); a research prototype. Data collection stopped after one detection session; the results
below come from `analysis/out/results.json`. It has not been tested with people with motor impairments, and no clinical claim is made.

## Key results

The study was preregistered as a single-person case study (the author, over many sessions) plus a check on a
public blink-video dataset ([`docs/preregistration.md`](docs/preregistration.md)). Data collection stopped after
one session, which has cue-response types but no closure times, so the detection tests on the author's data and the
typing study were not run (see the Deviations section). What remains (copied from `analysis/out/results.json`):

- **Other people's natural blinks** (Eyeblink8, 408 blinks of 4 people in 8 videos; secondary,
  not blind): a 200 ms reject window cut false triggers per minute from 10.5 [7.5, 13.2] to
  4.1 [2.7, 5.7] with the blendshape detector (D3), but only from 11.8 [9.2, 14.2] to 10.2 [7.5, 12.9] with
  the EAR detector (D1). Means over videos, 95% bootstrap CIs.
- **One session of the author** (exploratory): cued short closures, as measured by the calibrated blendshape
  detector, had a median of 684 ms, so 13 of 17 would have been dashes under the
  600 ms dot limit; the wink detector found none of the 31 winks, because the other eye's blink
  score rose too.

The paper: [morseye.pages.dev/paper/morseye.pdf](https://morseye.pages.dev/paper/morseye.pdf) (source in `paper/`).

## How it works

```
camera ─▶ FaceLandmarker ─▶ features ─────────▶ detector ──────▶ segmenter ─────▶ decoder ─▶ text, speech
 (rVFC      (on device,      EAR (6 points/eye),   hysteresis,      duration →       Morse table,
  frame      WASM, self-     eyeBlink scores,      per-user         reject / dot /   letter & word
  times)     hosted model)   head pose             threshold        dash / hold /    gaps, commands
                                                                    delete
```

| Closure duration | Meaning |
|---|---|
| < 200 ms | ignored (probable spontaneous blink) |
| 200 – 600 ms | dot |
| 600 – 1400 ms | dash |
| 1400 – 2000 ms | “pause” hold — two within 4 s turn input off or on |
| ≥ 2000 ms | delete the last letter (or the letter in progress) |

| Eyes open for | Meaning |
|---|---|
| ≥ 1200 ms | finish the letter |
| ≥ 3000 ms | add a space (once) |

These are the starting values from the PRD. The final values will be chosen from the Study A duration
distributions and recorded in [`docs/decisions.md`](docs/decisions.md). Presets scale all of them (Slow ×1.5,
Fast ×0.7).

The detectors compared in the study (all run offline on the same recordings, all with hysteresis and no
majority-vote buffer):

| ID | Signal | Threshold |
|---|---|---|
| D1 | mean EAR | fixed 0.21 (the v1 app) |
| D2 | mean EAR | per user, from *k* calibration closures |
| D3 | `max(eyeBlinkLeft, eyeBlinkRight)` | fixed 0.5 |
| D4 | blendshape | per user |
| D5 | wink: one eye closed, the other open | per user (exploratory) |

Code map: `src/vision` (features), `src/detect` (D1–D5, calibration), `src/segment`, `src/decode`,
`src/pipeline.ts` (offline replay), `src/study` (protocol, log schema, recorder), `src/pages` (one entry per page).

## Run locally

```sh
npm ci
npm run dev        # http://localhost:5173 — /try, /study, /labeler
npm test           # Vitest: segmenter, decoder, calibration, features, detectors, protocol, replay
npm run lint
npm run build
```

`npm run dev` and `npm run build` first copy the pinned MediaPipe WASM into `public/wasm/` and fetch
`public/models/face_landmarker.task` if it is missing, so the app makes no CDN requests.

Pages: `/` home · `/try` the app · `/how` how it works · `/research` results · `/data` dataset · `/about`.
`/study` (Study Mode) and `/labeler` (labelling tool) are not linked and are `noindex`.

## Reproduce the analysis

Python 3.11 (CPython from python.org, or `uv venv --python 3.11` — MSYS/Git-Bash Python cannot install the
numpy wheels):

```sh
python -m venv .venv && .venv/Scripts/activate    # or source .venv/bin/activate
pip install -r requirements.txt
python -m analysis.public_blinks --dataset <unpacked eyeblink8/>   # Eyeblink8 (features in data/external/)
python -m analysis.case_study --data data/public  # the reported results: results.json, case.json, C1-C7, tables
python -m analysis.run --synthetic                # the planned multi-session pipeline, on marked synthetic data
pytest analysis/tests
```

The Python replay is a port of the TypeScript detector/segmenter/decoder and is checked against it on a shared
fixture (`tests/fixtures/`) with zero tolerance. `npm run replay -- <log.jsonl>` runs the TypeScript version.

## Dataset

Per-frame features and human labels only — no images, no video, and no landmarks beyond the 12 eye points. See
[`data/DATASHEET.md`](data/DATASHEET.md). Licence: CC BY 4.0 ([`LICENSE-DATA`](LICENSE-DATA)). Not yet released.

## Privacy

Everything runs in the browser. Camera frames are processed on the device and never uploaded. There are no
accounts, cookies or analytics. Study Mode keeps recordings in memory until the experimenter downloads them.

## Limitations

One participant, who is also the designer and the only labeller (self-agreement κ and the public-data check
partly address this); the public check covers only four people and is not blind; one camera; deliberate blinks were cued, not driven by real intent to communicate; able-bodied adults
only; a lab reading task.

## Related work

- Soukupová & Čech (2016), real-time blink detection with facial landmarks (the EAR method).
- Grauman et al. (2003), communication via eye blinks and eyebrow raises.
- Majaranta & Räihä (2002), twenty years of eye typing.
- MacKenzie & Soukoreff (2003), phrase sets; Soukoreff & MacKenzie (2003), text-entry metrics.
- Hart & Staveland (1988), NASA-TLX.

## Citation and licence

Cite with [`CITATION.cff`](CITATION.cff). Code: MIT ([`LICENSE`](LICENSE)). Data: CC BY 4.0.
