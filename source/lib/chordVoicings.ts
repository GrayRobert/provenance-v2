/**
 * Chord Voicings Database with Dynamic Generation
 * 
 * This module provides guitar voicings for chords using:
 * 1. A curated database of common open-position chords
 * 2. Dynamic generation using movable barre chord shapes
 * 
 * Piano voicings are generated dynamically via ChordService.
 */

import { ChordVoicing, PianoVoicing } from './types';
import { 
  normalizeChordSymbol, 
  isValidChord, 
  getPianoVoicings,
  parseChord,
} from './chordService';

// Semitone values for each note (C = 0)
const NOTE_TO_SEMITONE: Record<string, number> = {
  'C': 0, 'C#': 1, 'Db': 1,
  'D': 2, 'D#': 3, 'Eb': 3,
  'E': 4, 'Fb': 4, 'E#': 5,
  'F': 5, 'F#': 6, 'Gb': 6,
  'G': 7, 'G#': 8, 'Ab': 8,
  'A': 9, 'A#': 10, 'Bb': 10,
  'B': 11, 'Cb': 11, 'B#': 0,
};

/**
 * Movable chord shapes based on E and A string roots
 * These are the base shapes at fret 0 that can be moved up the neck
 */
interface MovableShape {
  name: string;
  rootString: 6 | 5; // Which string has the root note (6 = low E, 5 = A)
  positions: number[]; // Fret positions relative to root fret (0 = root fret, -1 = muted)
  baseRootFret: number; // The fret of the root note in the base position
}

// E-shape barre chords (root on 6th string)
const E_SHAPE_MAJOR: MovableShape = {
  name: 'E-shape',
  rootString: 6,
  positions: [0, 0, 2, 2, 2, 0], // E major shape
  baseRootFret: 0,
};

const E_SHAPE_MINOR: MovableShape = {
  name: 'E-shape',
  rootString: 6,
  positions: [0, 0, 2, 2, 1, 0], // Em shape
  baseRootFret: 0,
};

const E_SHAPE_7: MovableShape = {
  name: 'E-shape',
  rootString: 6,
  positions: [0, 0, 2, 1, 2, 0], // E7 shape (simplified)
  baseRootFret: 0,
};

const E_SHAPE_M7: MovableShape = {
  name: 'E-shape',
  rootString: 6,
  positions: [0, 0, 2, 0, 2, 0], // Em7 shape
  baseRootFret: 0,
};

const E_SHAPE_MAJ7: MovableShape = {
  name: 'E-shape',
  rootString: 6,
  positions: [0, 0, 2, 1, 1, 0], // Emaj7 shape
  baseRootFret: 0,
};

// A-shape barre chords (root on 5th string)
const A_SHAPE_MAJOR: MovableShape = {
  name: 'A-shape',
  rootString: 5,
  positions: [-1, 0, 2, 2, 2, 0], // A major shape
  baseRootFret: 0,
};

const A_SHAPE_MINOR: MovableShape = {
  name: 'A-shape',
  rootString: 5,
  positions: [-1, 0, 2, 2, 1, 0], // Am shape
  baseRootFret: 0,
};

const A_SHAPE_7: MovableShape = {
  name: 'A-shape',
  rootString: 5,
  positions: [-1, 0, 2, 0, 2, 0], // A7 shape
  baseRootFret: 0,
};

const A_SHAPE_M7: MovableShape = {
  name: 'A-shape',
  rootString: 5,
  positions: [-1, 0, 2, 0, 1, 0], // Am7 shape
  baseRootFret: 0,
};

const A_SHAPE_MAJ7: MovableShape = {
  name: 'A-shape',
  rootString: 5,
  positions: [-1, 0, 2, 1, 2, 0], // Amaj7 shape
  baseRootFret: 0,
};

// Map chord types to their movable shapes
// Keys include both Tonal's type names and common abbreviations
const CHORD_TYPE_SHAPES: Record<string, MovableShape[]> = {
  // Major chords (Tonal type: "major" or empty for plain major)
  'major': [E_SHAPE_MAJOR, A_SHAPE_MAJOR],
  'M': [E_SHAPE_MAJOR, A_SHAPE_MAJOR],
  '': [E_SHAPE_MAJOR, A_SHAPE_MAJOR],
  
  // Minor chords (Tonal type: "minor")
  'minor': [E_SHAPE_MINOR, A_SHAPE_MINOR],
  'm': [E_SHAPE_MINOR, A_SHAPE_MINOR],
  'min': [E_SHAPE_MINOR, A_SHAPE_MINOR],
  
  // Dominant 7th (Tonal type: "dominant seventh")
  '7': [E_SHAPE_7, A_SHAPE_7],
  'dominant seventh': [E_SHAPE_7, A_SHAPE_7],
  
  // Minor 7th (Tonal type: "minor seventh")
  'm7': [E_SHAPE_M7, A_SHAPE_M7],
  'min7': [E_SHAPE_M7, A_SHAPE_M7],
  'minor seventh': [E_SHAPE_M7, A_SHAPE_M7],
  '-7': [E_SHAPE_M7, A_SHAPE_M7],
  
  // Major 7th (Tonal type: "major seventh")
  'maj7': [E_SHAPE_MAJ7, A_SHAPE_MAJ7],
  'M7': [E_SHAPE_MAJ7, A_SHAPE_MAJ7],
  'major seventh': [E_SHAPE_MAJ7, A_SHAPE_MAJ7],
  
  // Major 9th - use maj7 shape as approximation (Tonal type: "major ninth")
  'maj9': [E_SHAPE_MAJ7, A_SHAPE_MAJ7],
  'major ninth': [E_SHAPE_MAJ7, A_SHAPE_MAJ7],
  
  // Minor 9th - use m7 shape as approximation
  'm9': [E_SHAPE_M7, A_SHAPE_M7],
  'min9': [E_SHAPE_M7, A_SHAPE_M7],
  'minor ninth': [E_SHAPE_M7, A_SHAPE_M7],
  
  // Dominant 9th - use 7 shape as approximation
  '9': [E_SHAPE_7, A_SHAPE_7],
  'dominant ninth': [E_SHAPE_7, A_SHAPE_7],
};

