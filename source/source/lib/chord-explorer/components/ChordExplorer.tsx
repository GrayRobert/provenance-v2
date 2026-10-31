import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChordExplorerProps, SongKey } from '../types/chordExplorer';
import type { ChordDTO } from '../types/chordDto';
import { mountChordExplorer } from '../main';
import { mountChordProgressionPlayer } from '../chordProgressionPlayer';
import ChordExplorerTour from './ChordExplorerTour';
import { wakeAudioContext, enableDeviceSpeaker, getAudioState } from '../audioEngine';
import { ensureMaterialSymbolsLoaded } from '../materialSymbols';
import '../styles.css';
import '../chordExplorerModal.css';

function resolveEffectiveTheme(theme: 'light' | 'dark' | 'system'): 'light' | 'dark' {
  if (theme === 'light') return 'light';
  if (theme === 'dark') return 'dark';
  // When 'system', follow the host app's theme (document already set by layout script) so we match and avoid a white flash when opening in dark mode
  if (typeof document !== 'undefined') {
    const appTheme = document.documentElement.getAttribute('data-theme');
    if (appTheme === 'dark') return 'dark';
    if (appTheme === 'light') return 'light';
  }
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

const ChordExplorer: React.FC<ChordExplorerProps> = (props) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<ReturnType<typeof mountChordExplorer> | null>(null);
  const progressionPlayerContainerRef = useRef<HTMLDivElement | null>(null);
  const progressionPlayerInstanceRef = useRef<ReturnType<typeof mountChordProgressionPlayer> | null>(null);
  const tourShownThisSessionRef = useRef(false);
  const [showReactTour, setShowReactTour] = useState(false);
  /** Set when handleMinorScaleTypeChange is called (e.g. during playback). Next main-explorer updateProps will skip playing current chord to avoid double-play. */
  const skipPlayOnApplyCurrentChordRef = useRef(false);
  
  // Internal state for songKey - single source of truth in the wrapper
  const [internalSongKey, setInternalSongKey] = useState<SongKey>(props.songKey);

  const themePreference = props.theme ?? 'system';
  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>(() =>
    resolveEffectiveTheme(themePreference)
  );

  const [showWarmingModal, setShowWarmingModal] = useState(false);
  const [warmingStatus, setWarmingStatus] = useState<'pending' | 'enabling' | 'done'>('pending');
  const [speakerEnabled, setSpeakerEnabled] = useState(false);
  const [speakerButtonLoading, setSpeakerButtonLoading] = useState(false);

  useEffect(() => {
    ensureMaterialSymbolsLoaded();
  }, []);

  useEffect(() => {
    setEffectiveTheme(resolveEffectiveTheme(themePreference));
    if (themePreference !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => setEffectiveTheme(resolveEffectiveTheme('system'));
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [themePreference]);

  useEffect(() => {
    if (!props.isOpen) {
      setShowWarmingModal(false);
      setWarmingStatus('pending');
      setSpeakerEnabled(false);
      return;
    }
    const audioState = getAudioState();
    if (audioState === 'running') {
      setShowWarmingModal(false);
    } else {
      setShowWarmingModal(true);
      setWarmingStatus('pending');
    }
  }, [props.isOpen]);

  const handleEnableAudio = useCallback(async () => {
    setWarmingStatus('enabling');
    try {
      await wakeAudioContext();
      setWarmingStatus('done');
      await new Promise((r) => setTimeout(r, 300));
      setShowWarmingModal(false);
    } catch {
      setWarmingStatus('pending');
    }
  }, []);

  const handleEnableSpeaker = useCallback(async () => {
    setSpeakerButtonLoading(true);
    try {
      const success = await enableDeviceSpeaker();
      if (success) {
        setSpeakerEnabled(true);
      }
    } finally {
      setSpeakerButtonLoading(false);
    }
  }, []);

  const handleWarmingClose = useCallback(() => {
    setShowWarmingModal(false);
  }, []);

  const handleInsert = useCallback(
    (chord: ChordDTO) => {
      props.onInsert(chord);
      props.onClose();
    },
    [props]
  );

  const handleUpdate = useCallback(
    (chord: ChordDTO) => {
      props.onUpdate(chord);
      props.onClose();
    },
    [props]
  );

  const handleRemove = useCallback(() => {
    props.onRemove();
    props.onClose();
  }, [props]);

  // Handle songKey changes from parent React/Next.js app
  useEffect(() => {
    setInternalSongKey(props.songKey);
  }, [props.songKey]);

  // Handle songKey changes from vanilla app (root/tonality selector) or progression player ("Change key to match chords")
  const handleSongKeyChange = useCallback(
    (songKey: SongKey) => {
      setInternalSongKey(songKey);
      props.onSongKeyChange?.(songKey);
      // Push new key to main app immediately so key switches reliably every time (not only on first change)
      if (instanceRef.current) {
        instanceRef.current.updateProps({
          ...props,
          songKey,
          onInsert: handleInsert,
          onUpdate: handleUpdate,
          onRemove: handleRemove,
          onSongKeyChange: handleSongKeyChange,
        });
      }
    },
    [props, handleInsert, handleUpdate, handleRemove]
  );

  // When user applies a minor progression (or playback switches scale), switch palette to that minor scale (Natural / Harmonic / Melodic)
  const handleMinorScaleTypeChange = useCallback(
    (minorScaleType: 'natural' | 'harmonic' | 'melodic') => {
      skipPlayOnApplyCurrentChordRef.current = true;
      setInternalSongKey((prev) => ({ ...prev, minorScaleType }));
      const newKey: SongKey = { ...internalSongKey, minorScaleType };
      props.onSongKeyChange?.(newKey);
    },
    [internalSongKey, props]
  );

  const bridgeProps: ChordExplorerProps = useMemo(
    () => ({
      ...props,
      songKey: internalSongKey,
      onInsert: handleInsert,
      onUpdate: handleUpdate,
      onRemove: handleRemove,
      onSongKeyChange: handleSongKeyChange,
    }),
    [props, internalSongKey, handleInsert, handleUpdate, handleRemove, handleSongKeyChange]
  );

  useEffect(() => {
    if (!props.isOpen) return;
    const container = containerRef.current;
    if (!container) return;

    if (!instanceRef.current) {
      instanceRef.current = mountChordExplorer(container, bridgeProps);
    }

    return () => {
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
  }, [props.isOpen]);

  useEffect(() => {
    if (props.isOpen && instanceRef.current) {
      const skipPlay = skipPlayOnApplyCurrentChordRef.current;
      if (skipPlay) skipPlayOnApplyCurrentChordRef.current = false;
      instanceRef.current.updateProps({ ...bridgeProps, skipPlayOnApplyCurrentChord: skipPlay });
    }
  }, [bridgeProps, props.isOpen]);

  // Mount progression player
  useEffect(() => {
    if (!props.isOpen) return;
    const container = progressionPlayerContainerRef.current;
    if (!container) return;

    if (!progressionPlayerInstanceRef.current) {
      progressionPlayerInstanceRef.current = mountChordProgressionPlayer(container, {
        songKey: internalSongKey,
        mode: props.mode,
        currentChord: props.currentChord,
        onInsert: handleInsert,
        onUpdate: handleUpdate,
        onRemove: handleRemove,
        onSongKeyChange: handleSongKeyChange,
        onMinorScaleTypeChange: handleMinorScaleTypeChange,
        theme: effectiveTheme,
      });
    }

    return () => {
      progressionPlayerInstanceRef.current?.destroy();
      progressionPlayerInstanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.isOpen]); // Only remount when isOpen changes; updateProps handles key/mode changes

  // Update progression player props
  useEffect(() => {
    if (props.isOpen && progressionPlayerInstanceRef.current) {
      progressionPlayerInstanceRef.current.updateProps({
        songKey: internalSongKey,
        mode: props.mode,
        currentChord: props.currentChord,
        onInsert: handleInsert,
        onUpdate: handleUpdate,
        onRemove: handleRemove,
        onSongKeyChange: handleSongKeyChange,
        onMinorScaleTypeChange: handleMinorScaleTypeChange,
        theme: effectiveTheme,
      });
    }
  }, [props.isOpen, internalSongKey, props.mode, props.currentChord, effectiveTheme, handleInsert, handleUpdate, handleRemove, handleSongKeyChange]);

  // Show React tour when modal opens and showTutorialOnOpen is true (once per session)
  useEffect(() => {
    if (!props.isOpen || !props.showTutorialOnOpen || tourShownThisSessionRef.current) {
      if (!props.isOpen) setShowReactTour(false);
      return;
    }

    const timer = setTimeout(() => {
      tourShownThisSessionRef.current = true;
      setShowReactTour(true);
    }, 400);

    return () => clearTimeout(timer);
  }, [props.isOpen, props.showTutorialOnOpen]);

  // Reset session ref when modal closes so tour can show again next open if user had dismissed
  useEffect(() => {
    if (!props.isOpen) {
      tourShownThisSessionRef.current = false;
    }
  }, [props.isOpen]);

  const handleTourComplete = useCallback(
    (reason?: 'completed' | 'dismissed') => {
      setShowReactTour(false);
      props.onTutorialComplete?.(reason);
    },
    [props]
  );

  const handleTourSkipPermanent = useCallback(() => {
    setShowReactTour(false);
    props.onTutorialSkipPermanent?.();
  }, [props]);

  if (!props.isOpen) {
    return null;
  }

  return (
    <div
      className="chord-explorer-modal"
      role="dialog"
      aria-modal="true"
      data-theme={effectiveTheme}
    >
      <div className="chord-explorer-modal__backdrop" onClick={props.onClose} />
      <div className="chord-explorer-modal__content">
        <button
          type="button"
          className="chord-explorer-modal__close"
          aria-label="Close chord explorer"
          onClick={props.onClose}
        >
          ×
        </button>
        <div className="chord-explorer-container" ref={containerRef} />
        <div className="chord-progression-player-container" ref={progressionPlayerContainerRef} />
        <ChordExplorerTour
          isActive={showReactTour}
          onComplete={handleTourComplete}
          onSkipPermanent={handleTourSkipPermanent}
        />
        {showWarmingModal && (
          <div className="chord-explorer-warming-overlay" role="dialog" aria-modal="true" aria-label="Enable audio">
            <div className="chord-explorer-warming-backdrop" />
            <div className="chord-explorer-warming-panel">
              <div className="chord-explorer-warming-header">
                <h2 className="chord-explorer-warming-title">Enable audio</h2>
                <button
                  type="button"
                  className="chord-explorer-warming-close"
                  aria-label="Close"
                  onClick={handleWarmingClose}
                >
                  ×
                </button>
              </div>
              <p className="chord-explorer-warming-description">
                Tap the button below to enable audio playback.
              </p>
              <button
                type="button"
                className="chord-explorer-warming-enable-btn"
                onClick={handleEnableAudio}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  handleEnableAudio();
                }}
                disabled={warmingStatus === 'enabling'}
              >
                {warmingStatus === 'enabling' ? 'Enabling…' : warmingStatus === 'done' ? 'Done!' : 'Turn on audio'}
              </button>
              <div className="chord-explorer-warming-speaker-section">
                <p className="chord-explorer-warming-hint">
                  For speaker playback, turn off your device's mute/silent switch.
                </p>
                <button
                  type="button"
                  className="chord-explorer-warming-speaker-btn"
                  onClick={handleEnableSpeaker}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    handleEnableSpeaker();
                  }}
                  disabled={speakerButtonLoading || speakerEnabled}
                >
                  {speakerButtonLoading ? 'Enabling…' : speakerEnabled ? 'Speaker enabled' : 'Turn on device speaker'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChordExplorer;
