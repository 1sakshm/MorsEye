import type { Segment, Timing } from '../segment/segmenter';

export const MORSE: Readonly<Record<string, string>> = {
  '.-': 'A', '-...': 'B', '-.-.': 'C', '-..': 'D', '.': 'E', '..-.': 'F', '--.': 'G', '....': 'H',
  '..': 'I', '.---': 'J', '-.-': 'K', '.-..': 'L', '--': 'M', '-.': 'N', '---': 'O', '.--.': 'P',
  '--.-': 'Q', '.-.': 'R', '...': 'S', '-': 'T', '..-': 'U', '...-': 'V', '.--': 'W', '-..-': 'X',
  '-.--': 'Y', '--..': 'Z',
  '.----': '1', '..---': '2', '...--': '3', '....-': '4', '.....': '5',
  '-....': '6', '--...': '7', '---..': '8', '----.': '9', '-----': '0',
  '.-.-.-': '.', '--..--': ',', '..--..': '?',
}; // prettier-ignore

export const REVERSE_MORSE: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(MORSE).map(([k, v]) => [v, k]),
);

/** Two "hold"-band closures this close together (end of first to start of second) toggle pause. */
export const PAUSE_WINDOW_MS = 4000;

export type DecoderAction =
  | { type: 'symbol'; symbol: '.' | '-'; pattern: string }
  | { type: 'letter'; char: string; pattern: string }
  | { type: 'unknown'; pattern: string }
  | { type: 'space' }
  | { type: 'backspace'; removed: string; what: 'pattern' | 'char' }
  | { type: 'pause'; paused: boolean }
  | { type: 'speak'; text: string }
  | { type: 'ignored'; band: Segment['band'] };

/**
 * Morse state machine (PRD §5.3). Pure and clock-free: callers pass timestamps, so the same
 * code runs live (tick every frame) and offline over recorded logs.
 *
 * - Gaps are measured from the end of the last counted closure. Rejected closures do not count.
 * - A letter is committed after `letterGapMs`; one space is inserted after `wordGapMs`, and only
 *   once per committed letter (no double spaces, and a deleted space is not re-added).
 * - An unknown pattern is reported but never inserted into the text.
 * - Backspace removes the partial letter if there is one, otherwise the last character.
 * - Left wink: commit + space. Right wink: speak the text. (Only when winks are enabled.)
 */
export class Decoder {
  text = '';
  pattern = '';
  paused = false;

  private lastEnd: number | null = null;
  private spaceArmed = false;
  private lastHoldEnd: number | null = null;

  constructor(
    public timing: Timing,
    public winks = false,
  ) {}

  /** Feed a segmented closure. Commits anything whose gap expired before the closure began. */
  push(seg: Segment): DecoderAction[] {
    const out = this.tick(seg.start_ms, false);

    if (seg.band === 'reject') {
      out.push({ type: 'ignored', band: seg.band });
      return out;
    }

    if (seg.band === 'hold' && seg.eye === 'both') {
      if (this.lastHoldEnd !== null && seg.start_ms - this.lastHoldEnd <= PAUSE_WINDOW_MS) {
        this.lastHoldEnd = null;
        this.paused = !this.paused;
        if (this.paused) out.push(...this.commitLetter());
        this.lastEnd = seg.end_ms;
        out.push({ type: 'pause', paused: this.paused });
      } else {
        this.lastHoldEnd = seg.end_ms;
        out.push({ type: 'ignored', band: seg.band });
      }
      return out;
    }
    this.lastHoldEnd = null;

    if (this.paused) {
      out.push({ type: 'ignored', band: seg.band });
      return out;
    }

    if (seg.eye !== 'both') {
      if (!this.winks) {
        out.push({ type: 'ignored', band: seg.band });
        return out;
      }
      this.lastEnd = seg.end_ms;
      if (seg.eye === 'left') {
        out.push(...this.commitLetter());
        out.push(...this.insertSpace());
      } else {
        out.push({ type: 'speak', text: this.text.trim() });
      }
      return out;
    }

    this.lastEnd = seg.end_ms;
    if (seg.band === 'dot' || seg.band === 'dash') {
      const symbol = seg.band === 'dot' ? '.' : '-';
      this.pattern += symbol;
      out.push({ type: 'symbol', symbol, pattern: this.pattern });
    } else if (seg.band === 'backspace') {
      out.push(this.backspace());
    }
    return out;
  }

  /** Advance the clock. Call every frame live; pass `closed` while an eye closure is in progress. */
  tick(t_ms: number, closed: boolean): DecoderAction[] {
    if (this.paused || closed || this.lastEnd === null) return [];
    const gap = t_ms - this.lastEnd;
    const out: DecoderAction[] = [];
    if (this.pattern && gap >= this.timing.letterGapMs) out.push(...this.commitLetter());
    if (this.spaceArmed && gap >= this.timing.wordGapMs) out.push(...this.insertSpace());
    return out;
  }

  /** Commit everything still pending (end of a recording). */
  flush(): DecoderAction[] {
    if (this.lastEnd === null) return [];
    return this.tick(this.lastEnd + this.timing.wordGapMs, false);
  }

  commitLetter(): DecoderAction[] {
    if (!this.pattern) return [];
    const pattern = this.pattern;
    this.pattern = '';
    const char = MORSE[pattern];
    if (char === undefined) return [{ type: 'unknown', pattern }];
    this.text += char;
    this.spaceArmed = true;
    return [{ type: 'letter', char, pattern }];
  }

  insertSpace(): DecoderAction[] {
    this.spaceArmed = false;
    if (!this.text || this.text.endsWith(' ')) return [];
    this.text += ' ';
    return [{ type: 'space' }];
  }

  backspace(): DecoderAction {
    if (this.pattern) {
      const removed = this.pattern;
      this.pattern = '';
      return { type: 'backspace', removed, what: 'pattern' };
    }
    const removed = this.text.slice(-1);
    this.text = this.text.slice(0, -1);
    this.spaceArmed = false;
    return { type: 'backspace', removed, what: 'char' };
  }

  clear(): void {
    this.text = '';
    this.pattern = '';
    this.lastEnd = null;
    this.spaceArmed = false;
    this.lastHoldEnd = null;
  }
}

/** Encode text as Morse with spaces between letters and " / " between words (for cards and the hero). */
export function encode(text: string): string {
  return text
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) =>
      [...w]
        .map((c) => REVERSE_MORSE[c] ?? '')
        .filter(Boolean)
        .join(' '),
    )
    .join(' / ');
}
