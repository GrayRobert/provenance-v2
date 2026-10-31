/**
 * Progression Converter
 * Converts roman numeral progressions to Chord objects
 */

import type { Chord, ChordQuality } from '../harmonizer';
import type { HarmonizedScale } from '../harmonizer';
import type { SongKey } from '../types/chordExplorer';
import type { ChordProgression } from '../chordProgressionDictionary';
import { buildChord, harmonizeScale, noteToMidi } from '../harmonizer';
import { getNoteAtInterval, shouldPreferFlats, getScaleById, ALL_SCALES, isEmotionalScale, EMOTIONAL_BUCKET_IDS } from '../scales';
import { parseRomanNumeral } from './romanNumeralParser';
import { isProgressionCompatible } from './progressionCompatibility';

/** Tension level for progression chord voicings: low = triads, medium = 7ths, high = extensions. */
export type TensionLevel = 'low' | 'medium' | 'high';

/** Preferred chord quality per diatonic degree (1–7) for medium (7ths) and high (extensions) tension. */
const TENSION_QUALITY_MEDIUM: Record<number, ChordQuality> = {
  1: 'maj7',
  2: 'min7',
  3: 'min7',
  4: 'maj7',
  5: 'dom7',
  6: 'min7',
  7: 'min7b5',
};

const TENSION_QUALITY_HIGH: Record<number, ChordQuality> = {
  1: 'maj9',
  2: 'min9',
  3: 'min9',
  4: 'maj9',
  5: 'dom13',
  6: 'min9',
  7: 'min7b5',
};

/** Minor mode for 7th quality selection: Natural (Aeolian), Harmonic, or Melodic. */
export type MinorMode = 'natural' | 'harmonic' | 'melodic';

/** Natural Minor (Aeolian) 7ths: i=min7, ii=min7b5, III=maj7, iv=min7, v=min7, VI=maj7, VII=dom7. */
const MINOR_NATURAL_MEDIUM: Record<number, ChordQuality> = {
  1: 'min7',
  2: 'min7b5',
  3: 'maj7',
  4: 'min7',
  5: 'min7',
  6: 'maj7',
  7: 'dom7',
};

/** Harmonic Minor 7ths: i=min7, ii=min7b5, III=maj7, iv=min7, V=dom7, VI=maj7, VII=dim7. */
const MINOR_HARMONIC_MEDIUM: Record<number, ChordQuality> = {
  1: 'min7',
  2: 'min7b5',
  3: 'maj7',
  4: 'min7',
  5: 'dom7',
  6: 'maj7',
  7: 'dim7',
};

/** Natural Minor extensions (high tension): map 7ths to 9/13 where they exist. */
const MINOR_NATURAL_HIGH: Record<number, ChordQuality> = {
  1: 'min9',
  2: 'min7b5',
  3: 'maj9',
  4: 'min9',
  5: 'min9',
  6: 'maj9',
  7: 'dom9',
};

/** Harmonic Minor extensions (high tension). */
const MINOR_HARMONIC_HIGH: Record<number, ChordQuality> = {
  1: 'min9',
  2: 'min7b5',
  3: 'maj9',
  4: 'min9',
  5: 'dom13',
  6: 'maj9',
  7: 'dim7',
};

/**
 * Preferred chord quality for a diatonic degree at the given tension level.
 * Returns null for low tension (use primary chord / existing logic).
 * For minor keys, pass tonality 'minor' and the resolved minorMode to use minor 7th tables.
 */
export function getPreferredQualityForTension(
  degree: number,
  tension: TensionLevel,
  tonality?: 'major' | 'minor',
  minorMode?: MinorMode
): ChordQuality | null {
  if (tension === 'low') return null;
  if (tonality === 'minor' && minorMode) {
    if (minorMode === 'natural') {
      if (tension === 'medium') return MINOR_NATURAL_MEDIUM[degree] ?? null;
      return MINOR_NATURAL_HIGH[degree] ?? null;
    }
    if (minorMode === 'harmonic') {
      if (tension === 'medium') return MINOR_HARMONIC_MEDIUM[degree] ?? null;
      return MINOR_HARMONIC_HIGH[degree] ?? null;
    }
    // melodic: not implemented; fall back to natural
    if (tension === 'medium') return MINOR_NATURAL_MEDIUM[degree] ?? null;
    return MINOR_NATURAL_HIGH[degree] ?? null;
  }
  if (tension === 'medium') return TENSION_QUALITY_MEDIUM[degree] ?? null;
  return TENSION_QUALITY_HIGH[degree] ?? null;
}

