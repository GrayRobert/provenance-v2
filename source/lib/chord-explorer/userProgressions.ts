/**
 * User Progressions Module
 * Handles persistence of user-saved chord progressions
 */

import type { ProgressionSection, TimeSignature } from './types/chordProgression';

const STORAGE_KEY = 'chord-explorer-user-progressions';

/** Optional callbacks after progressions are written (e.g. to sync to backend). Set by main.ts when pluginPersistence is provided. */
let onAfterSaveProgression: ((progression: UserProgression) => void) | null = null;
let onAfterDeleteProgression: ((id: string) => void) | null = null;
export function setOnAfterSaveProgression(cb: ((progression: UserProgression) => void) | null): void {
  onAfterSaveProgression = cb;
}
export function setOnAfterDeleteProgression(cb: ((id: string) => void) | null): void {
  onAfterDeleteProgression = cb;
}

// ===========================
// TYPES
// ===========================

/**
 * A user-saved chord progression with metadata.
 * Unlike dictionary progressions (roman numerals), these store concrete chord sequences.
 */
export interface UserProgression {
  id: string;
  name: string;
  styles: string[];
  feel: string;
  typicalUse?: string;
  notes?: string;
  createdAt: number;
  songKey: { root: string; scale: string };
  timeSignature: TimeSignature;
  sections: ProgressionSection[];
}

// ===========================
// VALIDATION
// ===========================

/**
 * Validate that an object has the shape of a UserProgression
 */
function isValidUserProgression(obj: unknown): obj is UserProgression {
  if (!obj || typeof obj !== 'object') return false;
  
  const prog = obj as Record<string, unknown>;
  
  return (
    typeof prog.id === 'string' &&
    typeof prog.name === 'string' &&
    Array.isArray(prog.styles) &&
    typeof prog.feel === 'string' &&
    typeof prog.createdAt === 'number' &&
    prog.songKey !== null &&
    typeof prog.songKey === 'object' &&
    typeof (prog.songKey as Record<string, unknown>).root === 'string' &&
    typeof (prog.songKey as Record<string, unknown>).scale === 'string' &&
    Array.isArray(prog.timeSignature) &&
    prog.timeSignature.length === 2 &&
    Array.isArray(prog.sections)
  );
}

/**
 * Validate that a section has valid structure
 */
function isValidSection(section: unknown): boolean {
  if (!section || typeof section !== 'object') return false;
  
  const s = section as Record<string, unknown>;
  
  if (typeof s.id !== 'string' || !Array.isArray(s.bars) || typeof s.repeatTimes !== 'number') {
    return false;
  }
  
  // Validate each bar
  for (const bar of s.bars as unknown[]) {
    if (!bar || typeof bar !== 'object') return false;
    const b = bar as Record<string, unknown>;
    if (typeof b.id !== 'string' || !Array.isArray(b.chords)) return false;
    
    // Validate each chord in the bar
    for (const timelineChord of b.chords as unknown[]) {
      if (!timelineChord || typeof timelineChord !== 'object') return false;
      const tc = timelineChord as Record<string, unknown>;
      if (
        typeof tc.id !== 'string' ||
        typeof tc.position !== 'number' ||
        typeof tc.duration !== 'number' ||
        !tc.chord ||
        typeof tc.chord !== 'object'
      ) {
        return false;
      }
      
      // Validate the chord object
      const chord = tc.chord as Record<string, unknown>;
      if (
        typeof chord.root !== 'string' ||
        typeof chord.quality !== 'string' ||
        typeof chord.symbol !== 'string' ||
        !Array.isArray(chord.notes) ||
        !Array.isArray(chord.midiNotes)
      ) {
        return false;
      }
    }
  }
  
  return true;
}

// ===========================
// PERSISTENCE
// ===========================

/**
 * Load user progressions from localStorage
 */
export function loadUserProgressions(): UserProgression[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    
    const progressions = JSON.parse(stored) as unknown[];
    
    // Validate that we got an array
    if (!Array.isArray(progressions)) return [];
    
    // Filter to only valid progressions with valid sections
    return progressions.filter(prog => {
      if (!isValidUserProgression(prog)) return false;
      
      // Validate all sections
      for (const section of prog.sections) {
        if (!isValidSection(section)) return false;
      }
      
      return true;
    }) as UserProgression[];
  } catch (error) {
    console.warn('Failed to load user progressions from localStorage:', error);
    return [];
  }
}

/**
 * Save all user progressions to localStorage
 */
function saveAllUserProgressions(progressions: UserProgression[]): void {
  try {
    const serialized = JSON.stringify(progressions);
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      console.error('localStorage quota exceeded. Cannot save user progressions.');
    } else {
      console.error('Failed to save user progressions to localStorage:', error);
    }
  }
}

/** Replace all progressions (e.g. seed from backend). Does not invoke onAfterSaveProgression. */
export function replaceAllUserProgressions(progressions: UserProgression[]): void {
  try {
    const serialized = JSON.stringify(progressions);
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      console.error('localStorage quota exceeded. Cannot save user progressions.');
    } else {
      console.error('Failed to save user progressions to localStorage:', error);
    }
  }
}

/**
 * Save a new user progression
 * Returns true if saved successfully, false if duplicate name or error
 */
export function saveUserProgression(progression: UserProgression): boolean {
  const existing = loadUserProgressions();
  
  // Check for duplicate names
  const isDuplicate = existing.some(p => p.name.toLowerCase() === progression.name.toLowerCase());
  if (isDuplicate) {
    return false;
  }
  
  existing.unshift(progression); // Add to beginning so newest appears first
  saveAllUserProgressions(existing);
  onAfterSaveProgression?.(progression);
  return true;
}

/**
 * Delete a user progression by id
 */
export function deleteUserProgression(id: string): void {
  const existing = loadUserProgressions();
  const filtered = existing.filter(p => p.id !== id);
  saveAllUserProgressions(filtered);
  onAfterDeleteProgression?.(id);
}

/**
 * Generate a unique ID for a new user progression
 */
export function generateUserProgressionId(): string {
  return `user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Get chord symbols from the first section for display
 * Returns an array of chord symbols (e.g. ["C", "Am", "F", "G"])
 */
export function getProgressionChordSymbols(progression: UserProgression): string[] {
  const symbols: string[] = [];
  
  if (progression.sections.length === 0) return symbols;
  
  const firstSection = progression.sections[0];
  for (const bar of firstSection.bars) {
    for (const timelineChord of bar.chords) {
      if (timelineChord.chord && timelineChord.chord.symbol) {
        symbols.push(timelineChord.chord.symbol);
      }
    }
  }
  
  return symbols;
}

/**
 * Check if there are any chords in the given sections
 */
export function hasChords(sections: ProgressionSection[]): boolean {
  for (const section of sections) {
    for (const bar of section.bars) {
      if (bar.chords.length > 0) {
        return true;
      }
    }
  }
  return false;
}
