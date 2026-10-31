'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { parseChord, isValidChord } from '@/lib/chordService';
import {
  getGuitarVoicingsFromDbAsync,
  getUkuleleVoicingsFromDbAsync,
  REACT_CHORDS_GUITAR,
  REACT_CHORDS_UKULELE,
  chordToReactChordsDisplayFormat,
} from '@/lib/chordsDbAdapter';
import Chord from '@tombatossals/react-chords/lib/Chord';
import PianoChordDiagram from '@/components/chords/PianoChordDiagram';
import { getPianoVoicings } from '@/lib/chordService';
import type { PianoVoicing } from '@/lib/types';
import type { GuitarVoicing, UkuleleVoicing } from '@/lib/chordsDbAdapter';

export default function ChordFinderPage() {
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [guitarVoicings, setGuitarVoicings] = useState<GuitarVoicing[]>([]);
  const [guitarLoading, setGuitarLoading] = useState(false);
  const [ukuleleVoicings, setUkuleleVoicings] = useState<UkuleleVoicing[]>([]);
  const [ukuleleLoading, setUkuleleLoading] = useState(false);

  const chordSymbol = submitted.trim() || null;
  const parsed = useMemo(
    () => (chordSymbol ? parseChord(chordSymbol) : null),
    [chordSymbol]
  );
  const isValid = chordSymbol ? isValidChord(chordSymbol) : false;

  useEffect(() => {
    if (!parsed || !isValid) {
      setGuitarVoicings([]);
      return;
    }
    setGuitarLoading(true);
    getGuitarVoicingsFromDbAsync(parsed)
      .then(setGuitarVoicings)
      .finally(() => setGuitarLoading(false));
  }, [parsed, isValid]);

  useEffect(() => {
    if (!parsed || !isValid) {
      setUkuleleVoicings([]);
      return;
    }
    setUkuleleLoading(true);
    getUkuleleVoicingsFromDbAsync(parsed)
      .then(setUkuleleVoicings)
      .finally(() => setUkuleleLoading(false));
  }, [parsed, isValid]);
  const pianoVoicingsForDisplay = useMemo((): PianoVoicing[] => {
    if (!chordSymbol || !isValid) return [];
    return getPianoVoicings(chordSymbol);
  }, [chordSymbol, isValid]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(input);
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="px-4 sm:px-6 lg:px-8">
        <nav className="mb-6">
          <Link
            href="/songs"
            className="text-blue-600 hover:text-blue-800 underline"
          >
            Back to Workspaces
          </Link>
        </nav>

        <h1 className="text-2xl font-semibold mb-2">Chord Finder</h1>
        <p className="text-sm text-muted mb-6">
          Enter a chord symbol.
        </p>

        <form onSubmit={handleSubmit} className="mb-8">
          <label htmlFor="chord-input" className="block text-sm font-medium mb-2">
            Chord symbol
          </label>
          <div className="flex gap-2">
            <input
              id="chord-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. C, Am, Fmaj7, C/G, D/F#"
              className="flex-1 px-3 py-2 border border-border rounded-md text-foreground bg-surface focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              aria-describedby="chord-validation"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:ring-2 focus:ring-blue-500"
            >
              Show voicings
            </button>
          </div>
          <div id="chord-validation" role="alert" aria-live="polite" className="mt-2 min-h-[1.5rem]">
            {chordSymbol && !isValid && (
              <span className="text-red-600 text-sm">Unknown or invalid chord symbol.</span>
            )}
            {chordSymbol && isValid && parsed && (
              <span className="text-muted text-sm">
                Normalized: <strong>{parsed.normalizedSymbol}</strong>
                {parsed.notes?.length ? ` — Notes: ${parsed.notes.join(' ')}` : ''}
                {parsed.bassNote ? ` (bass: ${parsed.bassNote})` : ''}
              </span>
            )}
          </div>
        </form>

        {chordSymbol && isValid && parsed && (
          <div className="space-y-10">
            {/* Guitar */}
            <section aria-labelledby="guitar-heading">
              <h2 id="guitar-heading" className="text-lg font-medium mb-4">
                Guitar
              </h2>
              {guitarLoading ? (
                <p className="text-muted text-sm">Loading voicings…</p>
              ) : guitarVoicings.length > 0 ? (
                <div className="flex flex-wrap gap-6">
                  {guitarVoicings.map((v, i) => (
                    <div key={v.id ?? i} className="flex flex-col items-center">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-muted">
                          Voicing {i + 1}
                        </span>
                      </div>
                      <div className="w-[120px]">
                        <Chord
                          chord={
                            v.chord && Array.isArray(v.chord.frets)
                              ? chordToReactChordsDisplayFormat(v.chord)
                              : chordToReactChordsDisplayFormat(null)
                          }
                          instrument={REACT_CHORDS_GUITAR}
                          lite={false}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted text-sm">
                  No guitar voicings in database for this chord.
                </p>
              )}
            </section>

            {/* Ukulele */}
            <section aria-labelledby="ukulele-heading">
              <h2 id="ukulele-heading" className="text-lg font-medium mb-4">
                Ukulele
              </h2>
              {ukuleleLoading ? (
                <p className="text-muted text-sm">Loading voicings…</p>
              ) : ukuleleVoicings.length > 0 ? (
                <div className="flex flex-wrap gap-6">
                  {ukuleleVoicings.map((v, i) => (
                    <div key={i} className="flex flex-col items-center">
                      <span className="text-xs text-muted mb-1">
                        Voicing {i + 1}
                      </span>
                      <div className="w-[100px]">
                        <Chord
                          chord={v.chord}
                          instrument={REACT_CHORDS_UKULELE}
                          lite={false}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted text-sm">
                  No ukulele voicings in database for this chord.
                </p>
              )}
            </section>

            {/* Piano */}
            <section aria-labelledby="piano-heading">
              <h2 id="piano-heading" className="text-lg font-medium mb-4">
                Piano
              </h2>
              {pianoVoicingsForDisplay.length > 0 ? (
                <div className="flex flex-wrap gap-6">
                  {pianoVoicingsForDisplay.map((v, i) => (
                    <div key={v.id} className="flex flex-col items-center">
                      <span className="text-xs text-muted mb-1">
                        {v.name ?? `Voicing ${i + 1}`}
                      </span>
                      <PianoChordDiagram
                        voicing={v}
                        chordName={parsed.normalizedSymbol}
                        size="medium"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted text-sm">
                  No piano voicings for this chord.
                </p>
              )}
            </section>
          </div>
        )}

        {chordSymbol && !isValid && (
          <p className="text-muted">
            Enter a valid chord symbol (e.g. C, Am, G7, Fmaj7, Dsus2) and click Show voicings.
          </p>
        )}
      </div>
    </div>
  );
}