// Open string notes for standard tuning (E A D G B E)
const OPEN_STRING_NOTES = ['E', 'A', 'D', 'G', 'B', 'E'];
const OPEN_STRING_SEMITONES = [4, 9, 2, 7, 11, 4]; // E=4, A=9, D=2, G=7, B=11, E=4

/**
 * Calculate the fret number for a given note on a given string
 */
function getFretForNote(stringIndex: number, targetNote: string): number {
  const openSemitone = OPEN_STRING_SEMITONES[stringIndex];
  const targetSemitone = NOTE_TO_SEMITONE[targetNote];
  
  if (targetSemitone === undefined) return -1;
  
  let fret = targetSemitone - openSemitone;
  if (fret < 0) fret += 12;
  
  return fret;
}

/**
 * Generate a guitar voicing from a movable shape
 */
function generateVoicingFromShape(
  rootNote: string,
  shape: MovableShape,
  chordSymbol: string
): ChordVoicing | null {
  // Find the fret for the root note on the root string
  const rootStringIndex = shape.rootString === 6 ? 0 : 1;
  const rootFret = getFretForNote(rootStringIndex, rootNote);
  
  if (rootFret < 0 || rootFret > 12) return null;
  
  // Calculate positions by adding root fret to shape positions
  const positions = shape.positions.map((pos, index) => {
    if (pos === -1) return -1; // Muted string stays muted
    return pos + rootFret;
  });
  
  // For barre chords, we need to adjust - all 0s in the shape become the barre fret
  const barrePositions = positions.map((pos, index) => {
    if (pos === -1) return -1;
    if (shape.positions[index] === 0 && rootFret > 0) {
      return rootFret; // This is part of the barre
    }
    return pos;
  });
  
  const baseFret = rootFret > 0 ? rootFret : 1;
  
  return {
    id: `${chordSymbol}-${shape.name}-${baseFret}`,
    name: rootFret === 0 ? 'Open' : `${shape.name} (fret ${baseFret})`,
    positions: barrePositions,
    baseFret,
  };
}

/**
 * Get the chord type from a parsed chord
 */
function getChordType(chordSymbol: string): string | null {
  const parsed = parseChord(chordSymbol);
  if (!parsed) return null;
  
  // Extract the type part from the symbol (everything after the root)
  const rootLength = parsed.tonic.length;
  const type = chordSymbol.slice(rootLength);
  
  return type || '';
}

/**
 * Generate guitar voicings dynamically for any valid chord
 */
function generateGuitarVoicings(chordSymbol: string): ChordVoicing[] {
  const parsed = parseChord(chordSymbol);
  if (!parsed) return [];
  
  const rootNote = parsed.tonic;
  const chordType = parsed.type || '';
  
  // Find matching shapes for this chord type
  let shapes = CHORD_TYPE_SHAPES[chordType];
  
  // Try alternative lookups
  if (!shapes) {
    // Check quality
    if (parsed.quality === 'Major') shapes = CHORD_TYPE_SHAPES['major'];
    else if (parsed.quality === 'Minor') shapes = CHORD_TYPE_SHAPES['minor'];
  }
  
  // Still no shapes? Try to match by aliases
  if (!shapes) {
    const typeLower = chordType.toLowerCase();
    if (typeLower.includes('m7') || typeLower.includes('min7')) {
      shapes = CHORD_TYPE_SHAPES['m7'];
    } else if (typeLower.includes('maj7')) {
      shapes = CHORD_TYPE_SHAPES['maj7'];
    } else if (typeLower.includes('7')) {
      shapes = CHORD_TYPE_SHAPES['7'];
    } else if (typeLower.includes('m') || typeLower.includes('min')) {
      shapes = CHORD_TYPE_SHAPES['m'];
    }
  }
  
  if (!shapes) return [];
  
  const voicings: ChordVoicing[] = [];
  
  for (const shape of shapes) {
    const voicing = generateVoicingFromShape(rootNote, shape, parsed.normalizedSymbol);
    if (voicing) {
      voicings.push(voicing);
    }
  }
  
  return voicings;
}

