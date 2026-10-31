/**
 * Custom Chords Module
 * Handles parsing, validation, and persistence of user-defined custom chords
 */

import { Chord as TonalChord } from 'tonal';
import type { Chord, ChordQuality } from './harmonizer';
import { noteToMidi, ensureChordTonesMinimumRegister } from './harmonizer';

const STORAGE_KEY = 'chord-explorer-custom-chords';

/** Optional callback after custom chords are written (e.g. to sync to backend). Set by main.ts when pluginPersistence is provided. */
let onCustomChordsChange: (() => void) | null = null;
export function setOnCustomChordsChange(cb: (() => void) | null): void {
  onCustomChordsChange = cb;
}

// ===========================
// CHORD PARSING
// ===========================

/**
 * Map tonal.js chord types to internal ChordQuality types
 */
function mapTonalTypeToQuality(tonalType: string, symbol: string): ChordQuality | null {
  // Tonal uses uppercase "M" for major (e.g. type "M" for major triad, "M7"/"major seventh" for major 7th).
  // Resolve these before lowercasing to avoid confusing "M" with "m" (minor).
  if (tonalType === 'M') return 'major';
  if (tonalType === 'M7' || tonalType === 'major seventh') return 'maj7';
  // Catch symbols like "DM7" that indicate major seventh (uppercase M before 7)
  if (/^[A-G][#b]?M7$/.test(symbol.split('/')[0])) return 'maj7';

  const type = tonalType.toLowerCase();
  const symbolLower = symbol.toLowerCase();
  
  // Check for sevenths FIRST (before triads) to avoid misclassification
  // Sevenths
  if (type === 'm7' || type === 'min7' || type === 'minor7' || symbolLower.includes('m7')) return 'min7';
  if (type === 'maj7' || type === 'major7' || symbolLower.includes('maj7')) return 'maj7';
  if (type === 'm7b5' || type === 'min7b5' || type === 'ø7' || symbolLower.includes('ø7') || symbolLower.includes('m7b5')) return 'min7b5';
  if (type === 'dim7' || type === 'diminished7' || symbolLower.includes('°7') || symbolLower.includes('dim7')) return 'dim7';
  if (type === '7' || type === 'dom7' || type === 'dominant' || (symbolLower.includes('7') && !symbolLower.includes('maj7') && !symbolLower.includes('m7') && !symbolLower.includes('min7'))) return 'dom7';
  
  // Sus Sevenths
  if (type === '7sus4' || symbolLower.includes('7sus4')) return '7sus4';
  if (type === 'maj7sus2' || symbolLower.includes('maj7sus2')) return 'maj7sus2';
  
  // Triads (check after sevenths)
  if (type === '' || type === 'major' || type === 'maj') return 'major';
  if (type === 'm' || type === 'minor' || type === 'min') return 'minor';
  if (type === 'dim' || type === 'diminished' || symbolLower.includes('°')) return 'diminished';
  if (type === 'aug' || type === 'augmented' || symbolLower.includes('+')) return 'augmented';
  if (type === 'sus2' || symbolLower.includes('sus2')) return 'sus2';
  if (type === 'sus4' || symbolLower.includes('sus4') || symbolLower.includes('sus')) return 'sus4';
  
  // Sus Sevenths
  if (type === '7sus4' || symbolLower.includes('7sus4')) return '7sus4';
  if (type === 'maj7sus2' || symbolLower.includes('maj7sus2')) return 'maj7sus2';
  
  // Extensions
  if (type === 'add9' || symbolLower.includes('add9')) return 'add9';
  if (type === 'maj9' || type === 'major9' || symbolLower.includes('maj9')) return 'maj9';
  if (type === 'm9' || type === 'min9' || type === 'minor9' || symbolLower.includes('m9')) return 'min9';
  if (type === '9' || type === 'dom9' || (symbolLower.includes('9') && !symbolLower.includes('maj9') && !symbolLower.includes('min9') && !symbolLower.includes('m9'))) {
    // Check if it's a 9th chord (not maj9 or min9)
    if (!symbolLower.includes('maj') && !symbolLower.includes('min')) return 'dom9';
  }
  if (type === '11' || type === 'dom11' || (symbolLower.includes('11') && !symbolLower.includes('maj') && !symbolLower.includes('min'))) return 'dom11';
  if (type === 'm11' || type === 'min11' || symbolLower.includes('m11')) return 'min11';
  if (type === '13' || type === 'dom13' || (symbolLower.includes('13') && !symbolLower.includes('maj') && !symbolLower.includes('min'))) return 'dom13';
  if (type === 'maj13' || type === 'major13' || symbolLower.includes('maj13')) return 'maj13';
  if (type === 'm13' || type === 'min13' || symbolLower.includes('m13')) return 'min13';
  
  return null;
}

/**
 * Normalize chord symbol for Tonal.js (e.g. ø7 -> m7b5 so Tonal can parse)
 */
function normalizeChordPartForTonal(part: string): string {
  return part.replace(/ø7/g, 'm7b5').replace(/ø/g, 'm7b5');
}

/**
 * Parse a chord symbol and extract root, quality, and optional bass note
 */
export function parseChordSymbol(symbol: string): { root: string; quality: ChordQuality; bass?: string } | null {
  if (!symbol || typeof symbol !== 'string') return null;
  
  const trimmed = symbol.trim();
  if (!trimmed) return null;
  
  // Handle slash chords (e.g., "D/F#")
  const slashIndex = trimmed.indexOf('/');
  let chordPart = trimmed;
  let bassNote: string | undefined;
  
  if (slashIndex > 0) {
    chordPart = trimmed.substring(0, slashIndex).trim();
    bassNote = trimmed.substring(slashIndex + 1).trim();
  }
  
  // Normalize for Tonal (e.g. G#ø7 -> G#m7b5) so half-diminished parses correctly
  const chordPartForTonal = normalizeChordPartForTonal(chordPart);
  const parsed = TonalChord.get(chordPartForTonal);
  
  // Check if chord is valid
  if (!parsed || !parsed.tonic || parsed.empty) {
    return null;
  }
  
  // Map tonal type to internal quality
  const quality = mapTonalTypeToQuality(parsed.type || '', trimmed);
  if (!quality) {
    return null;
  }
  
  return {
    root: parsed.tonic || '',
    quality,
    bass: bassNote,
  };
}

/**
 * Convert a chord symbol to an internal Chord object
 */
export function chordSymbolToInternalChord(symbol: string): Chord | null {
  const parsed = parseChordSymbol(symbol);
  if (!parsed) return null;
  
  // Get chord notes from tonal.js (normalize ø -> m7b5 for Tonal)
  const chordPart = symbol.split('/')[0].trim();
  const chordPartForTonal = normalizeChordPartForTonal(chordPart);
  const tonalChord = TonalChord.get(chordPartForTonal);
  if (!tonalChord || !tonalChord.notes || tonalChord.notes.length === 0) {
    return null;
  }
  
  // Extract pitch classes from tonal notes (remove octave numbers if present)
  // Normalize note names to match noteToMidi expected format
  const notes = tonalChord.notes.map(note => {
    // Remove octave numbers (e.g., "C4" -> "C", "F#5" -> "F#")
    let normalized = note.replace(/\d+/g, '').trim();
    // Ensure note names match the format expected by noteToMidi
    // Tonal might return 'B#' as 'C', but we'll keep the original enharmonic
    // Map common variations
    if (normalized === 'B#') normalized = 'C';
    else if (normalized === 'E#') normalized = 'F';
    else if (normalized === 'Cb') normalized = 'B';
    else if (normalized === 'Fb') normalized = 'E';
    return normalized;
  });
  
  const root = parsed.root;
  const quality = parsed.quality;
  
  // Build MIDI notes with proper voicing
  // Bass: root one octave below chord tones (octave 2)
  // Chord tones: at octave 3 (extensions at octave 4)
  const bassOctave = 2;
  const chordToneOctave = 3;
  
  const midiNotes: number[] = [];
  const noteNames: string[] = [];
  
  // Handle slash chord bass note
  if (parsed.bass) {
    // Use the specified bass note
    const bassMidi = noteToMidi(parsed.bass, bassOctave);
    midiNotes.push(bassMidi);
    noteNames.push(parsed.bass);
  } else {
    // Use root as bass
    const rootMidi = noteToMidi(root, bassOctave);
    midiNotes.push(rootMidi);
    noteNames.push(root);
  }
  
  // Add chord tones
  // For non-slash chords, skip the root if it's already in the bass
  // For slash chords, include all notes
  const rootNoteIndex = notes.findIndex(n => {
    const nNormalized = n.toUpperCase().replace(/[#B]/g, '');
    const rootNormalized = root.toUpperCase().replace(/[#B]/g, '');
    return nNormalized === rootNormalized;
  });
  
  const chordTones = rootNoteIndex >= 0 && !parsed.bass 
    ? notes.filter((_, i) => i !== rootNoteIndex)
    : notes;
  
  for (let i = 0; i < chordTones.length; i++) {
    const note = chordTones[i];
    // Extensions (9th, 11th, 13th) go one octave higher
    // This is a heuristic - extensions typically come after the 7th
    const isExtension = i >= 3; // Assuming first 3 notes are root, 3rd, 5th (or 3rd, 5th, 7th)
    const octave = isExtension ? chordToneOctave + 1 : chordToneOctave;
    
    // noteToMidi handles various note name formats, so we can use the note directly
    const midi = noteToMidi(note, octave);
    midiNotes.push(midi);
    noteNames.push(note);
  }
  
  const chord: Chord = {
    root,
    quality,
    symbol: symbol,
    notes: noteNames,
    midiNotes,
    degree: 0, // Custom chords have no scale degree
    degreeRoman: '', // No Roman numerals for custom chords
  };
  
  // Apply minimum register rule
  return ensureChordTonesMinimumRegister(chord);
}

// ===========================
// PERSISTENCE
// ===========================

/**
 * Load custom chords from localStorage
 */
export function loadCustomChords(): Chord[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    
    const chords = JSON.parse(stored) as Chord[];
    // Validate that we got an array
    if (!Array.isArray(chords)) return [];
    
    // Validate each chord has required fields
    return chords.filter(chord => 
      chord && 
      typeof chord === 'object' &&
      chord.root &&
      chord.quality &&
      chord.symbol &&
      Array.isArray(chord.notes) &&
      Array.isArray(chord.midiNotes)
    );
  } catch (error) {
    console.warn('Failed to load custom chords from localStorage:', error);
    return [];
  }
}

/**
 * Save custom chords to localStorage
 */
export function saveCustomChords(chords: Chord[]): void {
  try {
    const serialized = JSON.stringify(chords);
    localStorage.setItem(STORAGE_KEY, serialized);
    onCustomChordsChange?.();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      console.error('localStorage quota exceeded. Cannot save custom chords.');
    } else {
      console.error('Failed to save custom chords to localStorage:', error);
    }
  }
}

/**
 * Add a custom chord to the list
 * Returns true if added, false if duplicate or error
 */
export function addCustomChord(chord: Chord): boolean {
  const existing = loadCustomChords();
  
  // Check for duplicates by symbol
  const isDuplicate = existing.some(c => c.symbol === chord.symbol);
  if (isDuplicate) {
    return false;
  }
  
  existing.push(chord);
  saveCustomChords(existing);
  return true;
}

/**
 * Remove a custom chord by symbol
 */
export function removeCustomChord(symbol: string): void {
  const existing = loadCustomChords();
  const filtered = existing.filter(c => c.symbol !== symbol);
  saveCustomChords(filtered);
}

/**
 * Validate a chord symbol
 * Returns null if valid, error message if invalid
 */
export function validateChordSymbol(symbol: string): string | null {
  if (!symbol || typeof symbol !== 'string' || !symbol.trim()) {
    return 'Please enter a chord symbol';
  }
  
  const parsed = chordSymbolToInternalChord(symbol.trim());
  if (!parsed) {
    return 'Invalid chord symbol';
  }
  
  return null;
}
