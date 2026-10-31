/**
 * ASCII guitar tab staff generation (six string lines).
 * Legacy tab blocks may still include a middle-dot chord guide row above the staff;
 * `isGuitarTabChordGuideLine` detects that line for editor layout.
 */

import type { GuitarChordLibraryFormat } from '@/lib/chord-builder/guitarToChordLibrary';

export type GuitarTabWidthPreset = 'small' | 'medium' | 'large';

/** Inner hyphen count per bar (between | … |). */
export const GUITAR_TAB_INNER_DASHES: Record<GuitarTabWidthPreset, number> = {
  small: 12,
  medium: 36,
  large: 75,
};

/** Standard tuning labels high → low (matches typical ASCII tab). */
export const GUITAR_TAB_STRING_LABELS = ['e', 'B', 'G', 'D', 'A', 'E'] as const;

export interface GuitarTabBlockOptions {
  barCount: number;
  widthPreset: GuitarTabWidthPreset;
}

export interface GuitarTabBlockLines {
  staffLines: string[];
}

function clampBarCount(n: number): number {
  return Math.max(1, Math.min(8, Math.floor(n)));
}

function innerWidth(preset: GuitarTabWidthPreset): number {
  return GUITAR_TAB_INNER_DASHES[preset];
}

/** Total fret-slot columns across all bars (one slot per hyphen column). */
export function guitarTabTotalSlots(barCount: number, preset: GuitarTabWidthPreset): number {
  return innerWidth(preset) * clampBarCount(barCount);
}

/**
 * True if text looks like a generated chord guide line (middle-dot slots + padding).
 * Used to apply tab-specific layout in the song editor.
 */
export function isGuitarTabChordGuideLine(text: string): boolean {
  const t = text ?? '';
  if (!t.includes('·')) return false;
  // Allow only whitespace and middle dot U+00B7
  return /^[\s·]+$/.test(t);
}

/** True if line looks like a staff row (string label + barlines + fret content). */
export function isGuitarTabStaffLine(text: string): boolean {
  const t = (text ?? '').trim();
  return /^[eBGDAE]\|.+\|$/.test(t);
}

/** High-e string row (chords align above this line in the tab editor). */
export function isGuitarTabHighEStringLine(text: string): boolean {
  return isGuitarTabStaffLine(text) && (text ?? '').trimStart().startsWith('e|');
}

function tuningLetterAtStart(text: string): string | null {
  const m = (text ?? '').trim().match(/^([eBGDAE])\|/);
  return m ? m[1]! : null;
}

/**
 * How many consecutive section lines form one visual tab block (single horizontal scroll unit).
 * Returns 7 if a chord guide row precedes six e→E staff lines, 6 if only staff, 0 otherwise.
 */
export function guitarTabStaffDisplayBlockLineCount(
  lines: { text?: string }[],
  startIndex: number
): number {
  if (startIndex < 0 || startIndex >= lines.length) return 0;
  let staffStart = startIndex;
  let prefix = 0;
  if (isGuitarTabChordGuideLine(lines[startIndex]?.text ?? '')) {
    prefix = 1;
    staffStart = startIndex + 1;
    if (staffStart + 6 > lines.length) return 0;
  } else {
    if (startIndex + 6 > lines.length) return 0;
    staffStart = startIndex;
  }
  for (let k = 0; k < 6; k++) {
    const t = lines[staffStart + k]?.text ?? '';
    if (!isGuitarTabStaffLine(t)) return 0;
    const letter = tuningLetterAtStart(t);
    if (letter !== GUITAR_TAB_STRING_LABELS[k]) return 0;
  }
  return prefix + 6;
}

/**
 * From a section’s lines and any staff line in a 6-row block, return that block’s texts and lineIds.
 * Contiguous staff lines are grouped in chunks of six (e … E); anchor picks which chunk.
 */
