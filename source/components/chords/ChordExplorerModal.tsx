'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ChordExplorer from '@/lib/chord-explorer/components/ChordExplorer';
import type { ChordDTO } from '@/lib/chord-explorer/types/chordDto';
import type { Chord } from '@/lib/chord-explorer/harmonizer';
import type { UserProgression } from '@/lib/chord-explorer/userProgressions';
import {
  provenanceSongKeyToSongKey,
  songKeyToProvenanceSongKey,
  chordDTOToProvenanceSymbol,
  provenanceChordToChordDTO,
  symbolToChordDTO,
} from '@/lib/chord-explorer-adapter';
import { insertChord } from '@/lib/chordInsertion';
import type { ChordInsertionContext, ChordInsertionResult } from '@/lib/chordInsertion';
import type { Chord as ProvenanceChord } from '@/lib/types';
import { isAuthenticated } from '@/lib/auth';
import { pluginSettingsApi } from '@/lib/api';

export interface ChordExplorerModalProps {
  isOpen: boolean;
  mode: 'insert' | 'edit';
  songKey: string;
  currentChord?: ProvenanceChord | null;
  previousChordSymbol?: string | null;
  insertionContext?: ChordInsertionContext;
  /** When provided, used instead of insertChord (e.g. for optimistic sync). */
  insertChordOverride?: (symbol: string, context: ChordInsertionContext) => Promise<ChordInsertionResult>;
  onInsertionSuccess?: (chordId: string, symbol: string) => void;
  onInsertionError?: (error: string) => void;
  onEditChord?: (chordId: string, symbol: string) => void;
  onRemoveChord?: (chordId: string) => void;
  onClose: () => void;
  onSongKeyChange?: (songKey: string) => void;
  /** When true, show the chord-explorer tutorial on open. Parent typically from persisted tour state. */
  showTutorialOnOpen?: boolean;
  /** Called when the tour ends. reason 'completed' = persist so tour is not shown again; 'dismissed' = do not persist. */
  onTutorialComplete?: (reason?: 'completed' | 'dismissed') => void;
  /** Called when user chooses "Don't show again". Parent should persist and pass showTutorialOnOpen: false next time. */
  onTutorialSkipPermanent?: () => void;
}

