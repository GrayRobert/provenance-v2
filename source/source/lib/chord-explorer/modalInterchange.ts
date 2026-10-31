/**
 * Modal Interchange Engine
 * Handles borrowed chords from parallel modes and confidence scoring
 */

import { 
  Scale, 
  AEOLIAN_SCALE, 
  DORIAN_SCALE, 
  MIXOLYDIAN_SCALE, 
  LYDIAN_SCALE,
  MAJOR_SCALE,
  PHRYGIAN_SCALE,
  getNoteAtInterval,
  shouldPreferFlats,
  NOTE_NAMES,
  NOTE_NAMES_FLAT,
  isEmotionalScale,
  isScaleInEmotionalBucket,
  EMOTIONAL_BUCKET_IDS
} from './scales';
import { 
  Chord, 
  ChordQuality, 
  buildChord, 
  CHORD_TYPES, 
  HarmonizedScale, 
  harmonizeScale,
  getMusicalUsefulnessScore
} from './harmonizer';

// ===========================
// CHORD FUNCTION TYPES
// ===========================

export type ChordFunction = 'tonic' | 'predominant' | 'dominant' | 'colour';

export interface BorrowedChord extends Chord {
  isBorrowed: true;
  sourceMode: string;
  sourceModeName: string;
  chordFunction: ChordFunction;
}

export interface BorrowedModeChords {
  modeId: string;
  modeName: string;
  chords: BorrowedChord[];
}

// ===========================
// PARALLEL MODES FOR BORROWING
// ===========================

export const BORROWING_MODES: { scale: Scale; displayName: string }[] = [
  { scale: MAJOR_SCALE, displayName: 'Ionian' },
  { scale: AEOLIAN_SCALE, displayName: 'Aeolian' },
  { scale: DORIAN_SCALE, displayName: 'Dorian' },
  { scale: MIXOLYDIAN_SCALE, displayName: 'Mixolydian' },
  { scale: LYDIAN_SCALE, displayName: 'Lydian' },
  { scale: PHRYGIAN_SCALE, displayName: 'Phrygian' },
];

// ===========================
// CHORD FUNCTION CLASSIFICATION
// ===========================

/**
 * Classify a chord's function based on its scale degree
 * This is a simplified, pragmatic classification
 */
export function classifyChordFunction(
  degree: number,
  quality: ChordQuality,
  isBorrowed: boolean
): ChordFunction {
  // Borrowed chords are generally "colour" chords
  if (isBorrowed) {
    // Some borrowed chords can have predominant function
    if (degree === 4 && (quality === 'minor' || quality === 'min7')) {
      return 'predominant'; // iv from Aeolian is classically predominant
    }
    if (degree === 2) {
      return 'predominant'; // ii variations often function as predominant
    }
    return 'colour';
  }

  // Diatonic chord functions
  switch (degree) {
    case 1:
    case 6:
      return 'tonic'; // I, vi
    case 3:
      return quality.includes('min') ? 'tonic' : 'tonic'; // iii
    case 2:
    case 4:
      return 'predominant'; // ii, IV
    case 5:
    case 7:
      return 'dominant'; // V, vii°
    default:
      return 'tonic';
  }
}

// ===========================
// MODE COMPATIBILITY SCORES
// ===========================

const MODE_COMPATIBILITY_SCORES: Record<string, number> = {
  'aeolian': 1.0,
  'mixolydian': 0.8,
  'dorian': 0.7,
  'lydian': 0.5,
};

// ===========================
// CONFIDENCE SCORING
// ===========================

/**
 * Count shared tones between two chords
 */
function countSharedTones(chord1: Chord, chord2: Chord): number {
  // Normalize note names to pitch classes for comparison
  const getPitchClasses = (chord: Chord): Set<number> => {
    const classes = new Set<number>();
    for (const note of chord.notes) {
      let index = NOTE_NAMES.indexOf(note as any);
      if (index === -1) {
        index = NOTE_NAMES_FLAT.indexOf(note as any);
      }
      if (index !== -1) {
        classes.add(index);
      }
    }
    return classes;
  };

  const pc1 = getPitchClasses(chord1);
  const pc2 = getPitchClasses(chord2);
  
  let shared = 0;
  pc1.forEach(pc => {
    if (pc2.has(pc)) shared++;
  });
  
  return shared;
}

