/**
 * Scales & Modes Engine
 * Defines all musical scales, modes, and their intervals
 */

// Note names for display
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

export type NoteName = typeof NOTE_NAMES[number];
export type NoteNameFlat = typeof NOTE_NAMES_FLAT[number];

export interface Scale {
  id: string;
  name: string;
  family: 'major' | 'minor' | 'pentatonic' | 'blues' | 'symmetric';
  intervals: number[];
  description: string;
}

// ===========================
// MAJOR FAMILY (Ionian-based)
// ===========================

export const MAJOR_SCALE: Scale = {
  id: 'major',
  name: 'Major (Ionian)',
  family: 'major',
  intervals: [0, 2, 4, 5, 7, 9, 11],
  description: 'The foundation of Western music'
};

export const DORIAN_SCALE: Scale = {
  id: 'dorian',
  name: 'Dorian',
  family: 'major',
  intervals: [0, 2, 3, 5, 7, 9, 10],
  description: 'Minor with raised 6th - jazzy, soulful'
};

export const PHRYGIAN_SCALE: Scale = {
  id: 'phrygian',
  name: 'Phrygian',
  family: 'major',
  intervals: [0, 1, 3, 5, 7, 8, 10],
  description: 'Spanish/flamenco flavour'
};

export const LYDIAN_SCALE: Scale = {
  id: 'lydian',
  name: 'Lydian',
  family: 'major',
  intervals: [0, 2, 4, 6, 7, 9, 11],
  description: 'Dreamy, ethereal - raised 4th'
};

export const MIXOLYDIAN_SCALE: Scale = {
  id: 'mixolydian',
  name: 'Mixolydian',
  family: 'major',
  intervals: [0, 2, 4, 5, 7, 9, 10],
  description: 'Dominant, bluesy - flat 7'
};

export const AEOLIAN_SCALE: Scale = {
  id: 'aeolian',
  name: 'Natural Minor (Aeolian)',
  family: 'minor',
  intervals: [0, 2, 3, 5, 7, 8, 10],
  description: 'The natural minor scale'
};

export const LOCRIAN_SCALE: Scale = {
  id: 'locrian',
  name: 'Locrian',
  family: 'major',
  intervals: [0, 1, 3, 5, 6, 8, 10],
  description: 'Dark, unstable - diminished tonic'
};

// ===========================
// MINOR FAMILY
// ===========================

export const HARMONIC_MINOR_SCALE: Scale = {
  id: 'harmonic_minor',
  name: 'Harmonic Minor',
  family: 'minor',
  intervals: [0, 2, 3, 5, 7, 8, 11],
  description: 'Dramatic, cinematic - raised 7th'
};

export const MELODIC_MINOR_SCALE: Scale = {
  id: 'melodic_minor',
  name: 'Melodic Minor',
  family: 'minor',
  intervals: [0, 2, 3, 5, 7, 9, 11],
  description: 'Jazz foundation - raised 6th and 7th'
};

// Melodic Minor Modes
export const DORIAN_B2_SCALE: Scale = {
  id: 'dorian_b2',
  name: 'Dorian ♭2',
  family: 'minor',
  intervals: [0, 1, 3, 5, 7, 9, 10],
  description: 'Phrygian with natural 6th'
};

export const LYDIAN_AUGMENTED_SCALE: Scale = {
  id: 'lydian_augmented',
  name: 'Lydian Augmented',
  family: 'minor',
  intervals: [0, 2, 4, 6, 8, 9, 11],
  description: 'Lydian with raised 5th'
};

export const LYDIAN_DOMINANT_SCALE: Scale = {
  id: 'lydian_dominant',
  name: 'Lydian Dominant',
  family: 'minor',
  intervals: [0, 2, 4, 6, 7, 9, 10],
  description: 'Lydian with flat 7 - The Simpsons theme'
};

export const MIXOLYDIAN_B6_SCALE: Scale = {
  id: 'mixolydian_b6',
  name: 'Mixolydian ♭6',
  family: 'minor',
  intervals: [0, 2, 4, 5, 7, 8, 10],
  description: 'Hindu scale - Mixolydian with flat 6'
};

export const LOCRIAN_NATURAL2_SCALE: Scale = {
  id: 'locrian_natural2',
  name: 'Locrian ♮2',
  family: 'minor',
  intervals: [0, 2, 3, 5, 6, 8, 10],
  description: 'Half-diminished scale'
};

