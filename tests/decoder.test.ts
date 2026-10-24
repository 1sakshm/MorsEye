import { describe, expect, it } from 'vitest';
import { Decoder, encode, PAUSE_WINDOW_MS, type DecoderAction } from '../src/decode/decoder';
import { DEFAULT_TIMING as T, segment, type Band } from '../src/segment/segmenter';
import type { Closure } from '../src/types';

const DUR: Record<Band, number> = { reject: 120, dot: 350, dash: 900, hold: 1600, backspace: 2300 };

/** Drives a decoder with closures described as a compact script. */
class Driver {
  dec = new Decoder(T, true);
  t = 0;
  actions: DecoderAction[] = [];

  close(b: Band, eye: Closure['eye'] = 'both') {
    const d = DUR[b];
    const c: Closure = { start_ms: this.t, end_ms: this.t + d, duration_ms: d, eye };
    this.actions.push(...this.dec.push(segment(c, T)));
    this.t += d;
    return this;
  }

  wait(ms: number) {
    // Tick every 33 ms, as the live app does.
    const end = this.t + ms;
    for (; this.t < end; this.t += 33) this.actions.push(...this.dec.tick(this.t, false));
    this.t = end;
    this.actions.push(...this.dec.tick(this.t, false));
    return this;
  }

  letter(pattern: string, gap = 300) {
    [...pattern].forEach((s, i) => {
      this.close(s === '.' ? 'dot' : 'dash');
      if (i < pattern.length - 1) this.wait(gap);
    });
    return this;
  }
}

describe('decoder', () => {
  it('types SOS', () => {
    const d = new Driver();
    d.letter('...').wait(T.letterGapMs);
    d.letter('---').wait(T.letterGapMs);
    d.letter('...').wait(T.letterGapMs);
    expect(d.dec.text).toBe('SOS');
  });

  it('types HELLO WORLD with one space from the word gap', () => {
    const d = new Driver();
    const word = (w: string[]) => w.forEach((p) => d.letter(p).wait(T.letterGapMs));
    word(['....', '.', '.-..', '.-..', '---']);
    d.wait(T.wordGapMs);
    word(['.--', '---', '.-.', '.-..', '-..']);
    expect(d.dec.text).toBe('HELLO WORLD');
  });

  it('does not commit a letter before the letter gap', () => {
    const d = new Driver();
    d.letter('.').wait(T.letterGapMs - 50);
    expect(d.dec.text).toBe('');
    expect(d.dec.pattern).toBe('.');
    d.wait(60);
    expect(d.dec.text).toBe('E');
  });

  it('commits at exactly the letter gap', () => {
    const dec = new Decoder(T);
    dec.push({ band: 'dot', start_ms: 0, end_ms: 300, duration_ms: 300, eye: 'both' });
    expect(dec.tick(300 + T.letterGapMs - 1, false)).toEqual([]);
    expect(dec.tick(300 + T.letterGapMs, false)).toEqual([
      { type: 'letter', char: 'E', pattern: '.' },
    ]);
  });

  it('does not commit while the eye is closed', () => {
    const dec = new Decoder(T);
    dec.push({ band: 'dot', start_ms: 0, end_ms: 300, duration_ms: 300, eye: 'both' });
    expect(dec.tick(5000, true)).toEqual([]);
    expect(dec.pattern).toBe('.');
  });

  it('reports an unknown pattern and does not insert it', () => {
    const d = new Driver();
    d.letter('......').wait(T.letterGapMs);
    expect(d.dec.text).toBe('');
    expect(d.actions).toContainEqual({ type: 'unknown', pattern: '......' });
  });

  it('backspace in the middle of a letter clears only the partial letter', () => {
    const d = new Driver();
    d.letter('.-').wait(T.letterGapMs); // A
    d.letter('..').wait(300).close('backspace').wait(T.letterGapMs);
    expect(d.dec.text).toBe('A');
    expect(d.actions).toContainEqual({ type: 'backspace', removed: '..', what: 'pattern' });
  });

  it('backspace after a letter removes the last character', () => {
    const d = new Driver();
    d.letter('.-').wait(T.letterGapMs).letter('-...').wait(T.letterGapMs);
    d.close('backspace').wait(T.letterGapMs);
    expect(d.dec.text).toBe('A');
  });

  it('a double word gap gives a single space', () => {
    const d = new Driver();
    d.letter('.')
      .wait(T.wordGapMs)
      .wait(T.wordGapMs * 2);
    expect(d.dec.text).toBe('E ');
  });

  it('a deleted space is not re-added by the word gap', () => {
    const d = new Driver();
    d.letter('.').wait(T.wordGapMs);
    expect(d.dec.text).toBe('E ');
    d.close('backspace').wait(T.wordGapMs * 2);
    expect(d.dec.text).toBe('E');
  });

  it('ignores rejected (spontaneous) blinks entirely, including for gap timing', () => {
    const d = new Driver();
    d.letter('.')
      .wait(500)
      .close('reject')
      .wait(T.letterGapMs - 500 - DUR.reject);
    expect(d.dec.text).toBe('E');
    expect(d.dec.pattern).toBe('');
  });

  it('two holds within the pause window toggle pause on and off', () => {
    const d = new Driver();
    d.close('hold').wait(1000).close('hold');
    expect(d.dec.paused).toBe(true);
    d.wait(500).letter('...').wait(T.letterGapMs);
    expect(d.dec.text).toBe('');
    d.close('hold').wait(800).close('hold').wait(500);
    expect(d.dec.paused).toBe(false);
    d.letter('.').wait(T.letterGapMs);
    expect(d.dec.text).toBe('E');
  });

  it('holds further apart than the pause window do nothing', () => {
    const d = new Driver();
    d.close('hold')
      .wait(PAUSE_WINDOW_MS + 100)
      .close('hold');
    expect(d.dec.paused).toBe(false);
  });

  it('pausing commits the pending letter first', () => {
    const d = new Driver();
    d.letter('.-').wait(300).close('hold').wait(300).close('hold');
    expect(d.dec.text).toBe('A');
    expect(d.dec.paused).toBe(true);
  });

  it('left wink inserts a space, right wink asks to speak', () => {
    const d = new Driver();
    d.letter('....').wait(300).close('dot', 'left');
    expect(d.dec.text).toBe('H ');
    d.close('dot', 'right');
    expect(d.actions).toContainEqual({ type: 'speak', text: 'H' });
  });

  it('winks are ignored when wink mode is off', () => {
    const dec = new Decoder(T, false);
    dec.push({ band: 'dot', start_ms: 0, end_ms: 300, duration_ms: 300, eye: 'left' });
    dec.tick(10_000, false);
    expect(dec.text).toBe('');
  });

  it('encodes text', () => {
    expect(encode('hi')).toBe('.... ..');
    expect(encode('sos sos')).toBe('... --- ... / ... --- ...');
  });
});
