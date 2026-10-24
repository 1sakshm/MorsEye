# Public blink datasets

Checked on 24 Oct 2026 for the single-person design (`docs/preregistration.md`). Public datasets contain only
**spontaneous** blinks; none has deliberate, Morse-style closures. They are used for the natural-blink questions
(false triggers while reading or at rest, and natural blink durations), never for deliberate-closure detection.

| Dataset | People / videos | Blinks | fps | Access | Use here |
|---|---|---|---|---|---|
| **Eyeblink8** (Drutarovsky & Fogelton, 2014) | 4 people (1 with glasses), 8 videos, ~40 min, home setting | 408 annotated | 30 (measured 31.2) | Direct download, GPL-3.0 ([blinkingmatters.com/research](https://www.blinkingmatters.com/research)) | **Used.** Secondary analysis (not blind, see below) |
| **Researcher's Night** (Fogelton & Benesova, 2016) | many people (~20% glasses), 107 videos, ~223k frames | 1,849 annotated | 15 and 30 | "Available on demand"; contact support@blinkingmatters.com | **Requested** (email below). Would be the blind, confirmatory multi-person check |
| Talking Face (INRIA) | 1 person, 200 s | 61 | 25 | Annotations from blinkingmatters; video from INRIA | Not needed (one person) |
| ZJU (Pan et al., 2007) | 20 people, 80 clips | 261 | ~30, irregular | Annotations from blinkingmatters; videos from the authors' site | Low resolution (320×240); not used |
| Silesian5 | 5 people | 300 | 100 | Signed licence agreement | Not used (high-speed camera, not a webcam) |
| HUST-LEBW, mEBAL2 | many | many | various | Separate terms | Not checked further: trimmed clips or NIR cameras, unlike a laptop webcam |

## How the videos are processed

1. Download and unpack the dataset outside the repository (the videos are never committed).
2. Extract the app's per-frame features with the same MediaPipe version and model as the app:
   `scripts/extract_video_features.py` (its own environment, `requirements-video.txt`). Output goes to
   `data/external/<dataset>/<video>.jsonl`: per frame only `t_ms`, `face`, `earL`, `earR`, `blinkL`, `blinkR`.
3. `python -m analysis.public_blinks --dataset <unpacked folder>` runs the fixed-threshold detectors (D1, D3)
   and the segmenter, matches detections to the annotated blinks (IoU ≥ 0.3), and writes
   `analysis/out/public_blinks.json`.

Differences from the app: the Python MediaPipe build instead of the browser WASM build (same version, 0.10.21,
same model file); one face instead of two; frame times from the dataset's timestamp files.

## What the agent saw before the preregistration was written

So that nobody mistakes the Eyeblink8 analysis for a blind test: before drafting the single-person
preregistration, the AI agent (24 Oct 2026) computed the annotated blink lengths for all 8 Eyeblink8 videos
(median 272 ms, 5th–95th percentile 192–560 ms, 9% under 200 ms) and ran D1 and D3 on one video (video 9).
The Eyeblink8 results are therefore reported as a secondary, non-blind analysis.

## Request email for Researcher's Night (to send)

> **To:** support@blinkingmatters.com
> **Subject:** Request for the Researcher's Night blink dataset (research use)
>
> Dear Dr Fogelton,
>
> I am a student at BITS Pilani working on MorsEye, an open-source browser system that types Morse code from
> deliberate eye closures on a laptop webcam. I would like to use the Researcher's Night dataset to measure how
> often natural blinks would be mistaken for deliberate input by landmark-based detectors (MediaPipe
> FaceLandmarker), as an independent check alongside my own recordings. I have already used Eyeblink8 for a
> preliminary analysis and will cite your papers.
>
> I would use the videos only on my own computer, publish only aggregate results (and, if you allow it,
> per-frame eye features without images), and not redistribute the videos. I am happy to agree to any terms.
>
> Thank you very much,
> Saksham Sharma
> BITS Pilani — ____ (email)

## Citations

- Drutarovsky, T. & Fogelton, A. (2014). Eye blink detection using variance of motion vectors. *ECCV 2014
  Workshops*, LNCS 8927, Springer. doi:10.1007/978-3-319-16199-0_31. (Eyeblink8.)
- Fogelton, A. & Benesova, W. (2016). Eye blink detection based on motion vectors analysis. *Computer Vision and
  Image Understanding* 148, 23–33. (Researcher's Night.)
