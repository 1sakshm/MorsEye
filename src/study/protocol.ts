import { mulberry32, sample } from '../detect/calibration';
import type { BlockName, CueKind } from './schema';

/**
 * Study cue schedules (PRD §3.5, §3.6). Everything is generated from the participant's seed,
 * which is stored in the log header, so a session can be reconstructed exactly.
 */

export interface Cue {
  /** Offset from the block start, ms. */
  at_ms: number;
  cue: CueKind;
  /** How long the cue stays on screen. */
  duration_ms: number;
}

export interface Block {
  name: BlockName;
  title: string;
  /** Shown before the block starts. */
  instructions: string;
  duration_ms: number;
  /** Text to read during the block, or null for none. */
  reading: string | null;
  /** Cues appear in the corner (mixed block) rather than full screen. */
  cornerCues: boolean;
  cues: Cue[];
}

const S = 1000;

function shuffle<T>(xs: readonly T[], rng: () => number): T[] {
  return sample(xs, xs.length, rng);
}

/** Cues spaced `minGap`–`maxGap` ms apart (uniform jitter), starting after `lead` ms. */
function spaced(
  kinds: readonly CueKind[],
  rng: () => number,
  minGap: number,
  maxGap: number,
  lead: number,
  duration: number,
): Cue[] {
  let t = lead;
  return kinds.map((cue) => {
    const c = { at_ms: Math.round(t), cue, duration_ms: duration };
    t += minGap + rng() * (maxGap - minGap);
    return c;
  });
}

function repeat<T>(x: T, n: number): T[] {
  return Array.from({ length: n }, () => x);
}

/** Calibration block: 15 s eyes open on a dot, then 10 SHORT and 10 LONG closures in random order. */
export function calibrationBlock(rng: () => number): Block {
  const closures = shuffle([...repeat<CueKind>('SHORT', 10), ...repeat<CueKind>('LONG', 10)], rng);
  const open: Cue = { at_ms: 0, cue: 'OPEN', duration_ms: 15 * S };
  const cues = [open, ...spaced(closures, rng, 2200, 2800, 16 * S, 1500)];
  const last = cues[cues.length - 1]!;
  return {
    name: 'calibration',
    title: 'Calibration',
    instructions:
      'First keep your eyes open and look at the dot. Then, each time a cue appears, close your eyes: ' +
      'SHORT means a quick deliberate closure, LONG means hold them closed for about a second.',
    duration_ms: last.at_ms + 3 * S,
    reading: null,
    cornerCues: false,
    cues,
  };
}

export function spontaneousBlock(): Block {
  return {
    name: 'spontaneous',
    title: 'Reading',
    instructions:
      'Read the text on screen at your own pace. There is nothing to do with your eyes; blink normally.',
    duration_ms: 180 * S,
    reading: READING_A,
    cornerCues: false,
    cues: [],
  };
}

/** 40 cues, 10 of each kind, 2–4 s apart with jitter. */
export function deliberateBlock(rng: () => number): Block {
  const kinds = shuffle(
    (['SHORT', 'LONG', 'WINK-L', 'WINK-R'] as const).flatMap((k) => repeat<CueKind>(k, 10)),
    rng,
  );
  const cues = spaced(kinds, rng, 2000, 4000, 2 * S, 1500);
  return {
    name: 'deliberate',
    title: 'Cued closures',
    instructions:
      'Respond to each cue as soon as it appears. SHORT: a quick closure. LONG: about one second. ' +
      'WINK-L / WINK-R: close only your left / right eye. If you cannot wink, just try your best.',
    duration_ms: Math.min(180 * S, cues[cues.length - 1]!.at_ms + 3 * S),
    reading: null,
    cornerCues: false,
    cues,
  };
}

/** Read text; cues appear in the corner every 4–8 s. */
export function mixedBlock(rng: () => number): Block {
  const kinds = shuffle(
    (['SHORT', 'LONG', 'WINK-L', 'WINK-R'] as const).flatMap((k) => repeat<CueKind>(k, 6)),
    rng,
  );
  const cues = spaced(kinds, rng, 4000, 8000, 4 * S, 2000).filter((c) => c.at_ms < 176 * S);
  return {
    name: 'mixed',
    title: 'Reading with cues',
    instructions:
      'Read the text again. When a cue appears in the corner, respond to it, then carry on reading.',
    duration_ms: 180 * S,
    reading: READING_B,
    cornerCues: true,
    cues,
  };
}