/**
 * Curated guitar voicings database for common open-position chords
 * These take priority over generated voicings for better quality
 */
export const CHORD_VOICINGS: Record<string, ChordVoicing[]> = {
  'C': [
    { id: 'C-open', name: 'Open', positions: [-1, 3, 2, 0, 1, 0], baseFret: 1 },
  ],
  'D': [
    { id: 'D-open', name: 'Open', positions: [-1, -1, 0, 2, 3, 2], baseFret: 1 },
  ],
  'E': [
    { id: 'E-open', name: 'Open', positions: [0, 2, 2, 1, 0, 0], baseFret: 1 },
  ],
  'G': [
    { id: 'G-open', name: 'Open', positions: [3, 2, 0, 0, 0, 3], baseFret: 1 },
  ],
  'A': [
    { id: 'A-open', name: 'Open', positions: [-1, 0, 2, 2, 2, 0], baseFret: 1 },
  ],
  'Am': [
    { id: 'Am-open', name: 'Open', positions: [-1, 0, 2, 2, 1, 0], baseFret: 1 },
  ],
  'Dm': [
    { id: 'Dm-open', name: 'Open', positions: [-1, -1, 0, 2, 3, 1], baseFret: 1 },
  ],
  'Em': [
    { id: 'Em-open', name: 'Open', positions: [0, 2, 2, 0, 0, 0], baseFret: 1 },
  ],
  'C7': [
    { id: 'C7-open', name: 'Open', positions: [-1, 3, 2, 3, 1, 0], baseFret: 1 },
  ],
  'D7': [
    { id: 'D7-open', name: 'Open', positions: [-1, -1, 0, 2, 1, 2], baseFret: 1 },
  ],
  'E7': [
    { id: 'E7-open', name: 'Open', positions: [0, 2, 0, 1, 0, 0], baseFret: 1 },
  ],
  'G7': [
    { id: 'G7-open', name: 'Open', positions: [3, 2, 0, 0, 0, 1], baseFret: 1 },
  ],
  'A7': [
    { id: 'A7-open', name: 'Open', positions: [-1, 0, 2, 0, 2, 0], baseFret: 1 },
  ],
  'Am7': [
    { id: 'Am7-open', name: 'Open', positions: [-1, 0, 2, 0, 1, 0], baseFret: 1 },
  ],
  'Dm7': [
    { id: 'Dm7-open', name: 'Open', positions: [-1, -1, 0, 2, 1, 1], baseFret: 1 },
  ],
  'Em7': [
    { id: 'Em7-open', name: 'Open', positions: [0, 2, 0, 0, 0, 0], baseFret: 1 },
  ],
  'Cmaj7': [
    { id: 'Cmaj7-open', name: 'Open', positions: [-1, 3, 2, 0, 0, 0], baseFret: 1 },
  ],
  'Dmaj7': [
    { id: 'Dmaj7-open', name: 'Open', positions: [-1, -1, 0, 2, 2, 2], baseFret: 1 },
  ],
  'Emaj7': [
    { id: 'Emaj7-open', name: 'Open', positions: [0, 2, 1, 1, 0, 0], baseFret: 1 },
  ],
  'Gmaj7': [
    { id: 'Gmaj7-open', name: 'Open', positions: [3, 2, 0, 0, 0, 2], baseFret: 1 },
  ],
  'Amaj7': [
    { id: 'Amaj7-open', name: 'Open', positions: [-1, 0, 2, 1, 2, 0], baseFret: 1 },
  ],
};

/**
 * Get guitar voicings for a chord symbol
 * First checks curated database, then generates dynamically
 */
export function getVoicingsForChord(symbol: string): ChordVoicing[] {
  if (!isValidChord(symbol)) {
    return [];
  }
  
  const normalized = normalizeChordSymbol(symbol);
  
  // Check curated database first
  const curated = CHORD_VOICINGS[normalized] || CHORD_VOICINGS[symbol];
  if (curated && curated.length > 0) {
    return curated;
  }
  
  // Generate voicings dynamically
  const generated = generateGuitarVoicings(symbol);
  if (generated.length > 0) {
    return generated;
  }
  
  // Try with normalized symbol
  return generateGuitarVoicings(normalized);
}

/**
 * Get piano voicings for a chord symbol
 * Uses ChordService to generate voicings dynamically
 */
export function getPianoVoicingsForChord(symbol: string): PianoVoicing[] {
  if (!isValidChord(symbol)) {
    return [];
  }
  
  return getPianoVoicings(symbol);
}

/**
 * Get default voicing for a chord and instrument
 */
export function getDefaultVoicing(
  symbol: string, 
  instrument: 'guitar' | 'piano'
): ChordVoicing | PianoVoicing | null {
  if (instrument === 'guitar') {
    const voicings = getVoicingsForChord(symbol);
    return voicings.length > 0 ? voicings[0] : null;
  } else {
    const voicings = getPianoVoicingsForChord(symbol);
    return voicings.length > 0 ? voicings[0] : null;
  }
}
