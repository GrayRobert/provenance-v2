/**
 * Playback Style Type Definitions
 * 
 * Based on the schema defined in chord-player-style-analysis-and-schema.md
 * This schema preserves Chord Player's musical strengths (degree-based patterns,
 * separation of bass/chord roles) while addressing structural weaknesses.
 */

import type { Chord } from '../harmonizer';
import type { Scale } from '../scales';

/**
 * Groove type: how subdivisions are felt (affects swing and accent).
 * - straight: even eighths/sixteenths
 * - swing: delayed offbeat eighths (jazz, shuffle)
 * - triplet: triplet subdivision (6/8, 12/8)
 * - shuffle: dotted eighth + sixteenth feel
 */
export type GrooveKind = 'straight' | 'swing' | 'triplet' | 'shuffle';

/**
 * Feel configuration for swing, groove, accents and timing variations
 */
export interface Feel {
  /** 0-1, amount of swing. ~0.6 = 60%, ~0.66 = 66% (triplet) for jazz. */
  swing?: number;
  /** 'eighth' = delay offbeat eighths; 'beat' = delay even beats only. Default 'eighth'. */
  swingMode?: 'beat' | 'eighth';
  /** Groove feel; interpreter applies meter-appropriate timing (e.g. no swing in 6/8 unless triplet). */
  groove?: GrooveKind;
  /** -1 to 1, laid-back to pushed timing bias (shifts note times slightly). */
  push?: number;
  /** 0-1, overall accent strength. */
  accentWeighting?: number;
  /** Per-beat velocity multipliers (length = timing beats per bar). e.g. [1, 0.7, 0.6] for waltz. */
  accentPattern?: number[];
  /** If true, apply small random timing and velocity variation for humanisation. */
  humanise?: boolean;
  /** Humanisation strength 0-1 (default 0.15). */
  humaniseAmount?: number;
}

/**
 * Style overrides - allows styles to override or lock playback controls
 */
export interface StyleOverrides {
  tempo?: {
    value?: number; // Override tempo (BPM)
    lock?: boolean; // Lock tempo control (disable user changes)
  };
  timeSignature?: {
    value?: [number, number]; // Override time signature [beats, noteValue]
    lock?: boolean; // Lock time signature control
  };
  sustain?: {
    value?: boolean; // Override sustain pedal state
    lock?: boolean; // Lock sustain control
  };
  rootBass?: {
    value?: boolean; // Override root bass state
    lock?: boolean; // Lock root bass control
  };
  humanise?: {
    value?: boolean; // Override humanise state
    lock?: boolean; // Lock humanise control
  };
  inversion?: {
    value?: number; // Override inversion (0 = root position)
    lock?: boolean; // Lock inversion control
  };
  /** Octave offset for chord playback: -3 to +3. 0 = no change, 1 = one octave up, -1 = one octave down. */
  octaveOffset?: {
    value?: number;
    lock?: boolean; // Lock octave control
  };
}

/**
 * Meter constraint - style is valid only for these time signatures
 * Omit → meter-agnostic. Present → valid ONLY when current time sig matches.
 */
export interface MeterConstraint {
  beatsPerBar: number[];
}

/**
 * Style definition - container for independent musical layers
 */
export interface Style {
  id: string;
  name: string;
  meterConstraint?: MeterConstraint;
  feel?: Feel;
  layers: Layer[];
  overrides?: StyleOverrides; // Optional style-specific overrides and locks
}

/**
 * Layer - represents a musical role (chord or bass)
 * Each layer is independent and does not coordinate with others
 */
export interface Layer {
  id: string;
  role: 'chord' | 'bass';
  pattern: Pattern;
  voicing?: VoicingPolicy;
  articulation?: Articulation;
}

import type { MeterKey } from './chordProgression';

export type { MeterKey };

/**
 * Pattern - describes temporal intent, not pitch.
 * Steps are bar-relative (0-1). Optional stepsByMeter provides meter-specific steps
 * so 3/4 and 6/8 can have correct grids (e.g. 3 beats, 6 pulses) instead of 4/4-centric offsets.
 */
export interface Pattern {
  resolution: 'slice' | 'bar';
  timingMode?: 'relative' | 'absoluteBar';
  overflow?: 'truncate' | 'spill';
  /** Default steps (bar fraction 0-1). Used when no stepsByMeter match current time sig. */
  steps: Step[];
  /** Meter-specific steps. When present for current time sig, used instead of steps. */
  stepsByMeter?: Partial<Record<MeterKey, Step[]>>;
}

/**
 * Step - defines decision points, not fixed notes
 */
export interface Step {
  offset: number; // 0-1 for relative timing, beat number for absoluteBar
  duration?: number; // Optional duration
  choices: Choice[];
}

/**
 * Choice - weighted action selection
 * Multiple actions may be valid at any step
 */
export interface Choice {
  weight: number;
  action: Action;
}

/**
 * Action - explicit musical intent
 * Replaces Chord Player's overloaded symbol syntax
 */
export type Action =
  | { type: 'note'; degree: number; octaveOffset?: number }
  | { type: 'chord'; degrees?: number[]; octaveOffset?: number; inversion?: number }
  | { type: 'rest' }
  | { type: 'arpeggio'; degrees: number[]; spread?: number }
  | { type: 'scaleNote'; degree: number }
  | { type: 'passing'; direction: 'below' | 'above' };

/**
 * Voicing Policy - handles voicing constraints independently of rhythm
 */
export interface VoicingPolicy {
  mode: 'close' | 'open' | 'shell' | 'power';
  range?: [number, number]; // Octave range [min, max]
  maxNotes?: number; // Maximum number of notes in voicing
}

/**
 * Articulation - applied after pitch resolution
 */
export interface Articulation {
  length: 'legato' | 'staccato' | 'tenuto';
  velocity?: number | [number, number]; // Single value or [min, max] range
  accent?: boolean;
}

/**
 * Note Event - compiled output from pattern interpreter
 */
export interface NoteEvent {
  time: number; // Absolute time in seconds
  midiNote: number;
  velocity: number;
  duration?: number; // Optional duration for note-off timing
}

/**
 * Optional context passed into the compiler by the engine.
 * Used for scale-degree resolution (walking bass) and passing tones.
 */
export interface PlaybackContext {
  keyRoot: string;
  scale: Scale;
  nextChord: Chord | null;
}
