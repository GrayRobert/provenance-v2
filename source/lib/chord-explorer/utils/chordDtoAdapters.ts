import type { Chord, ChordQuality as InternalQuality } from '../harmonizer';
import { buildChord } from '../harmonizer';
import type { BorrowedChord } from '../modalInterchange';
import type { Scale } from '../scales';
import { shouldPreferFlats, getScaleById } from '../scales';
import type {
  ChordAlteration,
  ChordContext,
  ChordDTO,
  ChordExtension,
  ChordMeta,
  ChordQuality,
  PitchClass,
} from '../types/chordDto';

const PITCH_CLASSES: PitchClass[] = [
  'C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B',
];

function toPitchClass(value: string): PitchClass {
  const match = PITCH_CLASSES.find(pc => pc === value);
  return match ?? 'C';
}

const INTERNAL_TO_DTO: Record<
  InternalQuality,
  { quality: ChordQuality; extensions: ChordExtension[]; alterations: ChordAlteration[] }
> = {
  major: { quality: 'major', extensions: [], alterations: [] },
  minor: { quality: 'minor', extensions: [], alterations: [] },
  diminished: { quality: 'diminished', extensions: [], alterations: [] },
  augmented: { quality: 'augmented', extensions: [], alterations: [] },
  sus2: { quality: 'suspended2', extensions: [], alterations: [] },
  sus4: { quality: 'suspended4', extensions: [], alterations: [] },
  dom7: { quality: 'major', extensions: ['7'], alterations: [] },
  maj7: { quality: 'major', extensions: ['maj7'], alterations: [] },
  min7: { quality: 'minor', extensions: ['7'], alterations: [] },
  min7b5: { quality: 'diminished', extensions: ['7'], alterations: ['b5'] },
  dim7: { quality: 'diminished', extensions: ['7'], alterations: [] },
  add9: { quality: 'major', extensions: [], alterations: ['add9'] },
  maj9: { quality: 'major', extensions: ['maj7', '9'], alterations: [] },
  min9: { quality: 'minor', extensions: ['7', '9'], alterations: [] },
  dom9: { quality: 'major', extensions: ['7', '9'], alterations: [] },
  dom11: { quality: 'major', extensions: ['7', '9', '11'], alterations: [] },
  min11: { quality: 'minor', extensions: ['7', '9', '11'], alterations: [] },
  dom13: { quality: 'major', extensions: ['7', '9', '11', '13'], alterations: [] },
  maj13: { quality: 'major', extensions: ['maj7', '9', '11', '13'], alterations: [] },
  min13: { quality: 'minor', extensions: ['7', '9', '11', '13'], alterations: [] },
  '7sus4': { quality: 'suspended4', extensions: ['7'], alterations: [] },
  'maj7sus2': { quality: 'suspended2', extensions: ['maj7'], alterations: [] },
};

function normalizeKeyScale(scale: string): ChordContext['keyScale'] {
  const normalized = scale.toLowerCase().replace(/\s+/g, '_');
  const allowed: ChordContext['keyScale'][] = [
    'major',
    'minor',
    'harmonic_minor',
    'melodic_minor',
    'dorian',
    'phrygian',
    'lydian',
    'mixolydian',
    'aeolian',
    'locrian',
  ];
  const match = allowed.find(value => value === normalized);
  return match ?? 'major';
}

function uniquePitchClasses(notes: string[]): PitchClass[] {
  const seen = new Set<string>();
  const result: PitchClass[] = [];
  notes.forEach(note => {
    if (seen.has(note)) return;
    seen.add(note);
    result.push(toPitchClass(note));
  });
  return result;
}

function isBorrowed(chord: Chord | BorrowedChord): chord is BorrowedChord {
  return 'isBorrowed' in chord && chord.isBorrowed === true;
}

function buildContext(chord: Chord | BorrowedChord, songKeyRoot: string, songKeyScale: string): ChordContext {
  const borrowed = isBorrowed(chord);
  return {
    keyRoot: toPitchClass(songKeyRoot),
    keyScale: normalizeKeyScale(songKeyScale),
    degree: chord.degree,
    isDiatonic: !borrowed,
    borrowedFrom: borrowed ? normalizeKeyScale(chord.sourceMode) : undefined,
  };
}

