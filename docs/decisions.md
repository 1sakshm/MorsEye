# Decisions

[HUMAN] Dated decisions with reasons. In particular (PRD §3.6, §5.3, §11): the final `REJECT_MS`, `DOT_MAX_MS`,
`DASH_MAX_MS`, `CMD_MS`, letter and word gaps, chosen from the Study A duration distributions, and the detector chosen
for Study B. Include the numbers you looked at (e.g. the percentile of spontaneous blinks below the reject threshold).

When the thresholds are final, update `DEFAULT_TIMING` in `src/segment/segmenter.ts` and note the commit here.

## Implementation choices made while building the software (for review)

These were made by the coding agent to fill gaps in the PRD. Review and keep, change or reject each one.

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