/**
 * Resolve which minor 7th set to use when scale is minor and tension is medium/high.
 * Must match the scale used for roots so suggested chords stay diatonic to the palette.
 * Uses scale id: aeolian → natural, harmonic_minor → harmonic, melodic_minor → melodic.
 * When scale is aeolian/minor emotional, uses songKey.minorScaleType so tension matches the palette toggle.
 */
function resolveMinorMode(
  scaleId: string,
  songKey: SongKey,
  _progression: ChordProgression | null
): MinorMode {
  if (scaleId === 'harmonic_minor') return 'harmonic';
  if (scaleId === 'melodic_minor') return 'melodic';
  if (scaleId === 'aeolian' || scaleId === EMOTIONAL_BUCKET_IDS.MINOR || scaleId === 'minor_emotional') {
    return songKey.minorScaleType ?? 'natural';
  }
  return 'natural';
}

/**
 * Get the minor scale type for a chord at the given index in a progression.
 * Used to switch the chord palette during playback so the correct chord is highlighted
 * (e.g. Natural for ♭VII/♭VI, Harmonic for V or borrowed degrees).
 */
export function getMinorScaleTypeForProgressionChord(
  progression: ChordProgression,
  chordIndex: number
): MinorMode {
  const romans = progression.romanNumerals;
  if (chordIndex < 0 || chordIndex >= romans.length) return progression.primaryMinorScale ?? 'natural';
  const parsed = parseRomanNumeral(romans[chordIndex]);
  const borrowed = progression.borrowedDegrees?.find(b => b.degree === parsed.degree);
  if (borrowed) return borrowed.fromScale === 'harmonic_minor' ? 'harmonic' : 'melodic';
  if (parsed.isFlat) return 'natural';
  if (parsed.degree === 5 && parsed.quality === 'major') return 'harmonic';
  return (progression.primaryMinorScale as MinorMode) ?? 'natural';
}

const MINOR_SCALE_IDS: MinorMode[] = ['natural', 'harmonic', 'melodic'];
const MINOR_SCALE_ID_MAP: Record<MinorMode, string> = {
  natural: 'aeolian',
  harmonic: 'harmonic_minor',
  melodic: 'melodic_minor',
};

/** Base triad type for quality matching (e.g. major matches maj7/maj9, minor matches min7/min9). */
const QUALITY_BASE: Record<ChordQuality, 'major' | 'minor' | 'diminished' | 'augmented'> = {
  major: 'major', minor: 'minor', diminished: 'diminished', augmented: 'augmented',
  sus2: 'major', sus4: 'major',
  dom7: 'major', maj7: 'major', min7: 'minor', min7b5: 'diminished', dim7: 'diminished',
  add9: 'major', maj9: 'major', min9: 'minor', dom9: 'major',
  dom11: 'major', min11: 'minor', dom13: 'major', maj13: 'major', min13: 'minor',
  '7sus4': 'major', 'maj7sus2': 'major',
};

function qualitiesMatch(a: ChordQuality, b: ChordQuality): boolean {
  if (a === b) return true;
  const baseA = QUALITY_BASE[a];
  const baseB = QUALITY_BASE[b];
  return baseA != null && baseB != null && baseA === baseB;
}

/**
 * Infer which minor scale (Natural / Harmonic / Melodic) contains the given chord for the key root.
 * Used when a timeline chord has no sourceMinorScale (e.g. from palette drag or user progression)
 * so the palette can switch to the correct tab during playback and highlight the chord.
 * Tries Natural first, then Harmonic, then Melodic, so chords that exist in multiple scales
 * (e.g. Am9) prefer Natural. Matches by pitch class and exact or base quality (e.g. D# major
 * matches Eb maj7 in harmonic).
 */
export function inferMinorScaleForChord(chord: Chord, keyRoot: string): MinorMode | null {
  const chordPitchClass = noteToMidi(chord.root, 4) % 12;
  for (const scaleType of MINOR_SCALE_IDS) {
    const scaleId = MINOR_SCALE_ID_MAP[scaleType];
    const scale = getScaleById(scaleId);
    if (!scale) continue;
    const harmonized = harmonizeScale(keyRoot, scale);
    for (const degreeChords of harmonized.degrees) {
      const allChords = [degreeChords.primaryChord, ...degreeChords.variations];
      for (const scaleChord of allChords) {
        const scalePitchClass = noteToMidi(scaleChord.root, 4) % 12;
        if (chordPitchClass === scalePitchClass && qualitiesMatch(chord.quality, scaleChord.quality)) {
          return scaleType;
        }
      }
    }
  }
  return null;
}

