/**
 * ASCII measure rows for instrumental / rhythm notation (editable lyric lines with chord alignment).
 * Spacing is intentional: each beat cell ends with a trailing space so the grid stays even in monospace.
 *
 * More than two bars are split into multiple lines (two bars per line). Continuation lines use a
 * leading `  | ` so the barline aligns under the `:` in `||:` on the first line; only the last
 * line ends with `:||`. Intermediate lines end with `|`.
 */

export type MeasureSubdivision = 'beat' | 'ampersand' | 'sixteenth' | 'triplet';

export interface InstrumentalMeasureRowOptions {
  /** Total bars (1–8). Rendered two bars per text line (last line may have one bar). */
  barCount: number;
  /** Beats per bar (2–12). Beat numbers are 1..beatsPerBar in each bar. */
  beatsPerBar: number;
  subdivision: MeasureSubdivision;
}

function beatCell(subdivision: MeasureSubdivision, beatNumber: number): string {
  const n = String(beatNumber);
  switch (subdivision) {
    case 'beat':
      return `${n} . . . `;
    case 'ampersand':
      return `${n} . & . `;
    case 'sixteenth':
      return `${n} e & a `;
    case 'triplet':
      return `${n} + a `;
    default: {
      const _exhaustive: never = subdivision;
      return _exhaustive;
    }
  }
}

function buildBar(beatsPerBar: number, subdivision: MeasureSubdivision): string {
  let bar = '';
  for (let b = 1; b <= beatsPerBar; b++) {
    bar += beatCell(subdivision, b);
  }
  return bar;
}

/**
 * Returns one or more newline-separated measure lines (two bars per line when possible).
 * Example 4 bars, 4/4, beat — two lines with continuation indent:
 * ```
 * ||: 1 . . . 2 . . . 3 . . . 4 . . . | 1 . . . 2 . . . 3 . . . 4 . . . |
 *   | 1 . . . 2 . . . 3 . . . 4 . . . | 1 . . . 2 . . . 3 . . . 4 . . . :||
 * ```
 */
export function generateInstrumentalMeasureRowAscii(options: InstrumentalMeasureRowOptions): string {
  const barCount = Math.max(1, Math.min(8, Math.floor(options.barCount)));
  const beatsPerBar = Math.max(2, Math.min(12, Math.floor(options.beatsPerBar)));
  const sub = options.subdivision;

  const numRows = Math.ceil(barCount / 2);
  const rows: string[] = [];

  for (let r = 0; r < numRows; r++) {
    const leftIndex = r * 2;
    const hasRightBar = leftIndex + 1 < barCount;
    const isLastRow = r === numRows - 1;

    let line = r === 0 ? '||: ' : '  | ';
    line += buildBar(beatsPerBar, sub);
    if (hasRightBar) {
      line += '| ';
      line += buildBar(beatsPerBar, sub);
    }
    line += isLastRow ? ':||' : '|';
    rows.push(line);
  }

  return rows.join('\n');
}

export const MEASURE_SUBDIVISION_LABELS: Record<MeasureSubdivision, string> = {
  beat: 'Beat',
  ampersand: '&',
  sixteenth: '16th',
  triplet: 'Triplet',
};

/** True for ASCII measure rows from {@link generateInstrumentalMeasureRowAscii} (first or continuation line). */
export function isInstrumentalMeasureAsciiLine(text: string | undefined): boolean {
  if (text == null) return false;
  const trimmed = text.trim();
  if (trimmed.startsWith('||:')) return true;
  return /^\s+\|\s/.test(text);
}

const CELL_HEAD: Record<MeasureSubdivision, RegExp> = {
  beat: /^(\d+) \. \. \.\s*/,
  ampersand: /^(\d+) \. & \.\s*/,
  sixteenth: /^(\d+) e & a\s*/,
  triplet: /^(\d+) \+ a\s*/,
};

function parseBarBeatCount(barRaw: string, sub: MeasureSubdivision): number | null {
  let s = barRaw.trimStart();
  let beats = 0;
  const re = CELL_HEAD[sub];
  while (s.length > 0) {
    const m = s.match(re);
    if (!m) return null;
    s = s.slice(m[0].length);
    beats += 1;
  }
  if (beats < 2 || beats > 12) return null;
  return beats;
}

/** Split a measure block (from {@link generateInstrumentalMeasureRowAscii}) into per-bar content strings. */
export function extractBarsFromMeasureAsciiBlock(lines: string[]): string[] {
  if (lines.length === 0) return [];
  const bars: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    let t = lines[i]!.trimEnd();
    if (i === 0) {
      const open = t.match(/^\|\|:\s*(.*)$/);
      if (!open) return [];
      t = open[1]!.trimEnd();
    } else {
      const cont = t.match(/^\s*\|\s+(.*)$/);
      if (!cont) return [];
      t = cont[1]!.trimEnd();
    }
    if (i === lines.length - 1) {
      t = t.replace(/:?\|\|\s*$/, '').trimEnd();
    } else {
      t = t.replace(/\|\s*$/, '').trimEnd();
    }
    const parts = t
      .split('|')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    bars.push(...parts);
  }
  return bars;
}

/**
 * Best-effort parse of a measure block back to options used by {@link generateInstrumentalMeasureRowAscii}.
 * Returns null if the text does not match the generator pattern (e.g. hand-edited).
 */
export function parseInstrumentalMeasureRowFromBlock(lines: string[]): InstrumentalMeasureRowOptions | null {
  const bars = extractBarsFromMeasureAsciiBlock(lines);
  if (bars.length < 1 || bars.length > 8) return null;
  const first = bars[0]!;
  const subs: MeasureSubdivision[] = ['beat', 'ampersand', 'sixteenth', 'triplet'];
  for (const sub of subs) {
    const bpb = parseBarBeatCount(first, sub);
    if (bpb == null) continue;
    const same = bars.every((b) => parseBarBeatCount(b, sub) === bpb);
    if (same) {
      return { barCount: bars.length, beatsPerBar: bpb, subdivision: sub };
    }
  }
  return null;
}

/** Consecutive measure lines to wrap in one horizontal scroll container. */
export function instrumentalMeasureBlockLineCount(
  lines: { text?: string }[],
  startIndex: number
): number {
  if (startIndex >= lines.length || !isInstrumentalMeasureAsciiLine(lines[startIndex]?.text)) {
    return 0;
  }
  let j = startIndex;
  while (j < lines.length && isInstrumentalMeasureAsciiLine(lines[j]?.text)) {
    j += 1;
  }
  return j - startIndex;
}
