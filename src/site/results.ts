/**
 * The JSON consumed by /research and the home page: public/results/site.json.
 * Written ONLY by analysis/export_site.py from analysis outputs. Never edit by hand.
 *
 * Until Study A has been analysed, the file is produced from the synthetic generator
 * (analysis/synth.py) and has `synthetic: true`; pages must then show a clear
 * "synthetic demo data, not study results" banner and must not show headline numbers.
 */

export interface CI {
  mean: number;
  lo: number;
  hi: number;
}

export interface PerParticipant {
  p: string; // P01…
  value: number;
}

export interface DurationSet {
  /** Closure durations in ms by labelled type. */
  spontaneous: number[];
  short: number[];
  long: number[];
  /** Minutes of spontaneous-block recording these spontaneous closures came from. */
  spontaneous_minutes: number;
}

export interface DetectorResult {
  id: 'D1' | 'D2' | 'D3' | 'D4' | 'D5';
  label: string;
  /** Event-level F1 for deliberate closures, IoU >= 0.3. */
  f1: CI;
  f1_pp: PerParticipant[];
  /** False triggers per minute in the spontaneous block (closures that would produce a symbol). */
  ftpm: CI;
  ftpm_pp: PerParticipant[];
  precision: CI;
  recall: CI;
}

export interface KShotPoint {
  detector: 'D2' | 'D4';
  k: number; // 0 = fixed threshold
  f1: CI;
}

export interface TextEntryBlock {
  block: 1 | 2 | 3;
  cpm: CI;
  /** MSD-based uncorrected character error rate, 0..1. */
  error: CI;
}

export interface SiteResults {
  schema: 'morseye-site/1';
  generated_at: string;
  synthetic: boolean;
  n_participants: number;
  /**
   * Unit of analysis: one value per participant, or per session in the single-person design.
   * Missing in files written before it existed, which were per participant.
   */
  unit?: 'participant' | 'session';
  /** CI method, e.g. "95% percentile bootstrap over participants, 10,000 resamples". */
  ci_method: string;
  /** The segmenter timing in use (the values the duration explorer starts from). */
  timing: {
    rejectMs: number;
    dotMaxMs: number;
    dashMaxMs: number;
    cmdMs: number;
    letterGapMs: number;
    wordGapMs: number;
  };
  /** Headline numbers for the home page; null until real (non-synthetic) results exist. */
  headline: {
    f1_uncalibrated: CI & { detector: string };
    f1_calibrated: CI & { detector: string; k: number };
    ftpm_before: CI;
    ftpm_after: CI;
    cpm_block3: CI | null;
    error_block3: CI | null;
  } | null;
  durations: { pooled: DurationSet; participants: Record<string, DurationSet> };
  detectors: DetectorResult[];
  kshot: KShotPoint[];
  text_entry: {
    blocks: TextEntryBlock[];
    per_participant: { p: string; cpm: number[]; error: number[] }[];
  } | null;
  fps: { p: string; fps: number; duration_error_ms: number; frame_interval_ms: number }[];
  /** Relative links to downloadable CSVs (under /results/). */
  downloads: Record<string, string>;
}

/** "participant(s)" or "session(s)", for the unit of analysis in these results. */
export function unitWord(r: Pick<SiteResults, 'unit'>, n = 2): string {
  const w = r.unit === 'session' ? 'session' : 'participant';
  return n === 1 ? w : `${w}s`;
}

/** The sentence about who was studied, for real (non-synthetic) results. */
export function whoSentence(r: Pick<SiteResults, 'unit' | 'n_participants'>): string {
  const who =
    r.unit === 'session'
      ? `Results come from ${r.n_participants} sessions of one able-bodied adult, the author.`
      : `Participants were ${r.n_participants} able-bodied adult volunteers.`;
  return `${who} The system has not been tested with people with motor impairments, and no clinical claim is made.`;
}
