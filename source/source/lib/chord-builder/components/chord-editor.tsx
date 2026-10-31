'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { Music, Waves, Play, Trash2, GripHorizontal } from 'lucide-react';
import GuitarFretboard from './guitar-fretboard';
import PianoKeyboard from './piano-keyboard';
import TuningSelector from './tuning-selector';
import ChordDisplay from './chord-display';
import {
  GuitarChord,
  TUNINGS,
  createEmptyChord,
  getChordNotes,
  getNoteAtFret,
  detectChordName,
  FINGER_COLORS,
} from '@/lib/chord-builder/chord-utils';
import { strumChord, playPianoChord } from '@/lib/chord-builder/audio-engine';
import type { GuitarChordLibraryFormat } from '@/lib/chord-builder/guitarToChordLibrary';
import { libraryFormatToGuitarChord } from '@/lib/chord-builder/guitarToChordLibrary';
import { parseChord } from '@/lib/chordService';

export type EditorMode = 'guitar' | 'piano';

export interface ChordEditorState {
  mode: EditorMode;
  chord: GuitarChord;
  pianoActiveNotes: string[];
  /** Detected chord name from current notes (e.g. "Em", "Cmaj7") for use when saving voicing. */
  chordName: string;
}

export interface ChordEditorProps {
  /** When provided, editor is used in embed mode (e.g. Chord Builder). */
  initialMode?: EditorMode;
  /** Pre-load guitar voicing from library format (e.g. from quick-select). */
  initialGuitarChord?: GuitarChordLibraryFormat | null;
  /** Pre-load piano notes (e.g. from quick-select or existing user voicing). */
  initialPianoNotes?: string[] | null;
  /** Called whenever chord or piano state changes so parent can read current state on Insert. */
  onStateChange?: (state: ChordEditorState) => void;
  /** Compact header (no full-page chrome). */
  compact?: boolean;
  /** When set, show this spelling for the chord when it matches the detected chord (keeps enharmonic spelling consistent with chord charts/explorer). */
  preferredChordName?: string | null;
}

