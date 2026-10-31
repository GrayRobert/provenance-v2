/**
 * Chord Progression Dictionary
 * Structured data for common chord progressions from CHORD_PROGRESSION_DICTIONARY.md
 * 
 * Progressions are stored as roman numerals only - never as fixed chord lists.
 * Examples are generated dynamically based on current root/scale.
 */

export type ProgressionTier = 'Core' | 'Extended' | 'Exploratory';
export type ScaleFamily = 'major' | 'minor' | 'harmonic_minor' | 'melodic_minor' | 'modal' | 'jazz' | 'blues';

export interface AlterationRule {
  scaleId: string;
  alterations: Array<{
    degree: number;
    alteration: 'raise7th' | 'lower6th' | 'raise6th' | 'lower7th';
  }>;
}

export type ProgressionCharacter = 'gravitational' | 'modal' | 'mixed';

/** Primary minor scale the progression is written in (Natural / Harmonic / Melodic). */
export type PrimaryMinorScale = 'natural' | 'harmonic' | 'melodic';

/** Degree borrowed from another minor scale (root and quality from that scale). */
export interface BorrowedDegree {
  degree: number;
  fromScale: 'harmonic_minor' | 'melodic_minor';
}

export interface ChordProgression {
  id: string;
  name: string;
  romanNumerals: string[];
  tier: ProgressionTier;
  styles: string[];
  feel: string;
  typicalUse?: string;
  notes?: string;
  compatibleScaleFamilies: ScaleFamily[];
  designedFor: string[];
  alterationRules?: AlterationRule[];
  character?: ProgressionCharacter; // Musical intent: gravitational (resolving), modal (circular), or mixed
  /** When tonality is minor: primary scale (Natural / Harmonic / Melodic) the progression is based on. */
  primaryMinorScale?: PrimaryMinorScale;
  /** Degrees whose root/quality come from another minor scale (e.g. V from Harmonic in i–iv–V–i). */
  borrowedDegrees?: BorrowedDegree[];
}

/**
 * All chord progressions from the dictionary
 */
