import type { SongDetail } from './types';

/** Captured before EditTabBlock so each chord can be MoveChord’d after token regeneration. */
export interface TabBlockChordAnchor {
  chordId: string;
  lineId: string;
  absoluteCharOffset: number;
}

/**
 * Collect every chord anchored on the given lines (typ. a 6-line tab block), with absolute
 * character index in the line text. Skip orphaned / missing-token chords.
 */
export function collectChordAnchorsOnTabBlockLines(
  song: SongDetail,
  blockLineIds: string[]
): TabBlockChordAnchor[] {
  const idSet = new Set(blockLineIds);
  const seen = new Set<string>();
  const out: TabBlockChordAnchor[] = [];

  for (const sec of song.sections ?? []) {
    for (const line of sec.lines ?? []) {
      if (!idSet.has(line.lineId)) continue;
      for (const chord of line.chords ?? []) {
        if (seen.has(chord.chordId)) continue;
        if (!chord.tokenId) continue;
        const tok = line.tokens?.find((t) => t.tokenId === chord.tokenId);
        if (!tok) continue;
        seen.add(chord.chordId);
        out.push({
          chordId: chord.chordId,
          lineId: line.lineId,
          absoluteCharOffset: tok.startOffset + chord.charOffset,
        });
      }
    }
  }
  return out;
}
