/**
 * Dynamic Progression Example Generator
 * Generates chord examples for progressions based on current root/scale and tension
 */

import type { SongKey } from '../types/chordExplorer';
import type { ChordProgression } from '../chordProgressionDictionary';
import type { TensionLevel } from './progressionConverter';
import { convertProgressionToChords } from './progressionConverter';

/**
 * Generate a progression example (chord symbols) for the current root/scale and tension.
 * Returns an array of chord symbols like ['C', 'G', 'Am', 'F'] or ['Dm7', 'G7', 'Cmaj7'] with tension.
 */
export function generateProgressionExample(
  progression: ChordProgression,
  songKey: SongKey,
  tension: TensionLevel = 'low'
): string[] {
  try {
    const chords = convertProgressionToChords(progression, progression.romanNumerals, songKey, undefined, false, tension);
    return chords.map(chord => chord.symbol);
  } catch (err) {
    // If conversion fails (e.g., incompatible), return empty array or error indicator
    console.warn(`Could not generate example for progression ${progression.id}:`, err);
    return [];
  }
}
