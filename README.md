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

**Status:** research prototype. Study A is in progress; results will be reported here from
`analysis/out/summary.json`. It has not been tested with people with motor impairments, and no clinical claim is made.

## Key results

Pending (November 2026). The study is a preregistered single-person case study (the author, over many sessions)
plus a check on a public blink-video dataset ([`docs/preregistration.md`](docs/preregistration.md)). This section
will hold three numbers, each with a 95% CI across sessions:
deliberate-closure F1 with and without calibration, false triggers per minute while reading, and characters per
minute after three practice blocks.

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
python -m analysis.run --data data/public         # regenerates every number, table and figure
python -m analysis.run --synthetic                # the same pipeline on clearly-marked synthetic data
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

## AI use

See [`AI_USE.md`](AI_USE.md).

## Citation and licence

Cite with [`CITATION.cff`](CITATION.cff). Code: MIT ([`LICENSE`](LICENSE)). Data: CC BY 4.0.
