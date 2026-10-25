# Paper

ACM `acmart` (`sigconf`), 4 pages + references (PRD §8).

```
python -m analysis.public_blinks --dataset <unpacked eyeblink8/>   # Eyeblink8 -> analysis/out/public_blinks.json
python -m analysis.case_study --data data/public                  # figures/C*, F1 and tables/case_* (never edit)
npm run paper                                                     # builds main.pdf and copies it to the site
```

- Saksham reviews and edits `main.tex`.
- Numbers in the text come from `analysis/out/results.json` through `\CS{key}` macros in
  `tables/case_numbers.tex` (for example `\CS{pub-D3-after}`).
- `references.bib`: only cited entries are printed. Every entry is a placeholder to replace with the publisher's
  BibTeX after reading the paper.
- `tables/numbers.tex`, `T1`-`T3` and `F2`-`F8` belong to the planned multi-session analysis
  (`python -m analysis.run`) and are not used by the paper.
