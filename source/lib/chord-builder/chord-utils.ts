import { Chord, Note, Interval } from '@tonaljs/tonal';

export const ALL_NOTES = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
];

export const TUNINGS: Record<string, string[]> = {
  Standard: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'],
  'Drop D': ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'],
  'Open G': ['D2', 'G2', 'D3', 'G3', 'B3', 'D4'],
  'Open D': ['D2', 'A2', 'D3', 'F#3', 'A3', 'D4'],
  'Open A': ['E2', 'A2', 'C#3', 'E3', 'A3', 'E4'],
  'Open E': ['E2', 'B2', 'E3', 'G#3', 'B3', 'E4'],
  DADGAD: ['D2', 'A2', 'D3', 'G3', 'A3', 'D4'],
  'Half Step Down': ['Eb2', 'Ab2', 'Db3', 'Gb3', 'Bb3', 'Eb4'],
  'Full Step Down': ['D2', 'G2', 'C3', 'F3', 'A3', 'D4'],
  'Drop C': ['C2', 'G2', 'C3', 'F3', 'A3', 'D4'],
  'Open C': ['C2', 'G2', 'C3', 'G3', 'C4', 'E4'],
};

export type StringState = {
  fret: number; // 0 = open, -1 = muted, 1+ = fretted position (relative to view)
  finger: number; // 0 = none, 1-4 = finger
};

export type GuitarChord = {
  strings: StringState[];
  baseFret: number;
  tuning: string[];
  barres: number[]; // relative fret positions that are barred
};

export function createEmptyChord(tuning: string[]): GuitarChord {
  return {
    strings: tuning.map(() => ({ fret: -1, finger: 0 })),
    baseFret: 1,
    tuning,
    barres: [],
  };
}

export function getNoteAtFret(openNote: string, fret: number): string {
  const interval = Interval.fromSemitones(fret);
  const result = Note.transpose(openNote, interval);
  return Note.simplify(result) || result;
}

export function getChordNotes(chord: GuitarChord): string[] {
  const notes: string[] = [];
  chord.strings.forEach((s, i) => {
    if (s.fret >= 0) {
      const actualFret = s.fret === 0 ? 0 : s.fret + chord.baseFret - 1;
      const note = getNoteAtFret(chord.tuning[i], actualFret);
      if (note) notes.push(note);
    }
  });
  return notes;
}

/**
 * Tonal may return "DM" for D major via Chord.detect(); strip the trailing
 * uppercase "M" for plain major triads so we output "D" instead of "DM".
 * Leaves compound suffixes like "Dmaj7" untouched.
 */
