/**
 * Regression test: selecting a library piano inversion must not rename the
 * chord. The detector names G 1st inversion (B3 D4 G4) "Bm#5"; when the user
 * merely picks that inversion for the intended chord G, the symbol must stay
 * "G". Once the user edits the notes away from G's pitch classes, detection
 * takes over again.
 */
import { describe, it, expect } from 'vitest';
import {
  detectChordName,
  notesMatchChordSymbol,
  resolveChordNameWithPreference,
} from '@/lib/chord-builder/chord-utils';

describe('detectChordName (documents the detector quirk the guard fixes)', () => {
  it('names G 1st inversion Bm#5', () => {
    expect(detectChordName(['B3', 'D4', 'G4'])).toBe('Bm#5');
  });
});

describe('notesMatchChordSymbol', () => {
  it('matches any inversion/voicing of the chord', () => {
    expect(notesMatchChordSymbol(['B3', 'D4', 'G4'], 'G')).toBe(true); // 1st inversion
    expect(notesMatchChordSymbol(['D3', 'G3', 'B3'], 'G')).toBe(true); // 2nd inversion
    expect(notesMatchChordSymbol(['G2', 'G3', 'B3', 'D4', 'G4'], 'G')).toBe(true); // doublings
    expect(notesMatchChordSymbol(['B3', 'D4', 'G4'], 'Em')).toBe(false);
    expect(notesMatchChordSymbol(['B3', 'D4', 'G4'], 'C')).toBe(false);
  });

  it('matches enharmonic spellings via chroma', () => {
    expect(notesMatchChordSymbol(['A#3', 'D4', 'F4'], 'Bb')).toBe(true);
    expect(notesMatchChordSymbol(['Gb3', 'A#3', 'C#4'], 'F#')).toBe(true); // Gb/A#/C# = F# pcs
    expect(notesMatchChordSymbol(['Gb3', 'Bb3', 'D4'], 'F#')).toBe(false); // D natural is not C#
  });

  it('rejects partial and supersets', () => {
    expect(notesMatchChordSymbol(['G3', 'B3'], 'G')).toBe(false); // missing fifth
    expect(notesMatchChordSymbol(['G3', 'B3', 'D4', 'E4'], 'G')).toBe(false); // added E
    expect(notesMatchChordSymbol(['G3', 'B3', 'D4', 'F4'], 'G')).toBe(false); // G7 is not G
    expect(notesMatchChordSymbol(['G3', 'B3', 'D4', 'F4'], 'G7')).toBe(true);
  });

  it('handles empty and unknown input safely', () => {
    expect(notesMatchChordSymbol([], 'G')).toBe(false);
    expect(notesMatchChordSymbol(['B3', 'D4', 'G4'], '')).toBe(false);
    expect(notesMatchChordSymbol(['B3', 'D4', 'G4'], 'not-a-chord')).toBe(false);
  });
});

describe('resolveChordNameWithPreference', () => {
  it('keeps the intended symbol when the notes are that chord (inversion selection)', () => {
    expect(resolveChordNameWithPreference('Bm#5', ['B3', 'D4', 'G4'], 'G')).toBe('G');
  });

  it('uses the detected name once the user edits notes away from the intended chord', () => {
    const edited = ['B3', 'D4', 'G4', 'C4']; // no longer G's pitch classes
    const detected = detectChordName(edited);
    expect(resolveChordNameWithPreference(detected, edited, 'G')).toBe(detected);
  });

  it('keeps the preferred enharmonic spelling for the same chord', () => {
    expect(resolveChordNameWithPreference('A#', ['A#3', 'D4', 'F4'], 'Bb')).toBe('Bb');
  });

  it('passes through without a preferred symbol or without notes', () => {
    expect(resolveChordNameWithPreference('Bm#5', ['B3', 'D4', 'G4'], null)).toBe('Bm#5');
    expect(resolveChordNameWithPreference('Bm#5', ['B3', 'D4', 'G4'], undefined)).toBe('Bm#5');
    expect(resolveChordNameWithPreference('', [], 'G')).toBe('');
  });
});
