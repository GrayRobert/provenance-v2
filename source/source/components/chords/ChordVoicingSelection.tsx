'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { chordLibraryApi, userVoicingsApi, pluginSettingsApi, type ChordVoicingDTO, type UserChordVoicingDTO } from '@/lib/api';
import { parseChord, isValidChord, getPianoVoicings } from '@/lib/chordService';
import ChordEditor, { type ChordEditorState } from '@/lib/chord-builder/components/chord-editor';
import {
  guitarChordToLibraryFormat,
  type GuitarChordLibraryFormat,
} from '@/lib/chord-builder/guitarToChordLibrary';
import { chordToReactChordsDisplayFormat } from '@/lib/chordsDbAdapter';
import Chord from '@tombatossals/react-chords/lib/Chord';
import { REACT_CHORDS_GUITAR } from '@/lib/chordsDbAdapter';
import PianoChordDiagram from './PianoChordDiagram';
import ChordVoicingSelectionTour from './ChordVoicingSelectionTour';
import { HelpCircle, Trash2 } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';

export interface ChordVoicingSelectionProps {
  isOpen: boolean;
  /** When omitted or empty, quick select is hidden and user builds a new chord only. */
  chordId?: string;
  /** When omitted or empty, no library voicings are loaded; user builds a new chord only. */
  symbol?: string;
  instrument: 'guitar' | 'piano';
  songId: string;
  /** Current voicing id for this chord (if any) – opens in edit mode with this voicing loaded. */
  currentVoicingId?: string | null;
  /** Called with the chosen voicing id and, when inserting a new voicing, the effective chord symbol (e.g. if user built Em, pass "Em" so the song chord can be updated). For guitar, `guitarVoicing` carries frets for tab autofill when inserting from the tab staff. */
  onSelect: (
    voicingId: string,
    effectiveSymbol?: string,
    guitarVoicing?: GuitarChordLibraryFormat | null
  ) => void;
  onSkip?: () => void;
  onClose: () => void;
  /** When true, show the chord voicing tutorial on open. Parent typically from persisted tour state. */
  showTutorialOnOpen?: boolean;
  /** Called when the tour ends. reason 'completed' = persist so tour is not shown again; 'dismissed' = do not persist. */
  onTutorialComplete?: (reason?: 'completed' | 'dismissed') => void;
  /** Called when user chooses "Don't show again". Parent should persist and pass showTutorialOnOpen: false next time. */
  onTutorialSkipPermanent?: () => void;
}

type QuickSelectItem =
  | { type: 'library'; id: string; chord: ChordVoicingDTO['chord']; name?: string }
  | { type: 'user'; id: string; chord: UserChordVoicingDTO['chord']; name?: string }
  | { type: 'inversion'; id: string; chord: { notes: string[] }; name: string };

function chordFromItem(item: QuickSelectItem): Record<string, unknown> {
  return (item.chord ?? {}) as Record<string, unknown>;
}

function guitarLibraryFromQuickItem(item: QuickSelectItem): GuitarChordLibraryFormat | null {
  if (item.type === 'inversion') return null;
  const c = chordFromItem(item);
  const frets = c.frets as number[] | undefined;
  if (!Array.isArray(frets) || frets.length === 0) return null;
  return {
    frets,
    fingers: Array.isArray(c.fingers) ? (c.fingers as number[]) : undefined,
    barres: Array.isArray(c.barres) ? (c.barres as number[]) : undefined,
    baseFret: typeof c.baseFret === 'number' ? c.baseFret : undefined,
  };
}

/** Normalize guitar library format for equality (frets + baseFret; barres are derived). */
function guitarLibraryKey(chord: Record<string, unknown>): string {
  const frets = (chord.frets as number[] | undefined) ?? [];
  const baseFret = (chord.baseFret as number | undefined) ?? 1;
  return JSON.stringify({ frets, baseFret });
}

/** Normalize piano chord for equality (sorted notes). */
function pianoChordKey(notes: string[]): string {
  return [...notes].sort().join(',');
}

