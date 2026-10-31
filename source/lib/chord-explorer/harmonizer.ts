/**
 * Harmonizer Engine
 * Generates chords from scales by stacking scale tones
 */

import { Scale, getNoteAtInterval, shouldPreferFlats } from './scales';

// ===========================
// CHORD TYPES & QUALITIES
// ===========================

export type ChordQuality = 
  | 'major' | 'minor' | 'diminished' | 'augmented'
  | 'sus2' | 'sus4'
  | 'dom7' | 'maj7' | 'min7' | 'min7b5' | 'dim7'
  | 'add9' | 'maj9' | 'min9' | 'dom9'
  | 'dom11' | 'min11'
  | 'dom13' | 'maj13' | 'min13'
  | '7sus4' | 'maj7sus2';

export interface ChordType {
  id: ChordQuality;
  name: string;
  symbol: string;
  intervals: number[];
  complexity: number; // 1-5, for UI grouping
}

// ===========================
// CHORD TYPE DEFINITIONS
// ===========================

export const CHORD_TYPES: Record<ChordQuality, ChordType> = {
  // Triads
  major: { id: 'major', name: 'Major', symbol: '', intervals: [0, 4, 7], complexity: 1 },
  minor: { id: 'minor', name: 'Minor', symbol: 'm', intervals: [0, 3, 7], complexity: 1 },
  diminished: { id: 'diminished', name: 'Diminished', symbol: '°', intervals: [0, 3, 6], complexity: 2 },
  augmented: { id: 'augmented', name: 'Augmented', symbol: '+', intervals: [0, 4, 8], complexity: 2 },
  sus2: { id: 'sus2', name: 'Sus2', symbol: 'sus2', intervals: [0, 2, 7], complexity: 2 },
  sus4: { id: 'sus4', name: 'Sus4', symbol: 'sus4', intervals: [0, 5, 7], complexity: 2 },
  
  // Sevenths
  dom7: { id: 'dom7', name: 'Dominant 7', symbol: '7', intervals: [0, 4, 7, 10], complexity: 2 },
  maj7: { id: 'maj7', name: 'Major 7', symbol: 'maj7', intervals: [0, 4, 7, 11], complexity: 2 },
  min7: { id: 'min7', name: 'Minor 7', symbol: 'm7', intervals: [0, 3, 7, 10], complexity: 2 },
  min7b5: { id: 'min7b5', name: 'Half-Dim', symbol: 'ø7', intervals: [0, 3, 6, 10], complexity: 3 },
  dim7: { id: 'dim7', name: 'Diminished 7', symbol: '°7', intervals: [0, 3, 6, 9], complexity: 3 },
  
  // Sus Sevenths
  '7sus4': { id: '7sus4', name: '7sus4', symbol: '7sus4', intervals: [0, 5, 7, 10], complexity: 3 },
  'maj7sus2': { id: 'maj7sus2', name: 'Maj7sus2', symbol: 'maj7sus2', intervals: [0, 2, 7, 11], complexity: 3 },
  
  // Extensions
  add9: { id: 'add9', name: 'Add9', symbol: 'add9', intervals: [0, 4, 7, 14], complexity: 3 },
  maj9: { id: 'maj9', name: 'Major 9', symbol: 'maj9', intervals: [0, 4, 7, 11, 14], complexity: 4 },
  min9: { id: 'min9', name: 'Minor 9', symbol: 'm9', intervals: [0, 3, 7, 10, 14], complexity: 4 },
  dom9: { id: 'dom9', name: 'Dominant 9', symbol: '9', intervals: [0, 4, 7, 10, 14], complexity: 4 },
  dom11: { id: 'dom11', name: '11', symbol: '11', intervals: [0, 4, 7, 10, 14, 17], complexity: 5 },
  min11: { id: 'min11', name: 'Minor 11', symbol: 'm11', intervals: [0, 3, 7, 10, 14, 17], complexity: 5 },
  dom13: { id: 'dom13', name: '13', symbol: '13', intervals: [0, 4, 7, 10, 14, 21], complexity: 5 },
  maj13: { id: 'maj13', name: 'Major 13', symbol: 'maj13', intervals: [0, 4, 7, 11, 14, 21], complexity: 5 },
  min13: { id: 'min13', name: 'Minor 13', symbol: 'm13', intervals: [0, 3, 7, 10, 14, 21], complexity: 5 },
};