/**
 * Study A: calibration first, then the three test blocks. With `counterbalance`, the order of the
 * three test blocks is drawn from the seed; otherwise it is the PRD order.
 */
export function studyA(seed: number, counterbalance = false): Block[] {
  const rng = mulberry32(seed);
  const calib = calibrationBlock(rng);
  const rest = [spontaneousBlock(), deliberateBlock(rng), mixedBlock(rng)];
  return [calib, ...(counterbalance ? shuffle(rest, rng) : rest)];
}

/**
 * 15 phrases from the MacKenzie & Soukoreff (2003) phrase set, lower case.
 * All 15 checked word for word against the original phrases2.txt (PhraseSets.zip from
 * yorku.ca/mack) on 24 Oct 2026. At novice Morse rates (~10 CPM) a 20-character phrase takes
 * about 2 minutes, so a Study B session is about 20 minutes plus breaks.
 */
export const PHRASES: readonly string[] = [
  'my watch fell in the water',
  'time to go shopping',
  'breathing is difficult',
  'the world is a stage',
  'love means many things',
  'we are having spaghetti',
  'my bank account is overdrawn',
  'a problem with the engine',
  'elephants are afraid of mice',
  'one heck of a question',
  'you must be getting old',
  'physics and chemistry are hard',
  'prevailing wind from the east',
  'never too rich and never too thin',
  'elections bring out the best',
];

/** Study B: 3 blocks of 5 phrases; phrase order shuffled by seed. */
export function studyBPhrases(seed: number): string[][] {
  const rng = mulberry32(seed ^ 0xb10c);
  const order = shuffle(PHRASES, rng);
  return [order.slice(0, 5), order.slice(5, 10), order.slice(10, 15)];
}

/**
 * Neutral reading passages for the spontaneous (A) and mixed (B) blocks: plain and factual, with no
 * emotional content, about 700 words each (roughly 3 minutes at 230 words a minute). Fast readers may
 * finish early: note it in the session log if so. [HUMAN] Review both before the pilot.
 */
export const READING_A = `Telegraph lines spread across many countries in the second half of the nineteenth century. An operator pressed a key to close an electric circuit, and at the other end of the wire a receiving instrument marked a moving strip of paper. Short contacts made dots and longer contacts made dashes. Skilled operators soon learned to read the code by ear from the clicks of the sounder, without looking at the tape at all.

Paper tape was still used for a long time, because it kept a record of the message. Rolls of tape were cut into strips and pasted onto forms, which were then carried by messengers to the people the telegrams were addressed to. In busy offices, dozens of instruments worked at once, and the room was filled with a steady clatter.

The code itself changed over the years. The version used on land lines in America differed from the international code agreed in Europe, which used fewer kinds of spacing and was easier to learn. Radio operators at sea adopted the international version, and it remained in use for distress calls for most of the twentieth century.

Sending a message cost money, and the price depended on the number of words. People therefore learned to write very short messages. Small words were left out, and whole phrases were replaced by single words that both sides understood. Companies printed books of agreed code words, so that one word on the wire could stand for a full sentence about prices, shipments or delivery dates. Clerks at the receiving end looked each word up and wrote out the meaning in full.

Lines were often built along railways, because the railway companies already owned a strip of land and needed fast messages of their own to keep trains apart. Poles were set at regular distances, and the wire was carried on glass or ceramic insulators so that the current would not leak away in wet weather. Linesmen walked or rode along the route to repair breaks caused by storms, falling trees and, now and then, by animals.

Crossing the sea was much harder than crossing land. A cable laid on the sea bed had to be strong enough not to snap under its own weight, flexible enough to be coiled in a ship, and well enough insulated to work for years under water. Early attempts failed after a few days or weeks. Engineers learned from each failure, and later cables worked reliably for decades. Messages that once took weeks to cross an ocean by ship could then arrive within minutes.

Learning the code takes patience. Most people begin with a few letters that use only dots, such as E, I, S and H, and then add letters that use only dashes, such as T, M and O. Common letters have short codes, so frequent words can be sent quickly. With practice, the patterns stop being counted and start being recognised as whole shapes, in the same way that a reader recognises familiar words without spelling them out.

Operators developed their own habits over time. Each person had a slightly different rhythm, and experienced listeners could often tell who was sending from the timing alone. Some offices used short abbreviations for common replies, such as a request to repeat the last word or a signal that the message had been received. These conventions saved time on busy lines.

The telephone gradually replaced the telegraph for many purposes, because it allowed people to speak directly instead of writing messages for an operator. Printing telegraphs, which typed letters onto paper automatically, also reduced the need for operators who could read the code. Even so, the telegraph network stayed in use for many years for business messages, news reports and official notices.

Today the code is mostly a hobby, but it is still taught, and it still turns up in unexpected places. Any signal that can be switched on and off can carry it: a lamp, a sound, a tap on a table, or the movement of an eyelid.`;

