/**
 * Pure immutable updaters for local song state (optimistic updates).
 * Each returns a new SongDetail; does not mutate input.
 */

import type { Chord, Line, Section, SongDetail, Token } from './types';

/**
 * Generate client-side tokens from line text.
 * Tokens are words split by whitespace; IDs are client-generated (line-scoped).
 * Server will replace these with canonical tokens on sync.
 */
function generateClientTokens(lineId: string, text: string): Token[] {
  if (!text || text.trim() === '') return [];
  
  const tokens: Token[] = [];
  const regex = /\S+/g;
  let match: RegExpExecArray | null;
  let tokenIndex = 0;
  
  while ((match = regex.exec(text)) !== null) {
    tokens.push({
      tokenId: `${lineId}_client_${tokenIndex}`,
      text: match[0],
      tokenIndex,
      startOffset: match.index,
      endOffset: match.index + match[0].length,
    });
    tokenIndex++;
  }
  
  return tokens;
}

export function applySetTitle(song: SongDetail, title: string): SongDetail {
  return { ...song, title };
}

export function applyAddSection(
  song: SongDetail,
  sectionId: string,
  sectionType: string,
  label: string
): SongDetail {
  const orderIndex = song.sections.length;
  const newSection: Section = {
    sectionId,
    sectionType,
    label,
    orderIndex,
    lines: [],
  };
  return { ...song, sections: [...song.sections, newSection] };
}

export function applyEditSection(
  song: SongDetail,
  sectionId: string,
  sectionType: string,
  label: string
): SongDetail {
  return {
    ...song,
    sections: song.sections.map((s) =>
      s.sectionId === sectionId ? { ...s, sectionType, label } : s
    ),
  };
}

export function applyArchiveSection(song: SongDetail, sectionId: string): SongDetail {
  return { ...song, sections: song.sections.filter((s) => s.sectionId !== sectionId) };
}

export function applyRepositionSection(
  song: SongDetail,
  sectionId: string,
  newOrderIndex: number
): SongDetail {
  const sections = [...song.sections];
  const idx = sections.findIndex((s) => s.sectionId === sectionId);
  if (idx < 0) return song;
  const [moved] = sections.splice(idx, 1);
  const insertAt = Math.max(0, Math.min(newOrderIndex, sections.length));
  sections.splice(insertAt, 0, moved);
  const reordered = sections.map((sec, i) => ({ ...sec, orderIndex: i }));
  return { ...song, sections: reordered };
}

export function applyAddLine(
  song: SongDetail,
  sectionId: string,
  lineId: string,
  text: string
): SongDetail {
  return {
    ...song,
    sections: song.sections.map((sec) => {
      if (sec.sectionId !== sectionId) return sec;
      const orderIndex = sec.lines?.length ?? 0;
      const newLine: Line = {
        lineId,
        text,
        orderIndex,
        tokens: generateClientTokens(lineId, text),
        chords: [],
      };
      return { ...sec, lines: [...(sec.lines ?? []), newLine] };
    }),
  };
}

/** Build stable line IDs for a measure-row replace (reuse old IDs, new UUIDs for extra rows). */
export function buildMeasureReplaceLineSpecs(
  oldLineIdsInOrder: string[],
  newTexts: string[]
): { lineId: string; text: string }[] {
  return newTexts.map((text, i) => ({
    lineId: i < oldLineIdsInOrder.length ? oldLineIdsInOrder[i]! : crypto.randomUUID(),
    text,
  }));
}

/**
 * Replace a contiguous block of lines with new measure rows. `specs` must be from
 * {@link buildMeasureReplaceLineSpecs} so client IDs match queued commands.
 */
