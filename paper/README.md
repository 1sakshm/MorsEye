# Paper

ACM `acmart` (`sigconf`), 4–6 pages + references (PRD §8).

```
python -m analysis.run --data data/public   # writes figures/ and tables/ (never edit those by hand)
cd paper && latexmk                          # builds main.pdf
```

- `main.tex` holds the structure. Since 24 Oct 2026 (PRD §2) the AI agent may draft any section for Saksham to
  review; each drafted section is named in `AI_USE.md` and in the paper's AI-use statement.
- Numbers in the text come from `analysis/out/summary.json` through `\ME{key}` macros in
  `tables/numbers.tex` (for example `\ME{f1-D1}`, `\ME{f1-D4-k5}`, `\ME{cpm-B3}`). When the outputs were
  made from synthetic data, every such number prints in red with a dagger and a banner appears under the title.
- `references.bib` holds placeholders for the PRD §8.4 reading list. Replace each entry with the
  publisher's BibTeX after reading the paper.