/**
 * Score based on shared tones (Weight: 0.4)
 */
function scoreSharedTones(currentChord: Chord, candidateChord: Chord): number {
  const shared = countSharedTones(currentChord, candidateChord);
  if (shared >= 3) return 1.0;
  if (shared === 2) return 0.7;
  if (shared === 1) return 0.3;
  return 0.0;
}

/**
 * Score based on functional resolution (Weight: 0.3)
 */
function scoreFunctionalResolution(
  fromFunction: ChordFunction,
  toFunction: ChordFunction
): number {
  const resolutionScores: Record<string, number> = {
    'tonic→colour': 0.8,
    'predominant→colour': 0.9,
    'dominant→colour': 0.75, // V→bVII (e.g. G→Bb in C) is a standard modal interchange move
    'colour→tonic': 1.0,
    'colour→predominant': 0.6,
    'colour→colour': 0.2,
    // Also handle diatonic transitions to borrowed
    'tonic→tonic': 0.5,
    'predominant→predominant': 0.4,
    'dominant→dominant': 0.2,
    'predominant→tonic': 0.7,
    'dominant→tonic': 0.9,
    'tonic→predominant': 0.7,
    'tonic→dominant': 0.6,
    'predominant→dominant': 0.8,
  };
  
  const key = `${fromFunction}→${toFunction}`;
  return resolutionScores[key] ?? 0.5;
}

/**
 * Score based on modal compatibility (Weight: 0.2)
 */
function scoreModalCompatibility(modeId: string): number {
  return MODE_COMPATIBILITY_SCORES[modeId] ?? 0.5;
}

/**
 * Score based on voice leading distance (Weight: 0.1)
 */
function scoreVoiceLeading(currentChord: Chord, candidateChord: Chord): number {
  // Calculate root movement in semitones
  const getRootPitchClass = (chord: Chord): number => {
    let index = NOTE_NAMES.indexOf(chord.root as any);
    if (index === -1) {
      index = NOTE_NAMES_FLAT.indexOf(chord.root as any);
    }
    return index;
  };

  const pc1 = getRootPitchClass(currentChord);
  const pc2 = getRootPitchClass(candidateChord);
  
  if (pc1 === -1 || pc2 === -1) return 0.5;
  
  const interval = Math.min(
    Math.abs(pc2 - pc1),
    12 - Math.abs(pc2 - pc1)
  );
  
  // Score based on interval
  if (interval === 0) return 1.0;       // Unison (same root)
  if (interval <= 2) return 1.0;         // Step (M2/m2)
  if (interval === 3 || interval === 4) return 0.7; // Third
  if (interval === 5 || interval === 7) return 0.5; // Fourth/Fifth
  if (interval === 6) return 0.1;        // Tritone
  return 0.3;
}

/**
 * Calculate confidence score for a borrowed chord following the current chord
 * Now includes musical usefulness as a factor
 */
export function calculateConfidence(
  currentChord: Chord,
  candidateChord: BorrowedChord,
  currentFunction: ChordFunction
): number {
  const sharedTonesScore = scoreSharedTones(currentChord, candidateChord);
  let functionScore = scoreFunctionalResolution(currentFunction, candidateChord.chordFunction);
  const modalScore = scoreModalCompatibility(candidateChord.sourceMode);
  const voiceLeadingScore = scoreVoiceLeading(currentChord, candidateChord);
  const usefulnessScore = getMusicalUsefulnessScore(candidateChord.quality);

  // Bonus: V→bVII (e.g. G→Bb in C) per chord-files model "ADD MODAL INTERCHANGE: FM GM BbM CM"
  const isVToFlatVII =
    currentChord.degree === 5 &&
    candidateChord.sourceMode === 'aeolian' &&
    candidateChord.degree === 7 &&
    (candidateChord.quality === 'major' || candidateChord.quality === 'dom7' || candidateChord.quality === 'maj7');
  if (isVToFlatVII) {
    functionScore = Math.max(functionScore, 0.9);
  }

  // Updated weights: reduced other weights slightly to make room for usefulness
  const confidence =
    sharedTonesScore * 0.35 +
    functionScore * 0.25 +
    modalScore * 0.15 +
    voiceLeadingScore * 0.1 +
    usefulnessScore * 0.15;

  return Math.round(confidence * 100) / 100; // Round to 2 decimals
}