export const ALTERED_SCALE: Scale = {
  id: 'altered',
  name: 'Altered (Super Locrian)',
  family: 'minor',
  intervals: [0, 1, 3, 4, 6, 8, 10],
  description: 'Maximum tension - all tensions altered'
};

// ===========================
// PENTATONIC & BLUES
// ===========================

export const MAJOR_PENTATONIC_SCALE: Scale = {
  id: 'major_pentatonic',
  name: 'Major Pentatonic',
  family: 'pentatonic',
  intervals: [0, 2, 4, 7, 9],
  description: 'Bright, open - country, pop, rock'
};

export const MINOR_PENTATONIC_SCALE: Scale = {
  id: 'minor_pentatonic',
  name: 'Minor Pentatonic',
  family: 'pentatonic',
  intervals: [0, 3, 5, 7, 10],
  description: 'Blues, rock foundation'
};

export const BLUES_SCALE: Scale = {
  id: 'blues',
  name: 'Blues Scale',
  family: 'blues',
  intervals: [0, 3, 5, 6, 7, 10],
  description: 'Minor pentatonic + blue note (♭5)'
};

// ===========================
// SYMMETRIC SCALES
// ===========================

export const WHOLE_TONE_SCALE: Scale = {
  id: 'whole_tone',
  name: 'Whole Tone',
  family: 'symmetric',
  intervals: [0, 2, 4, 6, 8, 10],
  description: 'Dreamlike, ambiguous - Debussy'
};

export const DIMINISHED_HW_SCALE: Scale = {
  id: 'diminished_hw',
  name: 'Diminished (H-W)',
  family: 'symmetric',
  intervals: [0, 1, 3, 4, 6, 7, 9, 10],
  description: 'Half-whole diminished - tension & colour'
};

export const DIMINISHED_WH_SCALE: Scale = {
  id: 'diminished_wh',
  name: 'Diminished (W-H)',
  family: 'symmetric',
  intervals: [0, 2, 3, 5, 6, 8, 9, 11],
  description: 'Whole-half diminished - over dim7 chords'
};

// ===========================
// ALL SCALES REGISTRY
// ===========================

export const ALL_SCALES: Scale[] = [
  // Major Family
  MAJOR_SCALE,
  DORIAN_SCALE,
  PHRYGIAN_SCALE,
  LYDIAN_SCALE,
  MIXOLYDIAN_SCALE,
  AEOLIAN_SCALE,
  LOCRIAN_SCALE,
  // Minor Family
  HARMONIC_MINOR_SCALE,
  MELODIC_MINOR_SCALE,
  DORIAN_B2_SCALE,
  LYDIAN_AUGMENTED_SCALE,
  LYDIAN_DOMINANT_SCALE,
  MIXOLYDIAN_B6_SCALE,
  LOCRIAN_NATURAL2_SCALE,
  ALTERED_SCALE,
  // Pentatonic & Blues
  MAJOR_PENTATONIC_SCALE,
  MINOR_PENTATONIC_SCALE,
  BLUES_SCALE,
  // Symmetric
  WHOLE_TONE_SCALE,
  DIMINISHED_HW_SCALE,
  DIMINISHED_WH_SCALE,
];

// ===========================
// UTILITY FUNCTIONS
// ===========================

/**
 * Get note name from a root note and interval
 */
export function getNoteAtInterval(root: string, interval: number, preferFlats = false): string {
  const noteArray = preferFlats ? NOTE_NAMES_FLAT : NOTE_NAMES;
  const rootIndex = NOTE_NAMES.indexOf(root as NoteName) !== -1 
    ? NOTE_NAMES.indexOf(root as NoteName)
    : NOTE_NAMES_FLAT.indexOf(root as NoteNameFlat);
  
  if (rootIndex === -1) return root;
  
  const targetIndex = (rootIndex + interval) % 12;
  return noteArray[targetIndex];
}

/**
 * Get all notes in a scale given a root
 */
export function getScaleNotes(root: string, scale: Scale, preferFlats = false): string[] {
  return scale.intervals.map(interval => getNoteAtInterval(root, interval, preferFlats));
}

/**
 * Check if a note is in a scale
 */
export function isNoteInScale(note: string, root: string, scale: Scale): boolean {
  const scaleNotes = getScaleNotes(root, scale);
  return scaleNotes.includes(note);
}

/**
 * Get scale by ID
 * Handles emotional bucket scales by creating them on the fly
 */