/** Find a quick-select voicing that matches the current builder state, if any. */
function findMatchingVoicingId(
  builderState: ChordEditorState | null,
  quickSelectItems: QuickSelectItem[],
  instrument: 'guitar' | 'piano'
): string | null {
  if (!builderState) return null;
  if (instrument === 'guitar' && builderState.mode === 'guitar') {
    const current = guitarChordToLibraryFormat(builderState.chord);
    const key = guitarLibraryKey(current as unknown as Record<string, unknown>);
    for (const item of quickSelectItems) {
      const c = chordFromItem(item);
      if (Array.isArray(c.frets) && guitarLibraryKey(c) === key) return item.id;
    }
    return null;
  }
  if (instrument === 'piano' && builderState.mode === 'piano') {
    const notes = Array.from(builderState.pianoActiveNotes);
    const key = pianoChordKey(notes);
    for (const item of quickSelectItems) {
      const c = chordFromItem(item);
      const itemNotes = (c.notes as string[] | undefined) ?? [];
      if (pianoChordKey(itemNotes) === key) return item.id;
    }
    return null;
  }
  return null;
}

/** Two-digit voicing number for consistent label width (01–99, XX for 100+). */
function formatVoicingNumber(n: number): string {
  if (n >= 1 && n <= 99) return n.toString().padStart(2, '0');
  return 'XX';
}