// ===========================
// BORROWED CHORD GENERATION
// ===========================

/**
 * Determine the base quality of a triad built on a scale degree
 */
function getBaseTriadQuality(
  scaleIntervals: number[],
  degreeIndex: number
): 'major' | 'minor' | 'diminished' | 'augmented' {
  const root = scaleIntervals[degreeIndex];
  
  const thirdIndex = (degreeIndex + 2) % scaleIntervals.length;
  const third = scaleIntervals[thirdIndex];
  const thirdInterval = (third - root + 12) % 12;
  
  const fifthIndex = (degreeIndex + 4) % scaleIntervals.length;
  const fifth = scaleIntervals[fifthIndex];
  const fifthInterval = (fifth - root + 12) % 12;
  
  if (thirdInterval === 4 && fifthInterval === 7) return 'major';
  if (thirdInterval === 3 && fifthInterval === 7) return 'minor';
  if (thirdInterval === 3 && fifthInterval === 6) return 'diminished';
  if (thirdInterval === 4 && fifthInterval === 8) return 'augmented';
  
  return thirdInterval === 3 ? 'minor' : 'major';
}

/**
 * Check if a chord's intervals are compatible with a scale from a given root degree
 */
function isChordScaleCompatible(
  scaleIntervals: number[],
  rootDegreeIndex: number,
  chordIntervals: number[]
): boolean {
  const rootPitchClass = scaleIntervals[rootDegreeIndex];
  
  for (const chordInterval of chordIntervals) {
    const targetPitchClass = (rootPitchClass + chordInterval) % 12;
    if (!scaleIntervals.includes(targetPitchClass)) {
      return false;
    }
  }
  return true;
}

/**
 * Get valid chord qualities for a scale degree
 */
function getValidChordQualities(
  scale: Scale,
  degreeIndex: number
): ChordQuality[] {
  const validQualities: ChordQuality[] = [];
  const baseQuality = getBaseTriadQuality(scale.intervals, degreeIndex);
  
  validQualities.push(baseQuality);
  
  // Also check for 7th chords
  const seventhChords: ChordQuality[] = ['dom7', 'maj7', 'min7', 'min7b5', 'dim7'];
  for (const quality of seventhChords) {
    if (quality === baseQuality) continue;
    if (isChordScaleCompatible(scale.intervals, degreeIndex, CHORD_TYPES[quality].intervals)) {
      validQualities.push(quality);
    }
  }
  
  return validQualities;
}

/**
 * Check if a chord contains notes outside the given scale
 */
function chordHasOutOfScaleNotes(
  chordIntervals: number[],
  rootInterval: number,
  scaleIntervals: number[]
): boolean {
  const scaleSet = new Set(scaleIntervals);
  
  for (const interval of chordIntervals) {
    const absoluteInterval = (rootInterval + interval) % 12;
    if (!scaleSet.has(absoluteInterval)) {
      return true;
    }
  }
  return false;
}

/**
 * Generate all diatonic chords from a parallel mode
 * Fully harmonizes the mode and returns all 7 primary chords
 */
export function generateBorrowedChords(
  root: string,
  currentScale: Scale,
  borrowFromMode: Scale,
  modeDisplayName: string
): BorrowedChord[] {
  // Fully harmonize the parallel mode (just like the main diatonic section)
  const harmonization = harmonizeScale(root, borrowFromMode);
  const borrowedChords: BorrowedChord[] = [];
  
  // Convert each primary chord from the harmonization to a BorrowedChord
  for (const degreeChords of harmonization.degrees) {
    const primaryChord = degreeChords.primaryChord;
    const chordFunction = classifyChordFunction(
      primaryChord.degree,
      primaryChord.quality,
      true
    );
    
    const borrowedChord: BorrowedChord = {
      ...primaryChord,
      isBorrowed: true,
      sourceMode: borrowFromMode.id,
      sourceModeName: modeDisplayName,
      chordFunction,
    };
    
    borrowedChords.push(borrowedChord);
  }
  
  return borrowedChords;
}

