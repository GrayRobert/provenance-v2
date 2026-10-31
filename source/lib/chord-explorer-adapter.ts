/**
 * Adapter between Provenance chord/song key types and the imported chord-explorer ChordDTO/SongKey.
 * Used by ChordExplorerModal to map props and callbacks.
 */

import type { ChordDTO, ChordContext, PitchClass } from '@/lib/chord-explorer/types/chordDto';
import type { SongKey } from '@/lib/chord-explorer/types/chordExplorer';
import { chordSymbolToInternalChord } from '@/lib/chord-explorer/customChords';
import { chordToChordDto } from '@/lib/chord-explorer/utils/chordDtoAdapters';
import type { Chord } from './types';

/** Provenance song key string (e.g. "C Major", "A Minor") */
export type ProvenanceSongKey = string;

/**
 * Map Provenance song key string to chord-explorer SongKey.
 * "C Major" -> { root: "C", scale: "major" }
 * "A Minor" -> { root: "A", scale: "minor" }
 */
export function provenanceSongKeyToSongKey(provenanceKey: ProvenanceSongKey): SongKey {
  const trimmed = (provenanceKey || 'C Major').trim();
  const parts = trimmed.split(/\s+/);
  const root = parts[0] || 'C';
  const scaleRaw = parts[1] || 'Major';
  const scale = scaleRaw.toLowerCase();
  return {
    root,
    scale: scale === 'minor' ? 'minor' : 'major',
  };
}

/**
 * Map chord-explorer SongKey to Provenance song key string.
 * { root: "C", scale: "major" } -> "C Major"
 */
export function songKeyToProvenanceSongKey(songKey: SongKey): ProvenanceSongKey {
  const scaleCapitalized =
    (songKey.scale || 'major').charAt(0).toUpperCase() + (songKey.scale || 'major').slice(1);
  return `${songKey.root || 'C'} ${scaleCapitalized}`;
}

/**
 * Map chord-explorer ChordDTO to a chord symbol string for Provenance API.
 * Used when persisting onInsert/onUpdate.
 */
export function chordDTOToProvenanceSymbol(dto: ChordDTO): string {
  return dto.symbol || '';
}

/**
 * Map Provenance Chord to chord-explorer ChordDTO for currentChord/previousChord.
 * Uses chord-explorer's chordSymbolToInternalChord + chordToChordDto when possible;
 * otherwise builds a minimal ChordDTO from symbol.
 */
export function provenanceChordToChordDTO(
  provenanceChord: Chord,
  songKey: ProvenanceSongKey
): ChordDTO | undefined {
  if (!provenanceChord?.chordSymbol) return undefined;

  const { root: songKeyRoot, scale: songKeyScale } = provenanceSongKeyToSongKey(songKey);
  const internalChord = chordSymbolToInternalChord(provenanceChord.chordSymbol);

  if (internalChord) {
    return chordToChordDto(internalChord, {
      songKeyRoot,
      songKeyScale,
      inversion: 0,
    });
  }

  return buildMinimalChordDTO(provenanceChord.chordSymbol, songKeyRoot, songKeyScale);
}

/**
 * Build ChordDTO from a chord symbol only (e.g. for previousChord when we only have the symbol).
 */
export function symbolToChordDTO(symbol: string, songKey: ProvenanceSongKey): ChordDTO | undefined {
  if (!symbol?.trim()) return undefined;
  const { root: songKeyRoot, scale: songKeyScale } = provenanceSongKeyToSongKey(songKey);
  const internalChord = chordSymbolToInternalChord(symbol.trim());
  if (internalChord) {
    return chordToChordDto(internalChord, {
      songKeyRoot,
      songKeyScale,
      inversion: 0,
    });
  }
  return buildMinimalChordDTO(symbol.trim(), songKeyRoot, songKeyScale);
}

function buildMinimalChordDTO(
  symbol: string,
  songKeyRoot: string,
  songKeyScale: string
): ChordDTO {
  const rootMatch = symbol.match(/^([A-G][#b]?)/);
  const root = (rootMatch ? rootMatch[1] : 'C') as PitchClass;
  const context: ChordContext = {
    keyRoot: root as PitchClass,
    keyScale: songKeyScale === 'minor' ? 'minor' : 'major',
    degree: 1,
    isDiatonic: true,
  };
  return {
    symbol,
    root,
    quality: 'major',
    extensions: [],
    alterations: [],
    inversion: 0,
    notes: [],
    context,
  };
}
