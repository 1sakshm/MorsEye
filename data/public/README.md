# data/public

The public, features-only dataset (licence CC BY 4.0, see `LICENSE-DATA`; datasheet:
`data/DATASHEET.md`). It is empty until Study A has been collected and labelled.

`python -m analysis.run --data data/public` regenerates every number and figure in the paper from the
files in this folder.

## Files

| File | What it is |
|---|---|
| `P07_A_2026-11-03.jsonl` | Study A session log, exactly as downloaded from Study Mode (`morseye-log/1`, schema in `src/study/schema.ts`) |
| `P07_A_labels.csv` | Human labels for that session: `onset_ms,offset_ms,type,labeller,labelled_at`; `type` is `spontaneous`, `short`, `long`, `wink-L` or `wink-R`; times are on the log's frame clock |
| `P07_A_labels_relabel.csv` | Second labelling pass, a week later (two participants), for self-agreement |
| `P07_B_2026-11-09.jsonl` | Study B session log (phrases, decoder actions, NASA-TLX) |

A label file is matched to its log by `<log name>_labels.csv` or `<participant>_<study>_labels.csv`.

## Never put here

- video (`*.webm`, `*.mp4`) or images of any kind; `data/video/` and `data/raw/` are gitignored;
- names, initials, emails or anything else that links an ID to a person;
- landmarks beyond the 12 eye points (the loader refuses logs that contain more);
- synthetic data (`python -m analysis.synth`); the analysis marks every output from synthetic logs as
  synthetic, but keep them out of this folder anyway.

Before committing, check: `git ls-files | grep -iE "webm|mp4|jpg|png"` and review every hit.