export const CHORD_PROGRESSIONS: ChordProgression[] = [
  // CORE PROGRESSIONS
  {
    id: '1',
    name: 'I–V–vi–IV',
    romanNumerals: ['I', 'V', 'vi', 'IV'],
    tier: 'Core',
    styles: ['Pop', 'Rock', 'Indie'],
    feel: 'Uplifting, emotional, familiar',
    typicalUse: 'Chorus',
    notes: 'One of the most-used progressions in modern songwriting',
    compatibleScaleFamilies: ['major'],
    designedFor: ['Major'],
  },
  {
    id: '2',
    name: 'I–vi–IV–V',
    romanNumerals: ['I', 'vi', 'IV', 'V'],
    tier: 'Core',
    styles: ['Pop', 'Rock', 'Doo-wop'],
    feel: 'Romantic, classic, resolved',
    typicalUse: 'Verse → Chorus',
    compatibleScaleFamilies: ['major'],
    designedFor: ['Major'],
  },
  {
    id: '3',
    name: 'vi–IV–I–V',
    romanNumerals: ['vi', 'IV', 'I', 'V'],
    tier: 'Core',
    styles: ['Pop', 'Folk', 'Indie'],
    feel: 'Reflective, modern pop',
    typicalUse: 'Verse',
    compatibleScaleFamilies: ['major'],
    designedFor: ['Major'],
  },
  {
    id: '4',
    name: 'I–IV–V',
    romanNumerals: ['I', 'IV', 'V'],
    tier: 'Core',
    styles: ['Rock', 'Blues', 'Folk'],
    feel: 'Open, strong, foundational',
    typicalUse: 'Any',
    compatibleScaleFamilies: ['major', 'blues'],
    designedFor: ['Major', 'Blues'],
  },
  {
    id: '5',
    name: 'ii–V–I',
    romanNumerals: ['ii', 'V', 'I'],
    tier: 'Core',
    styles: ['Jazz', 'Pop', 'Soul'],
    feel: 'Smooth, inevitable resolution',
    typicalUse: 'Cadence',
    compatibleScaleFamilies: ['major', 'jazz'],
    designedFor: ['Major', 'Jazz'],
  },
  // EXTENDED PROGRESSIONS
  {
    id: '6',
    name: 'I–iii–vi–IV',
    romanNumerals: ['I', 'iii', 'vi', 'IV'],
    tier: 'Extended',
    styles: ['Rock', 'Film', 'Pop'],
    feel: 'Expansive, cinematic',
    compatibleScaleFamilies: ['major'],
    designedFor: ['Major'],
  },
  {
    id: '7',
    name: 'I–IV–vi–V',
    romanNumerals: ['I', 'IV', 'vi', 'V'],
    tier: 'Extended',
    styles: ['Pop', 'Indie'],
    feel: 'Gentle tension and release',
    compatibleScaleFamilies: ['major'],
    designedFor: ['Major'],
  },
  {
    id: '8',
    name: 'I–♭VII–IV',
    romanNumerals: ['I', '♭VII', 'IV'],
    tier: 'Extended',
    styles: ['Rock', 'Folk', 'Americana'],
    feel: 'Earthy, grounded',
    compatibleScaleFamilies: ['major'],
    designedFor: ['Major'],
  },
  {
    id: '9',
    name: 'I–V–IV',
    romanNumerals: ['I', 'V', 'IV'],
    tier: 'Extended',
    styles: ['Rock', 'Punk'],
    feel: 'Driving, assertive',
    compatibleScaleFamilies: ['major', 'blues'],
    designedFor: ['Major', 'Blues'],
  },
  {
    id: '10',
    name: 'vi–V–IV–V',
    romanNumerals: ['vi', 'V', 'IV', 'V'],
    tier: 'Extended',
    styles: ['Pop', 'Rock'],
    feel: 'Looping, unresolved',
    compatibleScaleFamilies: ['major'],
    designedFor: ['Major'],
  },
  // EXPLORATORY PROGRESSIONS
  {
    id: '11',
    name: 'I–♭VI–♭VII–I',
    romanNumerals: ['I', '♭VI', '♭VII', 'I'],
    tier: 'Exploratory',
    styles: ['Rock opera', 'Film', 'Alternative'],
    feel: 'Dramatic, heroic',
    compatibleScaleFamilies: ['major'],
    designedFor: ['Major'],
  },
  {
    id: '12',
    name: 'I–iv–I',
    romanNumerals: ['I', 'iv', 'I'],
    tier: 'Exploratory',
    styles: ['Ballad', 'Film'],
    feel: 'Bittersweet',
    compatibleScaleFamilies: ['major'],
    designedFor: ['Major'],
  },
  {
    id: '13',
    name: 'I–V–♭VI–IV',
    romanNumerals: ['I', 'V', '♭VI', 'IV'],
    tier: 'Exploratory',
    styles: ['Alternative', 'Film'],
    feel: 'Unexpected',
    compatibleScaleFamilies: ['major'],
    designedFor: ['Major'],
  },
  {
    id: '14',
    name: 'i–♭VII–♭VI–V (Minor)',
    romanNumerals: ['i', '♭VII', '♭VI', 'V'],
    tier: 'Exploratory',
    styles: ['Rock', 'Metal', 'Film'],
    feel: 'Dark, driving',
    compatibleScaleFamilies: ['harmonic_minor'],
    designedFor: ['Harmonic Minor'],
    primaryMinorScale: 'harmonic',
    alterationRules: [
      {
        scaleId: 'harmonic_minor',
        alterations: [{ degree: 5, alteration: 'raise7th' }], // V becomes V7 with raised 7th
      },
    ],
  },
  // NATURAL MINOR PROGRESSIONS (Modal/Cyclical)
  {
    id: '16',
    name: 'i–♭VII–♭VI–♭VII',
    romanNumerals: ['i', '♭VII', '♭VI', '♭VII'],
    tier: 'Extended',
    styles: ['Rock', 'Folk', 'Indie'],
    feel: 'Modal loop',
    typicalUse: 'Verse or Chorus',
    compatibleScaleFamilies: ['minor'],
    designedFor: ['Natural Minor'],
    primaryMinorScale: 'natural',
    character: 'modal',
  },
  {
    id: '17',
    name: 'i–♭VI–♭VII–i',
    romanNumerals: ['i', '♭VI', '♭VII', 'i'],
    tier: 'Extended',
    styles: ['Rock', 'Folk', 'Indie'],
    feel: 'Cyclical',
    typicalUse: 'Verse or Chorus',
    compatibleScaleFamilies: ['minor'],
    designedFor: ['Natural Minor'],
    primaryMinorScale: 'natural',
    character: 'modal',
  },
  {
    id: '18',
    name: 'i–iv–♭VII–i',
    romanNumerals: ['i', 'iv', '♭VII', 'i'],
    tier: 'Extended',
    styles: ['Rock', 'Folk', 'Indie'],
    feel: 'Dark / unresolved',
    typicalUse: 'Verse',
    compatibleScaleFamilies: ['minor'],
    designedFor: ['Natural Minor'],
    primaryMinorScale: 'natural',
    character: 'modal',
  },
  {
    id: '19',
    name: 'i–♭III–♭VII–i',
    romanNumerals: ['i', '♭III', '♭VII', 'i'],
    tier: 'Extended',
    styles: ['Rock', 'Folk', 'Indie'],
    feel: 'Folk / rock minor',
    typicalUse: 'Verse or Chorus',
    compatibleScaleFamilies: ['minor'],
    designedFor: ['Natural Minor'],
    primaryMinorScale: 'natural',
    character: 'modal',
  },
  {
    id: '20',
    name: 'i–iv–♭VI–♭VII',
    romanNumerals: ['i', 'iv', '♭VI', '♭VII'],
    tier: 'Extended',
    styles: ['Rock', 'Folk', 'Indie'],
    feel: 'Modal loop',
    typicalUse: 'Verse or Chorus',
    compatibleScaleFamilies: ['minor'],
    designedFor: ['Natural Minor'],
    primaryMinorScale: 'natural',
    character: 'modal',
  },
  {
    id: '15',
    name: 'vi–♭VI–I',
    romanNumerals: ['vi', '♭VI', 'I'],
    tier: 'Exploratory',
    styles: ['Film', 'Indie'],
    feel: 'Emotional pivot',
    compatibleScaleFamilies: ['major'],
    designedFor: ['Major'],
  },
  // MINOR PROGRESSIONS (from MINOR_CHORD_PROGRESSION_DICTIONARY.md)
  // Core / Essential Minor Progressions
  {
    id: 'minor-1',
    name: 'i – VI – VII',
    romanNumerals: ['i', 'VI', 'VII'],
    tier: 'Core',
    styles: ['Rock', 'Pop', 'Cinematic'],
    feel: 'Epic, driving, emotional',
    typicalUse: 'Verse, Chorus',
    compatibleScaleFamilies: ['minor'],
    designedFor: ['Minor'],
    character: 'mixed',
    primaryMinorScale: 'natural',
  },
  {
    id: 'minor-2',
    name: 'i – iv – v',
    romanNumerals: ['i', 'iv', 'v'],
    tier: 'Core',
    styles: ['Folk', 'Indie', 'Acoustic'],
    feel: 'Pure, sad, folk',
    typicalUse: 'Verse',
    compatibleScaleFamilies: ['minor'],
    designedFor: ['Minor'],
    character: 'modal',
    primaryMinorScale: 'natural',
  },
  {
    id: 'minor-3',
    name: 'i – iv – V',
    romanNumerals: ['i', 'iv', 'V'],
    tier: 'Core',
    styles: ['Ballad', 'Cinematic', 'Pop'],
    feel: 'Dramatic, tense, classical pull',
    typicalUse: 'Pre-chorus, Cadence',
    compatibleScaleFamilies: ['minor', 'harmonic_minor'],
    designedFor: ['Minor'],
    character: 'gravitational',
    primaryMinorScale: 'natural',
    borrowedDegrees: [{ degree: 5, fromScale: 'harmonic_minor' }],
  },
  {
    id: 'minor-4',
    name: 'i – v – VI – VII',
    romanNumerals: ['i', 'v', 'VI', 'VII'],
    tier: 'Core',
    styles: ['Indie', 'Pop-rock'],
    feel: 'Melancholic, modern',
    typicalUse: 'Verse or Chorus',
    compatibleScaleFamilies: ['minor'],
    designedFor: ['Minor'],
    character: 'modal',
    primaryMinorScale: 'natural',
  },
  {
    id: 'minor-5',
    name: 'i – VI – III – VII',
    romanNumerals: ['i', 'VI', 'III', 'VII'],
    tier: 'Core',
    styles: ['Pop', 'Rock'],
    feel: 'Expansive, hopeful-sad',
    typicalUse: 'Chorus',
    compatibleScaleFamilies: ['minor'],
    designedFor: ['Minor'],
    character: 'mixed',
    primaryMinorScale: 'natural',
  },
  {
    id: 'minor-6',
    name: 'i – VII – VI – VII',
    romanNumerals: ['i', 'VII', 'VI', 'VII'],
    tier: 'Extended',
    styles: ['Rock'],
    feel: 'Classic rock minor loop',
    typicalUse: 'Verse',
    compatibleScaleFamilies: ['minor'],
    designedFor: ['Minor'],
    character: 'modal',
    primaryMinorScale: 'natural',
  },
  // Resolution & Cadence Patterns (Minor)
  {
    id: 'minor-7',
    name: 'ii° – V – i',
    romanNumerals: ['ii°', 'V', 'i'],
    tier: 'Core',
    styles: ['Pop', 'Cinematic'],
    feel: 'Strong resolution',
    typicalUse: 'Turnaround, Ending',
    compatibleScaleFamilies: ['minor', 'harmonic_minor'],
    designedFor: ['Minor'],
    character: 'gravitational',
    primaryMinorScale: 'harmonic',
  },
  {
    id: 'minor-8',
    name: 'iv – V – i',
    romanNumerals: ['iv', 'V', 'i'],
    tier: 'Core',
    styles: ['Pop', 'Cinematic'],
    feel: 'Clear dramatic close',
    typicalUse: 'Ending',
    compatibleScaleFamilies: ['minor', 'harmonic_minor'],
    designedFor: ['Minor'],
    character: 'gravitational',
    primaryMinorScale: 'natural',
    borrowedDegrees: [{ degree: 5, fromScale: 'harmonic_minor' }],
  },
  {
    id: 'minor-9',
    name: 'VI – VII – i',
    romanNumerals: ['VI', 'VII', 'i'],
    tier: 'Core',
    styles: ['Pop', 'Rock'],
    feel: 'Lift into resolution',
    typicalUse: 'Chorus into Verse',
    compatibleScaleFamilies: ['minor'],
    designedFor: ['Minor'],
    character: 'gravitational',
    primaryMinorScale: 'natural',
  },
  // Loop-Based / Modern Minor Progressions
  {
    id: 'minor-10',
    name: 'i – VI – i – VII',
    romanNumerals: ['i', 'VI', 'i', 'VII'],
    tier: 'Extended',
    styles: ['Indie', 'Alt'],
    feel: 'Brooding loop',
    typicalUse: 'Verse',
    compatibleScaleFamilies: ['minor'],
    designedFor: ['Minor'],
    character: 'modal',
    primaryMinorScale: 'natural',
  },
  {
    id: 'minor-11',
    name: 'i – III – VII – iv',
    romanNumerals: ['i', 'III', 'VII', 'iv'],
    tier: 'Extended',
    styles: ['Indie', 'Pop'],
    feel: 'Emotional contrast',
    typicalUse: 'Verse / Bridge',
    compatibleScaleFamilies: ['minor'],
    designedFor: ['Minor'],
    character: 'mixed',
    primaryMinorScale: 'natural',
  },
  {
    id: 'minor-12',
    name: 'i – v – iv – v',
    romanNumerals: ['i', 'v', 'iv', 'v'],
    tier: 'Extended',
    styles: ['Indie', 'Folk'],
    feel: 'Introspective, unresolved',
    typicalUse: 'Verse',
    compatibleScaleFamilies: ['minor'],
    designedFor: ['Minor'],
    character: 'modal',
    primaryMinorScale: 'natural',
  },
  // Dark / Cinematic Progressions
  {
    id: 'minor-13',
    name: 'i – ♭II – i',
    romanNumerals: ['i', '♭II', 'i'],
    tier: 'Exploratory',
    styles: ['Film', 'Trailer'],
    feel: 'Dark, tense',
    typicalUse: 'Accent, Breakdown',
    compatibleScaleFamilies: ['minor'],
    designedFor: ['Minor'],
    character: 'gravitational',
    primaryMinorScale: 'natural',
  },
  {
    id: 'minor-14',
    name: 'i – ♭VI – iv – i',
    romanNumerals: ['i', '♭VI', 'iv', 'i'],
    tier: 'Exploratory',
    styles: ['Film', 'Cinematic'],
    feel: 'Heavy sadness',
    typicalUse: 'Verse',
    compatibleScaleFamilies: ['minor'],
    designedFor: ['Minor'],
    character: 'gravitational',
    primaryMinorScale: 'natural',
  },
];

