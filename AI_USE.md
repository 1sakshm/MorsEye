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

- The recruitment message (`docs/recruitment.md`), kept in case volunteers are wanted later.
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
propose the final thresholds.

**After data collection ended (25 Oct 2026)**

- It recovered the session 1 response types from the labelling tool's saved browser state (Export was blocked by
  unconfirmed drafts) and wrote `data/raw/P01_A_cue_types.csv`; the types themselves are Saksham's.
- It drafted the Deviations entries for the stop, the types-only labels and the frame-rate correction.
- It wrote `analysis/case_study.py` and `analysis/case_outputs.py` (the Eyeblink8 secondary analysis and the
  exploratory session 1 analysis), re-ran the Eyeblink8 analysis from the original annotations, and made figures
  C1–C3 and the paper tables.
- It drafted **every section of the paper** (`paper/main.tex`: title, abstract, introduction, related work,
  system, the planned study and what happened, the public-video and session results, discussion, limitations,
  ethics and data, the AI-use statement and conclusion). The related-work sentences come from the agent's general
  knowledge of those papers and must be checked against the papers themselves.
- It rewrote the site's results text (home page, `/research`) and the README results to match.

## What Saksham did

- Wrote the project plan (`PRD.md`) that the agent worked from, and changed its rules on 24 Oct 2026.
- Reviews and approves every document above before it is used.
- Is the study's participant: recorded the one detection session (24 Oct 2026).
- Checked the response type of every cue in session 1 in the labelling tool.
- Decided to drop the ethics review, the lab notebook and the consent form, to finalise session 1 with types only,
  and to stop data collection after one session (24–25 Oct 2026).
- Requests the Researcher's Night dataset.
- No automatic labels are used as ground truth; the only human judgements in the data (session 1's response types)
  are Saksham's.

## What no one did

No result in this project is written by hand. Every reported number, figure and table comes from
`python -m analysis.public_blinks` and `python -m analysis.case_study`; the interactive charts of the planned
multi-session analysis on `/research` are clearly marked synthetic test data.
