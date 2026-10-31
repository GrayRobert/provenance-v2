/**
 * Progression Compatibility Checker
 * Determines if chord progressions are compatible with given scales
 */

import type { Scale } from '../scales';
import { isEmotionalScale, EMOTIONAL_BUCKET_IDS } from '../scales';
import type { ChordProgression, ScaleFamily } from '../chordProgressionDictionary';
import type { SongKey } from '../types/chordExplorer';

export type CompatibilityStatus = 'compatible' | 'incompatible' | 'altered';

/**
 * Map scale ID to scale family for compatibility checking
 */
export function getScaleFamily(scaleId: string, scaleFamily: Scale['family']): ScaleFamily {
  // Handle emotional buckets first
  if (isEmotionalScale(scaleId)) {
    if (scaleId === EMOTIONAL_BUCKET_IDS.MAJOR) {
      return 'major';
    }
    if (scaleId === EMOTIONAL_BUCKET_IDS.MINOR) {
      return 'minor';
    }
  }
  
  // Handle explicit scale IDs
  if (scaleId === 'harmonic_minor') return 'harmonic_minor';
  if (scaleId === 'melodic_minor') return 'melodic_minor';
  
  // Map scale families
  if (scaleFamily === 'minor') {
    // Check if it's a modal scale that's actually minor
    if (scaleId === 'aeolian' || scaleId === 'minor') {
      return 'minor';
    }
    // Other minor family scales
    return 'minor';
  }
  
  if (scaleFamily === 'major') {
    // Check if it's a modal scale
    if (['dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian'].includes(scaleId)) {
      return 'modal';
    }
    if (scaleId === 'major') {
      return 'major';
    }
  }
  
  // Jazz scales
  if (['altered', 'lydian_augmented', 'lydian_dominant', 'mixolydian_b6', 'locrian_natural2', 'dorian_b2'].includes(scaleId)) {
    return 'jazz';
  }
  
  // Blues/pentatonic
  if (['blues', 'major_pentatonic', 'minor_pentatonic'].includes(scaleId) || scaleFamily === 'blues' || scaleFamily === 'pentatonic') {
    return 'blues';
  }
  
  // Default to major for major family scales
  if (scaleFamily === 'major') {
    return 'major';
  }
  
  // Default fallback
  return 'major';
}

/**
 * Check if a progression contains dominant-function chords (V)
 * These should be filtered out for Natural Minor (Aeolian)
 * Note: lowercase 'v' is minor v in Natural Minor, not dominant, so we only check uppercase V
 */
function hasDominantFunction(progression: ChordProgression): boolean {
  return progression.romanNumerals.some(roman => {
    // Check for exact match of uppercase V (major dominant)
    // This matches 'V' but not 'IV', 'VII', '♭VII', etc.
    return roman.trim() === 'V';
  });
}

/**
 * Check if a progression is designed for Major or Minor tonality
 * Uses ONLY the designedFor field - no scale-family inference
 */
function isProgressionForTonality(progression: ChordProgression, tonality: 'major' | 'minor'): boolean {
  const designedFor = progression.designedFor.map(t => t.toLowerCase());
  if (tonality === 'major') {
    // Major progressions: designed for Major only
    return designedFor.some(t => t.includes('major'));
  } else {
    // Minor progressions: includes "Minor", "Natural Minor", "Harmonic Minor"
    return designedFor.some(t => t.includes('minor'));
  }
}

/**
 * Get effective scale families when in minor emotional bucket.
 * When the palette has Harmonic or Melodic selected, include that family so
 * Harmonic-only / Melodic-only progressions show as compatible.
 */
function getEffectiveMinorScaleFamilies(songKey?: SongKey | null): ScaleFamily[] {
  const families: ScaleFamily[] = ['minor'];
  const minorType = songKey?.minorScaleType;
  if (minorType === 'harmonic') families.push('harmonic_minor');
  if (minorType === 'melodic') families.push('melodic_minor');
  return families;
}

