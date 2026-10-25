# AI use

MorsEye 2.0 was built with heavy help from an AI coding agent, Claude Code (model Claude Opus 5.5, by Anthropic).
This file is the **only** place in the repository that records the AI's part: on 25 Oct 2026 Saksham Sharma asked for
every other mention of AI to be removed from the code, documents, website and paper and gathered here. Commits do
not carry AI co-author lines either. The agent drafted this file at Saksham's request; Saksham reviews it and keeps it
current.

## Rules the work followed

These rules were in `PRD.md` §2 until 25 Oct 2026 and are kept here.

**Changed by Saksham on 24 Oct 2026.** The original rule reserved the research questions, hypotheses, threshold
choice and all paper prose for Saksham. From that date the AI agent could draft those too. Two things did not
change: everything the agent drafts is disclosed accurately (now in this file only), and the data are collected and
labelled by a person.

CaCTüS policy says AI tools "must not be used to generate ideas, develop concepts, or produce original intellectual
content." Changing the project rules does not change that policy. Before citing MorsEye in the CaCTüS application,
Saksham checks with CaCTüS whether disclosed AI-drafted text is acceptable, and describes the AI's part as this file
does.

| Task | Who |
|---|---|
| Research questions, hypotheses and analysis plan (`docs/preregistration.md`) | Agent drafted; Saksham reviewed, approved and committed it before the first session |
| Recruitment message (only if volunteers are wanted) | Agent drafted; Saksham would send it |
| Recruiting participants, running every session | Saksham, in person |
| Labelling closures / checking responses in the labelling tool | Saksham, all of it; no automatic labels count as ground truth |
| Choosing thresholds from the data | Agent proposes with reasoning; Saksham approves (never done: no labelled data) |
| Paper: every section | Agent drafted; Saksham reads and edits |
| App code, website, analysis scripts, tests, figures | Agent; Saksham reviews and must be able to explain every module |
| Commit messages | Saksham writes or approves them |
| No number without data | Nobody writes a result that did not come from the analysis scripts run on real data |

## What the AI agent did

**Software (all of it, from the specification in `PRD.md`)**

- The app: build setup (Vite, strict TypeScript, tests, linting, CI), feature extraction from MediaPipe
  FaceLandmarker, the five detectors with hysteresis, calibration, the duration segmenter, the Morse decoder and its
  commands, and the `/try` interface.
- Study Mode (`/study`) and the labelling tool (`/labeler`), including the "Import cues as drafts" feature.
- The website (`/`, `/how`, `/research`, `/data`, `/about`), its hero animation and charts, the deployment, and the
  performance work (self-hosted fonts, build-time rendering, layout-shift fixes).
- The Python analysis (`analysis/`): the planned multi-session pipeline with its synthetic test data, the Eyeblink8
  analysis (`analysis/public_blinks.py`, `scripts/extract_video_features.py`), the analysis of what the study can
  report (`analysis/case_study.py`, `analysis/case_outputs.py`), their tests, and every figure and table.
- The timetable rows in `PRD.md` marked "Build + review" were the agent's work, reviewed by Saksham.

**Documents (drafted by the agent, reviewed by Saksham)**

- `PRD.md` edits after 24 Oct 2026 (the single-person redesign, the dropped ethics review, notebook and consent
  form, the definition-of-done status of 25 Oct 2026).
- `docs/preregistration.md`: the whole document (the research questions and hypotheses follow the plan in `PRD.md`;
  the agent wrote their wording and the analysis decisions, including the H2 non-inferiority margin, the exclusion
  and stopping rules, the Holm families and the threshold-selection rule) and every entry in its Deviations section.
  Its header said "Drafted by: Claude Code (AI agent)" until 25 Oct 2026; that line was moved here.
- `docs/decisions.md`: every implementation choice listed under "Implementation choices made while building the
  software", the cue-draft feature, and the note on session 1's types-only labels.
- `docs/public-data.md`: the dataset survey and the Researcher's Night request email (drafted, not sent).
- `docs/recruitment.md`, the two reading passages and the 15 study phrases (`src/study/protocol.ts`).
- `data/DATASHEET.md` (filled in on 25 Oct 2026 from the session log and its setup notes) and
  `data/public/README.md`.
- `README.md`, `paper/README.md` and this file.

**The Eyeblink8 analysis is not blind because of the agent.** Before the preregistration was drafted (24 Oct 2026),
the agent computed the annotated blink lengths for all 8 Eyeblink8 videos (median 272 ms, 5th–95th percentile
192–560 ms, 9% under 200 ms) and ran D1 and D3 on one video (video 9). The preregistration, `docs/public-data.md` and
the paper say that these were computed before the plan was written, without saying by whom; it was the agent.

**After data collection ended (25 Oct 2026)**

- It recovered the session 1 response types from the labelling tool's saved browser state (Export was blocked by
  unconfirmed drafts) and wrote `P01_A_cue_types.csv`; the types themselves are Saksham's.
- It prepared the data release in `data/public/`.
- It drafted **every section of the paper** (`paper/main.tex`): the title, abstract, introduction, related work,
  system, the planned study and what happened, the public-video and session results, discussion, limitations,
  ethics and data, and conclusion, and added three BibTeX entries (Eyeblink8, Researcher's Night, MediaPipe). The
  related-work sentences come from the agent's general knowledge of those papers and must be checked against the
  papers themselves. On 25 Oct 2026, at Saksham's request, the paper's own "Use of AI Tools" section and its draft
  notice were removed; this file is now the paper's AI-use statement. If the paper is submitted to a venue that
  requires an AI-use statement in the paper, one has to be added back from this file.
- It added the exploratory sweeps (reject window, dot–dash boundary), the measured-versus-annotated comparison, the
  calibration table, the example trace and figures C1–C7, and rewrote the site's results text and the README
  results to match.
- It deleted the old Vercel project at Saksham's request.

The site's `/about` page showed this file as an "AI-use statement" until 25 Oct 2026; that section and its footer link
were removed at Saksham's request.

## What Saksham did

- Wrote the project plan (`PRD.md`) that the agent worked from, and changed its rules on 24 Oct 2026.
- Reviewed and approved the preregistration before committing it (24 Oct 2026), and reviews the other documents.
- Is the study's participant: recorded the one detection session (24 Oct 2026).
- Checked the response type of every cue in session 1 in the labelling tool.
- Decided to drop the ethics review, the lab notebook and the consent form, to finalise session 1 with types only,
  and to stop data collection after one session (24–25 Oct 2026).
- Read the paper draft, tried the app at `/try`, and decided to publish the session data, not to request the
  Researcher's Night dataset, and to keep all AI disclosure in this file (25 Oct 2026).
- Read every paper the draft cites, tested `/try` with the NVDA screen reader, and reviewed this file (25 Oct 2026).
- No automatic labels are used as ground truth; the only human judgements in the data (session 1's response types)
  are Saksham's.

## What no one did

No result in this project is written by hand. Every reported number, figure and table comes from
`python -m analysis.public_blinks` and `python -m analysis.case_study`; the interactive charts of the planned
multi-session analysis on `/research` are clearly marked synthetic test data.
