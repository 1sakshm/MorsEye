# data/public

The public, features-only dataset (licence CC BY 4.0, see `LICENSE-DATA`; datasheet: `data/DATASHEET.md`).
Released 25 Oct 2026. It holds the project's one recorded session.

```
python -m analysis.case_study --data data/public   # regenerates the session results in the paper
```

## Files

| File | What it is |
|---|---|
| `P01_A_2026-10-24.jsonl` | Study A session log, exactly as downloaded from Study Mode (`morseye-log/1`, schema in `src/study/schema.ts`) |
| `P01_A_cue_types.csv` | One row per cue: `cue_ms,cue,block,response_type,labeller,labelled_at`; `response_type` is `short`, `long`, `wink-L`, `wink-R` or `none`, as checked by the participant. **Not** closure times; never used as detection ground truth |
| `P01_A_cue_types_meta.json` | How the CSV was built (from the labelling tool's saved state) |

The loader (`analysis/load.py`) would also read `<participant>_<study>_labels.csv` files with closure onsets and
offsets; this release has none.

## Never put here

- video (`*.webm`, `*.mp4`) or images of any kind; `data/video/` and `data/raw/` are gitignored;
- names, emails or anything else that links an ID to a person;
- landmarks beyond the 12 eye points (the loader refuses logs that contain more);
- synthetic data (`python -m analysis.synth`).

Before committing, check: `git ls-files | grep -iE "webm|mp4|jpg|png"` and review every hit.