/**
 * Get all progressions grouped by tier
 */
export function getProgressionsByTier(): Record<ProgressionTier, ChordProgression[]> {
  const grouped: Record<ProgressionTier, ChordProgression[]> = {
    Core: [],
    Extended: [],
    Exploratory: [],
  };

  for (const progression of CHORD_PROGRESSIONS) {
    grouped[progression.tier].push(progression);
  }

  return grouped;
}

/**
 * Get all progressions
 */
export function getAllProgressions(): ChordProgression[] {
  return CHORD_PROGRESSIONS;
}

/**
 * Get a progression by ID
 */
export function getProgressionById(id: string): ChordProgression | undefined {
  return CHORD_PROGRESSIONS.find(p => p.id === id);
}

/**
 * Get progressions filtered by tonality (Major or Minor)
 * Filters ONLY by designedFor field - no scale-family inference
 * Results are sorted by tier: Core → Extended → Exploratory
 */
export function getProgressionsByTonality(tonality: 'major' | 'minor'): ChordProgression[] {
  const filtered = CHORD_PROGRESSIONS.filter(progression => {
    const designedFor = progression.designedFor.map(t => t.toLowerCase());
    
    if (tonality === 'major') {
      // Major progressions: designed for Major only
      return designedFor.some(t => t.includes('major'));
    } else {
      // Minor progressions: includes "Minor", "Natural Minor", "Harmonic Minor"
      return designedFor.some(t => t.includes('minor'));
    }
  });
  
  // Sort by tier: Core → Extended → Exploratory
  const tierOrder: Record<ProgressionTier, number> = {
    Core: 1,
    Extended: 2,
    Exploratory: 3,
  };
  
  return filtered.sort((a, b) => {
    const tierDiff = tierOrder[a.tier] - tierOrder[b.tier];
    if (tierDiff !== 0) return tierDiff;
    // Within same tier, preserve original order (by index in CHORD_PROGRESSIONS)
    return 0;
  });
}

/**
 * Get progressions by tier, filtered by tonality
 */
export function getProgressionsByTierAndTonality(tonality: 'major' | 'minor'): Record<ProgressionTier, ChordProgression[]> {
  const filtered = getProgressionsByTonality(tonality);
  const grouped: Record<ProgressionTier, ChordProgression[]> = {
    Core: [],
    Extended: [],
    Exploratory: [],
  };

  for (const progression of filtered) {
    grouped[progression.tier].push(progression);
  }

  return grouped;
}