/**
 * Check if a progression is compatible with the current scale
 * Now filters by Major/Minor tonality to keep them separate.
 * When scale is minor emotional, considers songKey.minorScaleType so Harmonic/Melodic
 * progressions show when the palette matches.
 *
 * @param originalScaleId - Optional original scale ID (before conversion).
 *                          Used to detect emotional buckets that were converted to aeolian/major
 * @param songKey - Optional current song key; when in minor emotional, used to include
 *                  harmonic_minor or melodic_minor in effective families per palette toggle
 */
export function isProgressionCompatible(
  progression: ChordProgression,
  scaleId: string,
  scaleFamily: Scale['family'],
  originalScaleId?: string,
  songKey?: SongKey | null
): boolean {
  const currentScaleFamily = getScaleFamily(scaleId, scaleFamily);
  
  // Check if the original scale was an emotional bucket (even if converted to aeolian/major)
  const isFromEmotionalBucket = originalScaleId ? isEmotionalScale(originalScaleId) : false;
  const isMinorEmotional = (isEmotionalScale(scaleId) && scaleId === EMOTIONAL_BUCKET_IDS.MINOR) ||
    (isFromEmotionalBucket && originalScaleId === EMOTIONAL_BUCKET_IDS.MINOR);
  
  // Determine current tonality (Major or Minor)
  const isMinorTonality = currentScaleFamily === 'minor' || 
                          currentScaleFamily === 'harmonic_minor' || 
                          currentScaleFamily === 'melodic_minor' ||
                          isMinorEmotional;
  const isMajorTonality = currentScaleFamily === 'major' ||
                          (isEmotionalScale(scaleId) && scaleId === EMOTIONAL_BUCKET_IDS.MAJOR) ||
                          (isFromEmotionalBucket && originalScaleId === EMOTIONAL_BUCKET_IDS.MAJOR);
  
  // Filter by tonality: only show Major progressions in Major keys, Minor progressions in Minor keys
  if (isMajorTonality) {
    // In Major: only show Major progressions
    if (!isProgressionForTonality(progression, 'major')) {
      return false;
    }
  } else if (isMinorTonality) {
    // In Minor: only show Minor progressions
    if (!isProgressionForTonality(progression, 'minor')) {
      return false;
    }
  }
  
  // For Natural Minor (Aeolian), filter out progressions with dominant-function chords
  // But allow them for emotional minor bucket (which includes harmonic minor)
  // Also allow if the original scale was an emotional bucket
  if (scaleId === 'aeolian' && !isEmotionalScale(scaleId) && !isFromEmotionalBucket && hasDominantFunction(progression)) {
    return false;
  }
  
  // When in minor emotional bucket, effective families include minor + harmonic_minor/melodic_minor per palette
  if (isMinorEmotional) {
    const effectiveFamilies = getEffectiveMinorScaleFamilies(songKey);
    return progression.compatibleScaleFamilies.some(f => effectiveFamilies.includes(f));
  }
  
  // Check scale family compatibility (for modal borrowing, etc.)
  return progression.compatibleScaleFamilies.includes(currentScaleFamily);
}

/**
 * Get compatibility status for a progression with the current scale
 *
 * @param originalScaleId - Optional original scale ID (before conversion).
 *                          Used to detect emotional buckets that were converted to aeolian/major
 * @param songKey - Optional current song key; when in minor emotional, used so
 *                  Harmonic/Melodic progressions match the palette toggle
 */
export function getProgressionCompatibilityStatus(
  progression: ChordProgression,
  currentScale: Scale,
  originalScaleId?: string,
  songKey?: SongKey | null
): CompatibilityStatus {
  const isCompatible = isProgressionCompatible(progression, currentScale.id, currentScale.family, originalScaleId, songKey);
  
  if (isCompatible) {
    // Check if there are alteration rules for this scale
    if (progression.alterationRules) {
      const hasAlterations = progression.alterationRules.some(rule => rule.scaleId === currentScale.id);
      if (hasAlterations) {
        return 'altered'; // Compatible but will use altered chords
      }
    }
    return 'compatible';
  }
  
  return 'incompatible';
}

/**
 * Get "Designed for" tags for display
 */
export function getDesignedForTags(progression: ChordProgression): string[] {
  return progression.designedFor;
}
