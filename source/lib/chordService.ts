/**
 * ChordService - Pure music theory service using @tonaljs/tonal
 * 
 * This service provides framework-agnostic chord parsing and voicing helpers.
 * All music theory logic is handled by Tonal, making this layer fully testable.
 */

import { Chord as TonalChord, Note as TonalNote } from '@tonaljs/tonal';
import { ChordVoicing, PianoVoicing } from './types';

export interface ParsedChord {
  symbol: string;
  normalizedSymbol: string;
  tonic: string;
  type: string;
  notes: string[];
  intervals: string[];
  quality: string;
  empty: boolean;
  /** Set when the symbol is a slash chord (e.g. C/G); the note after the slash, normalized (e.g. "G", "F#"). */
  bassNote?: string | null;
}

/**
 * Normalize human-readable chord input to Tonal-friendly symbols (e.g. "C major 7" -> "Cmaj7").
 */
function normalizeChordInput(input: string): string {
  const s = input.trim();
  if (!s) return s;
  const rootMatch = s.match(/^([A-Ga-g][#b]?)\s*(.*)$/);
  if (!rootMatch) return s;
  const root = rootMatch[1];
  const restRaw = (rootMatch[2] ?? '').trim();
  if (!restRaw) return s;

  // Uppercase "M" alone denotes major (e.g. "DM" → "D"); normalize before lowercasing
  // to avoid confusing it with lowercase "m" (minor).
  if (restRaw === 'M') return root;
  if (restRaw === 'M7') return `${root}maj7`;

  const rest = restRaw.toLowerCase();

  const qualityMap: Array<{ pattern: RegExp; replacement: string }> = [
    { pattern: /^\s*major\s+7\s*$|^\s*maj\s+7\s*$|^\s*major7\s*$|^\s*maj7\s*$|^\s*major\s+seventh\s*$/i, replacement: 'maj7' },
    { pattern: /^\s*minor\s+7\s*$|^\s*min\s+7\s*$|^\s*minor7\s*$|^\s*min7\s*$|^\s*minor\s+seventh\s*$/i, replacement: 'm7' },
    { pattern: /^\s*major\s*$|^\s*maj\s*$/i, replacement: '' },
    { pattern: /^\s*minor\s*$|^\s*min\s*$/i, replacement: 'm' },
    { pattern: /^\s*diminished\s+7\s*$|^\s*dim\s+7\s*$|^\s*dim7\s*$/i, replacement: 'dim7' },
    { pattern: /^\s*diminished\s*$|^\s*dim\s*$/i, replacement: 'dim' },
    { pattern: /^\s*half\s+diminished\s*$|^\s*half\s+dim\s*$|^\s*m7b5\s*$/i, replacement: 'm7b5' },
    { pattern: /^\s*augmented\s*$|^\s*aug\s*$/i, replacement: 'aug' },
    { pattern: /^\s*suspended\s+second\s*$|^\s*sus\s+second\s*$|^\s*sus\s+2\s*$|^\s*sus2\s*$/i, replacement: 'sus2' },
    { pattern: /^\s*suspended\s+fourth\s*$|^\s*sus\s+fourth\s*$|^\s*sus\s+4\s*$|^\s*sus4\s*$/i, replacement: 'sus4' },
    { pattern: /^\s*dominant\s+seventh\s*$|^\s*dom\s+7\s*$|^\s*7\s*$/i, replacement: '7' },
  ];

  let restNorm = rest.replace(/\s+/g, ' ').trim();
  // Tonal does not parse ø/ø7; convert to m7b5 so e.g. D#ø7 parses (half-diminished).
  if (/ø/.test(restNorm)) {
    restNorm = restNorm.replace(/ø\s*7|ø7/gi, 'm7b5').replace(/ø/gi, 'm7b5');
    return root + restNorm;
  }
  for (const { pattern, replacement } of qualityMap) {
    if (pattern.test(restNorm)) {
      return replacement ? `${root}${replacement}` : root;
    }
  }
  return s;
}

/**
 * Parse a chord symbol using Tonal.
 * Supports slash chords (e.g. C/G, D/F#, Am7/G): the main chord is parsed, and the bass note is stored in bassNote.
 * Human-readable forms like "C major 7" or "C minor 7" are normalized before parsing.
 */
export function parseChord(chordSymbol: string): ParsedChord | null {
  if (!chordSymbol || !chordSymbol.trim()) {
    return null;
  }

  const trimmed = chordSymbol.trim();
  const slashIndex = trimmed.indexOf('/');
  let mainPart = slashIndex >= 0 ? trimmed.slice(0, slashIndex).trim() : trimmed;
  const bassPart = slashIndex >= 0 ? trimmed.slice(slashIndex + 1).trim() : null;

  mainPart = normalizeChordInput(mainPart);
  const parsed = TonalChord.get(mainPart);

  if (parsed.empty) {
    return null;
  }

  let bassNote: string | null = null;
  if (bassPart) {
    const bassPc = TonalNote.get(bassPart);
    if (bassPc && !bassPc.empty) {
      bassNote = bassPc.name;
    }
  }

  // Use ASCII quality (dim, dim7, m7b5) for normalizedSymbol so API/DB lookup matches (e.g. Gb° → Gbdim, F#dim in DB).
  // Also strip trailing uppercase "M" used by Tonal for major triads (e.g. "DM" → "D").
  const symbolForLookup = (s: string) =>
    s
      .replace(/^([A-G][#b]?)M7$/,  '$1maj7')
      .replace(/^([A-G][#b]?)M$/,   '$1')
      .replace(/°\s*7|°7/g, 'dim7')
      .replace(/°/g, 'dim')
      .replace(/ø\s*7|ø7/gi, 'm7b5')
      .replace(/ø/g, 'm7b5');
  const normalizedSymbol = bassNote
    ? `${symbolForLookup(parsed.symbol)}/${bassNote}`
    : symbolForLookup(parsed.symbol);

  return {
    symbol: trimmed,
    normalizedSymbol,
    tonic: parsed.tonic || '',
    type: parsed.type || '',
    notes: parsed.notes,
    intervals: parsed.intervals,
    quality: parsed.quality || '',
    empty: parsed.empty,
    bassNote: bassNote ?? undefined,
  };
}

/**
 * Get notes for a chord symbol
 */
export function getNotes(chordSymbol: string): string[] {
  const parsed = parseChord(chordSymbol);
  return parsed?.notes || [];
}

/**
 * Check if a chord symbol is valid (including slash chords e.g. C/G).
 */
export function isValidChord(chordSymbol: string): boolean {
  const parsed = parseChord(chordSymbol);
  return parsed !== null;
}

/**
 * Normalize a chord symbol (e.g., "Amin7" -> "Am7")
 */
export function normalizeChordSymbol(chordSymbol: string): string {
  const parsed = parseChord(chordSymbol);
  return parsed?.normalizedSymbol || chordSymbol;
}

const INVERSION_NAMES = ['Root Position', '1st Inversion', '2nd Inversion', '3rd Inversion'] as const;

/**
 * Assign octaves so rotated chord tones stay in ascending order in a compact range (no left-hand bass).
 * Same rotation rule as chord-explorer; we only show the right-hand chord tones.
 */
function assignCompactOctaves(noteNames: string[], baseOctave: number = 3): string[] {
  if (noteNames.length === 0) return [];
  const result: string[] = [];
  let prevChroma: number | null = null;
  let octave = baseOctave;
  for (const name of noteNames) {
    const chroma = TonalNote.get(name).chroma ?? 0;
    if (prevChroma !== null && chroma <= prevChroma) {
      octave += 1;
    }
    prevChroma = chroma;
    result.push(`${name}${octave}`);
  }
  return result;
}

/**
 * Get piano voicings for a chord: one voicing per inversion (root, 1st, 2nd, and for 7ths, 3rd).
 * Uses the chord's actual tones from Tonal; rotation matches chord-explorer; compact range only (no octave-lower bass).
 */
export function getPianoVoicings(chordSymbol: string): PianoVoicing[] {
  const parsed = parseChord(chordSymbol);
  if (!parsed || parsed.empty) {
    return [];
  }

  const notes = parsed.notes;
  if (notes.length === 0) {
    return [];
  }

  const voicings: PianoVoicing[] = [];
  const n = notes.length;

  for (let inv = 0; inv < n; inv++) {
    const rotated = notes.map((_, j) => notes[(j + inv) % n]);
    const withOctaves = assignCompactOctaves(rotated);
    const name = INVERSION_NAMES[inv] ?? `${inv + 1}th Inversion`;
    voicings.push({
      id: `${parsed.normalizedSymbol}-${inv}`,
      name,
      notes: withOctaves,
    });
  }

  return voicings;
}

/**
 * Get guitar voicings for a chord
 * This integrates with the existing chordVoicings.ts data but validates/normalizes via Tonal
 */
export function getGuitarVoicings(
  chordSymbol: string,
  voicingLookup: (symbol: string) => ChordVoicing[]
): ChordVoicing[] {
  // Normalize the chord symbol first
  const normalized = normalizeChordSymbol(chordSymbol);
  
  // Try normalized symbol first
  let voicings = voicingLookup(normalized);
  
  // If no voicings found, try original symbol
  if (voicings.length === 0) {
    voicings = voicingLookup(chordSymbol);
  }

  // Validate that the chord is actually valid
  if (!isValidChord(chordSymbol)) {
    return [];
  }

  return voicings;
}

/**
 * Get all voicings (both guitar and piano) for a chord
 */
export function getAllVoicings(
  chordSymbol: string,
  guitarVoicingLookup: (symbol: string) => ChordVoicing[]
): {
  guitar: ChordVoicing[];
  piano: PianoVoicing[];
} {
  return {
    guitar: getGuitarVoicings(chordSymbol, guitarVoicingLookup),
    piano: getPianoVoicings(chordSymbol),
  };
}