export function extractGuitarTabStaffBlockFromLines(
  lines: { lineId: string; text: string }[],
  anchorLineId: string
): { staffTexts: string[]; lineIds: string[] } | null {
  const anchorIdx = lines.findIndex((l) => l.lineId === anchorLineId);
  if (anchorIdx < 0) return null;

  let lo = anchorIdx;
  while (lo > 0 && isGuitarTabStaffLine(lines[lo - 1]?.text ?? '')) lo--;
  let hi = anchorIdx;
  while (hi < lines.length - 1 && isGuitarTabStaffLine(lines[hi + 1]?.text ?? '')) hi++;

  const contiguous: { lineId: string; text: string }[] = [];
  for (let i = lo; i <= hi; i++) {
    const L = lines[i];
    if (L && isGuitarTabStaffLine(L.text ?? '')) contiguous.push(L);
  }
  if (contiguous.length === 0) return null;

  const anchorPos = contiguous.findIndex((l) => l.lineId === anchorLineId);
  if (anchorPos < 0) return null;

  const blockStart = Math.floor(anchorPos / 6) * 6;
  if (blockStart + 6 > contiguous.length) return null;

  const slice = contiguous.slice(blockStart, blockStart + 6);
  for (let i = 0; i < 6; i++) {
    const letter = tuningLetterAtStart(slice[i]!.text);
    if (letter !== GUITAR_TAB_STRING_LABELS[i]) return null;
  }

  return {
    staffTexts: slice.map((l) => l.text ?? ''),
    lineIds: slice.map((l) => l.lineId),
  };
}

export interface ParsedGuitarTabFromStaff {
  barCount: number;
  widthPreset: GuitarTabWidthPreset;
  grid: string[][];
}

/**
 * Parse six serialized staff lines (as produced by the tab modal) back into bar count, width preset, and grid.
 */
export function parseGuitarTabStaffLinesToGrid(staffLines: string[]): ParsedGuitarTabFromStaff | null {
  if (!staffLines || staffLines.length !== 6) return null;

  let barCount = 0;
  let innerW = 0;
  const rows: string[][] = [];

  for (let r = 0; r < 6; r++) {
    const trimmed = (staffLines[r] ?? '').trim();
    const letter = tuningLetterAtStart(trimmed);
    if (letter !== GUITAR_TAB_STRING_LABELS[r]) return null;

    const m = trimmed.match(/^.\|(.+)\|$/);
    if (!m) return null;
    const inner = m[1]!;
    const segments = inner.split('|').filter((s) => s.length > 0);
    if (segments.length === 0) return null;

    if (r === 0) {
      barCount = segments.length;
      innerW = segments[0]!.length;
      if (innerW !== 12 && innerW !== 36 && innerW !== 75) return null;
      if (barCount < 1 || barCount > 8) return null;
    } else if (segments.length !== barCount) {
      return null;
    }

    const row: string[] = [];
    for (const seg of segments) {
      const norm = seg.padEnd(innerW, '-').slice(0, innerW);
      for (let i = 0; i < norm.length; i++) {
        row.push(norm[i]!);
      }
    }
    rows.push(row);
  }

  const widthPreset: GuitarTabWidthPreset =
    innerW === 12 ? 'small' : innerW === 36 ? 'medium' : 'large';

  return {
    barCount: clampBarCount(barCount),
    widthPreset,
    grid: rows,
  };
}

/**
 * Build one staff line for a tuning letter and N bars of fixed inner width.
 */
export function buildGuitarTabStaffRow(
  tuningLabel: string,
  barCount: number,
  preset: GuitarTabWidthPreset,
  innerCharsPerBar?: string[]
): string {
  const n = clampBarCount(barCount);
  const w = innerWidth(preset);
  const label = tuningLabel.length === 1 ? tuningLabel : tuningLabel.slice(0, 1);
  let body = '';
  for (let b = 0; b < n; b++) {
    const slice =
      innerCharsPerBar && innerCharsPerBar[b] !== undefined
        ? innerCharsPerBar[b].padEnd(w, '-').slice(0, w)
        : '-'.repeat(w);
    body += slice + '|';
  }
  return `${label}|${body}`;
}

export function generateGuitarTabBlock(options: GuitarTabBlockOptions): GuitarTabBlockLines {
  const barCount = clampBarCount(options.barCount);
  const preset = options.widthPreset;
  const staffLines = GUITAR_TAB_STRING_LABELS.map((tuning) =>
    buildGuitarTabStaffRow(tuning, barCount, preset)
  );
  return { staffLines };
}

/** Empty grid: 6 rows × (innerWidth * barCount) columns filled with '-'. */
export function createEmptyGuitarTabGrid(barCount: number, preset: GuitarTabWidthPreset): string[][] {
  const cols = guitarTabTotalSlots(barCount, preset);
  const rows = GUITAR_TAB_STRING_LABELS.length;
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => '-'));
}