export default function ChordVoicingSelection({
  isOpen,
  chordId = '',
  symbol: symbolProp = '',
  instrument,
  songId,
  currentVoicingId = null,
  onSelect,
  onSkip,
  onClose,
  showTutorialOnOpen,
  onTutorialComplete,
  onTutorialSkipPermanent,
}: ChordVoicingSelectionProps) {
  const symbol = symbolProp ?? '';
  const hasChord = !!symbol && isValidChord(symbol);
  const normalizedSymbol = parseChord(symbol)?.normalizedSymbol ?? symbol;
  const [libraryVoicings, setLibraryVoicings] = useState<ChordVoicingDTO[]>([]);
  const [userVoicings, setUserVoicings] = useState<UserChordVoicingDTO[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [loadingUser, setLoadingUser] = useState(false);
  const [currentVoicingData, setCurrentVoicingData] = useState<UserChordVoicingDTO | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [builderState, setBuilderState] = useState<ChordEditorState | null>(null);
  const [inserting, setInserting] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState('');
  const editingNameInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  /** When true, current editor state is custom (doesn't match any library voicing); show "use and save" vs "use without saving". */
  const [showCustomVoicingChoice, setShowCustomVoicingChoice] = useState(false);
  const tourShownThisSessionRef = useRef(false);
  const [showTour, setShowTour] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document === 'undefined') return 'light';
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  });
  const [helpDrawerOpen, setHelpDrawerOpen] = useState(false);

  const isUpdate = !!currentVoicingId;

  useEffect(() => {
    if (!isOpen) return;
    pluginSettingsApi
      .getPluginSettings('chord-voicing-selection')
      .then((settings) => {
        const t = settings.theme;
        if (t === 'light') setTheme('light');
        else if (t === 'dark') setTheme('dark');
        else {
          const doc = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : null;
          setTheme(doc === 'dark' ? 'dark' : 'light');
        }
      })
      .catch(() => setTheme('light'));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setShowCustomVoicingChoice(false);
      setSelectedId(null);
      return;
    }
    if (!hasChord) {
      setLibraryVoicings([]);
      setUserVoicings([]);
      setCurrentVoicingData(null);
      setSelectedId(null);
      return;
    }
    setLoadingLibrary(true);
    chordLibraryApi
      .getVoicings(instrument, normalizedSymbol)
      .then(async (list) => {
        if (list.length > 0) return list;
        // Many chord libraries store major as "Gmaj" etc.; Tonal gives "G" – try alternate
        const parsed = parseChord(symbol);
        if (parsed?.type === 'major' && /^[A-Ga-g][#b]?$/.test(normalizedSymbol)) {
          return chordLibraryApi.getVoicings(instrument, normalizedSymbol + 'maj');
        }
        return list;
      })
      .then(setLibraryVoicings)
      .catch(() => setLibraryVoicings([]))
      .finally(() => setLoadingLibrary(false));

    setLoadingUser(true);
    userVoicingsApi
      .list(instrument, normalizedSymbol)
      .then(setUserVoicings)
      .catch(() => setUserVoicings([]))
      .finally(() => setLoadingUser(false));
  }, [isOpen, hasChord, symbol, normalizedSymbol, instrument]);

  // Load current voicing data only when it's a user voicing (not library). Use list data when present to avoid extra getById.
  useEffect(() => {
    if (!isOpen || !currentVoicingId || loadingLibrary) {
      if (!isOpen || !currentVoicingId) setCurrentVoicingData(null);
      return;
    }
    const isLibraryId = libraryVoicings.some((v) => v.id === currentVoicingId);
    if (isLibraryId) {
      setCurrentVoicingData(null);
      return;
    }
    const fromList = userVoicings.find((v) => v.id === currentVoicingId);
    if (fromList && fromList.normalizedSymbol === normalizedSymbol) {
      setCurrentVoicingData(fromList);
      setSelectedId(fromList.id);
      return;
    }
    // Only call getById for archived user voicings (not in list)
    userVoicingsApi
      .getById(currentVoicingId)
      .then((v) => {
        if (!v) {
          setCurrentVoicingData(null);
          return;
        }
        if (v.normalizedSymbol !== normalizedSymbol) {
          setCurrentVoicingData(null);
          setSelectedId(null);
          return;
        }
        setCurrentVoicingData(v);
        setSelectedId(v.id);
      })
      .catch(() => setCurrentVoicingData(null));
  }, [isOpen, currentVoicingId, normalizedSymbol, libraryVoicings, loadingLibrary, userVoicings]);

  const pianoInversionItems = useMemo((): QuickSelectItem[] => {
    if (instrument !== 'piano' || !symbol || !isValidChord(symbol)) return [];
    const voicings = getPianoVoicings(symbol);
    return voicings.map((v, i) => ({
      type: 'inversion' as const,
      id: `inversion-${i}`,
      chord: { notes: v.notes },
      name: v.name,
    }));
  }, [instrument, symbol]);

  const quickSelectItems = useMemo((): QuickSelectItem[] => {
    const lib: QuickSelectItem[] = libraryVoicings.map((v) => ({
      type: 'library',
      id: v.id,
      chord: v.chord,
      name: v.name,
    }));
    const user: QuickSelectItem[] = userVoicings.map((v, i) => ({
      type: 'user',
      id: v.id,
      chord: v.chord,
      name: v.name ?? `Custom ${i + 1}`,
    }));
    return [...pianoInversionItems, ...lib, ...user];
  }, [pianoInversionItems, libraryVoicings, userVoicings]);

  // Pre-select current voicing in quick-select when it appears in the list (covers both library and user voicings).
  useEffect(() => {
    if (!isOpen || !currentVoicingId || quickSelectItems.length === 0) return;
    if (quickSelectItems.some((i) => i.id === currentVoicingId)) {
      setSelectedId(currentVoicingId);
    }
  }, [isOpen, currentVoicingId, quickSelectItems]);

  // Default-select first library voicing when opening for insert (no currentVoicingId).
  useEffect(() => {
    if (!isOpen || currentVoicingId || loadingLibrary) return;
    if (libraryVoicings.length > 0 && selectedId === null) {
      setSelectedId(libraryVoicings[0].id);
    }
  }, [isOpen, currentVoicingId, loadingLibrary, libraryVoicings, selectedId]);

  const selectedItem = useMemo(
    () => quickSelectItems.find((i) => i.id === selectedId) ?? null,
    [quickSelectItems, selectedId]
  );

  const initialGuitar = useMemo(() => {
    if (instrument !== 'guitar') return null;
    const chord = selectedItem
      ? chordFromItem(selectedItem)
      : currentVoicingData?.chord
        ? (currentVoicingData.chord as Record<string, unknown>)
        : null;
    if (!chord || !Array.isArray(chord.frets)) return null;
    return chord as { frets: number[]; fingers?: number[]; barres?: number[]; baseFret?: number };
  }, [instrument, selectedItem, currentVoicingData]);

  const initialPiano = useMemo(() => {
    if (instrument !== 'piano') return null;
    const chord = selectedItem
      ? chordFromItem(selectedItem)
      : currentVoicingData?.chord
        ? (currentVoicingData.chord as Record<string, unknown>)
        : null;
    if (!chord || !Array.isArray(chord.notes)) return null;
    return chord.notes as string[];
  }, [instrument, selectedItem, currentVoicingData]);

  const handleInsert = useCallback(async () => {
    if (!builderState) return;
    setError(null);
    setInserting(true);
    try {
      // Use the chord currently built (e.g. Em if user changed from C), or when no symbol passed, builder chord name only
      const effectiveSymbol = (builderState.chordName || symbol).trim() || symbol;
      const effectiveNormalized = parseChord(effectiveSymbol)?.normalizedSymbol ?? effectiveSymbol;
      if (!effectiveNormalized || !isValidChord(effectiveSymbol)) {
        setError(hasChord ? 'Build a valid chord or select one from the list.' : 'Build a valid chord (add notes and set the chord name).');
        setInserting(false);
        return;
      }
      if (builderState.mode === 'piano') {
        const chordData = { notes: builderState.pianoActiveNotes };
        const created = await userVoicingsApi.create({
          instrument: 'piano',
          normalizedSymbol: effectiveNormalized,
          name: builderState.pianoActiveNotes.length ? undefined : 'Voicing',
          chordData,
        });
        onSelect(created.id, effectiveNormalized);
        onClose();
      } else {
        const chordData = guitarChordToLibraryFormat(builderState.chord);
        const created = await userVoicingsApi.create({
          instrument: 'guitar',
          normalizedSymbol: effectiveNormalized,
          name: undefined,
          chordData: chordData as unknown as Record<string, unknown>,
        });
        onSelect(created.id, effectiveNormalized, chordData);
        onClose();
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to save voicing';
      setError(message);
    } finally {
      setInserting(false);
    }
  }, [builderState, symbol, onSelect, onClose]);

  /** Select a voicing from quick-select: load into editor and highlight; user can then Insert/Update or modify. */
  const handleSelectQuickSelectVoicing = useCallback((voicingId: string) => {
    setSelectedId(voicingId);
    setShowCustomVoicingChoice(false);
  }, []);

  /** Start inline edit of custom voicing name. */
  const handleStartEditName = useCallback((e: React.MouseEvent, id: string, currentLabel: string) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingNameId(id);
    setEditingNameValue(currentLabel);
    setError(null);
    setTimeout(() => editingNameInputRef.current?.focus(), 0);
  }, []);

  /** Save custom voicing name and exit edit mode. */
  const handleSaveEditName = useCallback(
    async (id: string) => {
      const trimmed = editingNameValue.trim();
      setEditingNameId(null);
      setEditingNameValue('');
      setError(null);
      try {
        const updated = await userVoicingsApi.update(id, { name: trimmed || null });
        setUserVoicings((prev) => prev.map((v) => (v.id === id ? { ...v, name: updated.name } : v)));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update name';
        setError(message);
      }
    },
    [editingNameValue]
  );

  /** Archive a custom voicing so it is hidden from quick-select; provenance can still reference it. */
  const handleArchiveUserVoicing = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.preventDefault();
      e.stopPropagation();
      setError(null);
      setArchivingId(id);
      try {
        await userVoicingsApi.archive(id);
        setUserVoicings((prev) => prev.filter((v) => v.id !== id));
        if (selectedId === id) setSelectedId(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to archive voicing';
        setError(message);
      } finally {
        setArchivingId(null);
      }
    },
    [selectedId]
  );

  /** Primary action: INSERT or UPDATE. If current state matches a voicing, apply it; else show save choice. */
  const handlePrimaryAction = useCallback(async () => {
    if (!builderState) return;
    setError(null);
    const matchId = findMatchingVoicingId(builderState, quickSelectItems, instrument);
    if (matchId != null) {
      const matchedItem = quickSelectItems.find((i) => i.id === matchId);
      if (matchedItem?.type === 'inversion') {
        setInserting(true);
        try {
          const effectiveSymbol = (builderState.chordName || symbol).trim() || symbol;
          const effectiveNormalized = parseChord(effectiveSymbol)?.normalizedSymbol ?? effectiveSymbol;
          if (!effectiveNormalized || !isValidChord(effectiveSymbol)) {
            setError('Build a valid chord or select one from the list.');
            setInserting(false);
            return;
          }
          const chordData = { notes: Array.from(builderState.pianoActiveNotes) };
          const created = await userVoicingsApi.create({
            instrument: 'piano',
            normalizedSymbol: effectiveNormalized,
            name: matchedItem.name,
            chordData,
          });
          onSelect(created.id, effectiveNormalized);
          onClose();
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : 'Failed to save voicing';
          setError(message);
        } finally {
          setInserting(false);
        }
        return;
      }
      const gv =
        instrument === 'guitar' && matchedItem ? guitarLibraryFromQuickItem(matchedItem) : null;
      onSelect(matchId, undefined, gv ?? undefined);
      onClose();
      return;
    }
    const effectiveSymbol = (builderState.chordName || symbol).trim() || symbol;
    if (!parseChord(effectiveSymbol)?.normalizedSymbol || !isValidChord(effectiveSymbol)) {
      setError('Build a valid chord or select one from the list.');
      return;
    }
    setShowCustomVoicingChoice(true);
  }, [builderState, quickSelectItems, instrument, symbol, onSelect, onClose]);

  const handleUseAndSave = useCallback(() => {
    setShowCustomVoicingChoice(false);
    handleInsert();
  }, [handleInsert]);

  /** Use current voicing for this chord only (still creates a user voicing to get an id; can be refined later). */
  const handleUseWithoutSaving = useCallback(async () => {
    if (!builderState) return;
    setError(null);
    setShowCustomVoicingChoice(false);
    setInserting(true);
    try {
      const effectiveSymbol = (builderState.chordName || symbol).trim() || symbol;
      const effectiveNormalized = parseChord(effectiveSymbol)?.normalizedSymbol ?? effectiveSymbol;
      if (!effectiveNormalized || !isValidChord(effectiveSymbol)) {
        setError('Build a valid chord or select one from the list.');
        setInserting(false);
        return;
      }
      if (builderState.mode === 'piano') {
        const chordData = { notes: builderState.pianoActiveNotes };
        const created = await userVoicingsApi.create({
          instrument: 'piano',
          normalizedSymbol: effectiveNormalized,
          name: 'One-off',
          chordData,
        });
        onSelect(created.id, effectiveNormalized);
        onClose();
      } else {
        const chordData = guitarChordToLibraryFormat(builderState.chord);
        const created = await userVoicingsApi.create({
          instrument: 'guitar',
          normalizedSymbol: effectiveNormalized,
          name: 'One-off',
          chordData: chordData as unknown as Record<string, unknown>,
        });
        onSelect(created.id, effectiveNormalized, chordData);
        onClose();
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to apply voicing';
      setError(message);
    } finally {
      setInserting(false);
    }
  }, [builderState, symbol, onSelect, onClose]);

  // Show tour when modal opens and showTutorialOnOpen is true (once per session)
  useEffect(() => {
    if (!isOpen || !showTutorialOnOpen || tourShownThisSessionRef.current) {
      if (!isOpen) setShowTour(false);
      return;
    }
    const timer = setTimeout(() => {
      tourShownThisSessionRef.current = true;
      setShowTour(true);
    }, 400);
    return () => clearTimeout(timer);
  }, [isOpen, showTutorialOnOpen]);

  useEffect(() => {
    if (!isOpen) {
      tourShownThisSessionRef.current = false;
      setEditingNameId(null);
      setEditingNameValue('');
    }
  }, [isOpen]);

  const handleTourComplete = useCallback(
    (reason?: 'completed' | 'dismissed') => {
      setShowTour(false);
      onTutorialComplete?.(reason);
    },
    [onTutorialComplete]
  );

  const handleTourSkipPermanent = useCallback(() => {
    setShowTour(false);
    onTutorialSkipPermanent?.();
  }, [onTutorialSkipPermanent]);

  if (!isOpen) return null;

  const loading = loadingLibrary || loadingUser;
  const hasLibrary = libraryVoicings.length > 0;
  const hasUser = userVoicings.length > 0;

  return (
    <div
      className="chord-voicing-selection fixed inset-0 z-[100] flex flex-col bg-background overflow-hidden w-full h-full max-w-[100vw] max-h-[100dvh]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chord-voicing-selection-title"
      data-theme={theme}
    >
      <button
        type="button"
        className="fixed z-10 w-9 h-9 rounded-full border border-border bg-card text-foreground text-xl leading-none flex items-center justify-center hover:border-accent transition-colors"
        style={{ top: 'max(1rem, env(safe-area-inset-top))', right: 'max(1rem, env(safe-area-inset-right))' }}
        aria-label="Close Chord Builder"
        onClick={onClose}
      >
        ×
      </button>
      <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden p-4 pt-4 md:p-6 md:pt-6">
        <h2 id="chord-voicing-selection-title" className="text-lg font-semibold text-foreground mb-1 hidden md:block">
          Chord Builder
        </h2>
        <p className="text-sm text-muted mb-4 hidden md:block">
          {hasChord
            ? `Select a voicing to load it into the editor, then ${isUpdate ? 'Update' : 'Insert'}—or modify it first. If the chord is not in the library, you can save a custom voicing.`
            : 'Build a new chord below (add notes on piano or guitar, then set the chord name). Click Insert to add it to the song.'}
        </p>

        {error && (
          <div
            className="mb-4 p-3 bg-red-500/20 text-red-700 dark:text-red-300 text-sm rounded-lg border border-red-500/30"
            role="alert"
          >
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto min-h-0 flex flex-col gap-4">
          <section className="flex-shrink-0" data-tour="chord-editor">
            <ChordEditor
              key={`voicing-${normalizedSymbol}-${selectedId ?? 'loading'}`}
              compact
              initialMode={instrument}
              initialGuitarChord={initialGuitar}
              initialPianoNotes={initialPiano}
              onStateChange={setBuilderState}
              preferredChordName={symbol || undefined}
            />
          </section>

          {hasChord && (
          <section className="border-t border-border pt-4" data-tour="quick-select">
            <h3 className="text-sm font-medium text-foreground mb-2">Quick select</h3>
            {loading && <p className="text-sm text-muted py-2">Loading voicings…</p>}
            {!loading && quickSelectItems.length === 0 && (
              <p className="text-sm text-muted py-2">No library or custom voicings for this chord.</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {!loading &&
                pianoInversionItems.map((item) => {
                  if (item.type !== 'inversion') return null;
                  const id = item.id;
                  const isSelected = selectedId === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleSelectQuickSelectVoicing(id)}
                      className={`flex flex-col items-center p-3 rounded-lg border text-left transition-colors min-w-0 w-full ${
                        isSelected
                          ? 'border-accent ring-2 ring-accent bg-accent/10 hover:bg-accent/15'
                          : 'border-border hover:bg-border/50'
                      }`}
                    >
                      <div className="w-full min-w-0 flex justify-center">
                        <PianoChordDiagram
                          voicing={{
                            id,
                            name: item.name,
                            notes: item.chord.notes,
                          }}
                          chordName={symbol}
                          size="small"
                          fillWidth
                          showVoicingName={false}
                        />
                      </div>
                      <span className="text-xs font-medium text-foreground mt-1.5 text-center truncate w-full">
                        {item.name}
                      </span>
                    </button>
                  );
                })}
              {!loading &&
                libraryVoicings.map((v, i) => {
                  const id = v.id;
                  const chord = (v.chord ?? {}) as Record<string, unknown>;
                  const isGuitar = Array.isArray(chord.frets);
                  const isPiano = Array.isArray(chord.notes);
                  const label = `Voicing ${formatVoicingNumber(i + 1)}`;

                  const isSelected = selectedId === id;
                  return (
                    <button
                      key={`lib-${id}`}
                      type="button"
                      onClick={() => handleSelectQuickSelectVoicing(id)}
                      className={`flex min-w-0 w-full p-3 rounded-lg border text-left transition-colors ${
                        isGuitar ? 'items-center gap-2' : 'flex-col items-center'
                      } ${
                        isSelected
                          ? 'border-accent ring-2 ring-accent bg-accent/10 hover:bg-accent/15'
                          : 'border-border hover:bg-border/50'
                      }`}
                    >
                      {isGuitar && (
                        <div className="chord-diagram-guitar w-[100px] shrink-0 min-h-[80px] flex items-center justify-center">
                          <Chord
                            chord={chordToReactChordsDisplayFormat(v.chord)}
                            instrument={REACT_CHORDS_GUITAR}
                            lite
                          />
                        </div>
                      )}
                      {isPiano && (
                        <>
                          <div className="w-full min-w-0 flex justify-center">
                            <PianoChordDiagram
                              voicing={{
                                id,
                                name: label,
                                notes: (chord.notes as string[]) ?? [],
                              }}
                              chordName={symbol}
                              size="small"
                              fillWidth
                              showVoicingName={false}
                            />
                          </div>
                          <span className="text-xs font-medium text-foreground mt-1.5 text-center truncate w-full">
                            {label}
                          </span>
                        </>
                      )}
                      {isGuitar && (
                        <span className="text-sm font-medium text-foreground min-w-[4.5rem]">
                          {label}
                        </span>
                      )}
                    </button>
                  );
                })}
              {!loading &&
                userVoicings.map((v, i) => {
                  const id = v.id;
                  const chord = (v.chord ?? {}) as Record<string, unknown>;
                  const isGuitar = Array.isArray(chord.frets);
                  const isPiano = Array.isArray(chord.notes);
                  const label = v.name ?? `Custom ${formatVoicingNumber(i + 1)}`;
                  const isArchiving = archivingId === id;
                  const isEditingName = editingNameId === id;

                  const isSelectedUser = selectedId === id;
                  const nameControl = isEditingName ? (
                    <input
                      ref={editingNameInputRef}
                      type="text"
                      value={editingNameValue}
                      onChange={(e) => setEditingNameValue(e.target.value)}
                      onBlur={() => handleSaveEditName(id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSaveEditName(id);
                        }
                        if (e.key === 'Escape') {
                          setEditingNameId(null);
                          setEditingNameValue('');
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="text-base md:text-xs font-medium text-foreground bg-background border border-border rounded px-1.5 py-0.5 w-full min-w-0 max-w-full mt-1.5"
                      placeholder="Voicing name"
                      maxLength={100}
                      aria-label="Edit voicing name"
                    />
                  ) : (
                    <span
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleStartEditName(e, id, label);
                      }}
                      className="text-xs font-medium text-foreground mt-1.5 text-center truncate w-full hover:underline cursor-pointer text-left min-w-0 inline-block"
                      title="Click to edit name"
                    >
                      {label}
                    </span>
                  );
                  const handleCardKeyDown = (e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (!isEditingName && !isArchiving) handleSelectQuickSelectVoicing(id);
                    }
                  };
                  return (
                    <div key={`user-${id}`} className="relative min-w-0 w-full">
                      <div
                        role="button"
                        tabIndex={isArchiving ? -1 : 0}
                        onClick={() => !isEditingName && !isArchiving && handleSelectQuickSelectVoicing(id)}
                        onKeyDown={handleCardKeyDown}
                        aria-disabled={isArchiving}
                        className={`flex min-w-0 w-full p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                          isGuitar ? 'items-center gap-2' : 'flex-col items-center'
                        } ${
                          isSelectedUser
                            ? 'border-accent ring-2 ring-accent bg-accent/10 hover:bg-accent/15'
                            : 'border-purple-500/50 bg-purple-500/10 hover:bg-purple-500/20'
                        } ${isArchiving ? 'opacity-60 pointer-events-none' : ''}`}
                      >
                        {isGuitar && (
                          <>
                            <div className="chord-diagram-guitar w-[100px] shrink-0 min-h-[80px] flex items-center justify-center">
                              <Chord
                                chord={chordToReactChordsDisplayFormat(v.chord)}
                                instrument={REACT_CHORDS_GUITAR}
                                lite
                              />
                            </div>
                            <span className="text-sm font-medium text-foreground min-w-[4.5rem] flex min-w-0 flex-1 justify-center">
                              {isEditingName ? (
                                <span className="w-full max-w-[120px]" onClick={(e) => e.stopPropagation()}>
                                  {nameControl}
                                </span>
                              ) : (
                                <span
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleStartEditName(e, id, label);
                                  }}
                                  className="hover:underline truncate text-left w-full cursor-pointer"
                                  title="Click to edit name"
                                >
                                  {label}
                                </span>
                              )}
                            </span>
                          </>
                        )}
                        {isPiano && (
                          <>
                            <div className="w-full min-w-0 flex justify-center">
                              <PianoChordDiagram
                                voicing={{
                                  id,
                                  name: label,
                                  notes: (chord.notes as string[]) ?? [],
                                }}
                                chordName={symbol}
                                size="small"
                                fillWidth
                                showVoicingName={false}
                              />
                            </div>
                            <span className="w-full min-w-0 flex justify-center">
                              {nameControl}
                            </span>
                          </>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => handleArchiveUserVoicing(e, id)}
                        disabled={isArchiving}
                        title="Archive voicing (hide from quick select)"
                        className="absolute top-1.5 right-1.5 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-background/80 disabled:opacity-50"
                        aria-label="Archive voicing"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
            </div>
          </section>
          )}
        </div>

        {showCustomVoicingChoice && (
          <div className="mt-4 p-4 rounded-lg border border-border bg-surface" role="dialog" aria-labelledby="custom-voicing-choice-title">
            <p id="custom-voicing-choice-title" className="text-sm font-medium text-foreground mb-2">
              Use this voicing
            </p>
            <p className="text-sm text-muted mb-4">
              Save it to your custom voicings to reuse in any song, or use it only for this chord.
            </p>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleUseWithoutSaving}
                disabled={inserting || !builderState}
                className="px-4 py-2 text-foreground bg-surface border border-border rounded-lg hover:bg-border text-sm font-medium disabled:opacity-50"
              >
                {inserting ? 'Applying…' : 'Use without saving'}
              </button>
              <button
                type="button"
                onClick={handleUseAndSave}
                disabled={inserting || !builderState}
                className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover disabled:opacity-50"
              >
                {inserting ? 'Saving…' : 'Use and save'}
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-border flex justify-end items-center gap-2 flex-shrink-0 flex-wrap">
          <button
            type="button"
            onClick={() => setHelpDrawerOpen(true)}
            className="p-2 text-muted hover:text-foreground rounded-lg hover:bg-border transition-colors"
            aria-label="Chord editor help"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
          {onSkip && (
            <button
              type="button"
              onClick={() => { onSkip(); onClose(); }}
              className="px-4 py-2 text-foreground bg-surface border border-border rounded-lg hover:bg-border text-sm font-medium"
            >
              Skip
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-foreground bg-surface border border-border rounded-lg hover:bg-border text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePrimaryAction}
            disabled={!builderState}
            data-tour="insert-button"
            className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover disabled:opacity-50"
          >
            {isUpdate ? 'Update' : 'Insert'}
          </button>
        </div>
      </div>
      <ChordVoicingSelectionTour
        isActive={showTour}
        onComplete={handleTourComplete}
        onSkipPermanent={handleTourSkipPermanent}
      />
      {/* Vaul drawer with higher z-index so it appears above this modal (z-[100]) */}
      <Drawer open={helpDrawerOpen} onOpenChange={setHelpDrawerOpen} direction="bottom">
        <DrawerContent
          className="z-[110]"
          overlayClassName="z-[110]"
        >
          <DrawerHeader>
            <DrawerTitle>
              {instrument === 'piano' ? 'Chord editor (piano)' : 'Chord editor (guitar)'}
            </DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-8 flex flex-col gap-3 text-sm text-muted">
            {instrument === 'piano' ? (
              <>
                <p>Tap or click piano keys to add or remove notes (max 10 notes).</p>
                <p>Scroll horizontally to access the full 88-key range.</p>
                <p>Use <strong className="text-foreground">Play chord</strong> to hear the voicing, and <strong className="text-foreground">Clear</strong> to remove all notes.</p>
                <p>The chord name updates automatically as you add or remove notes.</p>
              </>
            ) : (
              <>
                <p>Click a dot to cycle finger (1–4). Double-click to remove the note.</p>
                <p>Drag a dot to move it to another string or fret.</p>
                <p>
                  <kbd className="px-1.5 py-0.5 rounded bg-surface border border-border text-xs font-mono text-foreground">Shift</kbd>
                  {' '}+ drag from a dot to create a barre chord.
                </p>
                <p>On touch devices: long-press on a dot then drag to create a barre.</p>
              </>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