/**
 * Generate all borrowed chords from all parallel modes
 * Each mode is fully harmonized, showing all 7 diatonic chords
 * Filters out chords that are already diatonic to the current key
 */
export function generateAllBorrowedChords(
  root: string,
  currentScale: Scale
): BorrowedModeChords[] {
  const result: BorrowedModeChords[] = [];
  
  // Check if current scale is an emotional bucket
  const isEmotional = isEmotionalScale(currentScale.id);
  
  for (const { scale, displayName } of BORROWING_MODES) {
    // Skip if this is the same mode as current scale
    if (scale.id === currentScale.id) continue;
    
    // Special handling for emotional buckets
    if (isEmotional) {
      // Check if this borrowing mode is already included in the emotional bucket
      const bucketId = currentScale.id as 'major_emotional' | 'minor_emotional';
      if (isScaleInEmotionalBucket(scale.id, bucketId)) {
        // This mode is already in the bucket, skip it
        continue;
      }
    }
    
    // Generate all 7 diatonic chords from this parallel mode
    const allChords = generateBorrowedChords(root, currentScale, scale, displayName);
    
    // Filter out chords that are already diatonic to the current key
    // These chords are already available in the primary diatonic section
    const trulyBorrowedChords = allChords.filter(chord => {
      return !isChordDiatonicToScale(chord, currentScale, root);
    });
    
    // Only include the mode if it has at least one truly borrowed chord
    if (trulyBorrowedChords.length > 0) {
      result.push({
        modeId: scale.id,
        modeName: displayName,
        chords: trulyBorrowedChords,
      });
    }
  }
  
  return result;
}

// ===========================
// SUGGESTION ENGINE
// ===========================

export interface BorrowedSuggestion {
  chord: BorrowedChord | Chord; // Can be BorrowedChord or regular Chord for resolution
  confidence: number;
  isResolution?: boolean; // True if this is a diatonic resolution chord (return to key)
}

// Diatonic degrees that borrowed chords should resolve to
const RESOLUTION_TARGET_DEGREES = [1, 3, 4, 5, 6]; // I, iii, IV, V, vi

/**
 * Check if a chord quality is diminished
 */
function isDiminishedChord(quality: ChordQuality): boolean {
  return quality === 'diminished' || quality === 'dim7' || quality === 'min7b5';
}

/**
 * Get the pitch class (0-11) of a note name
 */
function getNotePitchClass(note: string): number {
  let index = NOTE_NAMES.indexOf(note as any);
  if (index === -1) {
    index = NOTE_NAMES_FLAT.indexOf(note as any);
  }
  return index >= 0 ? index : 0;
}

/**
 * Calculate semitone distance between two pitch classes
 */
function semitoneDifference(pc1: number, pc2: number): number {
  const diff = Math.abs(pc2 - pc1);
  return Math.min(diff, 12 - diff);
}

/**
 * Check if a borrowed chord can resolve by semitone or whole tone 
 * to any of the target diatonic degrees
 */
