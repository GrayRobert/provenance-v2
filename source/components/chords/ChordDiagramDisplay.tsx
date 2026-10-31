'use client';

import { useState, useEffect } from 'react';
import { PianoVoicing, Instrument } from '@/lib/types';
import { parseChord, isValidChord, getPianoVoicings } from '@/lib/chordService';
import { getGuitarVoicingsFromDbAsync, REACT_CHORDS_GUITAR, chordToReactChordsDisplayFormat } from '@/lib/chordsDbAdapter';
import type { GuitarVoicing } from '@/lib/chordsDbAdapter';
import Chord from '@tombatossals/react-chords/lib/Chord';
import PianoChordDiagram from './PianoChordDiagram';

interface Props {
  chordSymbol: string;
  instrument?: Instrument;
  size?: 'small' | 'medium' | 'large';
  showInstrumentToggle?: boolean;
  showVoicingCycle?: boolean;
  /** When set, show only this voicing (no cycling). Fetched by id from chord library. */
  voicingId?: string | null;
  className?: string;
  /** When true, piano diagram fills container width and shows as many octaves as fit (centered on C3). */
  fillWidth?: boolean;
}

/**
 * A display component for chord diagrams that can be used inline or in popovers.
 * Supports both guitar (Szaza/react-chords, async) and piano with voicing cycling.
 */