export function getScaleById(id: string): Scale | undefined {
  // Check if it's an emotional bucket scale
  if (isEmotionalScale(id)) {
    return createEmotionalBucketScale(id as EmotionalBucketId);
  }
  return ALL_SCALES.find(s => s.id === id);
}

/**
 * Determine if flats should be preferred based on scale/mode
 * Follows enharmonic spelling rules:
 * - Use flats in flat-based modes (Aeolian, Phrygian, Locrian)
 * - Use sharps in sharp-based modes (Lydian)
 * - For other modes, fall back to root-based preference
 */
export function shouldPreferFlats(root: string, scale?: Scale): boolean {
  // Scale-based rules (take priority)
  if (scale) {
    // Handle emotional buckets
    if (scale.id === 'major_emotional' || scale.id === 'minor_emotional') {
      // Use the base scale's preference
      if (scale.id === 'minor_emotional') {
        return true; // Minor uses flats
      }
      return false; // Major uses sharps
    }
    // Flat-based modes
    if (scale.id === 'aeolian' || scale.id === 'phrygian' || scale.id === 'locrian') {
      return true;
    }
    // Sharp-based modes
    if (scale.id === 'lydian') {
      return false;
    }
  }
  
  // Fallback: root-based preference for keys that traditionally use flats
  return ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'].includes(root);
}

// ===========================
// EMOTIONAL SCALE BUCKETS
// ===========================

/**
 * Emotional scale bucket IDs
 */
export const EMOTIONAL_BUCKET_IDS = {
  MAJOR: 'major_emotional',
  MINOR: 'minor_emotional',
} as const;

export type EmotionalBucketId = typeof EMOTIONAL_BUCKET_IDS[keyof typeof EMOTIONAL_BUCKET_IDS];

/**
 * Scales that belong to the Minor emotional bucket
 */
const MINOR_BUCKET_SCALE_IDS = ['aeolian', 'harmonic_minor', 'melodic_minor'] as const;

/**
 * Scales that belong to the Major emotional bucket
 */
const MAJOR_BUCKET_SCALE_IDS = ['major'] as const;

/**
 * Get all scales that belong to an emotional bucket
 */
export function getScalesForEmotionalBucket(bucketId: EmotionalBucketId): Scale[] {
  const scaleIds = bucketId === EMOTIONAL_BUCKET_IDS.MINOR 
    ? MINOR_BUCKET_SCALE_IDS 
    : MAJOR_BUCKET_SCALE_IDS;
  
  return scaleIds
    .map(id => getScaleById(id))
    .filter((scale): scale is Scale => scale !== undefined);
}

/**
 * Check if a scale ID is an emotional bucket
 */
export function isEmotionalScale(scaleId: string): boolean {
  return scaleId === EMOTIONAL_BUCKET_IDS.MAJOR || scaleId === EMOTIONAL_BUCKET_IDS.MINOR;
}

/**
 * Get the display name for an emotional bucket
 */
export function getEmotionalBucketName(bucketId: EmotionalBucketId): string {
  if (bucketId === EMOTIONAL_BUCKET_IDS.MAJOR) {
    return 'Major (Happy / Bright)';
  }
  return 'Minor (Moody / Dark)';
}

/**
 * Check if a scale ID is included in an emotional bucket
 */
export function isScaleInEmotionalBucket(scaleId: string, bucketId: EmotionalBucketId): boolean {
  const scaleIds = bucketId === EMOTIONAL_BUCKET_IDS.MINOR
    ? MINOR_BUCKET_SCALE_IDS
    : MAJOR_BUCKET_SCALE_IDS;
  return (scaleIds as readonly string[]).includes(scaleId);
}

/**
 * Create a synthetic Scale object for an emotional bucket
 */
export function createEmotionalBucketScale(bucketId: EmotionalBucketId): Scale {
  if (bucketId === EMOTIONAL_BUCKET_IDS.MAJOR) {
    return {
      id: EMOTIONAL_BUCKET_IDS.MAJOR,
      name: getEmotionalBucketName(bucketId),
      family: 'major',
      intervals: MAJOR_SCALE.intervals, // Use Ionian as base
      description: 'Bright, happy, uplifting'
    };
  } else {
    return {
      id: EMOTIONAL_BUCKET_IDS.MINOR,
      name: getEmotionalBucketName(bucketId),
      family: 'minor',
      intervals: AEOLIAN_SCALE.intervals, // Use Aeolian as base
      description: 'Sad, dark, melancholic'
    };
  }
}