function canResolveByStepToDiatonic(
  borrowedChord: BorrowedChord,
  diatonicRoots: Map<number, number> // degree -> pitch class
): boolean {
  const borrowedRootPC = getNotePitchClass(borrowedChord.root);
  
  for (const targetDegree of RESOLUTION_TARGET_DEGREES) {
    const targetPC = diatonicRoots.get(targetDegree);
    if (targetPC === undefined) continue;
    
    const distance = semitoneDifference(borrowedRootPC, targetPC);
    // Semitone (1) or whole tone (2) resolution
    if (distance <= 2) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a borrowed chord shares enough tones with the current chord
 */
function getSharedToneCount(chord1: Chord, chord2: Chord): number {
  const pc1 = new Set(chord1.notes.map(n => getNotePitchClass(n)));
  const pc2 = new Set(chord2.notes.map(n => getNotePitchClass(n)));
  
  let shared = 0;
  pc1.forEach(pc => {
    if (pc2.has(pc)) shared++;
  });
  return shared;
}

/**
 * Check if a chord is diatonic to the current scale
 * Returns true if all notes of the chord are within the scale
 */
function isChordDiatonicToScale(
  chord: BorrowedChord,
  currentScale: Scale,
  scaleRoot: string
): boolean {
  const chordType = CHORD_TYPES[chord.quality];
  // Use scale-based enharmonic spelling for current scale
  const preferFlats = shouldPreferFlats(scaleRoot, currentScale);
  
  // Find the root's position in the current scale
  let rootDegreeIndex = -1;
  const rootPC = getNotePitchClass(chord.root);
  const scaleRootPC = getNotePitchClass(scaleRoot);
  
  for (let i = 0; i < currentScale.intervals.length; i++) {
    const degreePC = (scaleRootPC + currentScale.intervals[i]) % 12;
    if (degreePC === rootPC) {
      rootDegreeIndex = i;
      break;
    }
  }
  
  // If root not found in scale, it's not diatonic
  if (rootDegreeIndex === -1) {
    return false;
  }
  
  // Check if all chord intervals are within the scale
  return isChordScaleCompatible(
    currentScale.intervals,
    rootDegreeIndex,
    chordType.intervals
  );
}

/**
 * PRE-FILTER: Reject borrowed chords that don't meet musical usefulness criteria
 * This runs BEFORE confidence scoring
 */
function preFilterBorrowedChord(
  borrowedChord: BorrowedChord,
  currentChord: Chord,
  diatonicRoots: Map<number, number>,
  currentScale?: Scale,
  scaleRoot?: string
): boolean {
  // HARD REJECT: If the chord is already diatonic to the current key, it's not a borrowed chord
  // This prevents suggesting chords like C Major (from Mixolydian) when in C Major
  if (currentScale && scaleRoot) {
    if (isChordDiatonicToScale(borrowedChord, currentScale, scaleRoot)) {
      return false;
    }
  }
  
  const sharedTones = getSharedToneCount(currentChord, borrowedChord);
  
  // HARD REJECT: Zero shared tones
  if (sharedTones === 0) {
    return false;
  }
  
  // HARD REJECT: Diminished chords have stricter requirements
  if (isDiminishedChord(borrowedChord.quality)) {
    // Must share at least 2 tones
    if (sharedTones < 2) {
      return false;
    }
    // Must resolve by semitone or tone to a diatonic chord (I, IV, or V)
    if (!canResolveByStepToDiatonic(borrowedChord, diatonicRoots)) {
      return false;
    }
  }
  
  // Check if chord can resolve to ANY diatonic chord within one move
  // (For non-diminished chords, we're more lenient - allow 4th/5th movement too)
  const borrowedRootPC = getNotePitchClass(borrowedChord.root);
  let canResolve = false;
  
  for (const targetDegree of RESOLUTION_TARGET_DEGREES) {
    const targetPC = diatonicRoots.get(targetDegree);
    if (targetPC === undefined) continue;
    
    const distance = semitoneDifference(borrowedRootPC, targetPC);
    // Allow resolution by step, third, fourth, or fifth (not tritone)
    if (distance <= 5 && distance !== 6) {
      canResolve = true;
      break;
    }
  }
  
  if (!canResolve) {
    return false;
  }
  
  return true;
}

/**
 * POST-FILTER: Apply final selection rules after scoring
 * - At most one diminished chord
 * - Mode-specific caps (prefer variety)
 */
function postFilterSuggestions(
  suggestions: BorrowedSuggestion[],
  maxSuggestions: number
): BorrowedSuggestion[] {
  const result: BorrowedSuggestion[] = [];
  const usedRoots = new Set<string>();
  const usedModes = new Map<string, number>(); // mode -> count
  let diminishedCount = 0;
  
  const MODE_CAP = 2; // Max suggestions per mode
  
  for (const suggestion of suggestions) {
    if (result.length >= maxSuggestions) break;
    
    const { chord } = suggestion;
    
    // Check diminished limit (at most 1)
    if (isDiminishedChord(chord.quality)) {
      if (diminishedCount >= 1) continue;
      diminishedCount++;
    }
    
    // Check mode cap (only BorrowedChord has sourceMode)
    const modeKey = isBorrowedChord(chord) ? chord.sourceMode : 'diatonic';
    const modeCount = usedModes.get(modeKey) || 0;
    if (modeCount >= MODE_CAP) continue;
    
    // Prefer variety - skip duplicate roots unless we need to fill slots
    if (usedRoots.has(chord.root) && suggestions.length > result.length + 1) {
      continue;
    }
    
    result.push(suggestion);
    usedRoots.add(chord.root);
    usedModes.set(modeKey, modeCount + 1);
  }
  
  return result;
}

/**
 * Check if a chord is a borrowed chord
 * Only returns true if the chord actually has the isBorrowed property set to true
 * We don't match against the borrowed chords list because now we show all chords
 * from each mode, so a diatonic chord might match a chord in a parallel mode
 */
function isBorrowedChord(
  chord: Chord | BorrowedChord | null | undefined,
  allBorrowedChords?: BorrowedModeChords[]
): chord is BorrowedChord {
  if (!chord) return false;
  
  // Check for isBorrowed property (most reliable indicator)
  if ('isBorrowed' in chord && (chord as any).isBorrowed === true) {
    return true;
  }
  
  // Also check for sourceMode which is unique to BorrowedChord
  // This ensures we only detect chords that were explicitly created as borrowed
  if ('sourceMode' in chord && typeof (chord as any).sourceMode === 'string') {
    return true;
  }
  
  // Don't match against the borrowed chords list anymore because:
  // 1. We now show all 7 chords from each mode
  // 2. A diatonic chord (e.g., C Major) might exist in a parallel mode (e.g., Mixolydian)
  // 3. This would cause false positives where diatonic chords are detected as borrowed
  
  return false;
}

/**
 * Build a map of diatonic degree roots for resolution checking
 */
function buildDiatonicRootsMap(
  root: string,
  scale: Scale
): Map<number, number> {
  const rootPC = getNotePitchClass(root);
  const map = new Map<number, number>();
  
  for (let i = 0; i < scale.intervals.length; i++) {
    const degree = i + 1;
    const degreePC = (rootPC + scale.intervals[i]) % 12;
    map.set(degree, degreePC);
  }
  
  return map;
}

/**
 * Check if a chord is a borrowed minor tonic (i)
 * This is used to determine if we should prefer V over V7 for resolution
 */
function isBorrowedMinorTonic(chord: Chord | BorrowedChord | null | undefined): boolean {
  if (!chord) return false;
  const isBorrowed = isBorrowedChord(chord);
  if (!isBorrowed) return false;
  
  // Check if it's degree 1 (tonic) and minor quality
  return chord.degree === 1 && (chord.quality === 'minor' || chord.quality === 'min7');
}

/**
 * Generate diatonic resolution chords for returning to the key after a borrowed chord
 * Always includes I and V (or V7 if available)
 * 
 * @param fromBorrowedMinorTonic - If true, prefer V over V7 (gentler resolution)
 */
function generateResolutionChords(
  harmonization: HarmonizedScale | null,
  currentChord: Chord | null,
  fromBorrowedMinorTonic: boolean = false
): BorrowedSuggestion[] {
  if (!harmonization || !currentChord) return [];
  
  const resolutionChords: BorrowedSuggestion[] = [];
  
  // Find degree 1 (I) - always include
  const degree1 = harmonization.degrees.find(d => d.degree === 1);
  if (degree1) {
    resolutionChords.push({
      chord: degree1.primaryChord,
      confidence: 1.0,
      isResolution: true,
    });
    
    // Also include maj7 variation if available (for I)
    const maj7Variation = degree1.variations.find(v => v.quality === 'maj7');
    if (maj7Variation) {
      resolutionChords.push({
        chord: maj7Variation,
        confidence: 0.95,
        isResolution: true,
      });
    }
  }
  
  // Find degree 5 (V) - always include
  const degree5 = harmonization.degrees.find(d => d.degree === 5);
  if (degree5) {
    if (fromBorrowedMinorTonic) {
      // When resolving from borrowed minor tonic (i), prefer V over V7
      // V provides a gentler return to the key
      resolutionChords.push({
        chord: degree5.primaryChord,
        confidence: 1.0, // Highest confidence for V
        isResolution: true,
      });
      
      // V7 is still available but ranked lower
      const v7Variation = degree5.variations.find(v => v.quality === 'dom7');
      if (v7Variation) {
        resolutionChords.push({
          chord: v7Variation,
          confidence: 0.85, // Lower confidence than V
          isResolution: true,
        });
      }
    } else {
      // Default behavior: prioritize V7 over V
      const v7Variation = degree5.variations.find(v => v.quality === 'dom7');
      if (v7Variation) {
        resolutionChords.push({
          chord: v7Variation,
          confidence: 1.0,
          isResolution: true,
        });
      }
      
      // Also include V triad
      resolutionChords.push({
        chord: degree5.primaryChord,
        confidence: 0.95,
        isResolution: true,
      });
    }
  }
  
  // Optionally include predominant → dominant paths (ii, IV)
  const degree2 = harmonization.degrees.find(d => d.degree === 2);
  if (degree2) {
    resolutionChords.push({
      chord: degree2.primaryChord,
      confidence: 0.85,
      isResolution: true,
    });
  }
  
  const degree4 = harmonization.degrees.find(d => d.degree === 4);
  if (degree4) {
    resolutionChords.push({
      chord: degree4.primaryChord,
      confidence: 0.85,
      isResolution: true,
    });
  }
  
  // Remove duplicates (same root and quality)
  const seen = new Set<string>();
  return resolutionChords.filter(suggestion => {
    const key = `${suggestion.chord.root}-${suggestion.chord.quality}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Get suggested borrowed chords based on the currently playing chord
 * 
 * Pipeline:
 * 1. Pre-filter: Reject musically implausible chords
 * 2. Score: Apply confidence formula to remaining chords
 * 3. Post-filter: Apply caps and variety rules
 * 
 * If previousChord is borrowed, also includes diatonic resolution chords
 * 
 * Returns at most 3 suggestions with confidence >= 0.6
 */
export function getSuggestedBorrowedChords(
  currentChord: Chord | null,
  allBorrowedChords: BorrowedModeChords[],
  maxSuggestions: number = 3,
  minConfidence: number = 0.6,
  currentScale?: Scale,
  scaleRoot?: string,
  previousChord?: Chord | null,
  harmonization?: HarmonizedScale | null
): BorrowedSuggestion[] {
  if (!currentChord) return [];
  
  const currentFunction = classifyChordFunction(
    currentChord.degree,
    currentChord.quality,
    false
  );
  
  // Build diatonic roots map for resolution checking
  // If scale info not provided, create a basic major scale map from current chord
  let diatonicRoots: Map<number, number>;
  if (currentScale && scaleRoot) {
    diatonicRoots = buildDiatonicRootsMap(scaleRoot, currentScale);
  } else {
    // Fallback: estimate from current chord (less accurate)
    diatonicRoots = new Map();
    const rootPC = getNotePitchClass(currentChord.root);
    // Assume major scale intervals for fallback
    const majorIntervals = [0, 2, 4, 5, 7, 9, 11];
    majorIntervals.forEach((interval, i) => {
      diatonicRoots.set(i + 1, (rootPC + interval) % 12);
    });
  }
  
  // STAGE 1: Pre-filter
  const preFiltered: BorrowedChord[] = [];
  for (const modeChords of allBorrowedChords) {
    for (const chord of modeChords.chords) {
      if (preFilterBorrowedChord(chord, currentChord, diatonicRoots, currentScale, scaleRoot)) {
        preFiltered.push(chord);
      }
    }
  }
  
  // STAGE 2: Score remaining chords
  const scored: BorrowedSuggestion[] = [];
  for (const chord of preFiltered) {
    const confidence = calculateConfidence(currentChord, chord, currentFunction);
    
    if (confidence >= minConfidence) {
      scored.push({ chord, confidence });
    }
  }
  
  // Sort by confidence (descending)
  scored.sort((a, b) => b.confidence - a.confidence);
  
  // STAGE 3: Post-filter
  const borrowedSuggestions = postFilterSuggestions(scored, maxSuggestions);
  
  // STAGE 4: If current chord is borrowed, add diatonic resolution chords
  // Only show resolution chords when you're CURRENTLY on a borrowed chord
  // Once you've resolved to a diatonic chord, you're back in the key - no need for resolution suggestions
  const currentIsBorrowed = isBorrowedChord(currentChord, allBorrowedChords);
  
  // Check if we're resolving from a borrowed minor tonic (i)
  // This affects whether we prefer V over V7
  const fromBorrowedMinorTonic = isBorrowedMinorTonic(currentChord);
  
  // Show resolution chords ONLY if we're currently on a borrowed chord
  // Don't show them if we've already resolved to a diatonic chord
  if (currentIsBorrowed && harmonization) {
    const resolutionChords = generateResolutionChords(harmonization, currentChord, fromBorrowedMinorTonic);
    
    // Debug: log if resolution chords are being generated
    if (resolutionChords.length > 0) {
      console.log('[Resolution] Generating resolution chords:', resolutionChords.map(r => `${r.chord.root}${r.chord.quality} (degree ${r.chord.degree}, conf: ${r.confidence})`));
      if (fromBorrowedMinorTonic) {
        console.log('[Resolution] From borrowed minor tonic (i) - preferring V over V7');
      }
    }
    
    // Always include resolution chords (I and V/V7 are required)
    const result: BorrowedSuggestion[] = [];
    
    // Prioritize I and V/V7 - always include these
    // Find I chord (degree 1)
    const degree1Chords = resolutionChords.filter(r => r.chord.degree === 1);
    if (degree1Chords.length > 0) {
      // Prefer the primary chord (triad) over variations
      const primaryI = degree1Chords.find(r => !r.chord.quality.includes('7') && !r.chord.quality.includes('9'));
      if (primaryI) {
        result.push(primaryI);
      } else {
        result.push(degree1Chords[0]); // Fallback to first available
      }
    }
    
    // Find V chord (degree 5)
    const degree5Chords = resolutionChords.filter(r => r.chord.degree === 5);
    if (degree5Chords.length > 0) {
      if (fromBorrowedMinorTonic) {
        // When resolving from borrowed minor tonic, prefer V over V7
        const v = degree5Chords.find(r => r.chord.quality === 'major');
        if (v) {
          result.push(v);
        }
        // Also include V7 but with lower priority (it will be sorted by confidence)
        const v7 = degree5Chords.find(r => r.chord.quality === 'dom7');
        if (v7) {
          result.push(v7);
        }
      } else {
        // Default: prefer V7 (dom7) over V (major)
        const v7 = degree5Chords.find(r => r.chord.quality === 'dom7');
        if (v7) {
          result.push(v7);
        } else {
          // Fallback to V (major)
          const v = degree5Chords.find(r => r.chord.quality === 'major');
          if (v) {
            result.push(v);
          } else {
            result.push(degree5Chords[0]); // Fallback to first available
          }
        }
      }
    }
    
    // Add other resolution chords (ii, IV) if space allows
    const otherResolutionChords = resolutionChords.filter(
      r => r.chord.degree !== 1 && r.chord.degree !== 5
    );
    for (const resChord of otherResolutionChords) {
      if (result.length >= maxSuggestions) break;
      // Avoid duplicates
      if (!result.some(r => r.chord.root === resChord.chord.root && r.chord.quality === resChord.chord.quality)) {
        result.push(resChord);
      }
    }
    
    // Sort by confidence (descending) to ensure V appears before V7 when from borrowed minor tonic
    result.sort((a, b) => b.confidence - a.confidence);
    
    // Fill remaining slots with borrowed suggestions (if any)
    const remainingSlots = maxSuggestions - result.length;
    for (let i = 0; i < remainingSlots && i < borrowedSuggestions.length; i++) {
      result.push(borrowedSuggestions[i]);
    }
    
    return result;
  }
  
  return borrowedSuggestions;
}

/**
 * Check if a specific borrowed chord is suggested
 */
export function isBorrowedChordSuggested(
  chord: BorrowedChord,
  suggestions: BorrowedSuggestion[]
): boolean {
  return suggestions.some(s =>
    s.chord.root === chord.root &&
    s.chord.quality === chord.quality &&
    (isBorrowedChord(s.chord) ? s.chord.sourceMode === chord.sourceMode : false)
  );
}
