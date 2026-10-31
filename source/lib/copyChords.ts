/**
 * Copy chords from one section to another by line index and token index.
 * Used by the "Copy Chords" feature in the song editor.
 */

import { songApi } from './api';
import type { Chord, Line, Section } from './types';

export interface CopyChordsResult {
  copied: number;
  skipped: number;
}

/**
 * Returns true if target line already has a chord at the same tokenId and charOffset.
 */
function targetHasChordAt(targetLine: Line, tokenId: string, charOffset: number): boolean {
  return (targetLine.chords ?? []).some(
    (c) => c.tokenId === tokenId && c.charOffset === charOffset
  );
}

/**
 * Copy chords from source section to target section.
 * Position mapping: same line index (line 0 → line 0), same token index and charOffset within line.
 * Skips chords when target line has no token at that index, or when target already has a chord at that position.
 * Preserves voicing via setChordVoicing when source chord has voicingId.
 */
export async function copyChordsFromSectionToSection(
  songId: string,
  sourceSection: Section,
  targetSection: Section
): Promise<CopyChordsResult> {
  let copied = 0;
  let skipped = 0;
  const sourceLines = sourceSection.lines ?? [];
  const targetLines = targetSection.lines ?? [];

  for (let i = 0; i < sourceLines.length; i++) {
    const sourceLine = sourceLines[i];
    const targetLine = targetLines[i];
    if (!targetLine || !sourceLine.chords?.length) continue;

    const sourceTokens = sourceLine.tokens ?? [];
    const targetTokens = targetLine.tokens ?? [];

    for (const chord of sourceLine.chords) {
      if (chord.orphaned) {
        skipped++;
        continue;
      }
      const srcTokenIndex =
        chord.tokenId != null
          ? sourceTokens.findIndex((t) => t.tokenId === chord.tokenId)
          : -1;
      if (srcTokenIndex < 0) {
        skipped++;
        continue;
      }
      const targetToken = targetTokens[srcTokenIndex];
      if (!targetToken) {
        skipped++;
        continue;
      }
      const charOffset = Math.min(chord.charOffset, targetToken.text.length);
      if (targetHasChordAt(targetLine, targetToken.tokenId, charOffset)) {
        skipped++;
        continue;
      }
      try {
        const { chordId } = await songApi.addChord(
          songId,
          targetLine.lineId,
          targetToken.tokenId,
          charOffset,
          chord.chordSymbol
        );
        copied++;
        if (chord.voicingId && chordId) {
          await songApi.setChordVoicing(songId, chordId, chord.voicingId);
        }
      } catch {
        skipped++;
      }
    }
  }

  return { copied, skipped };
}
