import type { GuitarChord } from './chord-utils';

/**
 * Chord library / API format: absolute frets, fingers, barres, baseFret.
 * Used for user voicings and for loading library voicings into the builder.
 */
export interface GuitarChordLibraryFormat {
  frets: number[];
  fingers?: number[];
  barres?: number[];
  baseFret?: number;
}

/**
 * Convert Chord Builder GuitarChord (relative frets 1..5, relative barres) to library format (absolute frets).
 * - Fret -1 = muted, 0 = open, 1+ = relative view fret -> absolute = baseFret + fret - 1.
 * - Barres are relative -> absolute = baseFret + barre - 1.
 */
export function guitarChordToLibraryFormat(chord: GuitarChord): GuitarChordLibraryFormat {
  const frets = chord.strings.map((s) => {
    if (s.fret < 0) return -1;
    if (s.fret === 0) return 0;
    return chord.baseFret + s.fret - 1;
  });
  const fingers = chord.strings.map((s) => s.finger).filter((f) => f >= 1 && f <= 4);
  const fingersPadded =
    fingers.length === 6 ? fingers : [...chord.strings.map((s) => (s.fret >= 0 ? s.finger : 0))];
  const barresAbsolute = chord.barres.map((b) => chord.baseFret + b - 1);
  return {
    frets,
    fingers: fingersPadded.length === 6 ? fingersPadded : undefined,
    barres: barresAbsolute.length > 0 ? barresAbsolute : undefined,
    baseFret: chord.baseFret,
  };
}

/**
 * Convert library format (absolute frets) to Chord Builder GuitarChord (relative frets, standard tuning).
 * Used when loading a quick-select voicing into the builder.
 */
export function libraryFormatToGuitarChord(
  data: GuitarChordLibraryFormat,
  tuning: string[] = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4']
): GuitarChord {
  const frets = data.frets ?? [];
  const fingers = data.fingers ?? [];
  const positiveFrets = frets.filter((f) => f > 0);
  const requestedBase =
    data.baseFret ?? (positiveFrets.length > 0 ? Math.min(...positiveFrets) : 1);
  // If chord is within first 3 frets, show base fret 1 (nut + 1st fret visible), same as chord charts.
  const maxPositive = positiveFrets.length ? Math.max(...positiveFrets) : 1;
  const baseFret = maxPositive <= 3 ? 1 : requestedBase;
  const relativeFrets = frets.map((f) => {
    if (f < 0) return -1;
    if (f === 0) return 0;
    return f - baseFret + 1;
  });
  const barresRelative =
    data.barres?.map((b) => b - baseFret + 1).filter((b) => b >= 1 && b <= 5) ?? [];
  const strings = relativeFrets.slice(0, tuning.length).map((fret, i) => ({
    fret,
    finger: fingers[i] ?? (fret >= 0 ? 1 : 0),
  }));
  while (strings.length < tuning.length) {
    strings.push({ fret: -1, finger: 0 });
  }
  return {
    strings,
    baseFret,
    tuning,
    barres: barresRelative,
  };
}
