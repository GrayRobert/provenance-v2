/**
 * Chord Builder audio engine.
 * Uses the same sampled instruments as Chord Explorer:
 * - Piano mode: Salamander grand piano (public/salamander)
 * - Guitar mode: Acoustic guitar (public/acc-guitar)
 */

import * as Tone from 'tone';

// ===========================
// Sample configs (same as chord-explorer)
// ===========================

/** Shift a note name up one octave (e.g. C4 -> C5). Used so samples recorded an octave high play at correct pitch. */
function noteUpOneOctave(note: string): string {
  const match = note.match(/^([A-G]#?)(-?\d+)$/);
  if (!match) return note;
  const octave = parseInt(match[2], 10) + 1;
  return `${match[1]}${octave}`;
}

/** Salamander grand piano: public/salamander (run: node scripts/fetch-salamander-piano.js) */
const SALAMANDER_SAMPLES = {
  baseUrl: '/salamander/',
  urls: {
    'A0': 'A0.mp3', 'C1': 'C1.mp3', 'D#1': 'Ds1.mp3', 'F#1': 'Fs1.mp3',
    'A1': 'A1.mp3', 'C2': 'C2.mp3', 'D#2': 'Ds2.mp3', 'F#2': 'Fs2.mp3',
    'A2': 'A2.mp3', 'C3': 'C3.mp3', 'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3',
    'A3': 'A3.mp3', 'C4': 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3',
    'A4': 'A4.mp3', 'C5': 'C5.mp3', 'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3',
    'A5': 'A5.mp3', 'C6': 'C6.mp3', 'D#6': 'Ds6.mp3', 'F#6': 'Fs6.mp3',
    'A6': 'A6.mp3', 'C7': 'C7.mp3', 'D#7': 'Ds7.mp3', 'F#7': 'Fs7.mp3',
    'A7': 'A7.mp3', 'C8': 'C8.mp3',
  },
};

/** Acoustic guitar: public/acc-guitar (run: node scripts/convert-samples.mjs acc-guitar). Samples one octave high. */
const ACOUSTIC_GUITAR_NOTE_NAMES = [
  'A#1', 'A#2', 'A#3', 'A#4', 'A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4',
  'C#2', 'C#3', 'C#4', 'C2', 'C3', 'C4', 'C5', 'D#2', 'D#3', 'D#4', 'D2', 'D3', 'D4',
  'E1', 'E2', 'E3', 'E4', 'F#1', 'F#2', 'F#3', 'F#4', 'F1', 'F2', 'F3', 'F4',
  'G#1', 'G#2', 'G#3', 'G#4', 'G1', 'G2', 'G3', 'G4',
];
const ACOUSTIC_GUITAR_SAMPLES = {
  baseUrl: '/acc-guitar/',
  urls: Object.fromEntries(
    ACOUSTIC_GUITAR_NOTE_NAMES.map((note) => [
      noteUpOneOctave(note),
      `${note.replace(/#/g, 's')}.mp3`,
    ])
  ),
};

// ===========================
// Lazy samplers
// ===========================

let pianoSampler: Tone.Sampler | null = null;
let guitarSampler: Tone.Sampler | null = null;
let pianoLoadPromise: Promise<Tone.Sampler> | null = null;
let guitarLoadPromise: Promise<Tone.Sampler> | null = null;

async function ensureToneStarted(): Promise<void> {
  if (Tone.context.state !== 'running') {
    await Tone.start();
  }
}

async function getPianoSampler(): Promise<Tone.Sampler> {
  if (pianoSampler) return pianoSampler;
  if (pianoLoadPromise) return pianoLoadPromise;
  pianoLoadPromise = (async () => {
    await ensureToneStarted();
    const sampler = new Tone.Sampler({
      urls: SALAMANDER_SAMPLES.urls,
      baseUrl: SALAMANDER_SAMPLES.baseUrl,
      release: 1.5,
      volume: -6,
    });
    await Tone.loaded();
    pianoSampler = sampler;
    sampler.toDestination();
    return sampler;
  })();
  return pianoLoadPromise;
}

async function getGuitarSampler(): Promise<Tone.Sampler> {
  if (guitarSampler) return guitarSampler;
  if (guitarLoadPromise) return guitarLoadPromise;
  guitarLoadPromise = (async () => {
    await ensureToneStarted();
    const sampler = new Tone.Sampler({
      urls: ACOUSTIC_GUITAR_SAMPLES.urls,
      baseUrl: ACOUSTIC_GUITAR_SAMPLES.baseUrl,
      release: 1.5,
      volume: -13,
    });
    await Tone.loaded();
    guitarSampler = sampler;
    sampler.toDestination();
    return sampler;
  })();
  return guitarLoadPromise;
}

// ===========================
// Public API (same as before)
// ===========================

const DEFAULT_DURATION = 1.5;

/** Play a single note on the acoustic guitar sampler. Used for guitar fretboard. */
export function playNote(note: string, duration: number = DEFAULT_DURATION): void {
  getGuitarSampler().then((sampler) => {
    sampler.triggerAttackRelease(note, duration);
  });
}

/** Play a single note on the Salamander piano sampler. Used for piano keyboard. */
export function playPianoNote(note: string, duration: number = DEFAULT_DURATION): void {
  getPianoSampler().then((sampler) => {
    sampler.triggerAttackRelease(note, duration);
  });
}

/** Strum chord on guitar with slight delay between notes. */
export function strumChord(notes: string[], direction: 'down' | 'up' = 'down'): void {
  const ordered = direction === 'down' ? notes : [...notes].reverse();
  getGuitarSampler().then((sampler) => {
    const now = Tone.now();
    ordered.forEach((note, i) => {
      sampler.triggerAttackRelease(note, 2, now + i * 0.05);
    });
  });
}

/** Play all piano notes together (chord). */
export function playPianoChord(notes: string[]): void {
  getPianoSampler().then((sampler) => {
    const now = Tone.now();
    notes.forEach((note) => {
      sampler.triggerAttackRelease(note, 2, now);
    });
  });
}
