import type { Chord } from '../harmonizer';

/** Minor scale type for palette sync during playback (Natural / Harmonic / Melodic). */
export type SourceMinorScale = 'natural' | 'harmonic' | 'melodic';

/**
 * Represents a single chord within a bar, positioned at a specific time
 */
export interface TimelineChord {
  id: string;
  chord: Chord;
  position: number; // 0-1 within the bar (0 = start, 0.5 = half, etc.)
  duration: number; // Fraction of bar (1 = full bar, 0.5 = half bar)
  /** When in minor key: which minor scale this chord belongs to (for dynamic palette switch during playback). */
  sourceMinorScale?: SourceMinorScale;
}

/**
 * Represents a single bar in the timeline, containing one or more chords
 */
export interface TimelineBar {
  id: string;
  chords: TimelineChord[]; // Can have 1, 2, 3, 4+ chords per bar
}

/**
 * A section of the progression: its bars and how many times to repeat when multiple sections exist.
 * When only one section exists, playback loops that section infinitely (repeatTimes ignored).
 */
export interface ProgressionSection {
  id: string;
  bars: TimelineBar[];
  repeatTimes: number; // >= 1; default 4 when sections.length > 1
}

/**
 * Time signature representation
 */
export type TimeSignature = [number, number]; // [beats, noteValue] e.g. [4, 4] for 4/4

/**
 * Beats per bar used for timing and bar duration.
 * 6/8 is compound: 6 eighth notes = 2 dotted-quarter beats per bar (so bar is half as long as "6 beats").
 */
export function getTimingBeatsPerBar(ts: TimeSignature): number {
  if (ts[0] === 6 && ts[1] === 8) return 2;
  return ts[0];
}

/** Canonical meter key for style pattern selection ('4/4', '3/4', '6/8'). */
export type MeterKey = '4/4' | '3/4' | '6/8';

/**
 * Return the meter key for a time signature (used to pick meter-specific pattern steps).
 */
export function getMeterKey(ts: TimeSignature): MeterKey {
  if (ts[0] === 6 && ts[1] === 8) return '6/8';
  if (ts[0] === 3 && ts[1] === 4) return '3/4';
  return '4/4';
}

/**
 * Number of pulses per bar for subdivision (e.g. 8 for 4/4 eighths, 6 for 6/8 eighths).
 * Used for swing and accent logic.
 */
export function getPulsesPerBar(ts: TimeSignature): number {
  if (ts[0] === 6 && ts[1] === 8) return 6;
  return ts[0] * 2; // 4/4 → 8, 3/4 → 6
}

/**
 * Bar duration in seconds using a quarter-note "master clock".
 * Same wall-clock length regardless of time signature: Bar = 240/BPM (4 quarter notes).
 * So at 120 BPM a bar is always 2s (4/4, 3/4, or 6/8). This prevents 6/8 from feeling
 * twice as fast (which happened when the bar was 2 dotted-quarter beats = 120/BPM).
 */
export function getSecondsPerBar(_ts: TimeSignature, bpm: number): number {
  return 240 / bpm;
}

/**
 * Duration of one beat in seconds for the current meter.
 * Use for metronome interval and beat-based math: Beat = Bar / timingBeatsPerBar.
 * In 4/4: quarter note = 60/BPM. In 6/8: dotted quarter = (240/BPM)/2.
 */
export function getSecondsPerBeat(ts: TimeSignature, bpm: number): number {
  return getSecondsPerBar(ts, bpm) / getTimingBeatsPerBar(ts);
}

/**
 * Round a bar fraction (0–1) to 3 decimal places to avoid floating-point drift
 * when looping 6/8 patterns (1/6, 1/3 are infinite decimals).
 */
export function roundBarFraction(x: number): number {
  return Math.round(x * 1000) / 1000;
}

/**
 * Drag data format for chord drag & drop
 */
export interface ChordDragData {
  chord: Chord;
  source: 'palette' | 'timeline';
  /** When source is 'timeline', the bar index being dragged from */
  barIndex?: number;
  /** When source is 'timeline', the chord index within the bar */
  chordIndex?: number;
}
