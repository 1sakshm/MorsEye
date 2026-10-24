import type { CI, SiteResults } from './results';

/** Where analysis/export_site.py writes the site data. */
export const RESULTS_URL = '/results/site.json';

/**
 * Loads the results file. Returns null when it is missing, unreadable or of another schema,
 * so pages can fall back to their "results pending" state instead of breaking.
 * In development only, `?results=/path.json` points the page at another file for testing.
 */
export async function loadResults(): Promise<SiteResults | null> {
  let url = RESULTS_URL;
  if (import.meta.env.DEV) {
    const override = new URLSearchParams(location.search).get('results');
    if (override && override.startsWith('/')) url = override;
  }
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return null;
    const json = (await res.json()) as Partial<SiteResults>;
    if (json?.schema !== 'morseye-site/1') return null;
    return json as SiteResults;
  } catch {
    return null;
  }
}

/** True when the file holds real study results that may be shown as findings. */
export function hasRealResults(r: SiteResults | null): r is SiteResults {
  return !!r && !r.synthetic && r.n_participants > 0;
}

export function fmtNum(x: number, digits = 2): string {
  if (!Number.isFinite(x)) return '–';
  return x.toFixed(digits);
}

/** "0.81 [0.74, 0.88]" */
export function fmtCI(c: CI | null | undefined, digits = 2): string {
  if (!c) return '–';
  return `${fmtNum(c.mean, digits)} [${fmtNum(c.lo, digits)}, ${fmtNum(c.hi, digits)}]`;
}

export function pct(x: number, digits = 1): string {
  if (!Number.isFinite(x)) return '–';
  return `${(x * 100).toFixed(digits)}%`;
}

export const SYNTHETIC_NOTE =
  'Synthetic demo data — generated to test the pipeline. Not study results.';
