export type PitchClass =
  | 'C' | 'C#' | 'Db'
  | 'D' | 'D#' | 'Eb'
  | 'E'
  | 'F' | 'F#' | 'Gb'
  | 'G' | 'G#' | 'Ab'
  | 'A' | 'A#' | 'Bb'
  | 'B';

export type ChordQuality =
  | 'major'
  | 'minor'
  | 'diminished'
  | 'augmented'
  | 'suspended2'
  | 'suspended4';

export type ChordExtension =
  | '6'
  | '7'
  | 'maj7'
  | '9'
  | '11'
  | '13';

export type ChordAlteration =
  | 'b5'
  | '#5'
  | 'b9'
  | '#9'
  | 'b11'
  | '#11'
  | 'b13'
  | '#13'
  | 'add9'
  | 'add11'
  | 'add13'
  | 'no3'
  | 'no5';

export interface VoicingDefinition {
  notes: Array<{
    pitch: PitchClass;
    octave: number;
  }>;
  name?: string;
  density?: 'close' | 'open' | 'wide';
}

export interface ChordContext {
  keyRoot: PitchClass;
  keyScale:
    | 'major'
    | 'minor'
    | 'harmonic_minor'
    | 'melodic_minor'
    | 'dorian'
    | 'phrygian'
    | 'lydian'
    | 'mixolydian'
    | 'aeolian'
    | 'locrian';
  degree?: number;
  isDiatonic: boolean;
  borrowedFrom?: ChordContext['keyScale'];
  secondaryOf?: number;
}

export interface ChordMeta {
  source: 'diatonic' | 'borrowed' | 'secondary' | 'custom';
  score?: number;
  explanation?: string;
}

export interface ChordDTO {
  id?: string;
  symbol: string;
  root: PitchClass;
  quality: ChordQuality;
  extensions: ChordExtension[];
  alterations: ChordAlteration[];
  inversion: number;
  bass?: PitchClass;
  notes: PitchClass[];
  voicing?: VoicingDefinition;
  context: ChordContext;
  meta?: ChordMeta;
}

export interface ChordDTOv1 extends ChordDTO {
  _version: '1.0';
}