export default function ChordDiagramDisplay({
  chordSymbol,
  instrument: initialInstrument = 'guitar',
  size = 'small',
  showInstrumentToggle = false,
  showVoicingCycle = true,
  voicingId: preferredVoicingId = null,
  className = '',
  fillWidth = false,
}: Props) {
  const [instrument, setInstrument] = useState<Instrument>(initialInstrument);
  const [voicingIndex, setVoicingIndex] = useState(0);

  const parsed = chordSymbol ? parseChord(chordSymbol) : null;
  const isValid = chordSymbol ? isValidChord(chordSymbol) : false;

  const pianoVoicings = (chordSymbol && isValid ? getPianoVoicings(chordSymbol) : []) as PianoVoicing[];
  const currentPianoVoicing = pianoVoicings[voicingIndex] ?? null;

  const [guitarVoicings, setGuitarVoicings] = useState<GuitarVoicing[] | null>(null);
  const [guitarLoading, setGuitarLoading] = useState(false);
  /** When voicingId is set, we fetch and show only that voicing (single-voicing mode). */
  const [singleVoicing, setSingleVoicing] = useState<GuitarVoicing | PianoVoicing | null>(null);
  const [singleVoicingLoading, setSingleVoicingLoading] = useState(false);
  const [singleVoicingFromUser, setSingleVoicingFromUser] = useState<boolean | null>(null);
  const [customVoicingDisplayName, setCustomVoicingDisplayName] = useState<string | null>(null);

  useEffect(() => {
    setInstrument(initialInstrument);
  }, [initialInstrument]);

  useEffect(() => {
    if (!preferredVoicingId || !chordSymbol) {
      setSingleVoicing(null);
      setSingleVoicingFromUser(null);
      setCustomVoicingDisplayName(null);
      return;
    }
    setSingleVoicingLoading(true);
    setSingleVoicing(null);
    setSingleVoicingFromUser(null);
    setCustomVoicingDisplayName(null);
    import('@/lib/api').then(({ userVoicingsApi, chordLibraryApi }) => {
      const applyVoicing = (v: { id: string; chord?: Record<string, unknown>; name?: string | null } | null) => {
        if (!v?.chord) {
          setSingleVoicing(null);
          return;
        }
        const c = v.chord as Record<string, unknown>;
        if (Array.isArray(c.frets)) {
          setSingleVoicing({
            id: v.id,
            chord: v.chord as GuitarVoicing['chord'],
            name: v.name ?? undefined,
          });
        } else if (Array.isArray(c.notes)) {
          setSingleVoicing({
            id: v.id,
            name: v.name ?? 'Voicing',
            notes: c.notes as string[],
          });
        }
      };
      // Try library first (avoids 404 when chord uses a library voicing); fall back to user voicing.
      chordLibraryApi
        .getVoicingById(preferredVoicingId)
        .then((v) => {
          if (v) {
            setSingleVoicingFromUser(false);
            applyVoicing(v);
            return;
          }
          return userVoicingsApi.getById(preferredVoicingId).then((u) => {
            if (u) {
              setSingleVoicingFromUser(true);
              applyVoicing(u);
            }
          });
        })
        .catch(() =>
          userVoicingsApi.getById(preferredVoicingId).then((u) => {
            if (u) {
              setSingleVoicingFromUser(true);
              applyVoicing(u);
            }
          })
        )
        .finally(() => setSingleVoicingLoading(false));
    });
  }, [preferredVoicingId, chordSymbol]);

  // Resolve "Custom 01" style label for user voicings with generic name (matches voicing selection list)
  useEffect(() => {
    if (
      !fillWidth ||
      !preferredVoicingId ||
      !chordSymbol ||
      !parsed ||
      instrument !== 'piano' ||
      !singleVoicing ||
      !('notes' in singleVoicing) ||
      singleVoicingFromUser !== true
    ) {
      if (!preferredVoicingId) setCustomVoicingDisplayName(null);
      return;
    }
    const p = singleVoicing as PianoVoicing;
    const genericName = !p.name || p.name === 'Voicing' || p.name === 'One-off';
    if (!genericName) {
      setCustomVoicingDisplayName(null);
      return;
    }
    let cancelled = false;
    import('@/lib/api').then(({ userVoicingsApi }) => {
      const normalized = parsed.normalizedSymbol;
      userVoicingsApi.list('piano', normalized).then((list) => {
        if (cancelled) return;
        const idx = list.findIndex((v) => v.id === preferredVoicingId);
        if (idx >= 0) {
          const n = idx + 1;
          const num = n >= 1 && n <= 99 ? n.toString().padStart(2, '0') : 'XX';
          setCustomVoicingDisplayName(list[idx].name ?? `Custom ${num}`);
        } else {
          setCustomVoicingDisplayName(null);
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [fillWidth, preferredVoicingId, chordSymbol, parsed, instrument, singleVoicing, singleVoicingFromUser]);

  useEffect(() => {
    if (instrument !== 'guitar' || !chordSymbol || !isValid) {
      setGuitarVoicings(null);
      return;
    }
    if (preferredVoicingId) return; // single-voicing mode uses getVoicingById above
    const parsedForFetch = parseChord(chordSymbol);
    if (!parsedForFetch) return;
    setGuitarVoicings(null);
    setGuitarLoading(true);
    getGuitarVoicingsFromDbAsync(parsedForFetch)
      .then((voicings) => {
        setGuitarVoicings(voicings);
        setVoicingIndex(0);
      })
      .finally(() => setGuitarLoading(false));
  }, [chordSymbol, instrument, isValid, preferredVoicingId]);

  useEffect(() => {
    setVoicingIndex(0);
  }, [chordSymbol, instrument]);

  const cycleVoicing = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (instrument === 'guitar' && guitarVoicings && guitarVoicings.length > 1) {
      setVoicingIndex((prev) => (prev + 1) % guitarVoicings.length);
    }
    if (instrument === 'piano' && pianoVoicings.length > 1) {
      setVoicingIndex((prev) => (prev + 1) % pianoVoicings.length);
    }
  };

  const switchInstrument = (e: React.MouseEvent, newInstrument: Instrument) => {
    e.stopPropagation();
    setInstrument(newInstrument);
    setVoicingIndex(0);
  };

  const   instrumentToggle = showInstrumentToggle && (
    <div className="flex gap-2 mb-3">
      <button
        onClick={(e) => switchInstrument(e, 'guitar')}
        className={`px-3 py-1.5 text-lg rounded-md transition-colors ${
          instrument === 'guitar' ? 'bg-accent text-white shadow-sm' : 'bg-surface text-muted hover:bg-border'
        }`}
        title="Guitar"
      >
        🎸
      </button>
      <button
        onClick={(e) => switchInstrument(e, 'piano')}
        className={`px-3 py-1.5 text-lg rounded-md transition-colors ${
          instrument === 'piano' ? 'bg-accent text-white shadow-sm' : 'bg-surface text-muted hover:bg-border'
        }`}
        title="Piano"
      >
        🎹
      </button>
    </div>
  );

  if (!chordSymbol) {
    return null;
  }
  if (!isValid || !parsed) {
    return (
      <div className={`text-xs text-muted p-2 ${className}`}>
        No diagram for {chordSymbol}
      </div>
    );
  }

  // When voicingId is set and the stored voicing matches current instrument, show only that voicing (no cycling).
  // If user switched Chord Chart to the other instrument, ignore voicingId and show that instrument's voicings.
  if (preferredVoicingId) {
    if (singleVoicingLoading) {
      return (
        <div className={`inline-flex flex-col items-center ${className}`}>
          {instrumentToggle}
          <div className="text-xs text-muted p-2">Loading voicing…</div>
        </div>
      );
    }
    if (singleVoicing) {
      const isGuitarVoicing = 'chord' in singleVoicing && singleVoicing.chord;
      const isPianoVoicing = 'notes' in singleVoicing;
      const matchesInstrument =
        (instrument === 'guitar' && isGuitarVoicing) || (instrument === 'piano' && isPianoVoicing);
      if (matchesInstrument && isGuitarVoicing) {
        const g = singleVoicing as GuitarVoicing;
        return (
          <div className={`inline-flex flex-col items-center ${className}`}>
            {instrumentToggle}
            <div className="flex flex-col items-center">
              {g.name && <span className="text-xs text-muted mb-1">{g.name}</span>}
              <div className={`chord-diagram-guitar ${size === 'small' ? 'w-[80px]' : size === 'medium' ? 'w-[100px]' : 'w-[120px]'}`}>
                <Chord chord={chordToReactChordsDisplayFormat(g.chord)} instrument={REACT_CHORDS_GUITAR} lite={false} />
              </div>
            </div>
          </div>
        );
      }
      if (matchesInstrument && isPianoVoicing) {
        const p = singleVoicing as PianoVoicing;
        return (
          <div className={`flex flex-col items-center ${fillWidth ? 'w-full min-w-0' : ''} ${className}`}>
            {instrumentToggle}
            <div className={fillWidth ? 'w-full min-w-0 flex justify-center' : ''}>
              <PianoChordDiagram
                voicing={p}
                chordName={parsed.normalizedSymbol}
                size={size}
                fillWidth={fillWidth}
                showVoicingName={!fillWidth}
              />
            </div>
            {fillWidth && (customVoicingDisplayName ?? p.name) && (
              <span className="text-xs font-medium text-foreground mt-1.5 text-center truncate w-full">
                {customVoicingDisplayName ?? p.name}
              </span>
            )}
          </div>
        );
      }
    }
    // Voicing not found, or instrument switched (e.g. stored guitar voicing but user chose Piano) — fall through to normal instrument flow
  }

  if (instrument === 'guitar') {
    if (guitarLoading) {
      return (
        <div className={`inline-flex flex-col items-center ${className}`}>
          {instrumentToggle}
          <div className="text-xs text-muted p-2">Loading…</div>
        </div>
      );
    }
    if (!guitarVoicings || guitarVoicings.length === 0) {
      return (
        <div className={`inline-flex flex-col items-center ${className}`}>
          {instrumentToggle}
          <div className="text-xs text-muted p-2">No guitar voicings for {chordSymbol}</div>
        </div>
      );
    }
    const currentGuitar = guitarVoicings[voicingIndex] ?? guitarVoicings[0];
    const showCycle = showVoicingCycle && guitarVoicings.length > 1;

    return (
      <div className={`inline-flex flex-col items-center ${className}`}>
        {instrumentToggle}
        <div className="flex flex-col items-center">
          {          currentGuitar.name && (
            <span className="text-xs text-muted mb-1">{currentGuitar.name}</span>
          )}
          <div className={`chord-diagram-guitar ${size === 'small' ? 'w-[80px]' : size === 'medium' ? 'w-[100px]' : 'w-[120px]'}`}>
            <Chord
              chord={chordToReactChordsDisplayFormat(currentGuitar.chord)}
              instrument={REACT_CHORDS_GUITAR}
              lite={false}
            />
          </div>
        </div>
        {showCycle && (
          <button
            onClick={cycleVoicing}
            className="mt-2 px-3 py-1 text-sm text-muted hover:text-accent hover:bg-surface rounded-md transition-colors"
          >
            Voicing {voicingIndex + 1}/{guitarVoicings.length} →
          </button>
        )}
      </div>
    );
  }

  if (instrument === 'piano') {
    if (!currentPianoVoicing) {
      return (
        <div className={`inline-flex flex-col items-center ${className}`}>
          {instrumentToggle}
          <div className="text-xs text-muted p-2">No piano voicings for {chordSymbol}</div>
        </div>
      );
    }
    const showCycle = showVoicingCycle && pianoVoicings.length > 1;

    return (
      <div className={`flex flex-col items-center ${fillWidth ? 'w-full min-w-0' : ''} ${className}`}>
        {instrumentToggle}
        <div className={fillWidth ? 'w-full min-w-0 flex justify-center' : ''}>
          <PianoChordDiagram
            voicing={currentPianoVoicing}
            chordName={parsed.normalizedSymbol}
            size={size}
            fillWidth={fillWidth}
            showVoicingName={!fillWidth}
          />
        </div>
        {fillWidth && currentPianoVoicing.name && (
          <span className="text-xs font-medium text-foreground mt-1.5 text-center truncate w-full">
            {currentPianoVoicing.name}
          </span>
        )}
        {showCycle && (
          <button
            onClick={cycleVoicing}
            className="mt-2 px-3 py-1 text-sm text-muted hover:text-accent hover:bg-surface rounded-md transition-colors"
          >
            Voicing {voicingIndex + 1}/{pianoVoicings.length} →
          </button>
        )}
      </div>
    );
  }

  return null;
}

/**
 * A hover-triggered chord diagram tooltip component
 */
interface ChordTooltipProps {
  chordSymbol: string;
  children: React.ReactNode;
  instrument?: Instrument;
  /** When set, overlay shows only this voicing (no cycling). */
  voicingId?: string | null;
  /** Optional: chord id for "Change voicing" (not yet rendered in tooltip). */
  chordId?: string;
  /** Optional: open Chord Builder (e.g. from parent when chord is clicked). */
  onRequestVoicingChange?: (chordId: string, symbol: string, voicingId?: string | null) => void;
}

export function ChordDiagramTooltip({
  chordSymbol,
  children,
  instrument = 'guitar',
  voicingId = null,
}: ChordTooltipProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
      {isHovered && (
        <div className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-3">
          <div className="bg-surface rounded-xl shadow-xl border border-border p-4">
            <div className="text-center font-semibold text-foreground mb-2 text-base">
              {chordSymbol}
            </div>
            <ChordDiagramDisplay
              chordSymbol={chordSymbol}
              instrument={instrument}
              size="large"
              showInstrumentToggle={false}
              showVoicingCycle={!voicingId}
              voicingId={voicingId}
            />
          </div>
          {/* Tooltip arrow */}
          <div className="absolute left-1/2 transform -translate-x-1/2 top-full">
            <div className="border-8 border-transparent border-t-surface -mt-px" />
          </div>
        </div>
      )}
    </div>
  );
}