/**
 * Convert a roman numeral progression to Chord objects
 * If harmonizedScale is not provided, it will be created from songKey
 *
 * @param progression - The chord progression (for compatibility checking)
 * @param romanNumerals - The roman numeral sequence
 * @param songKey - Current song key (root and scale)
 * @param harmonizedScale - Optional pre-computed harmonized scale
 * @param forceApply - If true, apply even if incompatible (will create non-diatonic chords)
 * @param tension - Low = triads, medium = 7ths, high = extensions (diatonic only)
 */
export function convertProgressionToChords(
  progression: ChordProgression | null,
  romanNumerals: string[],
  songKey: SongKey,
  harmonizedScale?: HarmonizedScale,
  forceApply: boolean = false,
  tension: TensionLevel = 'low'
): Chord[] {
  // Re-harmonize if not provided
  let scale = harmonizedScale;
  let scaleObj;
  if (!scale) {
    // Normalize scale string (handle display names like "Major (Ionian)" -> "major")
    const normalizedScale = songKey.scale.toLowerCase().replace(/\s+/g, '_');
    let scaleId: string;
    
    // Handle emotional bucket scales first
    if (normalizedScale === EMOTIONAL_BUCKET_IDS.MINOR || normalizedScale === 'minor_emotional') {
      // When minorScaleType is set (e.g. from palette toggle), use that scale so examples match the palette
      const minorType = songKey.minorScaleType ?? 'natural';
      scaleId = minorType === 'harmonic' ? 'harmonic_minor' : minorType === 'melodic' ? 'melodic_minor' : 'aeolian';
    } else if (normalizedScale === EMOTIONAL_BUCKET_IDS.MAJOR || normalizedScale === 'major_emotional') {
      // Map major emotional bucket to major (ionian)
      scaleId = 'major';
    } else if (normalizedScale === 'minor' || songKey.scale === 'minor' || normalizedScale.includes('minor')) {
      // Handle other minor scale references
      scaleId = 'aeolian';
    } else if (normalizedScale.includes('major') || normalizedScale.includes('ionian')) {
      scaleId = 'major';
    } else {
      // Try to find by ID or name
      scaleId = normalizedScale;
    }
    
    scaleObj = getScaleById(scaleId);
    if (!scaleObj) {
      // Fallback: try to find by name
      scaleObj = ALL_SCALES.find(s => 
        s.id === scaleId || 
        s.name.toLowerCase() === songKey.scale.toLowerCase() ||
        s.id === normalizedScale
      );
    }
    
    // If still not found and it's an emotional bucket, create it
    if (!scaleObj && isEmotionalScale(normalizedScale)) {
      if (normalizedScale === EMOTIONAL_BUCKET_IDS.MINOR || normalizedScale === 'minor_emotional') {
        const minorType = songKey.minorScaleType ?? 'natural';
        scaleObj = getScaleById(minorType === 'harmonic' ? 'harmonic_minor' : minorType === 'melodic' ? 'melodic_minor' : 'aeolian');
      } else if (normalizedScale === EMOTIONAL_BUCKET_IDS.MAJOR || normalizedScale === 'major_emotional') {
        scaleObj = getScaleById('major');
      }
    }
    
    if (!scaleObj) {
      throw new Error(`Invalid scale: ${songKey.scale} (tried: ${scaleId})`);
    }
    scale = harmonizeScale(songKey.root, scaleObj);
  } else {
    scaleObj = scale.scale;
  }
  
  // Check compatibility if progression is provided
  if (progression && !forceApply) {
    // Pass original scale ID and songKey so minor palette (Natural/Harmonic/Melodic) is considered
    const originalScaleId = songKey.scale.toLowerCase().replace(/\s+/g, '_');
    const isCompatible = isProgressionCompatible(progression, scaleObj.id, scaleObj.family, originalScaleId, songKey);
    if (!isCompatible) {
      throw new Error(
        `Progression "${progression.name}" is not compatible with scale "${scaleObj.name}". ` +
        `Use forceApply=true to apply anyway (chords will be non-diatonic).`
      );
    }
  }
  const preferFlats = shouldPreferFlats(songKey.root, scale.scale);
  const chords: Chord[] = [];

  // Resolve minor 7th set when scale is minor and tension is medium/high
  let minorMode: MinorMode | undefined;
  if (scaleObj.family === 'minor' && tension !== 'low') {
    minorMode = resolveMinorMode(scaleObj.id, songKey, progression);
  }
  
  // Get alteration rules for current scale if progression is provided
  const alterationRules = progression?.alterationRules?.find(rule => rule.scaleId === scaleObj.id);
  
  // Base chord-tone octave: always 3 (min register; chord tones ≥ C3 or ≥2 ≥ C3)
  const getKeyRootChordToneOctave = (_keyRoot: string): number => 3;
  
  const baseChordToneOctave = getKeyRootChordToneOctave(songKey.root);
  let lastChordToneRootMidi = 0;
  
  for (let i = 0; i < romanNumerals.length; i++) {
    const roman = romanNumerals[i];
    const parsed = parseRomanNumeral(roman);
    let chord: Chord;
    // Scale used for this chord (main scale, or borrowed minor scale when progression has borrowedDegrees)
    let scaleForDegree: HarmonizedScale = scale;
    let scaleObjForDegree = scaleObj;
    let borrowed: { degree: number; fromScale: 'harmonic_minor' | 'melodic_minor' } | undefined;

    if (parsed.isFlat) {
      // Handle borrowed chords (♭VI, ♭VII, etc.)
      // For flat chords, we need to find the root note by going down a semitone
      // from the normal degree root
      
      // Get the normal degree semitone interval
      const normalDegreeIndex = parsed.degree - 1;
      const normalSemitoneInterval = scale.scale.intervals[normalDegreeIndex];
      
      // For flat chords, go down a semitone (interval -1)
      const flatSemitoneInterval = (normalSemitoneInterval - 1 + 12) % 12;
      const flatRoot = getNoteAtInterval(songKey.root, flatSemitoneInterval, preferFlats);
      
      // Determine quality: ♭VI and ♭VII are typically major
      // But we should respect the parsed quality if it's specified
      let quality: 'major' | 'minor' | 'diminished';
      if (parsed.quality === 'diminished') {
        quality = 'diminished';
      } else if (parsed.quality === 'minor') {
        quality = 'minor';
      } else {
        // Default to major for flat chords
        quality = 'major';
      }
      
      // Calculate chord tone octave
      let chordToneOctave = baseChordToneOctave;
      let rootMidi = noteToMidi(flatRoot, chordToneOctave);
      let iterations = 0;
      const maxIterations = 10; // Safety limit to prevent infinite loops
      while (rootMidi < lastChordToneRootMidi && iterations < maxIterations) {
        chordToneOctave += 1;
        rootMidi = noteToMidi(flatRoot, chordToneOctave); // Recalculate with new octave
        iterations += 1;
      }
      if (iterations >= maxIterations) {
        console.warn(`Octave calculation reached max iterations for ${flatRoot} in ${songKey.root} ${songKey.scale}`);
      }
      lastChordToneRootMidi = noteToMidi(flatRoot, chordToneOctave);
      
      chord = buildChord(flatRoot, quality, parsed.degree, preferFlats, chordToneOctave);
    } else {
      // Handle diatonic chords (optionally from a borrowed minor scale for this degree)
      borrowed = progression?.borrowedDegrees?.find(b => b.degree === parsed.degree);
      if (borrowed) {
        scaleForDegree = harmonizeScale(songKey.root, getScaleById(borrowed.fromScale)!);
        scaleObjForDegree = getScaleById(borrowed.fromScale)!;
      }
      const degreeIndex = parsed.degree - 1;

      if (degreeIndex >= scaleForDegree.degrees.length) {
        throw new Error(`Invalid degree ${parsed.degree} for scale with ${scaleForDegree.degrees.length} degrees`);
      }

      const degreeChords = scaleForDegree.degrees[degreeIndex];

      // Determine which chord to use based on quality
      if (parsed.quality === 'diminished') {
        // Look for diminished chord in variations
        const dimChord = degreeChords.variations.find(c =>
          c.quality === 'diminished' || c.quality === 'dim7'
        );
        chord = dimChord || degreeChords.primaryChord;
      } else if (parsed.quality === 'minor') {
        // Look for minor chord
        if (degreeChords.primaryChord.quality === 'minor' ||
            degreeChords.primaryChord.quality === 'min7') {
          chord = degreeChords.primaryChord;
        } else {
          // Check variations
          const minChord = degreeChords.variations.find(c =>
            c.quality === 'minor' || c.quality === 'min7'
          );
          chord = minChord || degreeChords.primaryChord;
        }
      } else {
        // Major quality - use primary chord
        // Special case: In minor keys, if uppercase V (major) is requested but the scale
        // has minor v, build it as major anyway (only when not using borrowed scale)
        if (!borrowed &&
            parsed.degree === 5 &&
            parsed.quality === 'major' &&
            scaleObj.family === 'minor' &&
            degreeChords.primaryChord.quality === 'minor') {
          // Build major V chord directly (harmonic minor behavior)
          const vRoot = degreeChords.rootNote;
          let chordToneOctave = baseChordToneOctave;
          let rootMidi = noteToMidi(vRoot, chordToneOctave);
          let iterations = 0;
          const maxIterations = 10;
          while (rootMidi < lastChordToneRootMidi && iterations < maxIterations) {
            chordToneOctave += 1;
            rootMidi = noteToMidi(vRoot, chordToneOctave);
            iterations += 1;
          }
          if (iterations >= maxIterations) {
            console.warn(`Octave calculation reached max iterations for ${vRoot} in ${songKey.root} ${songKey.scale}`);
          }
          lastChordToneRootMidi = noteToMidi(vRoot, chordToneOctave);
          chord = buildChord(vRoot, 'major', parsed.degree, preferFlats, chordToneOctave);
        } else {
          chord = degreeChords.primaryChord;
        }
      }
    }

    // Apply alteration rules if present (for scale used for this degree)
    const alterationRulesForDegree = progression?.alterationRules?.find(rule => rule.scaleId === scaleObjForDegree?.id);
    if (alterationRulesForDegree) {
      const alteration = alterationRulesForDegree.alterations.find(alt => alt.degree === parsed.degree);
      if (alteration) {
        // Apply alteration (e.g., raise 7th for Harmonic Minor V chord)
        if (alteration.alteration === 'raise7th' && parsed.degree === 5) {
          if (!parsed.isFlat) {
            const degreeIndex = parsed.degree - 1;
            if (degreeIndex < scaleForDegree.degrees.length) {
              const degreeChordsAlt = scaleForDegree.degrees[degreeIndex];
              const dom7Chord = degreeChordsAlt.variations.find(c =>
                c.quality === 'dom7' || c.quality === 'maj7'
              );
              if (dom7Chord) {
                chord = dom7Chord;
              }
            }
          }
        }
      }
    }

    // Apply tension override for diatonic chords (medium = 7ths, high = extensions)
    // For borrowed degrees, use the borrowed scale's minor mode for tension table
    if (!parsed.isFlat && (tension === 'medium' || tension === 'high')) {
      const chordMinorMode: MinorMode | undefined = borrowed
        ? (borrowed.fromScale === 'harmonic_minor' ? 'harmonic' : 'melodic')
        : minorMode;
      const preferredQuality = scaleObjForDegree.family === 'minor' && chordMinorMode !== undefined
        ? getPreferredQualityForTension(parsed.degree, tension, 'minor', chordMinorMode)
        : getPreferredQualityForTension(parsed.degree, tension);
      if (preferredQuality) {
        const degreeIndexForTension = parsed.degree - 1;
        const degreeChordsForTension = scaleForDegree.degrees[degreeIndexForTension];
        const variation = degreeChordsForTension.variations.find(c => c.quality === preferredQuality);
        if (variation) {
          chord = variation;
        } else {
          // Build chord with preferred quality (e.g. scale has it but not in variations)
          let chordToneOctave = baseChordToneOctave;
          let rootMidi = noteToMidi(degreeChordsForTension.rootNote, chordToneOctave);
          let iterations = 0;
          const maxIterations = 10;
          while (rootMidi < lastChordToneRootMidi && iterations < maxIterations) {
            chordToneOctave += 1;
            rootMidi = noteToMidi(degreeChordsForTension.rootNote, chordToneOctave);
            iterations += 1;
          }
          if (iterations >= maxIterations) {
            console.warn(`Octave calculation reached max iterations for ${degreeChordsForTension.rootNote} in ${songKey.root} ${songKey.scale}`);
          }
          lastChordToneRootMidi = noteToMidi(degreeChordsForTension.rootNote, chordToneOctave);
          chord = buildChord(degreeChordsForTension.rootNote, preferredQuality, parsed.degree, preferFlats, chordToneOctave);
        }
      }
    }

    chords.push(chord);
  }

  return chords;
}