function buildMeta(chord: Chord | BorrowedChord): ChordMeta {
  return {
    source: isBorrowed(chord) ? 'borrowed' : 'diatonic',
  };
}

export function chordToChordDto(
  chord: Chord | BorrowedChord,
  options: {
    songKeyRoot: string;
    songKeyScale: string;
    inversion: number;
  }
): ChordDTO {
  const mapping = INTERNAL_TO_DTO[chord.quality];
  const context = buildContext(chord, options.songKeyRoot, options.songKeyScale);
  const notes = uniquePitchClasses(chord.notes);
  const bass = chord.notes[0];
  const bassPitch = bass && bass !== chord.root ? toPitchClass(bass) : undefined;

  return {
    symbol: chord.symbol,
    root: toPitchClass(chord.root),
    quality: mapping.quality,
    extensions: mapping.extensions,
    alterations: mapping.alterations,
    inversion: options.inversion,
    bass: bassPitch,
    notes,
    context,
    meta: buildMeta(chord),
  };
}

function hasExtension(extensions: ChordExtension[], value: ChordExtension): boolean {
  return extensions.includes(value);
}

function hasAlteration(alterations: ChordAlteration[], value: ChordAlteration): boolean {
  return alterations.includes(value);
}

function dtoToInternalQuality(dto: ChordDTO): InternalQuality {
  const { quality, extensions, alterations, symbol } = dto;

  if (quality === 'suspended4') {
    if (hasExtension(extensions, '7')) return '7sus4';
    return 'sus4';
  }

  if (quality === 'suspended2') {
    if (hasExtension(extensions, 'maj7')) return 'maj7sus2';
    return 'sus2';
  }

  if (quality === 'augmented') {
    return 'augmented';
  }

  if (quality === 'diminished') {
    if (hasExtension(extensions, '7')) {
      if (symbol.toLowerCase().includes('dim7') || symbol.includes('°7')) {
        return 'dim7';
      }
      if (hasAlteration(alterations, 'b5')) {
        return 'min7b5';
      }
      return 'min7b5';
    }
    return 'diminished';
  }

  if (quality === 'minor') {
    if (hasExtension(extensions, '13')) return 'min13';
    if (hasExtension(extensions, '11')) return 'min11';
    if (hasExtension(extensions, '9')) return 'min9';
    if (hasExtension(extensions, '7') || hasExtension(extensions, 'maj7')) return 'min7';
    return 'minor';
  }

  if (quality === 'major') {
    if (hasAlteration(alterations, 'add9')) return 'add9';
    if (hasExtension(extensions, '13')) return hasExtension(extensions, 'maj7') ? 'maj13' : 'dom13';
    if (hasExtension(extensions, '11')) return 'dom11';
    if (hasExtension(extensions, '9')) return hasExtension(extensions, 'maj7') ? 'maj9' : 'dom9';
    if (hasExtension(extensions, 'maj7')) return 'maj7';
    if (hasExtension(extensions, '7')) return 'dom7';
    return 'major';
  }

  return 'major';
}

export function chordDtoToInternalChord(dto: ChordDTO): Chord {
  const internalQuality = dtoToInternalQuality(dto);
  // Custom chords may have degree 0, which is invalid for getDegreeRoman
  // Use 1 as default for invalid degrees (0 or undefined)
  const degree = (dto.context.degree && dto.context.degree > 0 && dto.context.degree <= 7) 
    ? dto.context.degree 
    : 1;
  const root = dto.root;
  
  // Use scale-based enharmonic spelling if scale info is available
  let scale: Scale | undefined;
  if (dto.context.keyScale) {
    // DTO keyScale uses underscores (e.g., 'harmonic_minor'), same as scale IDs
    // Also handle 'minor' -> 'aeolian' mapping
    const scaleId = dto.context.keyScale === 'minor' ? 'aeolian' : dto.context.keyScale;
    scale = getScaleById(scaleId);
  }
  
  const preferFlats = shouldPreferFlats(root, scale);
  const chord = buildChord(root, internalQuality, degree, preferFlats);
  return {
    ...chord,
    symbol: dto.symbol || chord.symbol,
  };
}

export function normalizeSongKeyScale(scale: string): ChordContext['keyScale'] {
  return normalizeKeyScale(scale);
}
