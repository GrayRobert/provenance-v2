/**
 * Transpose chords and progressions by semitones
 */

import type { Chord } from './harmonizer';
import { noteToMidi } from './harmonizer';
import { getNoteAtInterval } from './scales';
import type { ProgressionSection, TimelineBar, TimelineChord } from './types/chordProgression';

/** Chromatic pitch classes (sharps) for MIDI % 12 */
const PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Get pitch class (note name without octave) from a MIDI note number
 */
function midiToPitchClass(midi: number): string {
  return PITCH_CLASSES[((midi % 12) + 12) % 12];
}

/**
 * Get semitone difference from one root to another (e.g. C -> G = 7)
 */
export function getSemitonesBetweenRoots(fromRoot: string, toRoot: string): number {
  const fromMidi = noteToMidi(fromRoot, 4);
  const toMidi = noteToMidi(toRoot, 4);
  return toMidi - fromMidi;
}

/**
 * Transpose a single chord by N semitones
 */
export function transposeChord(chord: Chord, semitones: number): Chord {
  if (semitones === 0) return { ...chord };

  const newMidiNotes = chord.midiNotes.map(m => m + semitones);
  const newNotes = newMidiNotes.map(m => midiToPitchClass(m));
  const newRoot = getNoteAtInterval(chord.root, semitones, false);
  // Defensive: chord.symbol can be undefined after JSON round-trip (undefined is omitted by JSON.stringify)
  const symbol = chord.symbol ?? '';
  const root = chord.root ?? newRoot;
  const suffix = symbol.length >= root.length ? symbol.slice(root.length) : '';
  const newSymbol = newRoot + suffix || newRoot;

  return {
    ...chord,
    root: newRoot,
    symbol: newSymbol,
    notes: newNotes,
    midiNotes: newMidiNotes,
  };
}

/**
 * Transpose all chords in a section (deep clone with new IDs)
 */
function transposeSection(section: ProgressionSection, semitones: number): ProgressionSection {
  return {
    id: section.id,
    repeatTimes: section.repeatTimes,
    bars: section.bars.map((bar: TimelineBar) => ({
      id: bar.id,
      chords: bar.chords.map((tc: TimelineChord) => ({
        id: tc.id,
        chord: transposeChord(tc.chord, semitones),
        position: tc.position,
        duration: tc.duration,
        ...(tc.sourceMinorScale != null && { sourceMinorScale: tc.sourceMinorScale }),
      })),
    })),
  };
}

/**
 * Transpose all sections by N semitones (returns new array, does not mutate)
 */
export function transposeSections(sections: ProgressionSection[], semitones: number): ProgressionSection[] {
  if (semitones === 0) return sections.map(s => ({ ...s, bars: s.bars.map(b => ({ ...b, chords: b.chords.map(c => ({ ...c, chord: { ...c.chord } })) })) }));
  return sections.map(section => transposeSection(section, semitones));
}