// ===========================
// CHORD INTERFACE
// ===========================

export interface Chord {
  root: string;
  quality: ChordQuality;
  symbol: string;
  notes: string[];
  midiNotes: number[];
  degree: number; // 1-7 for scale degree
  degreeRoman: string;
}

// ===========================
// ROMAN NUMERAL MAPPING
// ===========================

const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

function getDegreeRoman(degree: number, quality: ChordQuality): string {
  // Handle invalid degrees (e.g., 0 for custom chords, or out of range)
  // Default to 'I' for invalid degrees
  if (!degree || degree < 1 || degree > 7) {
    return 'I';
  }
  const numeral = ROMAN_NUMERALS[degree - 1];
  if (!numeral) {
    return 'I'; // Fallback if somehow still invalid
  }
  const isMinorish = ['minor', 'min7', 'min7b5', 'dim7', 'diminished', 'min9', 'min11', 'min13'].includes(quality);
  return isMinorish ? numeral.toLowerCase() : numeral;
}

// ===========================
// HARMONIZATION LOGIC
// ===========================

/**
 * Check if a chord's intervals are compatible with a scale from a given root degree
 */
function isChordScaleCompatible(
  scaleIntervals: number[],
  rootDegreeIndex: number,
  chordIntervals: number[]
): boolean {
  // Get the chromatic pitch class of the root within the scale
  const rootPitchClass = scaleIntervals[rootDegreeIndex];
  
  for (const chordInterval of chordIntervals) {
    // Calculate the target pitch class (mod 12)
    const targetPitchClass = (rootPitchClass + chordInterval) % 12;
    
    // Check if this pitch class exists in the scale
    if (!scaleIntervals.includes(targetPitchClass)) {
      return false;
    }
  }
  return true;
}

/**
 * Determine the base quality of a triad built on a scale degree
 */
function getBaseTriadQuality(
  scaleIntervals: number[],
  degreeIndex: number
): 'major' | 'minor' | 'diminished' | 'augmented' {
  const root = scaleIntervals[degreeIndex];
  
  // Find the third (2 scale steps up)
  const thirdIndex = (degreeIndex + 2) % scaleIntervals.length;
  const third = scaleIntervals[thirdIndex];
  const thirdInterval = (third - root + 12) % 12;
  
  // Find the fifth (4 scale steps up)
  const fifthIndex = (degreeIndex + 4) % scaleIntervals.length;
  const fifth = scaleIntervals[fifthIndex];
  const fifthInterval = (fifth - root + 12) % 12;
  
  // Determine quality
  if (thirdInterval === 4 && fifthInterval === 7) return 'major';
  if (thirdInterval === 3 && fifthInterval === 7) return 'minor';
  if (thirdInterval === 3 && fifthInterval === 6) return 'diminished';
  if (thirdInterval === 4 && fifthInterval === 8) return 'augmented';
  
  // Default fallback
  return thirdInterval === 3 ? 'minor' : 'major';
}

/**
 * Get all valid chord variations for a scale degree
 */
function getValidChordQualities(
  scale: Scale,
  degreeIndex: number
): ChordQuality[] {
  const validQualities: ChordQuality[] = [];
  const baseQuality = getBaseTriadQuality(scale.intervals, degreeIndex);
  
  // Always include the base triad
  validQualities.push(baseQuality);
  
  // Check each chord type for scale compatibility
  for (const [qualityId, chordType] of Object.entries(CHORD_TYPES)) {
    if (qualityId === baseQuality) continue; // Already added
    
    if (isChordScaleCompatible(scale.intervals, degreeIndex, chordType.intervals)) {
      validQualities.push(qualityId as ChordQuality);
    }
  }
  
  // Sort by complexity
  return validQualities.sort((a, b) => CHORD_TYPES[a].complexity - CHORD_TYPES[b].complexity);
}