export function applyReplaceMeasureBlock(
  song: SongDetail,
  sectionId: string,
  oldLineIdsInOrder: string[],
  specs: { lineId: string; text: string }[]
): SongDetail {
  return {
    ...song,
    sections: song.sections.map((sec) => {
      if (sec.sectionId !== sectionId) return sec;
      const lines = [...(sec.lines ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
      const start = lines.findIndex((l) => l.lineId === oldLineIdsInOrder[0]);
      if (start < 0) return sec;
      for (let k = 0; k < oldLineIdsInOrder.length; k++) {
        if (lines[start + k]?.lineId !== oldLineIdsInOrder[k]) return sec;
      }
      const oldLinesById = new Map(lines.map((l) => [l.lineId, l]));
      const head = lines.slice(0, start);
      const tail = lines.slice(start + oldLineIdsInOrder.length);
      const middle: Line[] = specs.map(({ lineId, text }) => {
        const prev = oldLinesById.get(lineId);
        if (prev) {
          return {
            ...prev,
            text,
            tokens: generateClientTokens(lineId, text),
          };
        }
        return {
          lineId,
          text,
          orderIndex: 0,
          tokens: generateClientTokens(lineId, text),
          chords: [],
        };
      });
      const merged = [...head, ...middle, ...tail];
      return { ...sec, lines: merged.map((l, i) => ({ ...l, orderIndex: i })) };
    }),
  };
}

export function applyEditLine(
  song: SongDetail,
  lineId: string,
  text: string
): SongDetail {
  return {
    ...song,
    sections: song.sections.map((sec) => ({
      ...sec,
      lines: (sec.lines ?? []).map((l) =>
        l.lineId === lineId
          ? { ...l, text, tokens: generateClientTokens(lineId, text) }
          : l
      ),
    })),
  };
}

export function applyArchiveLine(song: SongDetail, lineId: string): SongDetail {
  return {
    ...song,
    sections: song.sections.map((sec) => ({
      ...sec,
      lines: (sec.lines ?? []).filter((l) => l.lineId !== lineId),
    })),
  };
}

export function applyAddChord(
  song: SongDetail,
  lineId: string,
  chordId: string,
  tokenId: string | null,
  charOffset: number,
  chordSymbol: string
): SongDetail {
  const newChord: Chord = {
    chordId,
    tokenId,
    charOffset,
    chordSymbol,
    orphaned: false,
  };
  return {
    ...song,
    sections: song.sections.map((sec) => ({
      ...sec,
      lines: (sec.lines ?? []).map((l) => {
        if (l.lineId !== lineId) return l;
        return { ...l, chords: [...(l.chords ?? []), newChord] };
      }),
    })),
  };
}

export function applyEditChord(
  song: SongDetail,
  chordId: string,
  symbol: string
): SongDetail {
  return {
    ...song,
    sections: song.sections.map((sec) => ({
      ...sec,
      lines: (sec.lines ?? []).map((l) => ({
        ...l,
        chords: (l.chords ?? []).map((c) =>
          c.chordId === chordId ? { ...c, chordSymbol: symbol } : c
        ),
      })),
    })),
  };
}

export function applyRemoveChord(song: SongDetail, chordId: string): SongDetail {
  return {
    ...song,
    sections: song.sections.map((sec) => ({
      ...sec,
      lines: (sec.lines ?? []).map((l) => ({
        ...l,
        chords: (l.chords ?? []).filter((c) => c.chordId !== chordId),
      })),
    })),
  };
}

export function applyMoveChord(
  song: SongDetail,
  chordId: string,
  newTokenId: string,
  newCharOffset: number
): SongDetail {
  return {
    ...song,
    sections: song.sections.map((sec) => ({
      ...sec,
      lines: (sec.lines ?? []).map((l) => ({
        ...l,
        chords: (l.chords ?? []).map((c) =>
          c.chordId === chordId
            ? { ...c, tokenId: newTokenId, charOffset: newCharOffset }
            : c
        ),
      })),
    })),
  };
}

export function applySetChordVoicing(
  song: SongDetail,
  chordId: string,
  voicingId: string | null
): SongDetail {
  return {
    ...song,
    sections: song.sections.map((sec) => ({
      ...sec,
      lines: (sec.lines ?? []).map((l) => ({
        ...l,
        chords: (l.chords ?? []).map((c) =>
          c.chordId === chordId ? { ...c, voicingId: voicingId ?? undefined } : c
        ),
      })),
    })),
  };
}

/** After a line edit, map an absolute character index into token id + offset within that token. */
export function tokenAtAbsoluteCharOffset(
  line: Pick<Line, 'tokens'> | undefined,
  absoluteOffset: number
): { tokenId: string; charOffsetInToken: number } | null {
  const tokens = line?.tokens ?? [];
  for (const t of tokens) {
    if (absoluteOffset >= t.startOffset && absoluteOffset < t.endOffset) {
      return { tokenId: t.tokenId, charOffsetInToken: absoluteOffset - t.startOffset };
    }
  }
  return null;
}

export function withRegeneratedTokens(line: Line, text: string): Line {
  return { ...line, text, tokens: generateClientTokens(line.lineId, text) };
}