function normalizeMajorSymbol(name: string): string {
  const match = name.match(/^([A-G][#b]?)M$/);
  return match ? match[1] : name;
}

export function detectChordName(noteNames: string[]): string {
  if (noteNames.length === 0) return '';
  if (noteNames.length === 1) return Note.pitchClass(noteNames[0]) || noteNames[0];

  const pitchClasses = [
    ...new Set(noteNames.map((n) => Note.pitchClass(n)).filter(Boolean)),
  ] as string[];

  if (pitchClasses.length === 0) return '';
  if (pitchClasses.length === 1) return pitchClasses[0];

  const detected = Chord.detect(pitchClasses);
  if (detected.length > 0) return normalizeMajorSymbol(detected[0]);
  return pitchClasses.join(' ');
}

/**
 * True when the active notes' pitch classes are exactly the pitch classes of
 * the given chord symbol, in any inversion or octave arrangement. Compared via
 * chroma numbers so enharmonic spellings (A# vs Bb) match.
 */
export function notesMatchChordSymbol(noteNames: string[], symbol: string): boolean {
  if (!symbol || noteNames.length === 0) return false;
  const chord = Chord.get(symbol);
  if (!chord || chord.notes.length === 0) return false;
  const toChromas = (names: string[]) =>
    new Set(
      names
        .map((n) => Note.chroma(Note.pitchClass(n) || n))
        .filter((c): c is number => c !== undefined)
    );
  const noteChromas = toChromas(noteNames);
  const chordChromas = toChromas(chord.notes);
  if (noteChromas.size === 0 || chordChromas.size === 0) return false;
  if (noteChromas.size !== chordChromas.size) return false;
  for (const c of chordChromas) {
    if (!noteChromas.has(c)) return false;
  }
  return true;
}

/**
 * Decide which chord name to show and report when a preferred (intended)
 * symbol is known. Keeps the preferred symbol when the active notes are
 * exactly that chord's pitch classes in any inversion - e.g. choosing the
 * library "1st Inversion" of G (B3 D4 G4) stays "G" instead of the detector's
 * "Bm#5". Once the user edits the notes away from that pitch-class set, the
 * detected name is used again.
 */
export function resolveChordNameWithPreference(
  detectedName: string,
  noteNames: string[],
  preferredChordName?: string | null
): string {
  if (!preferredChordName || !detectedName) return detectedName;
  return notesMatchChordSymbol(noteNames, preferredChordName)
    ? preferredChordName
    : detectedName;
}

export type ChordToneInfo = {
  note: string;
  interval: string;
  intervalName: string;
  degree: string;
};

const INTERVAL_NAMES: Record<string, string> = {
  '1P': 'Root',
  '2m': 'b9',
  '2M': '9',
  '2A': '#9',
  '3m': 'm3',
  '3M': '3',
  '4P': '11',
  '4A': '#11',
  '5d': 'b5',
  '5P': '5',
  '5A': '#5',
  '6m': 'b13',
  '6M': '6/13',
  '7m': 'b7',
  '7M': '7',
};

const INTERVAL_SHORT: Record<string, string> = {
  '1P': 'R',
  '2m': 'b2',
  '2M': '2',
  '2A': '#2',
  '3m': 'b3',
  '3M': '3',
  '4P': '4',
  '4A': '#4',
  '5d': 'b5',
  '5P': '5',
  '5A': '#5',
  '6m': 'b6',
  '6M': '6',
  '7m': 'b7',
  '7M': '7',
};

export function analyzeChordTones(noteNames: string[]): {
  root: string;
  tones: ChordToneInfo[];
  chordName: string;
} | null {
  if (noteNames.length < 2) return null;

  const pitchClasses = [
    ...new Set(noteNames.map((n) => Note.pitchClass(n)).filter(Boolean)),
  ] as string[];

  if (pitchClasses.length < 2) return null;

  const detected = Chord.detect(pitchClasses);
  if (detected.length === 0) return null;

  const chordName = detected[0];
  const chord = Chord.get(chordName);
  if (!chord.tonic) return null;

  const root = chord.tonic;

  const tones: ChordToneInfo[] = pitchClasses.map((pc) => {
    const dist = Interval.distance(root, pc);
    const simplified = Interval.simplify(dist) || dist;
    return {
      note: pc,
      interval: simplified,
      intervalName: INTERVAL_NAMES[simplified] || simplified,
      degree: INTERVAL_SHORT[simplified] || simplified,
    };
  });

  tones.sort((a, b) => {
    const semiA = Interval.semitones(a.interval) ?? 0;
    const semiB = Interval.semitones(b.interval) ?? 0;
    return semiA - semiB;
  });

  return { root, tones, chordName };
}

export function noteToFrequency(note: string): number {
  return Note.freq(note) ?? 440;
}

export const INTERVAL_COLORS: Record<string, string> = {
  R: 'hsl(38, 92%, 50%)',
  b2: 'hsl(280, 60%, 55%)',
  '2': 'hsl(200, 70%, 55%)',
  '#2': 'hsl(310, 60%, 55%)',
  b3: 'hsl(170, 60%, 45%)',
  '3': 'hsl(140, 60%, 45%)',
  '4': 'hsl(200, 55%, 50%)',
  '#4': 'hsl(260, 55%, 55%)',
  b5: 'hsl(0, 60%, 50%)',
  '5': 'hsl(210, 55%, 55%)',
  '#5': 'hsl(330, 55%, 50%)',
  b6: 'hsl(340, 55%, 50%)',
  '6': 'hsl(50, 60%, 50%)',
  b7: 'hsl(25, 70%, 50%)',
  '7': 'hsl(280, 50%, 55%)',
};

export const FINGER_COLORS: Record<number, string> = {
  1: '#f59e0b',
  2: '#3b82f6',
  3: '#10b981',
  4: '#ef4444',
};

export const FINGER_LABELS: Record<number, string> = {
  0: '',
  1: '1',
  2: '2',
  3: '3',
  4: '4',
};
