/**
 * Standalone test harness for Chord Explorer integration.
 * Mirrors the ChordExplorerProps contract so we can verify:
 * - Open/close, root + tonality (key), mode (insert vs edit), currentChord, previousChord
 * - onInsert, onUpdate, onRemove, onClose, onSongKeyChange
 * Use this to validate behavior before porting to the real underlying application.
 *
 * Testing checklist (run npm run dev, then):
 * 1. Key: Change Root/Tonality dropdowns, open for insert → Chord Explorer opens with that key.
 * 2. Open for insert: Click "Open for insert", pick a chord from palette or progression → current chord updates, modal closes.
 * 3. Open for edit: Click "Open for edit" (with or without a current chord) → Chord Explorer opens; edit chord → onUpdate fires, modal closes.
 * 4. Key sync: Open Chord Explorer, change Root or Tonality inside the app → "Key synced from explorer" and dropdowns update (onSongKeyChange).
 * 5. Previous chord: Set "Use current as previous", open for edit → suggestions can use previous chord.
 * 6. Close: Click backdrop or × → onClose fires, modal closes.
 */

import React, { useState, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import ChordExplorer from './components/ChordExplorer';
import type { ChordDTO } from './types/chordDto';
import type { SongKey, MinorScaleType } from './types/chordExplorer';

const ROOTS = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const TONALITIES = [
  { value: 'major', label: 'Major' },
  { value: 'minor', label: 'Minor' },
] as const;

/** Minimal ChordDTO for "edit" when we have no chord yet (so we can test edit flow). */
const PLACEHOLDER_EDIT_CHORD: ChordDTO = {
  symbol: 'Cmaj7',
  root: 'C',
  quality: 'major',
  extensions: ['maj7'],
  alterations: [],
  inversion: 0,
  notes: ['C', 'E', 'G', 'B'],
  context: {
    keyRoot: 'C',
    keyScale: 'major',
    isDiatonic: true,
  },
};

/** Derive minorScaleType from ChordContext keyScale (e.g. melodic_minor -> 'melodic') */
const TUTORIAL_SKIPPED_KEY = 'chordExplorer_tutorialSkipped';

function minorScaleTypeFromKeyScale(keyScale: string | undefined): MinorScaleType | undefined {
  if (!keyScale) return undefined;
  const s = keyScale.toLowerCase().replace(/\s+/g, '_');
  if (s === 'melodic_minor') return 'melodic';
  if (s === 'harmonic_minor') return 'harmonic';
  if (s === 'aeolian' || s === 'minor') return 'natural';
  return undefined;
}

const App: React.FC = () => {
  // Contract state: root + tonality + minor variant = songKey
  const [root, setRoot] = useState<string>('C');
  const [tonality, setTonality] = useState<string>('major');
  const [minorScaleType, setMinorScaleType] = useState<MinorScaleType>('natural');
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'insert' | 'edit'>('insert');
  const [currentChord, setCurrentChord] = useState<ChordDTO | undefined>(undefined);
  const [previousChord, setPreviousChord] = useState<ChordDTO | undefined>(undefined);
  const [showTutorial, setShowTutorial] = useState(
    () => !(typeof window !== 'undefined' && localStorage.getItem(TUTORIAL_SKIPPED_KEY))
  );

  const songKey: SongKey = {
    root,
    scale: tonality,
    ...(tonality === 'minor' ? { minorScaleType } : {}),
  };

  const handleOpenInsert = useCallback(() => {
    setMode('insert');
    setCurrentChord(undefined);
    setIsOpen(true);
  }, []);

  const handleOpenEdit = useCallback(() => {
    setMode('edit');
    setCurrentChord((c) => c ?? PLACEHOLDER_EDIT_CHORD);
    setIsOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleInsert = useCallback((chord: ChordDTO) => {
    setCurrentChord(chord);
    // Sync key from inserted chord so "open for edit" opens with same scale (e.g. melodic)
    if (chord.context?.keyRoot) setRoot(chord.context.keyRoot as string);
    if (chord.context?.keyScale) {
      const scaleNorm = chord.context.keyScale.toLowerCase().replace(/\s+/g, '_');
      if (scaleNorm === 'melodic_minor' || scaleNorm === 'harmonic_minor' || scaleNorm === 'aeolian' || scaleNorm === 'minor') {
        setTonality('minor');
        const minor = minorScaleTypeFromKeyScale(chord.context.keyScale);
        if (minor) setMinorScaleType(minor);
      } else if (scaleNorm === 'major' || scaleNorm === 'ionian') {
        setTonality('major');
      }
    }
    setIsOpen(false);
  }, []);

  const handleUpdate = useCallback((chord: ChordDTO) => {
    setCurrentChord(chord);
    setIsOpen(false);
  }, []);

  const handleRemove = useCallback(() => {
    setCurrentChord(undefined);
    setIsOpen(false);
  }, []);

  const handleSongKeyChange = useCallback((newKey: SongKey) => {
    setRoot(newKey.root as string);
    const scale = newKey.scale as string;
    const tonalityValue = scale === 'major_emotional' ? 'major' : scale === 'minor_emotional' ? 'minor' : scale;
    setTonality(tonalityValue);
    if (newKey.minorScaleType) setMinorScaleType(newKey.minorScaleType);
  }, []);

  const handleTutorialComplete = useCallback((reason?: 'completed' | 'dismissed') => {
    if (reason) console.log('Tour completed:', reason);
    setShowTutorial(false);
  }, []);

  const handleTutorialSkipPermanent = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(TUTORIAL_SKIPPED_KEY, '1');
    }
    setShowTutorial(false);
  }, []);

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif', maxWidth: 560 }}>
      <h1 style={{ marginTop: 0 }}>Chord Explorer – Contract Test</h1>
      <p style={{ color: '#666', marginBottom: 24 }}>
        Mirror of ChordExplorerProps: root, tonality, isOpen, mode, currentChord, previousChord, callbacks.
      </p>

      {/* Key (root + tonality + minor variant) – parent-controlled */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 14, marginBottom: 8 }}>Key (root + tonality)</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <label>
            Root
            <select
              value={root}
              onChange={(e) => setRoot(e.target.value)}
              style={{ marginLeft: 8, padding: 6 }}
            >
              {ROOTS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
          <label>
            Tonality
            <select
              value={tonality}
              onChange={(e) => setTonality(e.target.value)}
              style={{ marginLeft: 8, padding: 6 }}
            >
              {TONALITIES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </label>
          {tonality === 'minor' && (
            <label>
              Minor scale
              <select
                value={minorScaleType}
                onChange={(e) => setMinorScaleType(e.target.value as MinorScaleType)}
                style={{ marginLeft: 8, padding: 6 }}
              >
                <option value="natural">Natural</option>
                <option value="harmonic">Harmonic</option>
                <option value="melodic">Melodic</option>
              </select>
            </label>
          )}
        </div>
      </section>

      {/* Actions: open for insert / open for edit */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 14, marginBottom: 8 }}>Open Chord Explorer</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={handleOpenInsert} style={{ padding: '8px 16px' }}>
            Open for insert
          </button>
          <button type="button" onClick={handleOpenEdit} style={{ padding: '8px 16px' }}>
            Open for edit
          </button>
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem(TUTORIAL_SKIPPED_KEY);
              setShowTutorial(true);
              setIsOpen(true);
              setMode('insert');
              setCurrentChord(undefined);
            }}
            style={{ padding: '8px 16px', fontSize: 12, opacity: 0.8 }}
            title="Reset tutorial preference and open with tour"
          >
            Show tutorial
          </button>
        </div>
      </section>

      {/* Reflected state + inserted chord data (for testing) */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 14, marginBottom: 8 }}>Reflected state</h2>
        <div style={{ background: '#f5f5f5', color: '#1a1a1a', padding: 12, borderRadius: 8 }}>
          <div><strong>Current chord:</strong> {currentChord ? currentChord.symbol : '—'}</div>
          <div><strong>Previous chord:</strong> {previousChord ? previousChord.symbol : '—'}</div>
          <div><strong>Key synced from explorer:</strong> {root} {tonality}{tonality === 'minor' ? ` (${minorScaleType})` : ''}</div>
        </div>
        {currentChord && (
          <>
            <h3 style={{ fontSize: 12, marginTop: 16, marginBottom: 6 }}>Data from insert/edit (for testing)</h3>
            <pre style={{ background: '#f0f0f0', color: '#1a1a1a', padding: 10, borderRadius: 6, fontSize: 11, overflow: 'auto', maxHeight: 200 }}>
              {JSON.stringify(
                {
                  symbol: currentChord.symbol,
                  root: currentChord.root,
                  quality: currentChord.quality,
                  inversion: currentChord.inversion,
                  context: currentChord.context,
                },
                null,
                2
              )}
            </pre>
          </>
        )}
      </section>

      {/* Optional: set previous chord for suggestion seeding */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 14, marginBottom: 8 }}>Optional: previous chord (for suggestions)</h2>
        <button
          type="button"
          onClick={() => setPreviousChord(currentChord ?? undefined)}
          style={{ padding: '6px 12px', marginRight: 8 }}
        >
          Use current as previous
        </button>
        <button
          type="button"
          onClick={() => setPreviousChord(undefined)}
          style={{ padding: '6px 12px' }}
        >
          Clear previous
        </button>
      </section>

      <ChordExplorer
        isOpen={isOpen}
        mode={mode}
        songKey={songKey}
        currentChord={currentChord}
        previousChord={previousChord}
        onInsert={handleInsert}
        onUpdate={handleUpdate}
        onRemove={handleRemove}
        onClose={handleClose}
        onSongKeyChange={handleSongKeyChange}
        showTutorialOnOpen={showTutorial}
        onTutorialComplete={handleTutorialComplete}
        onTutorialSkipPermanent={handleTutorialSkipPermanent}
      />
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