/**
 * Convert note name to MIDI note number
 */
export function noteToMidi(note: string, octave: number): number {
  const noteIndex = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B']
    .findIndex(n => n === note);
  
  // Handle enharmonic equivalents
  const normalizedIndex = noteIndex >= 0 ? noteIndex : 0;
  const chromaticIndex = [0, 1, 1, 2, 3, 3, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11][normalizedIndex];
  
  return chromaticIndex + (octave + 1) * 12;
}

/** MIDI note number for C3. Chord tones (excl. bass) must satisfy min-register rule vs this. */
export const C3_MIDI = 48;

/**
 * Check if chord tones (indices 1+) satisfy the minimum-register rule:
 * all ≥ C3, or at least 2 ≥ C3. Bass (index 0) is ignored.
 */
export function chordTonesSatisfyMinimumRegister(midiNotes: number[]): boolean {
  const tones = midiNotes.length <= 1 ? [] : midiNotes.slice(1);
  if (tones.length === 0) return true;
  const atOrAbove = tones.filter(m => m >= C3_MIDI).length;
  return atOrAbove === tones.length || atOrAbove >= 2;
}

/**
 * Ensure chord tones satisfy the minimum-register rule. If not, shift chord tones
 * up by octave(s) until at least 2 are ≥ C3 (or all ≥ C3). Bass is never changed.
 */
export function ensureChordTonesMinimumRegister(chord: Chord): Chord {
  let midi = [...chord.midiNotes];
  const maxIterations = 5;
  for (let i = 0; i < maxIterations; i++) {
    if (chordTonesSatisfyMinimumRegister(midi)) {
      if (i === 0) return chord;
      return { ...chord, midiNotes: midi };
    }
    for (let j = 1; j < midi.length; j++) midi[j] += 12;
  }
  return { ...chord, midiNotes: midi };
}

/**
 * Build a chord as a pitch-class set with voicing
 *
 * Chord tones form the centre; bass is always one octave below the root.
 * (Keep-root toggle controls whether bass follows inversion; buildChord always
 * voices root in bass one octave below chord tones.)
 *
 * Voicing:
 * - Chord tones: root, 3rd, 5th, etc. at chordToneOctave (extensions one higher)
 * - Bass: root one octave below chord tones
 */
export function buildChord(
  root: string,
  quality: ChordQuality,
  degree: number,
  preferFlats: boolean,
  chordToneOctaveOverride?: number
): Chord {
  const chordType = CHORD_TYPES[quality];
  const notes: string[] = [];
  const midiNotes: number[] = [];
  
  const rootNote = getNoteAtInterval(root, 0, preferFlats);
  const chordToneOctave = chordToneOctaveOverride ?? 3;
  const bassOctave = chordToneOctave - 1;
  
  // Bass: root one octave below chord tones
  const bassMidi = noteToMidi(rootNote, bassOctave);
  notes.push(rootNote);
  midiNotes.push(bassMidi);
  
  // Chord tones (centre) at chordToneOctave; extensions at chordToneOctave + 1
  for (const interval of chordType.intervals) {
    const note = getNoteAtInterval(root, interval % 12, preferFlats);
    const octave = interval >= 12 ? chordToneOctave + 1 : chordToneOctave;
    notes.push(note);
    midiNotes.push(noteToMidi(note, octave));
  }
  
  const built: Chord = {
    root,
    quality,
    symbol: `${root}${chordType.symbol}`,
    notes,
    midiNotes,
    degree,
    degreeRoman: getDegreeRoman(degree, quality),
  };
  return ensureChordTonesMinimumRegister(built);
}

// ===========================
// MAIN HARMONIZATION FUNCTION
// ===========================

export interface HarmonizedScale {
  root: string;
  scale: Scale;
  degrees: DegreeChords[];
}

