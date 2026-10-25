/**
 * What the completed project reports (public/results/case.json, written by analysis/case_outputs.py):
 * the Eyeblink8 secondary analysis and the exploratory single session. Every number on the page comes
 * from this file; nothing is typed by hand.
 */

export interface CI {
  mean: number;
  lo: number;
  hi: number;
  n: number;
}

interface PublicDetector {
  label: string;
  ftpm_no_reject: CI;
  ftpm: CI;
  ratio_of_means: number;
  meets_halving_criterion: boolean;
  wilcoxon_p: number;
  blink_recall: number;
  frac_closed_below_reject: number;
  halving_reject_ms: number | null;
  annotated_frac_below_halving: number | null;
}

interface Pct {
  n: number;
  p5: number;
  p25: number;
  median: number;
  p75: number;
  p95: number;
}

export interface CaseResults {
  generated_at: string;
  timing: { rejectMs: number; dotMaxMs: number; dashMaxMs: number; cmdMs: number };
  public: {
    dataset: string;
    n_videos: number;
    n_people: number;
    minutes: number;
    n_blinks: number;
    annotated_blink_ms: Pct;
    annotated_frac_below_reject: number;
    detectors: Record<string, PublicDetector>;
  } | null;
  session: {
    fps: number;
    fps_by_block: Record<string, number>;
    face_frac: number;
    responses: { n_cues: number; n_match: number };
    reading: Record<string, { n_closures: number; ftpm_no_reject: number; ftpm: number }>;
    cue_response: Record<
      string,
      {
        n: number;
        correct: number;
        accuracy: number;
        confusion: Record<string, Record<string, number>>;
      }
    >;
    duration_pct: Record<string, Record<string, Pct | null>>;
    dot_sweep: Record<
      string,
      {
        n: number;
        best_accuracy: number;
        best_from_ms: number;
        best_to_ms: number;
        accuracy_at_default: number;
      }
    >;
  } | null;
}

export const CASE_URL = '/results/case.json';

export async function loadCase(): Promise<CaseResults | null> {
  try {
    const res = await fetch(CASE_URL, { cache: 'no-cache' });
    if (!res.ok) return null;
    return (await res.json()) as CaseResults;
  } catch {
    return null;
  }
}

export const f = (x: number | null | undefined, d = 1): string =>
  typeof x === 'number' && Number.isFinite(x) ? x.toFixed(d) : '–';

export const ci = (c: CI | null | undefined, d = 1): string =>
  c ? `${f(c.mean, d)} [${f(c.lo, d)}, ${f(c.hi, d)}]` : '–';

export const pctText = (x: number, d = 0): string => `${f(100 * x, d)}%`;

/** Fill every element with a data-case="key" attribute from a map of key -> text. */
export function fillSlots(root: ParentNode, values: Record<string, string>): void {
  root.querySelectorAll<HTMLElement>('[data-case]').forEach((el) => {
    const v = values[el.dataset.case ?? ''];
    if (v !== undefined) el.textContent = v;
  });
}

/** The key -> text map used by the home and research pages. */
export function caseValues(r: CaseResults): Record<string, string> {
  const v: Record<string, string> = {
    reject: f(r.timing.rejectMs, 0),
    dotMax: f(r.timing.dotMaxMs, 0),
  };
  const p = r.public;
  if (p) {
    v.pubVideos = String(p.n_videos);
    v.pubPeople = String(p.n_people);
    v.pubBlinks = String(p.n_blinks);
    v.pubMinutes = f(p.minutes, 0);
    v.pubBlinkMedian = f(p.annotated_blink_ms.median, 0);
    v.pubBelowReject = pctText(p.annotated_frac_below_reject);
    for (const [d, x] of Object.entries(p.detectors)) {
      v[`${d}before`] = f(x.ftpm_no_reject.mean);
      v[`${d}after`] = f(x.ftpm.mean);
      v[`${d}beforeCI`] = ci(x.ftpm_no_reject);
      v[`${d}afterCI`] = ci(x.ftpm);
      v[`${d}ratio`] = f(x.ratio_of_means, 2);
      v[`${d}belowReject`] = pctText(x.frac_closed_below_reject);
      if (x.halving_reject_ms != null) v[`${d}halving`] = f(x.halving_reject_ms, 0);
      if (x.annotated_frac_below_halving != null)
        v[`${d}belowHalving`] = pctText(x.annotated_frac_below_halving);
    }
  }
  const s = r.session;
  if (s) {
    v.sFps = f(s.fps, 1);
    v.sFpsMixed = f(s.fps_by_block.mixed, 1);
    v.sMatch = String(s.responses.n_match);
    v.sCues = String(s.responses.n_cues);
    const d4 = s.duration_pct.D4;
    v.sShortMedian = f(d4?.short?.median, 0);
    v.sLongMedian = f(d4?.long?.median, 0);
    v.sD3readBefore = f(s.reading.D3?.ftpm_no_reject);
    v.sD3readAfter = f(s.reading.D3?.ftpm);
    v.sD5correct = `${s.cue_response.D5?.correct ?? '–'} of ${s.cue_response.D5?.n ?? '–'}`;
    const ds = s.dot_sweep?.D4;
    if (ds) {
      v.sDotBestFrom = f(ds.best_from_ms, 0);
      v.sDotBestTo = f(ds.best_to_ms, 0);
      v.sDotBest = pctText(ds.best_accuracy);
      v.sDotDefault = pctText(ds.accuracy_at_default);
      v.sDotN = String(ds.n);
    }
    const short = s.cue_response.D4?.confusion.short;
    if (short) {
      v.sShortDash = String(short.dash ?? 0);
      v.sShortN = String(Object.values(short).reduce((a, b) => a + b, 0));
    }
  }
  return v;
}
