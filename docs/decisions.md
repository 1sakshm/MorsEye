# Decisions

Dated decisions with reasons. Since 24 Oct 2026 (PRD §2) a decision may be proposed with its reasoning for Saksham
to approve. In particular (PRD §3.6, §5.3, §11): the final `REJECT_MS`, `DOT_MAX_MS`,
`DASH_MAX_MS`, `CMD_MS`, letter and word gaps, chosen from the Study A duration distributions by the rule in
`docs/preregistration.md` section 8, and the detector chosen for Study B. Include the numbers you looked at (e.g. the percentile of spontaneous blinks below the reject threshold).

When the thresholds are final, update `DEFAULT_TIMING` in `src/segment/segmenter.ts` and note the commit here.

## Implementation choices made while building the software (for review)

These were made while building the software, to fill gaps in the PRD. Review and keep, change or reject each one.

- **Pause gesture.** The PRD says "two long closures within 4 s" toggle pause. Closures of `DASH_MAX_MS`–`CMD_MS`
  (1.4–2.0 s by default) are otherwise unused, so they are the "pause" band: two of them, the second starting within
  4 s of the end of the first, toggle input. A single one does nothing. This keeps backspace (≥ 2 s) free of side effects.
- **Gap timing ignores rejected blinks.** A spontaneous (rejected) blink does not restart the letter or word gap.
- **Word gap fires once per letter.** After a backspace removes a space, waiting does not re-insert it.
- **Wink mode uses `min(eyeBlinkLeft, eyeBlinkRight)`** for the main both-eye detector, so a wink is not also a dot.
  With the EAR detector a wink can still register as a dot (visible in the replay fixture).
- **Calibration closure peaks.** Each cued closure contributes one "closed" value: the deepest point of the signal in
  the 2 s after the cue onset. The open value is the median over the open period.
- **Unknown patterns** are announced and spoken but not inserted; the v1 `[..-.?]` insertion is gone.
- **Study B phrase selection** (`src/study/protocol.ts`): 15 phrases chosen to be short; verify each against the
  original MacKenzie & Soukoreff file and check the session length (about 2 min per 20-character phrase at 10 CPM).
- **Cue drafts in the labeller** (added 25 Oct 2026 at Saksham's request). "Import cues as drafts" turns each cue
  into an event with the cue's type and the cue's window (cue onset to +1.8 s) as placeholder times. A draft cannot
  be exported: the labeller must set its onset and offset with `[` `]` (which confirms it), retype it, or delete it.
  No detector output is used, so detectors are not graded against themselves; this is the "cue-based candidates"
  case allowed by the preregistration (§6). Natural blinks have no cue and are still marked from scratch. The
  export metadata records `n_from_cue_drafts`, and the paper should state that cue drafts were used. Cue types
  can anchor the labeller, so a draft's type is changed whenever the closure actually made differs from the cue.
- **Session 1 labels are types only** (25 Oct 2026, Saksham's choice). The labeller confirmed the cue drafts' types
  but not their times, and Export refuses drafts, so the labeller's saved state was read from the browser and
  wrote `data/raw/P01_A_cue_types.csv` (one response type per cue; how it was built is in
  `P01_A_cue_types_meta.json`). The loader never treats that file as labels, and session 1 is skipped in the
  detection analysis; see the preregistration's Deviations.
