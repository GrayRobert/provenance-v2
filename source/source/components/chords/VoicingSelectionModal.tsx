'use client';

import { useState, useEffect } from 'react';
import { parseChord, isValidChord, getPianoVoicings } from '@/lib/chordService';
import { chordLibraryApi } from '@/lib/api';
import type { ChordVoicingDTO } from '@/lib/api';
import type { Instrument } from '@/lib/types';
import { REACT_CHORDS_GUITAR, chordToReactChordsDisplayFormat } from '@/lib/chordsDbAdapter';
import Chord from '@tombatossals/react-chords/lib/Chord';
import PianoChordDiagram from './PianoChordDiagram';

export interface VoicingSelectionModalProps {
  isOpen: boolean;
  chordId: string;
  symbol: string;
  instrument: Instrument;
  songId: string;
  onSelect: (voicingId: string) => void;
  onSkip: () => void;
  onClose: () => void;
}

type GuitarVoicingItem = { id: string; name?: string; chord: ChordVoicingDTO['chord'] };
type PianoVoicingItem = { id: string; name: string; notes: string[] };

export default function VoicingSelectionModal({
  isOpen,
  chordId,
  symbol,
  instrument,
  songId,
  onSelect,
  onSkip,
  onClose,
}: VoicingSelectionModalProps) {
  const [guitarVoicings, setGuitarVoicings] = useState<GuitarVoicingItem[]>([]);
  const [pianoVoicings, setPianoVoicings] = useState<PianoVoicingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);

  const parsed = symbol ? parseChord(symbol) : null;
  const normalizedSymbol = parsed?.normalizedSymbol ?? symbol;

  useEffect(() => {
    if (!isOpen || !symbol || !isValidChord(symbol)) {
      setGuitarVoicings([]);
      setPianoVoicings([]);
      setError(null);
      return;
    }
    setError(null);
    if (instrument === 'guitar') {
      setLoading(true);
      chordLibraryApi
        .getVoicings('guitar', normalizedSymbol)
        .then((list) => {
          setGuitarVoicings(
            list.map((v) => ({
              id: v.id,
              name: v.name ?? undefined,
              chord: v.chord,
            }))
          );
        })
        .catch(() => setError('Failed to load guitar voicings'))
        .finally(() => setLoading(false));
    } else {
      const voicings = getPianoVoicings(symbol);
      setPianoVoicings(
        voicings.map((v) => ({
          id: v.id,
          name: v.name,
          notes: v.notes,
        }))
      );
    }
  }, [isOpen, symbol, instrument, normalizedSymbol]);

  const handleSelectGuitar = (voicingId: string) => {
    onSelect(voicingId);
    onClose();
  };

  const handleSelectPiano = async (voicing: PianoVoicingItem) => {
    setCreating(voicing.id);
    setError(null);
    try {
      const created = await chordLibraryApi.createPianoVoicing({
        symbol: normalizedSymbol,
        notes: voicing.notes,
        name: voicing.name,
      });
      onSelect(created.id);
      onClose();
    } catch {
      setError('Failed to save piano voicing');
    } finally {
      setCreating(null);
    }
  };

  const handleSkip = () => {
    onSkip();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div
        className="relative bg-surface rounded-xl shadow-xl border border-border p-6 w-full mx-4 max-h-[85vh] overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="voicing-modal-title"
      >
        <h2 id="voicing-modal-title" className="text-lg font-semibold text-foreground mb-1">
          Choose a voicing for {symbol}
        </h2>
        <p className="text-sm text-muted mb-4">
          {instrument === 'guitar' ? 'Guitar' : 'Piano'} — select one to link to this chord, or skip.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-500/20 text-red-700 dark:text-red-300 text-sm rounded-lg border border-red-500/30" role="alert">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-4 min-h-0">
          {instrument === 'guitar' && (
            <>
              {loading && (
                <div className="text-sm text-muted py-4">Loading voicings…</div>
              )}
              {!loading && guitarVoicings.length === 0 && !error && (
                <div className="text-sm text-muted py-4">No guitar voicings found for this chord.</div>
              )}
              {!loading &&
                guitarVoicings.map((v) => {
                  const displayChord = v.chord && Array.isArray(v.chord.frets)
                    ? chordToReactChordsDisplayFormat(v.chord)
                    : chordToReactChordsDisplayFormat(null);
                  return (
                  <div
                    key={v.id}
                    className="flex items-center justify-between gap-4 p-3 border border-border rounded-lg hover:bg-border/50"
                  >
                    <div className="flex-1 min-w-0 flex items-center gap-4">
                      <div className="chord-diagram-guitar w-[160px] shrink-0 min-h-[120px] flex items-center justify-center">
                        <Chord chord={displayChord} instrument={REACT_CHORDS_GUITAR} lite={false} />
                      </div>
                      <div>
                        {v.name && <span className="text-sm font-medium text-foreground">{v.name}</span>}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectGuitar(v.id)}
                      className="shrink-0 px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover"
                    >
                      Use this voicing
                    </button>
                  </div>
                  );
                })}
            </>
          )}

          {instrument === 'piano' && (
            <>
              {pianoVoicings.length === 0 && (
                <div className="text-sm text-muted py-4">No piano voicings for this chord.</div>
              )}
              {pianoVoicings.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between gap-4 p-3 border border-border rounded-lg hover:bg-border/50"
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-foreground">{v.name}</span>
                    <div className="mt-1">
                      <PianoChordDiagram
                        voicing={{ id: v.id, name: v.name, notes: v.notes }}
                        chordName={normalizedSymbol}
                        size="small"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSelectPiano(v)}
                    disabled={creating !== null}
                    className="shrink-0 px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover disabled:opacity-50"
                  >
                    {creating === v.id ? 'Saving…' : 'Use this voicing'}
                  </button>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-border flex justify-end gap-2">
          <button
            type="button"
            onClick={handleSkip}
            className="px-4 py-2 text-foreground bg-surface border border-border rounded-lg hover:bg-border text-sm font-medium"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-foreground bg-surface border border-border rounded-lg hover:bg-border text-sm font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