export interface DegreeChords {
  degree: number;
  degreeRoman: string;
  rootNote: string;
  primaryChord: Chord;
  variations: Chord[];
}

/**
 * Minimum chord-tone octave. Always 3 so chord tones stay ≥ C3 (or ≥2 tones ≥ C3).
 * Previously E+ used 2 (muddy); now all keys use 3. Bass remains one octave below.
 */
function getKeyRootChordToneOctave(_keyRoot: string): number {
  return 3;
}

/**
 * Harmonize a scale into a full chord palette.
 * Chord tones are the centre; bass is one octave below. Chord-tone octave starts at 3
 * (min register); we bump per degree only when root would drop (sequential-up).
 */
export function harmonizeScale(root: string, scale: Scale): HarmonizedScale {
  // Use scale-based enharmonic spelling rules
  const preferFlats = shouldPreferFlats(root, scale);
  const degrees: DegreeChords[] = [];
  const baseChordToneOctave = getKeyRootChordToneOctave(root);
  
  const numDegrees = scale.intervals.length;
  let lastChordToneRootMidi = 0;
  
  for (let i = 0; i < numDegrees; i++) {
    const degreeRoot = getNoteAtInterval(root, scale.intervals[i], preferFlats);
    const degree = i + 1;
    
    let chordToneOctave = baseChordToneOctave;
    while (noteToMidi(degreeRoot, chordToneOctave) < lastChordToneRootMidi) {
      chordToneOctave += 1;
    }
    lastChordToneRootMidi = noteToMidi(degreeRoot, chordToneOctave);
    
    const validQualities = getValidChordQualities(scale, i);
    const primaryQuality = validQualities[0];
    const primaryChord = buildChord(degreeRoot, primaryQuality, degree, preferFlats, chordToneOctave);
    
    const variations = validQualities
      .slice(1)
      .slice(0, 8)
      .map(q => buildChord(degreeRoot, q, degree, preferFlats, chordToneOctave));
    
    degrees.push({
      degree,
      degreeRoman: getDegreeRoman(degree, primaryQuality),
      rootNote: degreeRoot,
      primaryChord,
      variations,
    });
  }
  
  return {
    root,
    scale,
    degrees,
  };
}

/**
 * Get a flat list of all primary chords (for simple grid view)
 */
export function getPrimaryChords(harmonized: HarmonizedScale): Chord[] {
  return harmonized.degrees.map(d => d.primaryChord);
}

/**
 * Get all chords including variations (for expanded view)
 */
export function getAllChords(harmonized: HarmonizedScale): Chord[] {
  return harmonized.degrees.flatMap(d => [d.primaryChord, ...d.variations]);
}

// ===========================
// MUSICAL USEFULNESS SCORING
// ===========================

/**
 * Musical usefulness scores for chord qualities
 * Higher scores = more common in popular music
 */
const MUSICAL_USEFULNESS_SCORES: Record<ChordQuality, number> = {
  // Very common in popular music
  'dom7': 1.0,        // V7 in minor keys
  'major': 1.0,       // I, IV, V
  'minor': 1.0,       // i, iv, v
  'min7': 0.9,        // Common 7th chords
  'maj7': 0.9,
  
  // Less common but still useful
  'sus4': 0.7,
  'sus2': 0.6,
  'add9': 0.7,
  'maj9': 0.8,
  'min9': 0.8,
  'dom9': 0.8,
  
  // Rare in pop music
  'diminished': 0.3,
  'dim7': 0.2,
  'augmented': 0.2,
  'min7b5': 0.4,
  'dom11': 0.5,
  'min11': 0.5,
  'dom13': 0.6,
  'maj13': 0.6,
  'min13': 0.6,
  '7sus4': 0.6,
  'maj7sus2': 0.5,
};

/**
 * Get musical usefulness score for a chord quality
 */
export function getMusicalUsefulnessScore(quality: ChordQuality): number {
  return MUSICAL_USEFULNESS_SCORES[quality] ?? 0.5;
}

/**
 * Compare two chords for deduplication (same root and quality)
 */
