/**
 * Adapter between Tonal chord symbols and react-chords.
 * Guitar: chord library API (database).
 * Ukulele: same data as @tombatossals/chords-db (loaded from /chords/ukulele.json at runtime).
 */

import type { ParsedChord } from './chordService';
import { getPianoVoicings } from './chordService';

// Shared position shape (guitar from API, ukulele from chords-db)
interface ChordsDbPosition {
  frets: number[];
  fingers?: number[];
  baseFret: number;
  barres: number[];
  capo?: boolean;
  midi?: number[];
  _source?: 'szaza';
}

interface ChordsDbChordEntry {
  key: string;
  suffix: string;
  positions: ChordsDbPosition[];
}

interface ChordsDbInstrument {
  chords: Record<string, ChordsDbChordEntry[]>;
  tunings?: { standard: string[] };
  keys?: string[];
  suffixes?: string[];
}

const UKULELE_JSON_URL = '/provenance-v2/chords/ukulele.json';

let ukuleleData: ChordsDbInstrument | null = null;
let ukuleleLoadPromise: Promise<ChordsDbInstrument> | null = null;

/** Loads ukulele chord DB once via fetch (not bundled — avoids large webpack cache strings). */
function loadUkuleleData(): Promise<ChordsDbInstrument> {
  if (ukuleleData) return Promise.resolve(ukuleleData);
  if (!ukuleleLoadPromise) {
    ukuleleLoadPromise = fetch(UKULELE_JSON_URL)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Ukulele chords: ${res.status} ${res.statusText}`);
        }
        return res.json() as Promise<ChordsDbInstrument>;
      })
      .then((data) => {
        ukuleleData = data;
        return data;
      });
  }
  return ukuleleLoadPromise;
}

/** Map Tonal tonic (e.g. "C#", "Bb") to chords-db key (e.g. "Csharp", "Bb") */
function tonicToChordsDbKey(tonic: string): string {
  const map: Record<string, string> = {
    'C#': 'Csharp',
    'D#': 'Dsharp',
    'F#': 'Fsharp',
    'G#': 'Gsharp',
    'A#': 'Asharp',
  };
  return map[tonic] ?? tonic;
}

/** Resolve Tonal tonic to a key present in chord data. Szaza uses sharps (A#, C#); we also try flat equivalents. */
function resolveChordsDbKey(tonic: string, chordKeys: string[]): string | null {
  if (chordKeys.includes(tonic)) return tonic;
  const asSharp = tonicToChordsDbKey(tonic);
  if (chordKeys.includes(asSharp)) return asSharp;
  const flatToSharp: Record<string, string> = { Bb: 'A#', Eb: 'D#', Ab: 'G#', Db: 'C#', Gb: 'F#' };
  const sharpForm = flatToSharp[tonic];
  if (sharpForm && chordKeys.includes(sharpForm)) return sharpForm;
  return null;
}

/**
 * Map Tonal chord type to chords-db suffix.
 * Tonal returns e.g. "major", "minor", "major seventh", "dominant seventh", "suspended second".
 */
function tonalTypeToChordsDbSuffix(tonalType: string): string {
  const map: Record<string, string> = {
    'major': 'major',
    'minor': 'minor',
    'diminished': 'dim',
    'diminished seventh': 'dim7',
    'suspended second': 'sus2',
    'suspended fourth': 'sus4',
    'suspended fourth seventh': '7sus4', // Tonal type for 7sus4
    'dominant seventh': '7',
    'major seventh': 'maj7',
    'minor seventh': 'm7',
    'augmented': 'aug',
    'half-diminished': 'm7b5',
    'minor major seventh': 'mmaj7',
    'sixth': '6',
    'minor sixth': 'm6',
    'ninth': '9',
    'minor ninth': 'm9',
    'major ninth': 'maj9',
    'add ninth': 'add9',
    'dominant ninth': '9',
    'eleventh': '11',
    'minor eleventh': 'm11',
    'thirteenth': '13',
    'major thirteenth': 'maj13',
    'fifth': '5',
  };
  return map[tonalType] ?? tonalType.replace(/\s+/g, '');
}

/**
 * Get chords-db suffix from parsed Tonal chord.
 * Falls back to deriving from symbol if type mapping misses.
 */
function getChordsDbSuffix(parsed: ParsedChord): string {
  const fromType = tonalTypeToChordsDbSuffix(parsed.type);
  if (fromType && fromType !== parsed.type) return fromType;
  // Fallback: strip root from normalized symbol (e.g. "Am7" -> "m7", "Cmaj7" -> "maj7")
  const sym = parsed.normalizedSymbol;
  const root = parsed.tonic.length;
  const suffix = sym.slice(root) || 'major';
  const normalized = suffix === 'M' ? 'major' : suffix === 'm' ? 'minor' : suffix.toLowerCase();
  return tonalTypeToChordsDbSuffix(parsed.type) || normalized;
}

/**
 * Szaza frets are ABSOLUTE (0 = open, n = fret n). baseFret is UI-only (where to start the grid).
 * We pass absolute frets through; convert to relative only when rendering the diagram.
 */
export function positionToReactChordsChord(position: ChordsDbPosition): {
  frets: number[];
  fingers?: number[];
  barres?: number[];
  capo?: boolean;
  baseFret?: number;
} {
  if (position._source !== 'szaza') {
    return {
      frets: position.frets,
      fingers: position.fingers,
      barres: position.barres?.length ? position.barres : undefined,
      capo: position.capo,
      baseFret: position.baseFret > 1 ? position.baseFret : undefined,
    };
  }
  // Keep absolute frets; baseFret for display only (grid start). Derive if missing.
  const frets = position.frets;
  const positiveFrets = frets.filter((f) => f > 0);
  const baseFret =
    position.baseFret > 1
      ? position.baseFret
      : positiveFrets.length > 0
        ? Math.min(...positiveFrets)
        : 1;
  return {
    frets,
    fingers: position.fingers,
    barres: position.barres?.length ? position.barres : undefined,
    capo: position.capo,
    baseFret: baseFret > 1 ? baseFret : undefined,
  };
}

/**
 * For display we never zero finger numbers: every fretted string keeps a finger (1–4) so the
 * diagram always shows a suggestion and never "string held down with no finger".
 * (We used to zero barre runs except the first string when barres were missing from API; that
 * caused empty dots. Now we only fill missing fingers and pass through.)
 */
function normalizeFingersForBarreDisplay(
  _frets: number[],
  fingers: number[]
): number[] {
  if (!fingers || fingers.length !== 6) return fingers;
  return [...fingers];
}

const BARRE_FINGER = 1;

/**
 * Fill missing finger numbers for fretted strings so the diagram always shows a suggestion.
 * - If a string has fret > 0 and finger is 0 or missing: use 1 when that fret is in barres, else assign 1–4 in order.
 * - When chord has no fingers array, build one from frets (barre frets → 1, others → 2,3,4 in order).
 */
function fillMissingFingers(
  frets: number[],
  fingers: number[] | undefined,
  barresAbsolute: number[]
): number[] {
  const barreSet = new Set(barresAbsolute);
  const out: number[] =
    fingers && fingers.length === 6
      ? [...fingers]
      : [0, 0, 0, 0, 0, 0];

  let nextFinger = 1;
  for (let i = 0; i < 6; i++) {
    if (frets[i] <= 0) continue;
    const f = out[i];
    if (f >= 1 && f <= 4) continue;
    if (barreSet.has(frets[i])) {
      out[i] = BARRE_FINGER;
    } else {
      out[i] = nextFinger <= 4 ? nextFinger : 1;
      nextFinger = nextFinger >= 4 ? 1 : nextFinger + 1;
    }
  }

  return out;
}

/** Minimum number of adjacent strings at same fret with same finger to infer a barre. */
const MIN_STRINGS_FOR_INFERRED_BARRE = 3;

/**
 * Infer barre frets from fingers: when the same finger (1–4) is on 3+ adjacent strings
 * at the same fret, treat it as a barre so the diagram draws the barre line.
 * Returns absolute fret numbers. Used only for display; does not change stored data.
 */
function inferBarresFromFingers(frets: number[], fingers: number[]): number[] {
  if (!fingers || fingers.length !== 6) return [];
  const barres: number[] = [];
  for (let finger = 1; finger <= 4; finger++) {
    const indices: number[] = [];
    for (let i = 0; i < 6; i++) {
      if (fingers[i] === finger && frets[i] > 0) indices.push(i);
    }
    indices.sort((a, b) => a - b);
    let j = 0;
    while (j < indices.length) {
      const run = [indices[j]];
      const fretAt = frets[indices[j]];
      while (j + 1 < indices.length && indices[j + 1] === indices[j] + 1 && frets[indices[j + 1]] === fretAt) {
        run.push(indices[j + 1]);
        j++;
      }
      if (run.length >= MIN_STRINGS_FOR_INFERRED_BARRE) barres.push(fretAt);
      j++;
    }
  }
  return [...new Set(barres)].sort((a, b) => a - b);
}

/**
 * Convert chord with absolute frets to react-chords display format (relative frets).
 * Use ONLY for rendering the diagram; do not use for note/pitch calculation.
 * Barres: from chord data first; then infer when same finger on 3+ adjacent strings at same fret.
 * Missing finger numbers for fretted strings are filled so every fretted note has a suggestion.
 */
const EMPTY_GUITAR_CHORD = {
  frets: [0, 0, 0, 0, 0, 0],
  fingers: undefined,
  barres: undefined,
  capo: undefined,
  baseFret: undefined,
} as const;

export function chordToReactChordsDisplayFormat(chord: {
  frets?: number[];
  fingers?: number[];
  barres?: number[];
  capo?: boolean;
  baseFret?: number;
  notes?: string[];
} | null | undefined): {
  frets: number[];
  fingers?: number[];
  barres?: number[];
  capo?: boolean;
  baseFret?: number;
} {
  if (chord == null || !Array.isArray(chord.frets) || chord.frets.length === 0) {
    return { ...EMPTY_GUITAR_CHORD, frets: [...EMPTY_GUITAR_CHORD.frets] };
  }
  const fretsNum = chord.frets.map((f) => Number(f));
  const positiveFrets = fretsNum.filter((f) => f > 0);
  const minPositive = positiveFrets.length ? Math.min(...positiveFrets) : 1;
  const maxPositive = positiveFrets.length ? Math.max(...positiveFrets) : 1;
  const requestedBase = (chord.baseFret ?? 1) > 1 ? Number(chord.baseFret) : 1;
  // Don't use baseFret 1 if chord spans above fret 3 (would push notes off the diagram).
  const baseFret = requestedBase === 1 && maxPositive > 3 ? minPositive : requestedBase;
  const relativeFrets = fretsNum.map((f) =>
    f <= 0 ? f : f - baseFret + 1
  );
  const rawBarres = chord.barres ?? [];
  const barresFromData = (Array.isArray(rawBarres) ? rawBarres : [])
    .map((b) => Number(b))
    .filter((n) => !Number.isNaN(n) && n >= 1)
    .slice()
    .sort((a, b) => a - b);
  const fingersInput = chord.fingers && chord.fingers.length === 6
    ? chord.fingers.map((f) => (f >= 1 && f <= 4 ? Number(f) : 0))
    : undefined;
  const filled = fillMissingFingers(fretsNum, fingersInput, barresFromData);
  const inferredBarres = inferBarresFromFingers(fretsNum, filled);
  const barresAbsolute = [...new Set([...barresFromData, ...inferredBarres])].sort((a, b) => a - b);
  const barresRelative = barresAbsolute
    .map((b) => b - baseFret + 1)
    .filter((b) => b >= 1)
    .filter((b) => relativeFrets.includes(b)); // only barres that exist in frets (avoids react-chords Barre crash)
  const fingers = normalizeFingersForBarreDisplay(fretsNum, filled);
  return {
    frets: relativeFrets,
    fingers,
    barres: barresRelative.length ? barresRelative : undefined,
    capo: chord.capo,
    baseFret: baseFret > 1 ? baseFret : undefined,
  };
}

export type GuitarVoicingSource = 'szaza';

export interface GuitarVoicing {
  id?: string; // from DB when using chord library API (for voicing_id linking in Phase 3)
  chord: ReturnType<typeof positionToReactChordsChord>;
  name?: string;
  source?: GuitarVoicingSource;
}

export interface UkuleleVoicing {
  chord: ReturnType<typeof positionToReactChordsChord>;
  name?: string;
}

export interface PianoVoicingForReactChords {
  frets: string[]; // note names e.g. ['C', 'E', 'G']
  name?: string;
}

/**
 * Sync guitar voicings: not supported (guitar data is async from chord library API).
 * Use getGuitarVoicingsFromDbAsync instead.
 */
export function getGuitarVoicingsFromDb(_parsed: ParsedChord): GuitarVoicing[] {
  return [];
}

/**
 * Get guitar voicings from the chord library API (database).
 */
export async function getGuitarVoicingsFromDbAsync(parsed: ParsedChord): Promise<GuitarVoicing[]> {
  try {
    const { chordLibraryApi } = await import('@/lib/api');
    const list = await chordLibraryApi.getVoicings('guitar', parsed.normalizedSymbol);
    return list.map((v) => ({
      id: v.id,
      chord: v.chord as ReturnType<typeof positionToReactChordsChord>,
      name: v.name,
      source: (v.source as GuitarVoicingSource) ?? undefined,
    }));
  } catch {
    return [];
  }
}

/**
 * Get all ukulele voicings for a parsed chord (chords-db data via /chords/ukulele.json).
 */
export async function getUkuleleVoicingsFromDbAsync(
  parsed: ParsedChord
): Promise<UkuleleVoicing[]> {
  try {
    const data = await loadUkuleleData();
    const key = resolveChordsDbKey(parsed.tonic, Object.keys(data.chords));
    if (!key) return [];

    const suffix = getChordsDbSuffix(parsed);
    const entries = data.chords[key] ?? [];
    const entry = entries.find((e) => e.suffix === suffix);
    if (!entry?.positions?.length) return [];

    return entry.positions.map((pos, i) => ({
      chord: positionToReactChordsChord(pos),
      name: entry.positions.length > 1 ? `Voicing ${i + 1}` : undefined,
    }));
  } catch {
    return [];
  }
}

/**
 * Get piano voicings for react-chords (note names without octave for display).
 * Uses existing getPianoVoicings from chordService; strips octave for react-chords Piano.
 */
export function getPianoVoicingsForReactChords(
  chordSymbol: string
): PianoVoicingForReactChords[] {
  const voicings = getPianoVoicings(chordSymbol);
  return voicings.map((v) => ({
    frets: v.notes.map((n) => n.replace(/\d+$/, '')), // "C4" -> "C"
    name: v.name,
  }));
}

/**
 * Get note names (pitch classes) from guitar frets using absolute fret numbers.
 * - -1 or muted => skip
 * - 0 => open string
 * - n > 0 => fret n (no baseFret offset).
 * Tuning defaults to standard E A D G B E (low to high).
 */
const STANDARD_TUNING = ['E', 'A', 'D', 'G', 'B', 'E'];
const CHROMA: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4, F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11,
};
const CHROMA_TO_NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function notesFromGuitarFrets(
  frets: number[],
  tuning: string[] = STANDARD_TUNING
): string[] {
  const notes: string[] = [];
  for (let i = 0; i < Math.min(frets.length, tuning.length); i++) {
    const f = frets[i];
    if (f < 0) continue; // muted
    const openChroma = CHROMA[tuning[i]];
    if (openChroma === undefined) continue;
    const chroma = (openChroma + f) % 12;
    notes.push(CHROMA_TO_NOTE[chroma] ?? 'C');
  }
  return notes;
}

/** react-chords guitar instrument config (from README) */
export const REACT_CHORDS_GUITAR = {
  strings: 6,
  fretsOnChord: 4,
  name: 'Guitar',
  keys: [],
  tunings: { standard: ['E', 'A', 'D', 'G', 'B', 'E'] },
};

/** react-chords ukulele instrument config */
export const REACT_CHORDS_UKULELE = {
  strings: 4,
  fretsOnChord: 4,
  name: 'Ukulele',
  keys: [],
  tunings: { standard: ['G', 'C', 'E', 'A'] },
};

/** react-chords piano instrument config */
export const REACT_CHORDS_PIANO = {
  name: 'Piano',
};
