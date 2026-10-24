# AI use

MorsEye 2.0 was built with heavy help from an AI coding agent, Claude Code (model Claude Opus 5.5, by Anthropic).
This file lists what the agent did and what Saksham Sharma did. The agent drafted this file at Saksham's request;
he reviews it and keeps it current. Commits in this repository do not carry AI co-author lines, so this file is the
record of the AI's part.

## What the AI agent did

**Software (all of it, from the specification in `PRD.md`)**

- The app: build setup (Vite, strict TypeScript, tests, linting, CI), feature extraction from MediaPipe
  FaceLandmarker, the five detectors with hysteresis, calibration, the duration segmenter, the Morse decoder and its
  commands, and the `/try` interface.
- Study Mode (`/study`) and the labelling tool (`/labeler`).
- The website (`/`, `/how`, `/research`, `/data`, `/about`), its hero animation and charts, and the deployment.
- The Python analysis pipeline (`analysis/`), its synthetic test data, its tests, and the figure and table scripts.
- The paper's LaTeX skeleton (`paper/`).

**Study materials and documents (drafted by the agent, reviewed by Saksham)**

- The consent form (`docs/consent.md`) and the recruitment message (`docs/recruitment.md`).
- The two reading passages and the selection of 15 phrases used in the study (`src/study/protocol.ts`).
- The preregistration (`docs/preregistration.md`): the wording of the research questions and hypotheses, and the
  analysis decisions in it, including the H2 non-inferiority margin, the exclusion and stopping rules, the Holm
  families and the rule for choosing the final thresholds. The research questions and hypotheses follow the plan
  in `PRD.md`.
- The implementation choices listed in `docs/decisions.md`, the README, the dataset datasheet template and this
  file.

**Study redesign and public data (24 Oct 2026)**

- When no participants were available, the agent proposed the single-person design with a public-data check, and
  rewrote the preregistration for it.
- It surveyed public blink datasets (`docs/public-data.md`), downloaded Eyeblink8, wrote
  `scripts/extract_video_features.py` and `analysis/public_blinks.py`, and ran them. Before the preregistration
  was drafted it had already seen the Eyeblink8 blink lengths and the results on one video; this is recorded so the
  Eyeblink8 analysis is not mistaken for a blind test.
- It drafted the request email for the Researcher's Night dataset.

On 24 Oct 2026 Saksham changed the project rules (PRD §2) so that the agent may also draft the paper text and
propose the final thresholds. Any section of the paper the agent drafts will be listed here and in the paper's
AI-use statement.

## What Saksham did

- Wrote the project plan (`PRD.md`) that the agent worked from, and changed its rules on 24 Oct 2026.
- Reviews and approves every document above before it is used.
- Is the study's participant: records every session himself (and runs any session with volunteers in person).
- Requests the Researcher's Night dataset.
- Labels every closure in the data himself; no automatic labels are used as ground truth.

## What no one did

No result in this project is written by hand. Every number, figure and table comes from
`python -m analysis.run` on the recorded sessions; until real data exist, the site and the paper draft show
clearly marked synthetic test data or "pending".
