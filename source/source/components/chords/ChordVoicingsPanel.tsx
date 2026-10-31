'use client';

import ChordDiagramDisplay from './ChordDiagramDisplay';
import type { Instrument } from '@/lib/types';

export interface ChordVoicingsPanelChord {
  chordId: string;
  chordSymbol: string;
  voicingId?: string;
}

export interface ChordVoicingsPanelProps {
  chords: ChordVoicingsPanelChord[];
  instrument: Instrument;
  isReadOnly?: boolean;
  onRequestVoicingChange?: (chordId: string, symbol: string, voicingId?: string | null) => void;
}

export default function ChordVoicingsPanel({
  chords,
  instrument,
  isReadOnly = false,
  onRequestVoicingChange,
}: ChordVoicingsPanelProps) {
  if (chords.length === 0) {
    return (
      <p className="text-sm text-muted py-4">No chords in this song.</p>
    );
  }

  // Piano diagrams need full width to avoid clipping; use single column for piano, two for guitar
  const gridCols = instrument === 'piano' ? 'grid-cols-1' : 'grid-cols-2';

  return (
    <div className={`grid ${gridCols} gap-3`}>
      {chords.map((chord) => (
        <div
          key={chord.chordId}
          className="flex flex-col items-center p-2 bg-surface rounded-lg border border-border shadow-sm"
          data-chord-symbol={chord.chordSymbol}
          data-voicing-id={chord.voicingId ?? ''}
        >
          {instrument === 'guitar' && (
            <span className="text-xs font-medium text-foreground mb-1 truncate w-full text-center">
              {chord.chordSymbol}
            </span>
          )}
          <div className={`min-h-[80px] flex items-center justify-center ${instrument === 'piano' ? 'w-full min-w-0' : ''}`}>
            <ChordDiagramDisplay
              chordSymbol={chord.chordSymbol}
              instrument={instrument}
              size="small"
              showVoicingCycle={false}
              voicingId={chord.voicingId}
              fillWidth={instrument === 'piano'}
            />
          </div>
          {!isReadOnly && onRequestVoicingChange && (
            <button
              type="button"
              onClick={() => onRequestVoicingChange(chord.chordId, chord.chordSymbol, chord.voicingId)}
              className="mt-2 w-full px-2 py-1.5 text-xs font-medium text-accent hover:text-accent-hover hover:bg-border rounded transition-colors"
            >
              Change voicing
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