/**
 * Resize the in-memory grid when changing width preset (e.g. Small → Medium) without losing bar content.
 * Each bar’s first min(oldInner, newInner) columns are copied; wider bars are padded with rests.
 * Narrowing truncates trailing columns per bar.
 */
export function migrateGuitarTabGridToPreset(
  grid: string[][],
  barCount: number,
  fromPreset: GuitarTabWidthPreset,
  toPreset: GuitarTabWidthPreset
): string[][] {
  const n = clampBarCount(barCount);
  if (fromPreset === toPreset) {
    return normalizeGuitarTabGrid(grid, n, fromPreset);
  }
  const oldW = innerWidth(fromPreset);
  const newW = innerWidth(toPreset);
  const normalized = normalizeGuitarTabGrid(grid, n, fromPreset);
  const out = createEmptyGuitarTabGrid(n, toPreset);
  const rows = GUITAR_TAB_STRING_LABELS.length;
  for (let r = 0; r < rows; r++) {
    const src = normalized[r] ?? [];
    for (let b = 0; b < n; b++) {
      const copyLen = Math.min(oldW, newW);
      for (let i = 0; i < copyLen; i++) {
        const ch = src[b * oldW + i];
        out[r]![b * newW + i] = ch === undefined || ch === '' ? '-' : ch.slice(0, 1);
      }
    }
  }
  return out;
}

/**
 * Change bar count without changing width preset: keep overlapping bars, pad with rests when adding bars,
 * drop trailing bars when reducing count.
 */
export function migrateGuitarTabGridToBarCount(
  grid: string[][],
  fromBarCount: number,
  toBarCount: number,
  preset: GuitarTabWidthPreset
): string[][] {
  const oldN = clampBarCount(fromBarCount);
  const newN = clampBarCount(toBarCount);
  if (oldN === newN) {
    return normalizeGuitarTabGrid(grid, newN, preset);
  }
  const w = innerWidth(preset);
  const normalized = normalizeGuitarTabGrid(grid, oldN, preset);
  const out = createEmptyGuitarTabGrid(newN, preset);
  const barsToCopy = Math.min(oldN, newN);
  const rows = GUITAR_TAB_STRING_LABELS.length;
  for (let r = 0; r < rows; r++) {
    const src = normalized[r] ?? [];
    for (let b = 0; b < barsToCopy; b++) {
      for (let i = 0; i < w; i++) {
        const ch = src[b * w + i];
        out[r]![b * w + i] = ch === undefined || ch === '' ? '-' : ch.slice(0, 1);
      }
    }
  }
  return out;
}

/**
 * Serialize a filled grid to the same staff line format as generateGuitarTabBlock.
 */
export function serializeGuitarTabGridToStaff(
  grid: string[][],
  barCount: number,
  preset: GuitarTabWidthPreset
): string[] {
  const n = clampBarCount(barCount);
  const w = innerWidth(preset);
  return GUITAR_TAB_STRING_LABELS.map((tuning, rowIdx) => {
    const row = grid[rowIdx] ?? [];
    const innerParts: string[] = [];
    for (let b = 0; b < n; b++) {
      let part = '';
      for (let i = 0; i < w; i++) {
        const c = row[b * w + i];
        part += c === undefined || c === '' ? '-' : c.slice(0, 1);
      }
      innerParts.push(part);
    }
    return buildGuitarTabStaffRow(tuning, n, preset, innerParts);
  });
}

/** Validate grid dimensions; pads or truncates rows to expected column count. */
export function normalizeGuitarTabGrid(
  grid: string[][],
  barCount: number,
  preset: GuitarTabWidthPreset
): string[][] {
  const cols = guitarTabTotalSlots(barCount, preset);
  const rows = GUITAR_TAB_STRING_LABELS.length;
  const out: string[][] = [];
  for (let r = 0; r < rows; r++) {
    const src = grid[r] ?? [];
    const row: string[] = [];
    for (let c = 0; c < cols; c++) {
      const ch = src[c];
      row.push(ch === undefined || ch === '' ? '-' : ch.slice(0, 1));
    }
    out.push(row);
  }
  return out;
}

