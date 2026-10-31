import type { ChordDTO, ChordContext, PitchClass } from './chordDto';
import type { Chord } from '../harmonizer';
import type { UserProgression } from '../userProgressions';

/** Minor scale variant when tonality is minor: Natural (Aeolian), Harmonic, or Melodic. */
export type MinorScaleType = 'natural' | 'harmonic' | 'melodic';

/**
 * Key/tonality for the chord explorer (root note + scale/tonality).
 * In the UI this is shown as "Root" and "Tonality"; internally and in the contract
 * we use root + scale (scale is the tonality identifier, e.g. 'major', 'minor').
 */
export interface SongKey {
  /** Root note (e.g. 'C', 'F#', 'Bb'). */
  root: PitchClass | string;
  /** Tonality/scale (e.g. 'major', 'minor'). Same as the Tonality control. */
  scale: ChordContext['keyScale'] | string;
  /** When scale is minor (emotional bucket), which minor scale to show: Natural, Harmonic, or Melodic. */
  minorScaleType?: MinorScaleType;
}

/**
 * Props contract for Chord Explorer when embedded in a parent app.
 * The parent controls open state, key (root + tonality), mode, and chord context;
 * Chord Explorer reports back via callbacks.
 */
export interface ChordExplorerProps {
  /** When true, the chord explorer modal is shown and mounted. */
  isOpen: boolean;
  /** 'insert' = adding a new chord; 'edit' = editing existing chord (currentChord). */
  mode: 'insert' | 'edit';
  /** Current key: root note + tonality (scale). Drives palette and progression context. */
  songKey: SongKey;
  /** When editing, the chord being edited. When set, applied as selected chord in the app. */
  currentChord?: ChordDTO;
  /** Optional previous chord in the song; used to seed suggestions (e.g. borrowed chords). */
  previousChord?: ChordDTO;
  /** Called when user inserts a chord. Parent should store the chord and typically close. */
  onInsert(chord: ChordDTO): void;
  /** Called when user updates the chord. Parent should update and typically close. */
  onUpdate(chord: ChordDTO): void;
  /** Called when user removes the chord. Parent should clear and typically close. */
  onRemove(): void;
  /** Called when user closes the modal (e.g. backdrop or close button). */
  onClose(): void;
  /** Called when user changes root or tonality inside Chord Explorer. Parent can sync its key state. */
  onSongKeyChange?: (songKey: SongKey) => void;
  /** When true, show the UI tutorial walkthrough after modal opens. Parent typically passes true only on first visit (e.g. based on localStorage). */
  showTutorialOnOpen?: boolean;
  /** Called when the tour ends. reason: 'completed' = user finished all steps; 'dismissed' = Skip or overlay close. Parent may persist when reason === 'completed'. */
  onTutorialComplete?: (reason?: 'completed' | 'dismissed') => void;
  /** Called when user chooses "Don't show again". Parent should persist (e.g. localStorage) and pass showTutorialOnOpen: false next time. */
  onTutorialSkipPermanent?: () => void;
  /**
   * When true, applyProps will update palette (e.g. minor scale switch) and sync chord highlight
   * but will NOT play the current chord. Used when the update is from playback-driven minor-scale
   * switch to avoid double-playing (engine plays the chord; we only need to switch UI).
   */
  skipPlayOnApplyCurrentChord?: boolean;

  /**
   * Visual theme: 'light' | 'dark' | 'system'. When 'system', follows prefers-color-scheme.
   * Default: 'system'.
   */
  theme?: 'light' | 'dark' | 'system';

  /**
   * Optional seed data when parent persists plugin settings (e.g. from backend).
   * When provided, chord-explorer seeds localStorage so loadCustomChords/loadUserProgressions return this data.
   */
  initialCustomChords?: Chord[];
  initialProgressions?: UserProgression[];

  /**
   * Optional persistence adapter for custom chords and saved progressions.
   * When provided (e.g. user logged in), chord-explorer calls these after mutations so the parent can sync to backend.
   */
  pluginPersistence?: {
    getCustomChords: () => Promise<Chord[]>;
    setCustomChords: (chords: Chord[]) => Promise<void>;
    getProgressions: () => Promise<UserProgression[]>;
    saveProgression: (progression: UserProgression) => Promise<boolean>;
    deleteProgression: (id: string) => Promise<void>;
  };
}