function areChordsEqual(chord1: Chord, chord2: Chord): boolean {
  return chord1.root === chord2.root && chord1.quality === chord2.quality;
}

// ===========================
// EMOTIONAL BUCKET HARMONIZATION
// ===========================

/**
 * Harmonize an emotional bucket by merging chords from multiple scales
 */
export function harmonizeEmotionalBucket(
  root: string,
  bucketId: 'major_emotional' | 'minor_emotional',
  getScalesForBucket: (bucketId: string) => Scale[],
  createBucketScale: (bucketId: string) => Scale
): HarmonizedScale {
  // Get all scales in the bucket
  const scales = getScalesForBucket(bucketId);
  
  // Harmonize each scale
  const harmonizations = scales.map(scale => harmonizeScale(root, scale));
  
  // Create synthetic scale object for the bucket
  const bucketScale = createBucketScale(bucketId);
  
  // Merge chords by degree
  const mergedDegrees: DegreeChords[] = [];
  const numDegrees = bucketScale.intervals.length;
  
  for (let degree = 1; degree <= numDegrees; degree++) {
    // Collect all chords for this degree from all scales
    const allChordsForDegree: Chord[] = [];
    
    for (const harmonization of harmonizations) {
      const degreeChords = harmonization.degrees.find(d => d.degree === degree);
      if (degreeChords) {
        // Add primary chord
        allChordsForDegree.push(degreeChords.primaryChord);
        // Add variations
        allChordsForDegree.push(...degreeChords.variations);
      }
    }
    
    // Remove duplicates (same root + quality)
    const uniqueChords: Chord[] = [];
    const seen = new Set<string>();
    
    for (const chord of allChordsForDegree) {
      const key = `${chord.root}-${chord.quality}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueChords.push(chord);
      }
    }
    
    // Select primary chord: most stable/common (usually from base scale)
    // For minor: prefer from Aeolian (Natural Minor)
    // For major: prefer from Ionian (Major)
    let primaryChord: Chord;
    const baseScaleId = bucketId === 'minor_emotional' ? 'aeolian' : 'major';
    const baseScaleHarmonization = harmonizations.find(h => h.scale.id === baseScaleId);
    
    if (baseScaleHarmonization) {
      const baseDegreeChords = baseScaleHarmonization.degrees.find(d => d.degree === degree);
      if (baseDegreeChords) {
        primaryChord = baseDegreeChords.primaryChord;
      } else {
        // Fallback: use first chord sorted by usefulness
        primaryChord = uniqueChords.sort((a, b) => 
          getMusicalUsefulnessScore(b.quality) - getMusicalUsefulnessScore(a.quality)
        )[0];
      }
    } else {
      // Fallback: use first chord sorted by usefulness
      primaryChord = uniqueChords.sort((a, b) => 
        getMusicalUsefulnessScore(b.quality) - getMusicalUsefulnessScore(a.quality)
      )[0];
    }
    
    // Get variations: all other chords, sorted by musical usefulness
    const variations = uniqueChords
      .filter(chord => !areChordsEqual(chord, primaryChord))
      .sort((a, b) => {
        // Sort by musical usefulness (higher first)
        const usefulnessDiff = getMusicalUsefulnessScore(b.quality) - getMusicalUsefulnessScore(a.quality);
        if (Math.abs(usefulnessDiff) > 0.01) {
          return usefulnessDiff;
        }
        // Then by complexity (simpler first)
        return CHORD_TYPES[a.quality].complexity - CHORD_TYPES[b.quality].complexity;
      })
      .slice(0, 8); // Limit to top 8 most useful
    
    // Get root note and degree roman from primary chord
    const rootNote = primaryChord.root;
    const degreeRoman = primaryChord.degreeRoman;
    
    mergedDegrees.push({
      degree,
      degreeRoman,
      rootNote,
      primaryChord,
      variations,
    });
  }
  
  return {
    root,
    scale: bucketScale,
    degrees: mergedDegrees,
  };
}