/** Library fret order: index 0 = low E, 5 = high e (matches `guitarChordToLibraryFormat`). */
export function guitarLibraryStringIndexToTabRow(libIndex: number): number {
  return 5 - libIndex;
}

/** One cell’s worth of ASCII tab text: muted `x`, open `0`, otherwise digits (two chars for frets 10+). */
export function guitarFretToTabCellChars(fret: number): string {
  if (fret < 0) return 'x';
  if (fret === 0) return '0';
  return String(fret);
}

function normalizeFretsSix(frets: number[]): number[] {
  const f = frets.slice(0, 6);
  while (f.length < 6) f.push(-1);
  return f;
}

/**
 * Map an absolute character index in the high-e staff line to a grid column (0-based across all bars).
 * Returns null if the index falls on a barline, label, or outside inner segments.
 */
export function staffHighECharIndexToGridColumn(highELineText: string, charIndex: number): number | null {
  const lead = highELineText.match(/^\s*/)?.[0]?.length ?? 0;
  const body = highELineText.slice(lead);
  if (!body.startsWith('e|')) return null;
  const lastBarClose = body.lastIndexOf('|');
  if (lastBarClose < 3) return null;
  const inner = body.slice(2, lastBarClose);
  const segments = inner.split('|').filter((s) => s.length > 0);
  if (segments.length === 0) return null;
  const innerW = segments[0]!.length;
  if (innerW !== 12 && innerW !== 36 && innerW !== 75) return null;

  let pos = lead + 2;
  for (let bi = 0; bi < segments.length; bi++) {
    const seg = segments[bi]!;
    const segStart = pos;
    const segEnd = pos + seg.length;
    if (charIndex >= segStart && charIndex < segEnd) {
      const within = charIndex - segStart;
      return bi * innerW + within;
    }
    pos = segEnd + 1;
  }
  return null;
}

/** True if every cell this voicing would occupy is still the rest character `-`. */
export function canPlaceGuitarVoicingInColumn(grid: string[][], col: number, fretsSix: number[]): boolean {
  const cols = grid[0]?.length ?? 0;
  if (cols <= 0) return false;
  const f = normalizeFretsSix(fretsSix);
  for (let lib = 0; lib < 6; lib++) {
    const r = guitarLibraryStringIndexToTabRow(lib);
    const cell = guitarFretToTabCellChars(f[lib]!);
    for (let k = 0; k < cell.length; k++) {
      const c = col + k;
      if (c >= cols) return false;
      const ch = grid[r]?.[c];
      if (ch !== '-') return false;
    }
  }
  return true;
}

export function applyGuitarVoicingToGridColumn(grid: string[][], col: number, fretsSix: number[]): string[][] {
  const out = grid.map((row) => [...row]);
  const f = normalizeFretsSix(fretsSix);
  for (let lib = 0; lib < 6; lib++) {
    const r = guitarLibraryStringIndexToTabRow(lib);
    const cell = guitarFretToTabCellChars(f[lib]!);
    for (let k = 0; k < cell.length; k++) {
      out[r]![col + k] = cell[k]!;
    }
  }
  return out;
}

/**
 * If the click is on a free vertical column, write the voicing into the six staff lines and return new text.
 * Otherwise returns null (caller keeps staff unchanged).
 */
export function tryApplyGuitarChordVoicingToStaffLines(
  staffLines: string[],
  highEAbsoluteCharIndex: number,
  voicing: GuitarChordLibraryFormat
): { newStaffLines: string[]; barCount: number; widthPreset: GuitarTabWidthPreset } | null {
  const parsed = parseGuitarTabStaffLinesToGrid(staffLines);
  if (!parsed) return null;
  const highE = staffLines[0] ?? '';
  const col = staffHighECharIndexToGridColumn(highE, highEAbsoluteCharIndex);
  if (col == null) return null;
  const frets = voicing.frets ?? [];
  if (!canPlaceGuitarVoicingInColumn(parsed.grid, col, frets)) return null;
  const nextGrid = applyGuitarVoicingToGridColumn(parsed.grid, col, frets);
  const norm = normalizeGuitarTabGrid(nextGrid, parsed.barCount, parsed.widthPreset);
  const newStaffLines = serializeGuitarTabGridToStaff(norm, parsed.barCount, parsed.widthPreset);
  return {
    newStaffLines,
    barCount: parsed.barCount,
    widthPreset: parsed.widthPreset,
  };
}
