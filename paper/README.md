# Paper

ACM `acmart` (`sigconf`), 4 pages + references (PRD §8).

```
python -m analysis.public_blinks --dataset <unpacked eyeblink8/>   # Eyeblink8 -> analysis/out/public_blinks.json
python -m analysis.case_study --data data/raw                     # figures/C*, F1 and tables/case_* (never edit)
npm run paper                                                     # builds main.pdf and copies it to the site
```

- Every section of `main.tex` was drafted by the AI agent on 25 Oct 2026 (PRD §2 allows it) and is listed in
  `AI_USE.md` and in the paper's AI-use section. Saksham reviews and edits it; `\unreviewedfalse` removes the
  draft notice.
- Numbers in the text come from `analysis/out/results.json` through `\CS{key}` macros in
  `tables/case_numbers.tex` (for example `\CS{pub-D3-after}`).
- `references.bib`: only cited entries are printed. Every entry is a placeholder to replace with the publisher's
  BibTeX after reading the paper.
- `tables/numbers.tex`, `T1`-`T3` and `F2`-`F8` belong to the planned multi-session analysis
  (`python -m analysis.run`) and are not used by the paper.