export default function ChordExplorerModal({
  isOpen,
  mode,
  songKey,
  currentChord,
  previousChordSymbol,
  insertionContext,
  insertChordOverride,
  onInsertionSuccess,
  onInsertionError,
  onEditChord,
  onRemoveChord,
  onClose,
  onSongKeyChange,
  showTutorialOnOpen,
  onTutorialComplete,
  onTutorialSkipPermanent,
}: ChordExplorerModalProps) {
  const songKeyDTO = provenanceSongKeyToSongKey(songKey);
  const currentChordDTO = currentChord
    ? provenanceChordToChordDTO(currentChord, songKey)
    : undefined;
  const previousChordDTO = previousChordSymbol
    ? symbolToChordDTO(previousChordSymbol, songKey)
    : undefined;

  // Plugin persistence: fetch initial data when modal opens and user is logged in
  const [pluginInitialData, setPluginInitialData] = useState<{
    customChords: Chord[];
    progressions: UserProgression[];
  } | null>(null);
  const [hasPassedInitialData, setHasPassedInitialData] = useState(false);
  const [chordExplorerTheme, setChordExplorerTheme] = useState<'light' | 'dark' | 'system' | null>(null);

  // Pending sync: React performs API calls in useEffect (same pattern as Tour)
  const [pendingCustomChords, setPendingCustomChords] = useState<Chord[] | null>(null);
  const [pendingProgressionsSync, setPendingProgressionsSync] = useState<
    | { type: 'save'; progression: UserProgression }
    | { type: 'delete'; id: string }
    | null
  >(null);

  useEffect(() => {
    if (!isOpen) {
      setHasPassedInitialData(false);
      setPluginInitialData(null);
      setChordExplorerTheme(null);
      setPendingCustomChords(null);
      setPendingProgressionsSync(null);
      return;
    }
    if (!isAuthenticated()) {
      setChordExplorerTheme('system');
      return;
    }
    pluginSettingsApi
      .getPluginSettings('chord-explorer')
      .then((settings) => {
        const customChords = Array.isArray(settings.custom_chords)
          ? (settings.custom_chords as Chord[])
          : [];
        const progressions = Array.isArray(settings.saved_progressions)
          ? (settings.saved_progressions as UserProgression[])
          : [];
        setPluginInitialData({ customChords, progressions });
        const t = settings.theme;
        if (t === 'light' || t === 'dark' || t === 'system') setChordExplorerTheme(t);
        else setChordExplorerTheme('system');
      })
      .catch(() => {
        setPluginInitialData(null);
        setChordExplorerTheme('system');
      });
  }, [isOpen]);

  // After first render with initial data, mark as passed so we don't overwrite localStorage on subsequent renders
  useEffect(() => {
    if (pluginInitialData && !hasPassedInitialData) setHasPassedInitialData(true);
  }, [pluginInitialData, hasPassedInitialData]);

  // React-owned API calls for plugin settings (same pattern as Tour)
  useEffect(() => {
    if (pendingCustomChords === null) return;
    const chords = pendingCustomChords;
    setPendingCustomChords(null);
    pluginSettingsApi
      .setPluginSetting('chord-explorer', 'custom_chords', chords)
      .catch((err) => console.warn('Failed to sync custom chords:', err));
  }, [pendingCustomChords]);

  useEffect(() => {
    if (pendingProgressionsSync === null) return;
    const payload = pendingProgressionsSync;
    setPendingProgressionsSync(null);
    if (payload.type === 'save') {
      pluginSettingsApi
        .getPluginSettings('chord-explorer')
        .then((settings) => {
          const list = Array.isArray(settings.saved_progressions)
            ? (settings.saved_progressions as UserProgression[])
            : [];
          const without = list.filter((p) => p.id !== payload.progression.id);
          without.unshift(payload.progression);
          return pluginSettingsApi.setPluginSetting(
            'chord-explorer',
            'saved_progressions',
            without
          );
        })
        .catch((err) => console.warn('Failed to save progression:', err));
    } else {
      pluginSettingsApi
        .getPluginSettings('chord-explorer')
        .then((settings) => {
          const list = Array.isArray(settings.saved_progressions)
            ? (settings.saved_progressions as UserProgression[])
            : [];
          const filtered = list.filter((p) => p.id !== payload.id);
          return pluginSettingsApi.setPluginSetting(
            'chord-explorer',
            'saved_progressions',
            filtered
          );
        })
        .catch((err) => console.warn('Failed to delete progression:', err));
    }
  }, [pendingProgressionsSync]);

  const initialCustomChordsToPass =
    pluginInitialData && !hasPassedInitialData ? pluginInitialData.customChords : undefined;
  const initialProgressionsToPass =
    pluginInitialData && !hasPassedInitialData ? pluginInitialData.progressions : undefined;

  const pluginPersistence = useMemo(() => {
    if (!isAuthenticated()) return undefined;
    return {
      getCustomChords: async (): Promise<Chord[]> => {
        const settings = await pluginSettingsApi.getPluginSettings('chord-explorer');
        return Array.isArray(settings.custom_chords) ? (settings.custom_chords as Chord[]) : [];
      },
      setCustomChords: async (chords: Chord[]): Promise<void> => {
        setPendingCustomChords(chords);
      },
      getProgressions: async (): Promise<UserProgression[]> => {
        const settings = await pluginSettingsApi.getPluginSettings('chord-explorer');
        return Array.isArray(settings.saved_progressions)
          ? (settings.saved_progressions as UserProgression[])
          : [];
      },
      saveProgression: async (progression: UserProgression): Promise<boolean> => {
        setPendingProgressionsSync({ type: 'save', progression });
        return true;
      },
      deleteProgression: async (id: string): Promise<void> => {
        setPendingProgressionsSync({ type: 'delete', id });
      },
    };
  }, []);

  const handleInsert = useCallback(
    async (chord: ChordDTO) => {
      if (!insertionContext) {
        onInsertionError?.('No insertion context');
        onClose();
        return;
      }
      const symbol = chordDTOToProvenanceSymbol(chord);
      const result = insertChordOverride
        ? await insertChordOverride(symbol, insertionContext)
        : await insertChord(symbol, insertionContext);
      if (result.success && result.chordId) {
        onInsertionSuccess?.(result.chordId, symbol);
        onClose();
      } else {
        onInsertionError?.(result.error ?? 'Failed to insert chord');
      }
    },
    [insertionContext, insertChordOverride, onInsertionSuccess, onInsertionError, onClose]
  );

  const handleUpdate = useCallback(
    (chord: ChordDTO) => {
      if (!currentChord || !onEditChord) return;
      const symbol = chordDTOToProvenanceSymbol(chord);
      onEditChord(currentChord.chordId, symbol);
      onClose();
    },
    [currentChord, onEditChord, onClose]
  );

  const handleRemove = useCallback(() => {
    if (!currentChord || !onRemoveChord) return;
    onRemoveChord(currentChord.chordId);
    onClose();
  }, [currentChord, onRemoveChord, onClose]);

  const handleSongKeyChange = useCallback(
    (newKey: { root: string; scale: string }) => {
      const provenanceKey = songKeyToProvenanceSongKey(newKey);
      onSongKeyChange?.(provenanceKey);
    },
    [onSongKeyChange]
  );

  if (!isOpen) return null;

  /* Defer render until theme is loaded – prevents flash of app theme */
  if (chordExplorerTheme === null) {
    return (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-[#e8e6e3]"
        role="dialog"
        aria-modal="true"
        aria-label="Loading Chord Explorer"
      >
        <p className="text-sm text-[#4a4a4e]">Loading…</p>
      </div>
    );
  }

  return (
    <ChordExplorer
      isOpen={isOpen}
      mode={mode}
      songKey={songKeyDTO}
      currentChord={currentChordDTO}
      previousChord={previousChordDTO}
      onInsert={handleInsert}
      onUpdate={handleUpdate}
      onRemove={handleRemove}
      onClose={onClose}
      onSongKeyChange={onSongKeyChange ? handleSongKeyChange : undefined}
      showTutorialOnOpen={showTutorialOnOpen}
      onTutorialComplete={onTutorialComplete}
      onTutorialSkipPermanent={onTutorialSkipPermanent}
      theme={chordExplorerTheme}
      initialCustomChords={initialCustomChordsToPass}
      initialProgressions={initialProgressionsToPass}
      pluginPersistence={pluginPersistence}
    />
  );
}