export default function ChordEditor({
  initialMode = 'guitar',
  initialGuitarChord = null,
  initialPianoNotes = null,
  onStateChange,
  compact = false,
  preferredChordName = null,
}: ChordEditorProps) {
  const [mode, setMode] = useState<EditorMode>(initialMode);
  const [tuningName, setTuningName] = useState('Standard');
  const [chord, setChord] = useState<GuitarChord>(() =>
    initialGuitarChord
      ? libraryFormatToGuitarChord(initialGuitarChord)
      : createEmptyChord(TUNINGS['Standard'])
  );
  const [selectedFinger, setSelectedFinger] = useState(1);
  const [pianoActiveNotes, setPianoActiveNotes] = useState<Set<string>>(() =>
    initialPianoNotes && initialPianoNotes.length > 0
      ? new Set(initialPianoNotes)
      : new Set()
  );

  useEffect(() => {
    if (initialGuitarChord) {
      setChord(libraryFormatToGuitarChord(initialGuitarChord));
      setMode('guitar');
    }
  }, [initialGuitarChord]);

  useEffect(() => {
    if (initialPianoNotes && initialPianoNotes.length > 0) {
      setPianoActiveNotes(new Set(initialPianoNotes));
      setMode('piano');
    }
  }, [initialPianoNotes?.join(',')]);

  const guitarNotes = useMemo(() => getChordNotes(chord), [chord]);
  const pianoNotesArray = useMemo(() => Array.from(pianoActiveNotes), [pianoActiveNotes]);
  const activeNotes = mode === 'guitar' ? guitarNotes : pianoNotesArray;
  const chordName = useMemo(() => detectChordName(activeNotes), [activeNotes]);
  const displayChordName = useMemo(() => {
    if (!preferredChordName || !chordName) return chordName;
    const normDetected = parseChord(chordName)?.normalizedSymbol;
    const normPreferred = parseChord(preferredChordName)?.normalizedSymbol;
    return normDetected && normPreferred && normDetected === normPreferred
      ? preferredChordName
      : chordName;
  }, [chordName, preferredChordName]);

  const handleChordChange = useCallback((newChord: GuitarChord) => {
    setChord(newChord);
  }, []);

  const handleTuningChange = useCallback((tuning: string[], name: string) => {
    setTuningName(name);
    setChord(createEmptyChord(tuning));
  }, []);

  const handleBaseFretChange = useCallback((delta: number) => {
    setChord((prev) => {
      const requestedBase = Math.max(1, Math.min(19, prev.baseFret + delta));
      const absoluteFrets = prev.strings.map((s) =>
        s.fret < 0 ? -1 : s.fret === 0 ? 0 : prev.baseFret + s.fret - 1
      );
      const absBarres = prev.barres
        .filter((b) => b >= 1)
        .map((b) => prev.baseFret + b - 1);
      const allAbsPositive = [
        ...absoluteFrets.filter((f) => f > 0),
        ...absBarres,
      ];
      const minFretted =
        allAbsPositive.length > 0 ? Math.min(...allAbsPositive) : 1;
      const newBaseFret = Math.max(
        1,
        Math.min(requestedBase, minFretted)
      );
      const newStrings = prev.strings.map((s, i) => {
        const abs = absoluteFrets[i];
        if (abs < 0) return { ...s, fret: -1 };
        if (abs === 0) return { ...s, fret: 0 };
        return { ...s, fret: abs - newBaseFret + 1 };
      });
      const newBarres = prev.barres
        .map((b) => {
          const abs = prev.baseFret + b - 1;
          return abs - newBaseFret + 1;
        })
        .filter((b) => b >= 1 && b <= 5);
      return {
        ...prev,
        baseFret: newBaseFret,
        strings: newStrings,
        barres: newBarres,
      };
    });
  }, []);

  const handleStrum = useCallback(() => {
    const notes: string[] = [];
    chord.strings.forEach((s, i) => {
      if (s.fret >= 0) {
        const actualFret = s.fret === 0 ? 0 : s.fret + chord.baseFret - 1;
        const note = getNoteAtFret(chord.tuning[i], actualFret);
        if (note) notes.push(note);
      }
    });
    strumChord(notes);
  }, [chord]);

  const handleClear = useCallback(() => {
    if (mode === 'guitar') {
      setChord(createEmptyChord(chord.tuning));
    } else {
      setPianoActiveNotes(new Set());
    }
  }, [mode, chord.tuning]);

  const handlePianoToggle = useCallback((note: string) => {
    setPianoActiveNotes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(note)) {
        newSet.delete(note);
      } else {
        if (newSet.size >= 10) return prev;
        newSet.add(note);
      }
      return newSet;
    });
  }, []);

  const handlePlayPianoChord = useCallback(() => {
    playPianoChord(Array.from(pianoActiveNotes));
  }, [pianoActiveNotes]);

  useEffect(() => {
    onStateChange?.({
      mode,
      chord,
      pianoActiveNotes: Array.from(pianoActiveNotes),
      chordName,
    });
  }, [mode, chord, pianoActiveNotes, chordName, onStateChange]);

  const content = (
    <>
      {!compact && (
        <header className="border-b border-border bg-surface/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">
                Chord Builder
              </h1>
              <p className="text-[11px] text-muted">Interactive chord voicing editor</p>
            </div>

            <div className="flex items-center bg-surface rounded-lg p-0.5 gap-0.5 border border-border">
              <button
                onClick={() => setMode('guitar')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  mode === 'guitar'
                    ? 'bg-accent text-foreground shadow-sm'
                    : 'text-muted hover:text-foreground'
                }`}
              >
                <Waves className="w-4 h-4" />
                Guitar
              </button>
              <button
                onClick={() => setMode('piano')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  mode === 'piano'
                    ? 'bg-accent text-foreground shadow-sm'
                    : 'text-muted hover:text-foreground'
                }`}
              >
                <Music className="w-4 h-4" />
                Piano
              </button>
            </div>
          </div>
        </header>
      )}

      <div className={compact ? '' : 'max-w-5xl mx-auto px-4 py-6 w-full'}>
        <ChordDisplay chordName={displayChordName} notes={activeNotes} />

        {mode === 'guitar' ? (
          <div className="flex flex-col gap-5 mt-2">
            <div className="flex flex-row flex-wrap items-end justify-start gap-4">
              <TuningSelector
                currentTuning={chord.tuning}
                tuningName={tuningName}
                onTuningChange={handleTuningChange}
              />

              <div className="flex items-center gap-2">
                <span className="flex items-center text-muted" title="Fret" aria-label="Fret">
                  <GripHorizontal className="w-4 h-4" />
                </span>
                <div className="flex items-center bg-surface rounded-lg overflow-hidden border border-border">
                  <button
                    onClick={() => handleBaseFretChange(-1)}
                    disabled={chord.baseFret <= 1}
                    className="px-3 py-1.5 text-sm font-medium text-foreground hover:bg-border disabled:opacity-30 transition-colors"
                  >
                    -
                  </button>
                  <span className="px-3 py-1.5 text-sm font-mono font-bold text-foreground min-w-[32px] text-center bg-background border-x border-border">
                    {chord.baseFret}
                  </span>
                  <button
                    onClick={() => handleBaseFretChange(1)}
                    disabled={chord.baseFret >= 19}
                    className="px-3 py-1.5 text-sm font-medium text-foreground hover:bg-border disabled:opacity-30 transition-colors"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-surface rounded-xl border border-border p-4 sm:p-6 min-h-[380px]">
              <GuitarFretboard
                chord={chord}
                onChange={handleChordChange}
                selectedFinger={selectedFinger}
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleStrum}
                disabled={guitarNotes.length === 0}
                className="flex items-center gap-2 bg-accent text-foreground px-5 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-30 transition-opacity"
              >
                <Play className="w-4 h-4" />
                Strum
              </button>
              <button
                onClick={handleClear}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium border border-border text-muted hover:text-foreground hover:bg-surface transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Clear
              </button>
            </div>

            {!compact && (
              <div className="bg-surface/60 rounded-xl border border-border p-4 text-xs text-muted leading-relaxed space-y-1.5">
                <p className="text-[10px] font-medium text-muted uppercase tracking-wider mb-2">
                  How to use
                </p>
                <p>
                  Click <strong className="text-foreground">X/O</strong> above each string to
                  toggle muted / open.
                </p>
                <p>
                  Click a <strong className="text-foreground">fret position</strong> to place a
                  finger dot. Click the dot again to cycle through fingers 1-4; a 5th tap removes it.
                </p>
                <p>
                  <strong className="text-accent">Double-click</strong> a dot to remove it instantly, or
                  drag it off the board.
                </p>
                <p>
                  Hold{' '}
                  <kbd className="px-1 py-0.5 rounded bg-surface border border-border text-[10px] font-mono">
                    Shift
                  </kbd>{' '}
                  and drag from one dot across strings to create a{' '}
                  <strong className="text-foreground">barre</strong>. On touch, long-press then
                  drag.
                </p>
                <p>
                  <strong className="text-accent">Swipe</strong> across strings on touch devices
                  to strum.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-5 mt-2">
            <div className="bg-surface rounded-xl border border-border p-4 sm:p-6 min-h-[240px]">
              <PianoKeyboard
                activeNotes={pianoActiveNotes}
                onToggleNote={handlePianoToggle}
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handlePlayPianoChord}
                disabled={pianoActiveNotes.size === 0}
                className="flex items-center gap-2 bg-accent text-foreground px-5 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-30 transition-opacity"
              >
                <Play className="w-4 h-4" />
                Play Chord
              </button>
              <button
                onClick={handleClear}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium border border-border text-muted hover:text-foreground hover:bg-surface transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Clear
              </button>
            </div>

            {!compact && (
              <div className="bg-surface/60 rounded-xl border border-border p-4 text-xs text-muted leading-relaxed space-y-1.5">
                <p className="text-[10px] font-medium text-muted uppercase tracking-wider mb-2">
                  How to use
                </p>
                <p>
                  Click any <strong className="text-foreground">piano key</strong> to toggle it on
                  or off (max 10 notes).
                </p>
                <p>
                  <strong className="text-accent">Scroll</strong> left/right to access all 88 keys
                  (A0 to C8). Active keys are colored by their chord interval.
                </p>
                <p>
                  The chord name updates{' '}
                  <strong className="text-foreground">automatically</strong> as you add or remove
                  notes.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );

  if (compact) {
    return <div className="flex flex-col w-full">{content}</div>;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {content}
    </div>
  );
}
