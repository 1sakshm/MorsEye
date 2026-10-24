/** speechSynthesis wrapper (PRD §5.5). Silently does nothing where speech is unavailable. */

const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;

export function speechAvailable(): boolean {
  return !!synth;
}

export function speak(text: string, { interrupt = false, rate = 1 } = {}): void {
  if (!synth || !text.trim()) return;
  if (interrupt) synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = rate;
  u.lang = 'en-GB';
  synth.speak(u);
}

/** Letters are spoken by name; a few need spelling out to be said clearly. */
export function speakLetter(ch: string): void {
  const names: Record<string, string> = {
    ' ': 'space',
    '.': 'full stop',
    ',': 'comma',
    '?': 'question mark',
  };
  speak(names[ch] ?? ch.toLowerCase(), { interrupt: true, rate: 1.1 });
}