export const READING_B = `People have written down the weather for a very long time. Farmers noted the dates of the first and last frosts, sailors recorded the wind in their logbooks, and town officials kept notes about floods and dry summers. For most of history these records were descriptions in words, such as a cold morning or a strong wind from the west. They were useful, but it was difficult to compare one place with another.

Instruments made the records more exact. A thermometer gives a number for the temperature, a barometer gives a number for the pressure of the air, and a rain gauge collects the water that falls so that it can be measured. Once these instruments were common, observers in different towns could compare their readings, as long as they used the instruments in the same way.

That last condition turned out to matter a great deal. A thermometer placed in the sun reads higher than one in the shade, and a thermometer close to a wall reads differently from one in an open field. Observers therefore agreed on standard ways to set up their instruments. Thermometers were placed inside a white wooden box with slatted sides, raised above the ground, so that air could pass through while direct sunlight was kept out. Rain gauges were set in open ground, away from trees and buildings.

Readings were usually taken at fixed times each day. In many stations an observer went out in the morning, read each instrument, wrote the numbers in a register, and reset the instruments for the next day. Some instruments recorded continuously, using a pen that drew a line on a slowly turning drum covered with paper. The drum made one turn a day or one turn a week, and the paper was changed when it was full.

When the telegraph arrived, weather reports could be collected from many stations within a few hours. This made it possible to draw maps of the weather across a whole region for the same moment. On these maps, lines joined places with the same air pressure. Forecasters noticed that areas of low pressure tended to move across the map in a fairly regular way, often bringing cloud and rain with them. By following their movement, it became possible to say something useful about the weather of the next day.

Measurements at the ground only describe the bottom of the atmosphere. To learn about the air higher up, observers sent instruments aloft, first on kites and later on balloons. A small radio transmitter attached to the balloon sends back the temperature, pressure and humidity as it rises. Balloons like this are still released from many places at agreed times, so that the readings can be combined.

Ships and aircraft also send regular reports. A ship far from land may be the only source of information about a large area of ocean, so its observations are valuable even if they are taken with simple instruments. Today satellites add a view from above, showing the clouds, the temperature of the sea surface and the amount of water vapour in the air.

All of these observations end up in large collections of numbers. Before computers, clerks copied readings into books and added them up by hand to find monthly averages. The work was slow and repetitive, but it produced long series of measurements that are still used. Some stations have kept records in the same place for more than a hundred years, and these long records are especially valuable because they allow careful comparisons over time.

Keeping a record consistent is harder than it sounds. If a station moves a short distance, if a new building goes up nearby, or if an instrument is replaced by a different model, the readings can change slightly even though the weather has not. People who study old records spend much of their time looking for such changes and correcting for them, using notes kept by the observers and comparisons with nearby stations.

The basic routine has hardly changed. Someone, or something, reads an instrument at an agreed time, in an agreed way, and writes the number down. Many small observations, collected patiently over many years, add up to a detailed picture of the air around us.`;
