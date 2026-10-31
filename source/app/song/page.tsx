'use client';

import ChordExplorerModal from '@/components/chords/ChordExplorerModal';
import ChordVoicingSelection from '@/components/chords/ChordVoicingSelection';
import AudioRecorderModal from '@/components/audio/AudioRecorderModal';
import AudioPlayerModal from '@/components/audio/AudioPlayerModal';
import ChordVoicingsPanel from '@/components/chords/ChordVoicingsPanel';
import { ChordDiagramTooltip } from '@/components/chords/ChordDiagramDisplay';
import { songApi, profileApi, type UserProfileResponse } from '@/lib/api';
import { getStoredSongRhythmForExport, type SongRhythmForExport } from '@/lib/export';
import {
  isTabStaffSectionType,
  sectionTypeDisplay,
  SECTION_TYPES_IN_MENU_ORDER,
} from '@/lib/sectionTypes';
import { collectChordAnchorsOnTabBlockLines } from '@/lib/tab-edit-reanchor';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { AppHeader } from '@/components/shared/AppHeader';
import { Breadcrumbs } from '@/components/shared/Breadcrumbs';
import { CollaborationBar } from '@/components/song-editor/CollaborationBar';
import { SongEditorBottomBar } from '@/components/song-editor/SongEditorBottomBar';
import { SongKeyDrawer } from '@/components/song-editor/SongKeyDrawer';
import { ExportDrawer } from '@/components/song-editor/ExportDrawer';
import { AddDrawer } from '@/components/song-editor/AddDrawer';
import { ScanLyricsDrawer } from '@/components/song-editor/ScanLyricsDrawer';
import { RecordVideoDrawer } from '@/components/song-editor/RecordVideoDrawer';
import { RecordAudioDrawer } from '@/components/song-editor/RecordAudioDrawer';
import { ChordVoicingsDrawer } from '@/components/song-editor/ChordVoicingsDrawer';
import { ChordDragMagnifier, type ChordDragMagnifierHandle } from '@/components/song-editor/ChordDragMagnifier';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/shared/ui/dropdown-menu';
import { PluginGraceModal } from '@/components/shared/PluginGraceModal';
import NotesModal from '@/components/notes/NotesModal';
import MetadataModal from '@/components/metadata/MetadataModal';
import { usePremiumPluginGate } from '@/lib/usePremiumPluginGate';
import { getAccountGraceDaysRemaining } from '@/lib/usePluginAccess';
import { Copy, FileText, Home, Mic, Music2, MoreVertical, Pencil, Play, Sliders, Trash2, UsersRound, X } from 'lucide-react';
import { useChordExplorerTour, type ChordExplorerTourProps } from '@/lib/useChordExplorerTour';
import { useChordVoicingSelectionTour } from '@/lib/useChordVoicingSelectionTour';
import { useAuthStore } from '@/lib/store';
import { copyChordsFromSectionToSection } from '@/lib/copyChords';
import {
  generateInstrumentalMeasureRowAscii,
  instrumentalMeasureBlockLineCount,
  isInstrumentalMeasureAsciiLine,
  MEASURE_SUBDIVISION_LABELS,
  parseInstrumentalMeasureRowFromBlock,
  type MeasureSubdivision,
} from '@/lib/instrumental-measure-row';
import type { GuitarChordLibraryFormat } from '@/lib/chord-builder/guitarToChordLibrary';
import {
  extractGuitarTabStaffBlockFromLines,
  guitarTabStaffDisplayBlockLineCount,
  isGuitarTabChordGuideLine,
  isGuitarTabHighEStringLine,
  isGuitarTabStaffLine,
  parseGuitarTabStaffLinesToGrid,
  tryApplyGuitarChordVoicingToStaffLines,
  type GuitarTabWidthPreset,
} from '@/lib/guitar-tab-bar';
import { GuitarTabBarModal } from '@/components/song-editor/GuitarTabBarModal';
import { useSongCommandQueue } from '@/lib/useSongCommandQueue';
import * as updaters from '@/lib/song-state-updaters';
import { Chord, Instrument, Line, Recording, Section, SongDetail, Token, TrackLabProject } from '@/lib/types';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { useDebouncedCallback } from 'use-debounce';
import { toast } from 'sonner';

/**
 * Ref registry for input elements that need to be focused from parent components.
 * iOS Safari only allows programmatic focus() when called synchronously in direct
 * response to a user gesture. Using setTimeout, useEffect, or any async mechanism
 * breaks this "user gesture chain" and the keyboard won't appear on mobile.
 *
 * This registry allows parent components to look up and focus child input refs
 * directly after using flushSync to render them.
 */
type InputRefRegistry = {
  sectionLabels: Map<string, HTMLInputElement | null>;
  lineInputs: Map<string, HTMLInputElement | null>;
};

function tryGuitarTabAutofillAtPosition(
  orderedSectionLines: { lineId: string; text: string }[],
  highELineId: string,
  absoluteCharOffset: number,
  instrument: 'guitar' | 'piano',
  guitarVoicing: GuitarChordLibraryFormat | null | undefined
): {
  tabResult: {
    newStaffLines: string[];
    barCount: number;
    widthPreset: GuitarTabWidthPreset;
  } | null;
  block: { staffTexts: string[]; lineIds: string[] } | null;
} {
  if (instrument !== 'guitar' || !guitarVoicing?.frets?.length) {
    return { tabResult: null, block: null };
  }
  const block = extractGuitarTabStaffBlockFromLines(orderedSectionLines, highELineId);
  if (!block) return { tabResult: null, block: null };
  const tabResult = tryApplyGuitarChordVoicingToStaffLines(
    block.staffTexts,
    absoluteCharOffset,
    guitarVoicing
  );
  if (!tabResult) return { tabResult: null, block: null };
  return { tabResult, block };
}

function findLineContainingChord(
  song: SongDetail,
  chordId: string
): { orderedLines: { lineId: string; text: string }[]; line: Line; chord: Chord } | null {
  for (const sec of song.sections ?? []) {
    const lines = sec.lines ?? [];
    for (const l of lines) {
      const c = l.chords?.find((ch) => ch.chordId === chordId);
      if (c) {
        return {
          orderedLines: lines.map((x) => ({ lineId: x.lineId, text: x.text ?? '' })),
          line: l,
          chord: c,
        };
      }
    }
  }
  return null;
}

function SongEditorPageInner() {
  const searchParams = useSearchParams();
  const songId = searchParams.get('id') ?? '';
  const [song, setSong] = useState<SongDetail | null>(null);
  const [loading, setLoading] = useState(true);
  /** When set, the section with this sectionId should focus the line with this lineId (e.g. after add section + first line). Cleared after focus is applied. */
  const [focusLineOnMount, setFocusLineOnMount] = useState<{ sectionId: string; lineId: string } | null>(null);
  /** New guitar-tab section: open the tab editor once so it is not mistaken for lyrics. */
  const [openGuitarTabEditorForSectionId, setOpenGuitarTabEditorForSectionId] = useState<string | null>(null);
  const [chordChartInstrument, setChordChartInstrument] = useState<'guitar' | 'piano'>('guitar');
  const [songKey, setSongKey] = useState<string>('C Major');
  const [timeSignature, setTimeSignature] = useState<[number, number]>([4, 4]);
  const [songBpm, setSongBpm] = useState(120);
  const [pendingVoicingSelection, setPendingVoicingSelection] = useState<{
    chordId: string;
    symbol: string;
    voicingId?: string | null;
  } | null>(null);
  /** When set, open Chord Builder in "build new chord" mode to add a chord at this token. */
  const [chordBuilderInsertContext, setChordBuilderInsertContext] = useState<{
    lineId: string;
    tokenId: string;
    token: Token;
    charOffsetInToken: number;
  } | null>(null);
  const [voicingDrawerOpen, setVoicingDrawerOpen] = useState(false);

  const [audioRecorderOpen, setAudioRecorderOpen] = useState(false);
  const [recordingSectionIdForModal, setRecordingSectionIdForModal] = useState<string | null>(null);
  const [recordingLabelForModal, setRecordingLabelForModal] = useState<string | null>(null);
  const [trackLabProjectToOpen, setTrackLabProjectToOpen] = useState<TrackLabProject | null>(null);
  const [keyDrawerOpen, setKeyDrawerOpen] = useState(false);
  const [exportDrawerOpen, setExportDrawerOpen] = useState(false);
  const [addDrawerOpen, setAddDrawerOpen] = useState(false);
  const [scanLyricsDrawerOpen, setScanLyricsDrawerOpen] = useState(false);
  const [recordVideoDrawerOpen, setRecordVideoDrawerOpen] = useState(false);
  const [recordAudioDrawerOpen, setRecordAudioDrawerOpen] = useState(false);
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [notesModalNoteId, setNotesModalNoteId] = useState<string | null>(null);
  const [metadataModalOpen, setMetadataModalOpen] = useState(false);
  const [artifactsRefreshKey, setArtifactsRefreshKey] = useState(0);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [profile, setProfile] = useState<UserProfileResponse | null>(null);
  const [audioPlayerOpen, setAudioPlayerOpen] = useState(false);
  const [audioPlayerTracks, setAudioPlayerTracks] = useState<Recording[]>([]);
  const [audioPlayerStartIndex, setAudioPlayerStartIndex] = useState(0);
  const [focusSectionLabelForSectionId, setFocusSectionLabelForSectionId] = useState<string | null>(null);
  const [collaborationWriteAccess, setCollaborationWriteAccess] = useState(true);
  const [workspaceContext, setWorkspaceContext] = useState<{
    teamId: string | null;
    teamName: string | null;
    collaborationChatEnabled: boolean;
  } | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const {
    runWithPluginGate,
    graceModalOpen,
    graceModalPlugin,
    handleGraceModalClose,
  } = usePremiumPluginGate(profile);

  // Ref registry for mobile-safe focus (iOS requires synchronous focus in user gesture handlers)
  const inputRefRegistry = useRef<InputRefRegistry>({
    sectionLabels: new Map(),
    lineInputs: new Map(),
  });

  // Callbacks for registering/unregistering refs (passed to children)
  const registerSectionLabelRef = useCallback((sectionId: string, ref: HTMLInputElement | null) => {
    if (ref) {
      inputRefRegistry.current.sectionLabels.set(sectionId, ref);
    } else {
      inputRefRegistry.current.sectionLabels.delete(sectionId);
    }
  }, []);

  const registerLineInputRef = useCallback((lineId: string, ref: HTMLInputElement | null) => {
    if (ref) {
      inputRefRegistry.current.lineInputs.set(lineId, ref);
    } else {
      inputRefRegistry.current.lineInputs.delete(lineId);
    }
  }, []);

  // Focus helpers that use the registry (call synchronously after flushSync)
  const focusSectionLabel = useCallback((sectionId: string) => {
    const input = inputRefRegistry.current.sectionLabels.get(sectionId);
    input?.focus();
  }, []);

  const focusLineInput = useCallback((lineId: string) => {
    const input = inputRefRegistry.current.lineInputs.get(lineId);
    input?.focus();
  }, []);
  const { user, logout } = useAuthStore();
  const { authChecked } = useAuthGuard();
  const chordExplorerTour = useChordExplorerTour();
  const chordVoicingSelectionTour = useChordVoicingSelectionTour();

  /** Root options matching chord-explorer: combined enharmonics (C#/Db), value = sharp for storage */
  const ROOT_OPTIONS: { value: string; label: string }[] = [
    { value: 'C', label: 'C' },
    { value: 'C#', label: 'C#/Db' },
    { value: 'D', label: 'D' },
    { value: 'D#', label: 'D#/Eb' },
    { value: 'E', label: 'E' },
    { value: 'F', label: 'F' },
    { value: 'F#', label: 'F#/Gb' },
    { value: 'G', label: 'G' },
    { value: 'G#', label: 'G#/Ab' },
    { value: 'A', label: 'A' },
    { value: 'A#', label: 'A#/Bb' },
    { value: 'B', label: 'B' },
  ];
  /** Flat-to-sharp map so "Db Major" displays as Root C#/Db and we store "C#" */
  const FLAT_TO_SHARP: Record<string, string> = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' };
  const SHARP_ROOTS = new Set(ROOT_OPTIONS.map((r) => r.value));

  /** Tonality options matching chord-explorer labels (Major/Minor with descriptions) */
  const TONALITIES = [
    { value: 'major', label: 'Major (Happy / Bright)' },
    { value: 'minor', label: 'Minor (Moody / Dark)' },
  ] as const;

  /** Parse "C Major" / "Db Minor" into { root, tonality } for dropdowns; root is always sharp (matches chord-explorer value) */
  const parseSongKey = (key: string): { root: string; tonality: string } => {
    if (!key || typeof key !== 'string') return { root: 'C', tonality: 'major' };
    const trimmed = key.trim();
    const parts = trimmed.split(/\s+/);
    const rawRoot = parts[0]?.trim() || 'C';
    const root = FLAT_TO_SHARP[rawRoot] ?? (SHARP_ROOTS.has(rawRoot) ? rawRoot : 'C');
    const scaleRaw = (parts[1] || 'Major').toLowerCase();
    const tonality = scaleRaw === 'minor' ? 'minor' : 'major';
    return { root, tonality };
  };

  /** Normalize to "Root Major|Minor" with root in sharp form (C#, not Db) to match chord-explorer */
  const normalizeSongKey = (key: string | null): string => {
    if (!key || typeof key !== 'string') return 'C Major';
    const trimmed = key.trim();
    const parts = trimmed.split(/\s+/);
    const rawRoot = parts[0]?.trim() || 'C';
    const root = FLAT_TO_SHARP[rawRoot] ?? (SHARP_ROOTS.has(rawRoot) ? rawRoot : 'C');
    const scaleRaw = (parts[1] || 'Major').toLowerCase();
    const scaleLabel = scaleRaw === 'minor' ? 'Minor' : 'Major';
    return `${root} ${scaleLabel}`;
  };

  const keySettingsSummary = `${songKey}, ${timeSignature[0]}/${timeSignature[1]} at ${songBpm}BPM`;

  const loadSong = async () => {
    try {
      const [data, recordingsData] = await Promise.all([
        songApi.getSong(songId),
        songApi.getRecordings(songId),
      ]);
      setSong(data);
      setRecordings(recordingsData);
      // Load key from localStorage (per-song key storage); normalize to avoid broken display e.g. "Major" only
      const savedKey = localStorage.getItem(`song_key_${songId}`);
      const key = normalizeSongKey(savedKey);
      setSongKey(key);
      if (savedKey !== null && key !== savedKey) {
        localStorage.setItem(`song_key_${songId}`, key);
      }
      // Load chord chart instrument (Guitar or Piano)
      const savedChart = localStorage.getItem(`chord_chart_${songId}`);
      if (savedChart === 'guitar' || savedChart === 'piano') {
        setChordChartInstrument(savedChart);
      }
      const rhythm = getStoredSongRhythmForExport(songId);
      setTimeSignature(rhythm.timeSignature);
      setSongBpm(rhythm.bpm);
    } catch (error) {
      console.error('Failed to load song', error);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyChange = (newKey: string) => {
    setSongKey(newKey);
    localStorage.setItem(`song_key_${songId}`, newKey);
  };

  /** Update key from Root and/or Tonality (mirrors chord-explorer) */
  const handleRootChange = (newRoot: string) => {
    const { tonality } = parseSongKey(songKey);
    const scaleLabel = tonality === 'minor' ? 'Minor' : 'Major';
    handleKeyChange(`${newRoot} ${scaleLabel}`);
  };
  const handleTonalityChange = (newTonality: string) => {
    const { root } = parseSongKey(songKey);
    const scaleLabel = newTonality === 'minor' ? 'Minor' : 'Major';
    handleKeyChange(`${root} ${scaleLabel}`);
  };

  const handleTimeSignatureChange = useCallback(
    (sig: [number, number]) => {
      setTimeSignature(sig);
      localStorage.setItem(`song_time_signature_${songId}`, `${sig[0]}/${sig[1]}`);
    },
    [songId]
  );

  const handleBpmChange = useCallback((next: number) => {
    setSongBpm(next);
    localStorage.setItem(`song_bpm_${songId}`, String(next));
  }, [songId]);

  const rhythmForExport: SongRhythmForExport = useMemo(
    () => ({ timeSignature, bpm: songBpm }),
    [timeSignature, songBpm]
  );

  /** Primary (non-archived) recording per section. */
  const primaryBySectionId = useMemo(() => {
    const map: Record<string, Recording> = {};
    for (const r of recordings) {
      if (r.archivedAt || !r.sectionId) continue;
      if (!map[r.sectionId]) map[r.sectionId] = r;
    }
    return map;
  }, [recordings]);

  /** Demo recordings (non-archived, no section). */
  const demos = useMemo(
    () => recordings.filter((r) => !r.archivedAt && (r.sectionId == null || r.sectionId === '')),
    [recordings]
  );

  /** Chords in song order: by section, then line, then position within line. Deduplicated by (chordSymbol, voicingId) so only one card per unique voicing appears in the Chord Voicings panel. */
  const chordsInOrder = useMemo(() => {
    if (!song?.sections?.length) return [];
    const getChordPositionInLine = (chord: Chord, line: Line): number => {
      if (chord.tokenId && line.tokens?.length) {
        const token = line.tokens.find((t) => t.tokenId === chord.tokenId);
        if (token) return token.startOffset + chord.charOffset;
      }
      return chord.charOffset;
    };
    const out: Chord[] = [];
    const seen = new Set<string>();
    const sections = [...song.sections].sort((a, b) => a.orderIndex - b.orderIndex);
    for (const section of sections) {
      const lines = [...(section.lines ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
      for (const line of lines) {
        if (!line.chords?.length) continue;
        const sorted = [...line.chords].sort((a, b) => getChordPositionInLine(a, line) - getChordPositionInLine(b, line));
        for (const chord of sorted) {
          const key = `${chord.chordSymbol}\0${chord.voicingId ?? ''}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(chord);
        }
      }
    }
    return out;
  }, [song]);

  /** Ref to chord voicings drawer content, used to capture HTML for export. */
  const chordChartsExportRef = useRef<HTMLDivElement>(null);

  const setSyncedRef = useRef<(seq: number) => void>(() => {});
  const commandQueue = useSongCommandQueue({
    songId,
    syncedUpToSequence: song?.lastEventSequence ?? 0,
    onSyncedSequenceChange: (seq) => {
      setSong((s) => (s ? { ...s, lastEventSequence: seq } : s));
    },
    onConflict: async (lastSeq) => {
      setSyncedRef.current(lastSeq);
    },
  });
  setSyncedRef.current = commandQueue.setSyncedUpToSequence;
  const { enqueue, flush, pendingCount, setSyncedUpToSequence } = commandQueue;

  const pendingCountRef = useRef(0);
  pendingCountRef.current = pendingCount;

  const checkInFlightRef = useRef(false);
  const checkForUpdates = async () => {
    if (!song) return;
    if (pendingCountRef.current > 0) return;
    if (checkInFlightRef.current) return;
    checkInFlightRef.current = true;
    try {
      const data = await songApi.getSong(songId);
      if (data.lastEventSequence > song.lastEventSequence) {
        setSong(data);
      }
    } catch (error) {
      console.error('Failed to check for updates', error);
    } finally {
      checkInFlightRef.current = false;
    }
  };

  const handleTitleChange = useDebouncedCallback((newTitle: string) => {
    if (!song || song.archived) return;
    setSong((s) => (s ? updaters.applySetTitle(s, newTitle) : s));
    enqueue({ type: 'SetTitle', payload: { title: newTitle } });
  }, 500);

  /** Add a section of the given type with default label; non–guitar sections get an empty first line focused. */
  const handleAddSectionWithType = useCallback(
    (sectionType: string) => {
      if (!song || song.archived) return;
      const sameTypeCount = song.sections.filter((s) => s.sectionType === sectionType).length;
      const defaultLabel = `${sectionTypeDisplay(sectionType)} ${sameTypeCount + 1}`;
      const sectionId = crypto.randomUUID();
      if (sectionType === 'GUITAR_TAB') {
        const newSong = updaters.applyAddSection(song, sectionId, sectionType, defaultLabel);
        flushSync(() => {
          setSong(newSong);
          setOpenGuitarTabEditorForSectionId(sectionId);
        });
        enqueue({
          type: 'AddSection',
          payload: { sectionType, label: defaultLabel },
          clientGeneratedId: sectionId,
        });
        return;
      }
      if (sectionType === 'INSTRUMENTAL') {
        const newSong = updaters.applyAddSection(song, sectionId, sectionType, defaultLabel);
        flushSync(() => setSong(newSong));
        enqueue({
          type: 'AddSection',
          payload: { sectionType, label: defaultLabel },
          clientGeneratedId: sectionId,
        });
        return;
      }
      const lineId = crypto.randomUUID();
      let newSong = updaters.applyAddSection(song, sectionId, sectionType, defaultLabel);
      newSong = updaters.applyAddLine(newSong, sectionId, lineId, '');
      flushSync(() => {
        setSong(newSong);
        setFocusLineOnMount({ sectionId, lineId });
      });
      enqueue({
        type: 'AddSection',
        payload: { sectionType, label: defaultLabel },
        clientGeneratedId: sectionId,
      });
      enqueue({
        type: 'AddLine',
        payload: { sectionId, text: '', source: 'typed' },
        clientGeneratedId: lineId,
      });
      setTimeout(() => focusLineInput(lineId), 100);
    },
    [song, enqueue, focusLineInput]
  );

  // Clear focusLineOnMount after sections have had a chance to focus (avoids re-passing on every render)
  useEffect(() => {
    if (!focusLineOnMount) return;
    const t = setTimeout(() => setFocusLineOnMount(null), 300);
    return () => clearTimeout(t);
  }, [focusLineOnMount]);

  const handleRestoreSong = async () => {
    try {
      await songApi.restoreSong(songId);
      loadSong();
    } catch (error) {
      console.error('Failed to restore song', error);
    }
  };

  // Load song when auth is ready
  useEffect(() => {
    if (authChecked && songId) {
      loadSong();
    }
  }, [authChecked, songId]);

  // Load profile for avatar in header
  useEffect(() => {
    if (!authChecked || !user) return;
    profileApi.getProfile().then(setProfile).catch(() => setProfile(null));
  }, [authChecked, user]);

  // Workspace context for breadcrumbs (team name when song is in exactly one team)
  useEffect(() => {
    if (!songId) return;
    songApi
      .getWorkspaceContext(songId)
      .then(setWorkspaceContext)
      .catch(() =>
        setWorkspaceContext({ teamId: null, teamName: null, collaborationChatEnabled: false })
      );
  }, [songId]);

  // Poll for updates every 5s while the tab is visible (stays quiet in background tabs)
  useEffect(() => {
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void checkForUpdates();
    };
    const interval = setInterval(tick, 5000);
    const onVis = () => {
      if (document.visibilityState === 'visible') void checkForUpdates();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [songId, song?.lastEventSequence]);

  // Flush pending commands when tab becomes visible (collaboration-ready)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void flush();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [flush]);

  // New song: focus title immediately so user can type (no sections yet)
  useEffect(() => {
    if (loading || !song || (song.sections?.length ?? 0) > 0) return;
    if (song.archived || !collaborationWriteAccess) return;
    titleInputRef.current?.focus();
  }, [loading, song?.songId, song?.sections?.length, song?.archived, collaborationWriteAccess]);

  // Don't render anything until auth is checked
  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <p>Checking authentication...</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <p>Loading song...</p>
      </div>
    );
  }

  if (!song) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <p>Song not found</p>
      </div>
    );
  }

  const isReadOnly = song.archived || !collaborationWriteAccess;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Archived Banner */}
      {song.archived && (
        <div className="border-b border-[#f6992c]/20 bg-[#f6992c]/10">
          <div className="px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-[#f6992c]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
                <span className="font-medium text-[#b35a0a]">
                  This song is archived and is read-only.
                </span>
              </div>
              <button
                onClick={handleRestoreSong}
                className="flex items-center px-3 py-1 rounded-md bg-[#f6992c]/15 text-[#b35a0a] transition-colors hover:bg-[#f6992c]/25"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Restore
              </button>
            </div>
          </div>
        </div>
      )}

      <AppHeader profile={profile} user={user} logout={logout} />

      <div className="flex flex-1 min-h-0 w-full">
        <main className="flex-1 min-w-0 py-8 overflow-auto">
          <div className="px-4 sm:px-6 lg:px-8 pb-28">
        <Breadcrumbs
          items={[
            { href: '/songs', label: 'Workspaces', icon: <Home className="size-4" /> },
            ...(workspaceContext?.teamId && workspaceContext?.teamName
              ? [{ href: `/teams/${workspaceContext.teamId}`, label: workspaceContext.teamName, icon: <UsersRound className="size-4" /> }]
              : []),
            { label: song.title || 'Untitled Song', icon: <FileText className="size-4" /> },
          ]}
          className="mb-4"
        />
        <CollaborationBar
          songId={songId}
          songOwnerId={song.userId ?? user?.userId ?? ''}
          onWriteAccessChange={setCollaborationWriteAccess}
        />
        <div className="min-h-6 mb-2 flex items-center" aria-live="polite">
          {pendingCount > 0 && !isReadOnly && (
            <p className="text-sm text-muted-foreground">
              Saving changes…
            </p>
          )}
        </div>
        {/* Title and actions: stacked on mobile, row on larger screens */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0 flex-1 flex flex-col gap-1.5">
            <div className="flex items-center gap-2 min-w-0">
            <input
              ref={titleInputRef}
              type="text"
              defaultValue={song.title || ''}
              onChange={(e) => handleTitleChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || isReadOnly) return;
                e.preventDefault();
                const value = (titleInputRef.current?.value ?? song?.title ?? '').trim();
                if (value) {
                  handleTitleChange.cancel();
                  setSong((s) => (s ? updaters.applySetTitle(s, value) : s));
                  enqueue({ type: 'SetTitle', payload: { title: value } });
                }
                if (!song?.sections?.length) {
                  const sectionId = crypto.randomUUID();
                  const lineId = crypto.randomUUID();
                  let newSong = updaters.applyAddSection(song!, sectionId, 'VERSE', 'Verse 1');
                  newSong = updaters.applyAddLine(newSong, sectionId, lineId, '');
                  flushSync(() => {
                    setSong(newSong);
                    setFocusLineOnMount({ sectionId, lineId });
                  });
                  enqueue({
                    type: 'AddSection',
                    payload: { sectionType: 'VERSE', label: 'Verse 1' },
                    clientGeneratedId: sectionId,
                  });
                  enqueue({
                    type: 'AddLine',
                    payload: { sectionId, text: '', source: 'typed' },
                    clientGeneratedId: lineId,
                  });
                } else {
                  // Existing song: move focus to first section's label (Enter = next field)
                  const firstSectionId = song.sections?.[0]?.sectionId;
                  if (firstSectionId) setFocusSectionLabelForSectionId(firstSectionId);
                }
              }}
              placeholder="Untitled Song"
              className={`flex-1 min-w-0 text-xl font-bold border-none focus:outline-none focus:ring-0 bg-transparent text-foreground placeholder:text-muted sm:text-2xl md:text-3xl ${
                isReadOnly ? 'text-muted cursor-not-allowed' : ''
              }`}
              disabled={isReadOnly}
            />
            {demos.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  runWithPluginGate('audio_player', () => {
                    setAudioPlayerTracks(demos);
                    setAudioPlayerStartIndex(0);
                    setAudioPlayerOpen(true);
                  });
                }}
                className="shrink-0 flex size-8 items-center justify-center rounded-full text-accent hover:bg-accent/10"
                title="Play full song demos"
                aria-label="Play full song demos"
              >
                <Play className="size-4" />
              </button>
            )}
            </div>
            {/* Key display: visible under title, opens key drawer on click (matches bottom bar Key) */}
            {!isReadOnly ? (
              <button
                type="button"
                onClick={() => setKeyDrawerOpen(true)}
                className="mt-1.5 flex items-start gap-1.5 text-sm text-muted-foreground transition-colors hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent/30 focus:ring-offset-2 focus:ring-offset-background rounded px-1 -mx-1 text-left"
                aria-label={`Song key and rhythm: ${keySettingsSummary}. Click to change.`}
                title="Change song key and rhythm"
              >
                <Music2 className="size-4 shrink-0 mt-0.5" aria-hidden />
                <span className="min-w-0 flex flex-wrap items-baseline gap-x-1">
                  <span>In the key of {songKey},</span>
                  <span className="whitespace-nowrap">
                    {timeSignature[0]}/{timeSignature[1]} at {songBpm}BPM
                  </span>
                </span>
              </button>
            ) : (
              <p
                className="mt-1.5 flex items-start gap-1.5 text-sm text-muted-foreground"
                aria-label={`Song key and rhythm: ${keySettingsSummary}`}
              >
                <Music2 className="size-4 shrink-0 mt-0.5" aria-hidden />
                <span className="min-w-0 flex flex-wrap items-baseline gap-x-1">
                  <span>In the key of {songKey},</span>
                  <span className="whitespace-nowrap">
                    {timeSignature[0]}/{timeSignature[1]} at {songBpm}BPM
                  </span>
                </span>
              </p>
            )}
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-6">
          {song.sections.map((section) => (
            <SectionComponent
              key={section.sectionId}
              section={section}
              songId={songId}
              song={song}
              setSong={setSong}
              enqueue={enqueue}
              flush={flush}
              onUpdate={loadSong}
              isReadOnly={isReadOnly}
              preferredInstrument={chordChartInstrument}
              songKey={songKey}
              onSongKeyChange={(newKey) => {
                const key = normalizeSongKey(newKey);
                setSongKey(key);
                localStorage.setItem(`song_key_${songId}`, key);
              }}
              chordExplorerTour={chordExplorerTour}
              setPendingVoicingSelection={setPendingVoicingSelection}
              setChordBuilderInsertContext={setChordBuilderInsertContext}
              focusSectionLabelForSectionId={focusSectionLabelForSectionId}
              onFocusSectionLabelDone={() => setFocusSectionLabelForSectionId(null)}
              onOpenSectionRecord={() => {
                toast.info('Recording is not part of this local-only version yet. It returns in a later update.');
              }}
              runWithPluginGate={runWithPluginGate}
              primarySectionRecording={primaryBySectionId[section.sectionId]}
              onPlaySectionRecording={(rec) => {
                runWithPluginGate('audio_player', () => {
                  setAudioPlayerTracks([rec]);
                  setAudioPlayerStartIndex(0);
                  setAudioPlayerOpen(true);
                });
              }}
              registerSectionLabelRef={registerSectionLabelRef}
              registerLineInputRef={registerLineInputRef}
              focusLineInput={focusLineInput}
              focusLineIdOnMount={focusLineOnMount?.sectionId === section.sectionId ? focusLineOnMount.lineId : undefined}
              openGuitarTabEditorForSectionId={openGuitarTabEditorForSectionId}
              onOpenGuitarTabEditorRequestConsumed={() => setOpenGuitarTabEditorForSectionId(null)}
            />
          ))}
        </div>

        {/* Add Section - type menu; non–guitar sections get an empty first line focused; Guitar Tab opens the tab editor */}
        {!isReadOnly && (
          <DropdownMenu>
            <DropdownMenuTrigger
              className="mt-6 inline-flex items-center justify-center gap-2 px-4 py-2 text-accent border border-accent rounded-md hover:bg-accent/10 min-h-[44px] touch-manipulation"
              aria-label="Add section"
            >
              + Add Section
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="bottom" className="min-w-[20rem] p-2">
              <div className="grid grid-flow-col grid-rows-9 grid-cols-2 gap-x-4 gap-y-0.5">
                {SECTION_TYPES_IN_MENU_ORDER.map((type) => (
                  <DropdownMenuItem
                    key={type}
                    onClick={() => handleAddSectionWithType(type)}
                    className="touch-manipulation min-h-[40px] cursor-pointer"
                  >
                    {sectionTypeDisplay(type)}
                  </DropdownMenuItem>
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
          </div>
      </main>

        {/* Chord Voicings - Vaul drawer from right (desktop + mobile), icon trigger */}
        <ChordVoicingsDrawer
          open={voicingDrawerOpen}
          onOpenChange={setVoicingDrawerOpen}
          chords={chordsInOrder}
          instrument={chordChartInstrument}
          isReadOnly={isReadOnly}
          chatReadOnly={song.archived}
          collaborationChatEnabled={workspaceContext?.collaborationChatEnabled ?? false}
          songId={songId}
          artifactsRefreshKey={artifactsRefreshKey}
          onOpenNote={(noteId) => {
            setNotesModalNoteId(noteId);
            setNotesModalOpen(true);
          }}
          onPlayRecordings={(tracks, startIndex) => {
            runWithPluginGate('audio_player', () => {
              setAudioPlayerTracks(tracks);
              setAudioPlayerStartIndex(startIndex);
              setAudioPlayerOpen(true);
            });
          }}
          onOpenTrackLabProject={() => {
            toast.info('Recording is not part of this local-only version yet. It returns in a later update.');
          }}
          contentRef={chordChartsExportRef}
          onRequestVoicingChange={(chordId, symbol, voicingId) =>
            setPendingVoicingSelection({ chordId, symbol, voicingId })
          }
        />
      </div>

      {/* Chord Builder – quick-select + editor; replaces VoicingSelectionModal (revert by restoring VoicingSelectionModal here) */}
      {pendingVoicingSelection && !isReadOnly && (
        <ChordVoicingSelection
          isOpen={true}
          chordId={pendingVoicingSelection.chordId}
          symbol={pendingVoicingSelection.symbol}
          instrument={chordChartInstrument}
          songId={songId}
          currentVoicingId={pendingVoicingSelection.voicingId ?? null}
          onSelect={(voicingId, effectiveSymbol, guitarVoicing) => {
            if (!song) return;
            const chordId = pendingVoicingSelection.chordId;
            const symbol = effectiveSymbol ?? pendingVoicingSelection.symbol;
            const placed = findLineContainingChord(song, chordId);
            const token = placed?.line.tokens?.find((t) => t.tokenId === placed.chord.tokenId);
            const absoluteCharOffset = placed
              ? token
                ? token.startOffset + placed.chord.charOffset
                : placed.chord.charOffset
              : 0;

            const { tabResult, block } = placed
              ? tryGuitarTabAutofillAtPosition(
                  placed.orderedLines,
                  placed.line.lineId,
                  absoluteCharOffset,
                  chordChartInstrument,
                  guitarVoicing
                )
              : { tabResult: null, block: null };

            if (effectiveSymbol != null && effectiveSymbol !== pendingVoicingSelection.symbol) {
              setSong((s) => (s ? updaters.applyEditChord(s, chordId, symbol) : s));
              enqueue({ type: 'EditChord', payload: { chordId, symbol } });
            }

            setSong((s) => {
              if (!s) return s;
              let next = s;
              const anchorsPre =
                tabResult && block ? collectChordAnchorsOnTabBlockLines(s, block.lineIds) : [];
              if (tabResult && block) {
                for (let i = 0; i < 6; i++) {
                  next = updaters.applyEditLine(next, block.lineIds[i]!, tabResult.newStaffLines[i]!);
                }
                for (const a of anchorsPre) {
                  const line = next.sections
                    .flatMap((sec) => sec.lines ?? [])
                    .find((l) => l.lineId === a.lineId);
                  const r = updaters.tokenAtAbsoluteCharOffset(line, a.absoluteCharOffset);
                  if (r) {
                    next = updaters.applyMoveChord(next, a.chordId, r.tokenId, r.charOffsetInToken);
                  }
                }
              }
              return updaters.applySetChordVoicing(next, chordId, voicingId ?? null);
            });

            if (tabResult && block && placed) {
              const reanchor = collectChordAnchorsOnTabBlockLines(song, block.lineIds);
              enqueue({
                type: 'EditTabBlock',
                payload: {
                  lines: block.lineIds.map((id, i) => ({
                    lineId: id,
                    text: tabResult.newStaffLines[i]!,
                  })),
                  barCount: tabResult.barCount,
                  widthPreset: tabResult.widthPreset,
                  source: 'typed',
                },
              });
              for (const a of reanchor) {
                enqueue({
                  type: 'MoveChord',
                  payload: {
                    chordId: a.chordId,
                    lineId: a.lineId,
                    absoluteCharOffset: a.absoluteCharOffset,
                  },
                });
              }
            }
            enqueue({ type: 'SetChordVoicing', payload: { chordId, voicingId: voicingId ?? null } });
            setPendingVoicingSelection(null);
          }}
          onSkip={() => {
            setPendingVoicingSelection(null);
            loadSong();
          }}
          onClose={() => setPendingVoicingSelection(null)}
          showTutorialOnOpen={chordVoicingSelectionTour.showTutorialOnOpen}
          onTutorialComplete={chordVoicingSelectionTour.onTutorialComplete}
          onTutorialSkipPermanent={chordVoicingSelectionTour.onTutorialSkipPermanent}
        />
      )}

      {/* Chord Builder – insert new chord at token (no chord passed; build only, no quick select) */}
      {chordBuilderInsertContext && !isReadOnly && song && (
        <ChordVoicingSelection
          isOpen={true}
          chordId=""
          symbol=""
          instrument={chordChartInstrument}
          songId={songId}
          onSelect={async (voicingId, effectiveSymbol, guitarVoicing) => {
            if (!effectiveSymbol || !song) return;
            const { normalizeChordSymbol } = await import('@/lib/chordService');
            const normalized = normalizeChordSymbol(effectiveSymbol);
            const chordId = crypto.randomUUID();
            const { lineId, tokenId, charOffsetInToken } = chordBuilderInsertContext;
            const line = song.sections.flatMap((s) => s.lines ?? []).find((l) => l.lineId === lineId);
            const token = line?.tokens?.find((t) => t.tokenId === tokenId);
            const absoluteCharOffset = token ? token.startOffset + charOffsetInToken : charOffsetInToken;

            const containingSection = song.sections.find((sec) =>
              (sec.lines ?? []).some((l) => l.lineId === lineId)
            );
            const orderedLines = (containingSection?.lines ?? []).map((l) => ({
              lineId: l.lineId,
              text: l.text ?? '',
            }));
            const { tabResult, block } = tryGuitarTabAutofillAtPosition(
              orderedLines,
              lineId,
              absoluteCharOffset,
              chordChartInstrument,
              guitarVoicing
            );

            const highLineAfter =
              tabResult && line
                ? updaters.withRegeneratedTokens(line, tabResult.newStaffLines[0]!)
                : line;
            const resolved = updaters.tokenAtAbsoluteCharOffset(highLineAfter, absoluteCharOffset);

            const reanchorBeforeTabEdit =
              tabResult && block ? collectChordAnchorsOnTabBlockLines(song, block.lineIds) : [];

            setSong((s) => {
              if (!s) return s;
              let next = s;
              const anchorsPre =
                tabResult && block ? collectChordAnchorsOnTabBlockLines(s, block.lineIds) : [];
              if (tabResult && block) {
                for (let i = 0; i < 6; i++) {
                  next = updaters.applyEditLine(next, block.lineIds[i]!, tabResult.newStaffLines[i]!);
                }
                for (const a of anchorsPre) {
                  const ln = next.sections
                    .flatMap((sec) => sec.lines ?? [])
                    .find((l) => l.lineId === a.lineId);
                  const r = updaters.tokenAtAbsoluteCharOffset(ln, a.absoluteCharOffset);
                  if (r) {
                    next = updaters.applyMoveChord(next, a.chordId, r.tokenId, r.charOffsetInToken);
                  }
                }
              }
              next = updaters.applyAddChord(
                next,
                lineId,
                chordId,
                resolved?.tokenId ?? tokenId,
                resolved?.charOffsetInToken ?? charOffsetInToken,
                normalized
              );
              return updaters.applySetChordVoicing(next, chordId, voicingId || null);
            });

            if (tabResult && block) {
              enqueue({
                type: 'EditTabBlock',
                payload: {
                  lines: block.lineIds.map((id, i) => ({
                    lineId: id,
                    text: tabResult.newStaffLines[i]!,
                  })),
                  barCount: tabResult.barCount,
                  widthPreset: tabResult.widthPreset,
                  source: 'typed',
                },
              });
              for (const a of reanchorBeforeTabEdit) {
                enqueue({
                  type: 'MoveChord',
                  payload: {
                    chordId: a.chordId,
                    lineId: a.lineId,
                    absoluteCharOffset: a.absoluteCharOffset,
                  },
                });
              }
            }
            enqueue({
              type: 'AddChord',
              payload: {
                lineId,
                tokenId: resolved?.tokenId ?? tokenId,
                charOffset: absoluteCharOffset,
                chordSymbol: normalized,
              },
              clientGeneratedId: chordId,
            });
            enqueue({
              type: 'SetChordVoicing',
              payload: { chordId, voicingId: voicingId || null },
            });
            setChordBuilderInsertContext(null);
          }}
          onClose={() => setChordBuilderInsertContext(null)}
          showTutorialOnOpen={chordVoicingSelectionTour.showTutorialOnOpen}
          onTutorialComplete={chordVoicingSelectionTour.onTutorialComplete}
          onTutorialSkipPermanent={chordVoicingSelectionTour.onTutorialSkipPermanent}
        />
      )}

      {/* Bottom bar and drawers */}
      <SongEditorBottomBar
        songId={songId}
        keyDrawerOpen={keyDrawerOpen}
        onKeyClick={() => setKeyDrawerOpen((o) => !o)}
        exportDrawerOpen={exportDrawerOpen}
        onExportClick={() => setExportDrawerOpen((o) => !o)}
        addDrawerOpen={addDrawerOpen}
        onAddClick={() => setAddDrawerOpen((o) => !o)}
        onRecordClick={() => {
          toast.info('Recording is not part of this local-only version yet. It returns in a later update.');
        }}
        isReadOnly={isReadOnly}
      />
      <SongKeyDrawer
        open={keyDrawerOpen}
        onOpenChange={setKeyDrawerOpen}
        root={parseSongKey(songKey).root}
        tonality={parseSongKey(songKey).tonality}
        chordChartInstrument={chordChartInstrument}
        onRootChange={handleRootChange}
        onTonalityChange={handleTonalityChange}
        onChordChartChange={(value) => {
          setChordChartInstrument(value);
          localStorage.setItem(`chord_chart_${songId}`, value);
        }}
        timeSignature={timeSignature}
        bpm={songBpm}
        onTimeSignatureChange={handleTimeSignatureChange}
        onBpmChange={handleBpmChange}
      />
      <ExportDrawer
        open={exportDrawerOpen}
        onOpenChange={setExportDrawerOpen}
        song={song}
        rhythm={rhythmForExport}
        instrument={chordChartInstrument}
        getChordChartsHtml={() => {
          const el = chordChartsExportRef.current;
          if (!el) return '';
          const clone = el.cloneNode(true) as HTMLDivElement;
          stripChordChartsForExport(clone);
          deduplicateChordChartsForExport(clone);
          return clone.innerHTML;
        }}
      />
      <AddDrawer
        open={addDrawerOpen}
        onOpenChange={setAddDrawerOpen}
        onOpenNotes={() => {
          setNotesModalNoteId(null);
          setNotesModalOpen(true);
        }}
        onOpenScanLyrics={() => setScanLyricsDrawerOpen(true)}
        onOpenAddVideo={() => setRecordVideoDrawerOpen(true)}
        onOpenAddAudio={() => setRecordAudioDrawerOpen(true)}
        onOpenMetadata={() => setMetadataModalOpen(true)}
        isReadOnly={isReadOnly}
      />

      {/* Record video drawer - camera record or file upload */}
      {songId && (
        <RecordVideoDrawer
          open={recordVideoDrawerOpen}
          onOpenChange={setRecordVideoDrawerOpen}
          songId={songId}
          onSuccess={() => {
            setArtifactsRefreshKey((k) => k + 1);
            loadSong();
          }}
        />
      )}

      {/* Record audio drawer - mic record or file upload */}
      {songId && (
        <RecordAudioDrawer
          open={recordAudioDrawerOpen}
          onOpenChange={setRecordAudioDrawerOpen}
          songId={songId}
          onSuccess={() => {
            setArtifactsRefreshKey((k) => k + 1);
            loadSong();
          }}
        />
      )}

      {/* Scan lyrics drawer - camera or file upload for hand-written lyrics */}
      {songId && (
        <ScanLyricsDrawer
          open={scanLyricsDrawerOpen}
          onOpenChange={setScanLyricsDrawerOpen}
          songId={songId}
          onSuccess={() => {
            setArtifactsRefreshKey((k) => k + 1);
            loadSong();
          }}
        />
      )}

      {/* Notes modal - create or edit markdown notes for this song */}
      {songId && (
        <NotesModal
          isOpen={notesModalOpen}
          songId={songId}
          initialNoteId={notesModalNoteId}
          onClose={() => {
            setNotesModalOpen(false);
            setNotesModalNoteId(null);
          }}
          onSaveSuccess={() => {
            setArtifactsRefreshKey((k) => k + 1);
            loadSong();
          }}
          onSaveError={(msg) => console.warn('Note save error:', msg)}
        />
      )}

      {/* Metadata modal - single work metadata set per song (not in artifacts) */}
      {songId && (
        <MetadataModal
          isOpen={metadataModalOpen}
          songId={songId}
          onClose={() => setMetadataModalOpen(false)}
          onSaveSuccess={() => loadSong()}
          onSaveError={(msg) => toast.error(msg)}
        />
      )}

      <PluginGraceModal
        open={graceModalOpen}
        onClose={handleGraceModalClose}
        pluginName={graceModalPlugin}
        graceDaysRemaining={getAccountGraceDaysRemaining(profile)}
      />

      {/* Audio Recorder modal - record and upload audio for this song or section */}
      {audioRecorderOpen && songId && (
        <AudioRecorderModal
          isOpen={true}
          songId={songId}
          recordingSectionId={recordingSectionIdForModal}
          recordingLabel={recordingLabelForModal}
          initialProject={trackLabProjectToOpen}
          startNewProject={!recordingSectionIdForModal && !trackLabProjectToOpen}
          onClose={() => {
            setAudioRecorderOpen(false);
            setRecordingSectionIdForModal(null);
            setRecordingLabelForModal(null);
            setTrackLabProjectToOpen(null);
          }}
          onSaveSuccess={() => {
            loadSong();
            setArtifactsRefreshKey((k) => k + 1);
            toast.success('Recording saved');
          }}
          onSaveError={(msg) => {
            console.warn('Audio save error:', msg);
            toast.error(msg);
          }}
        />
      )}

      {audioPlayerOpen && songId && (
        <AudioPlayerModal
          isOpen={true}
          onClose={() => setAudioPlayerOpen(false)}
          songId={songId}
          tracks={audioPlayerTracks}
          startIndex={audioPlayerStartIndex}
        />
      )}
    </div>
  );
}

/** Strip buttons and voicing names from a cloned chord charts container for HTML/PDF export. */
function stripChordChartsForExport(clone: HTMLDivElement) {
  clone.querySelectorAll('button').forEach((btn) => {
    if (btn.textContent?.trim().includes('Change voicing')) btn.remove();
  });
  const voicingNamePattern = /^Voicing(\s+\d+(\/\d+)?)?$|^Custom \d{2}$/;
  clone.querySelectorAll('span').forEach((span) => {
    if (voicingNamePattern.test(span.textContent?.trim() ?? '')) span.remove();
  });
  clone.querySelectorAll('text').forEach((el) => {
    if (voicingNamePattern.test(el.textContent?.trim() ?? '')) el.remove();
  });
}

/** Remove duplicate chord cards (same symbol + same voicing) so export shows each unique chord/voicing once. */
function deduplicateChordChartsForExport(clone: HTMLDivElement) {
  const cards = clone.querySelectorAll('[data-chord-symbol]');
  const seen = new Set<string>();
  cards.forEach((card) => {
    const symbol = card.getAttribute('data-chord-symbol') ?? '';
    const voicingId = card.getAttribute('data-voicing-id') ?? '';
    const key = `${symbol}\0${voicingId}`;
    if (seen.has(key)) card.remove();
    else seen.add(key);
  });
}

/** Apply 4-across layout and light backgrounds to cloned chord charts for PDF image capture. */
function prepareChordChartsCloneForPdfCapture(clone: HTMLDivElement) {
  clone.style.background = '#fff';
  const grid = clone.querySelector('.grid') as HTMLElement | null;
  if (grid) {
    grid.style.display = 'flex';
    grid.style.flexWrap = 'wrap';
    grid.style.gap = '10px';
    grid.style.background = '#fff';
    const cards = grid.querySelectorAll('[data-chord-symbol]');
    cards.forEach((card) => {
      const el = card as HTMLElement;
      el.style.width = 'calc(25% - 8px)';
      el.style.minWidth = '120px';
      el.style.maxWidth = '200px';
      el.style.backgroundColor = '#f9f9f9';
      el.style.borderRadius = '6px';
      el.style.border = '1px solid #ddd';
      el.style.padding = '10px';
      el.style.paddingTop = '14px';
      el.style.boxSizing = 'border-box';
      el.style.color = '#1a1a1a';
      el.style.overflow = 'visible';
      el.style.minHeight = '140px';
      const label = el.querySelector('span');
      if (label) {
        const labelEl = label as HTMLElement;
        labelEl.style.color = '#1a1a1a';
        labelEl.style.display = 'block';
        labelEl.style.marginBottom = '10px';
        labelEl.style.lineHeight = '1.4';
        labelEl.style.minHeight = '22px';
        labelEl.style.paddingTop = '2px';
        labelEl.style.flexShrink = '0';
      }
      el.querySelectorAll('div').forEach((div) => {
        (div as HTMLElement).style.backgroundColor = '#fff';
      });
      const firstDiagramWrapper = el.querySelector('div');
      if (firstDiagramWrapper) {
        (firstDiagramWrapper as HTMLElement).style.marginTop = '8px';
      }
      el.querySelectorAll('svg').forEach((svg) => {
        const s = svg as SVGElement;
        s.style.backgroundColor = '#fff';
      });
    });
  }
}

/** Guitar tab staff / legacy chord-dot lines: no inline text edit; chords only on high-e row (or legacy dot row). */
function guitarTabLineFlags(
  sectionType: string,
  lineText: string | undefined
): { tabStaffReadOnly: boolean; tabStaffChordRow: boolean } {
  if (!isTabStaffSectionType(sectionType)) {
    return { tabStaffReadOnly: false, tabStaffChordRow: false };
  }
  const t = lineText ?? '';
  const chordGuide = isGuitarTabChordGuideLine(t);
  const staff = isGuitarTabStaffLine(t);
  return {
    tabStaffReadOnly: staff || chordGuide,
    tabStaffChordRow: chordGuide || isGuitarTabHighEStringLine(t),
  };
}

// Section Component
function SectionComponent({
  section,
  songId,
  song,
  setSong,
  enqueue,
  flush,
  onUpdate,
  isReadOnly,
  preferredInstrument,
  songKey,
  onSongKeyChange,
  chordExplorerTour,
  setPendingVoicingSelection,
  setChordBuilderInsertContext,
  focusSectionLabelForSectionId,
  onFocusSectionLabelDone,
  onOpenSectionRecord,
  primarySectionRecording,
  onPlaySectionRecording,
  registerSectionLabelRef,
  registerLineInputRef,
  focusLineInput,
  focusLineIdOnMount,
  openGuitarTabEditorForSectionId,
  onOpenGuitarTabEditorRequestConsumed,
  runWithPluginGate,
}: {
  section: Section;
  songId: string;
  song: SongDetail | null;
  setSong: React.Dispatch<React.SetStateAction<SongDetail | null>>;
  enqueue: (cmd: import('@/lib/batch-types').BatchCommand) => void;
  flush: () => Promise<void>;
  onUpdate: () => void;
  isReadOnly: boolean;
  preferredInstrument: Instrument;
  songKey: string;
  onSongKeyChange: (newKey: string) => void;
  chordExplorerTour: ChordExplorerTourProps;
  setPendingVoicingSelection: (value: { chordId: string; symbol: string; voicingId?: string | null } | null) => void;
  setChordBuilderInsertContext: (value: {
    lineId: string;
    tokenId: string;
    token: Token;
    charOffsetInToken: number;
  } | null) => void;
  focusSectionLabelForSectionId?: string | null;
  onFocusSectionLabelDone?: () => void;
  onOpenSectionRecord?: (sectionId: string, sectionLabel: string) => void;
  primarySectionRecording?: Recording | null;
  onPlaySectionRecording?: (recording: Recording) => void;
  registerSectionLabelRef?: (sectionId: string, ref: HTMLInputElement | null) => void;
  registerLineInputRef?: (lineId: string, ref: HTMLInputElement | null) => void;
  focusLineInput?: (lineId: string) => void;
  /** When set, focus this line on mount (e.g. after add section + first line). */
  focusLineIdOnMount?: string | null;
  /** Parent signals this section should open the guitar tab editor once (e.g. new Guitar Tab section). */
  openGuitarTabEditorForSectionId?: string | null;
  onOpenGuitarTabEditorRequestConsumed?: () => void;
  runWithPluginGate?: (pluginId: string, proceed: () => void) => void;
}) {
  const [addingLine, setAddingLine] = useState(false);
  const [newLineText, setNewLineText] = useState('');
  const [focusedLineId, setFocusedLineId] = useState<string | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const newLineInputRef = useRef<HTMLInputElement>(null);
  /** Set to 'paste' when user pastes into new line input; passed to addLine and reset after. */
  const nextAddLineSourceRef = useRef<'typed' | 'paste'>('typed');
  const [pasteWarningOpen, setPasteWarningOpen] = useState(false);
  const [pendingPasteText, setPendingPasteText] = useState('');

  /** When we are the focus target on mount (e.g. just added), start in edit mode so we can focus the label synchronously. */
  const [isEditingSection, setIsEditingSection] = useState(() => focusSectionLabelForSectionId === section.sectionId);
  const [localSectionType, setLocalSectionType] = useState(section.sectionType);
  const [localSectionLabel, setLocalSectionLabel] = useState(section.label ?? '');
  const sectionLabelInputRef = useRef<HTMLInputElement>(null);
  /** When true, focus section label input after next render (e.g. after entering edit mode). */
  const shouldFocusSectionLabelRef = useRef(false);
  const [copyChordsModalOpen, setCopyChordsModalOpen] = useState(false);
  const [copyChordsTargetSectionId, setCopyChordsTargetSectionId] = useState<string | null>(null);
  const [copyChordsLoading, setCopyChordsLoading] = useState(false);
  const [copyChordsError, setCopyChordsError] = useState<string | null>(null);
  const [measureRowModalOpen, setMeasureRowModalOpen] = useState(false);
  /** When set, saving the measure modal replaces these line IDs instead of appending. */
  const [measureRowReplaceLineIds, setMeasureRowReplaceLineIds] = useState<string[] | null>(null);
  const [guitarTabBarModalOpen, setGuitarTabBarModalOpen] = useState(false);
  const [guitarTabInitialStaff, setGuitarTabInitialStaff] = useState<string[] | null>(null);
  const [guitarTabReplaceLineIds, setGuitarTabReplaceLineIds] = useState<string[] | null>(null);
  const openGuitarTabEditorForLine = useCallback(
    (lineId: string) => {
      const block = extractGuitarTabStaffBlockFromLines(
        (section.lines ?? []).map((l) => ({ lineId: l.lineId, text: l.text ?? '' })),
        lineId
      );
      if (block && parseGuitarTabStaffLinesToGrid(block.staffTexts)) {
        setGuitarTabInitialStaff(block.staffTexts);
        setGuitarTabReplaceLineIds(block.lineIds);
      } else {
        setGuitarTabInitialStaff(null);
        setGuitarTabReplaceLineIds(null);
      }
      setGuitarTabBarModalOpen(true);
    },
    [section.lines]
  );

  const openMeasureRowEditorForLine = useCallback(
    (lineId: string) => {
      const ordered = [...(section.lines ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
      const idx = ordered.findIndex((l) => l.lineId === lineId);
      if (idx < 0) return;
      let start = idx;
      while (start > 0 && isInstrumentalMeasureAsciiLine(ordered[start - 1]?.text)) {
        start -= 1;
      }
      const span = instrumentalMeasureBlockLineCount(ordered, start);
      if (span === 0) return;
      const blockLines = ordered.slice(start, start + span);
      const texts = blockLines.map((l) => l.text ?? '');
      const parsed = parseInstrumentalMeasureRowFromBlock(texts);
      if (parsed) {
        setMeasureRowBars(parsed.barCount);
        setMeasureRowBeats(parsed.beatsPerBar);
        setMeasureRowSubdivision(parsed.subdivision);
      } else {
        setMeasureRowBars(4);
        setMeasureRowBeats(4);
        setMeasureRowSubdivision('beat');
      }
      setMeasureRowReplaceLineIds(blockLines.map((l) => l.lineId));
      setMeasureRowModalOpen(true);
    },
    [section.lines]
  );

  useEffect(() => {
    if (isReadOnly || section.sectionType !== 'GUITAR_TAB') return;
    if (openGuitarTabEditorForSectionId !== section.sectionId) return;
    setGuitarTabInitialStaff(null);
    setGuitarTabReplaceLineIds(null);
    setGuitarTabBarModalOpen(true);
    onOpenGuitarTabEditorRequestConsumed?.();
  }, [
    isReadOnly,
    section.sectionId,
    section.sectionType,
    openGuitarTabEditorForSectionId,
    onOpenGuitarTabEditorRequestConsumed,
  ]);

  useEffect(() => {
    if (!isTabStaffSectionType(section.sectionType) || !addingLine) return;
    setAddingLine(false);
    setNewLineText('');
  }, [section.sectionType, addingLine]);
  const [measureRowBars, setMeasureRowBars] = useState(2);
  const [measureRowBeats, setMeasureRowBeats] = useState(4);
  const [measureRowSubdivision, setMeasureRowSubdivision] = useState<MeasureSubdivision>('beat');

  // Register section label input ref with parent for mobile-safe focus
  const sectionLabelRefCallback = useCallback((node: HTMLInputElement | null) => {
    sectionLabelInputRef.current = node;
    registerSectionLabelRef?.(section.sectionId, node);
  }, [section.sectionId, registerSectionLabelRef]);

  // When parent requests focus on this section's label, enter editing mode (clear target after we focus)
  useEffect(() => {
    if (focusSectionLabelForSectionId === section.sectionId) {
      shouldFocusSectionLabelRef.current = true;
      setIsEditingSection(true);
    }
  }, [focusSectionLabelForSectionId, section.sectionId]);

  // Focus section label input when we've just entered edit mode (sync after DOM so focus lands reliably)
  useLayoutEffect(() => {
    if (!isEditingSection) return;
    const shouldFocus = shouldFocusSectionLabelRef.current || focusSectionLabelForSectionId === section.sectionId;
    if (!shouldFocus) return;
    shouldFocusSectionLabelRef.current = false;
    sectionLabelInputRef.current?.focus();
    onFocusSectionLabelDone?.();
  }, [isEditingSection, focusSectionLabelForSectionId, section.sectionId, onFocusSectionLabelDone]);

  useEffect(() => {
    if (!isEditingSection) {
      setLocalSectionType(section.sectionType);
      setLocalSectionLabel(section.label ?? '');
    }
  }, [section.sectionType, section.label, isEditingSection]);

  const handleAddLine = () => {
    if (isReadOnly || !song) return;
    const source = nextAddLineSourceRef.current;
    nextAddLineSourceRef.current = 'typed';
    const lineId = crypto.randomUUID();
    setSong((s) => (s ? updaters.applyAddLine(s, section.sectionId, lineId, newLineText) : s));
    enqueue({
      type: 'AddLine',
      payload: { sectionId: section.sectionId, text: newLineText, source },
      clientGeneratedId: lineId,
    });
    setNewLineText('');
    setAddingLine(false);
  };

  /** Persist current line and keep focus in the same input so user can type the next line (Enter key). */
  const handleAddLineAndContinue = () => {
    if (isReadOnly || !newLineText.trim() || !song) return;
    const source = nextAddLineSourceRef.current;
    nextAddLineSourceRef.current = 'typed';
    const lineId = crypto.randomUUID();
    setSong((s) => (s ? updaters.applyAddLine(s, section.sectionId, lineId, newLineText) : s));
    enqueue({
      type: 'AddLine',
      payload: { sectionId: section.sectionId, text: newLineText, source },
      clientGeneratedId: lineId,
    });
    setNewLineText('');
    newLineInputRef.current?.focus();
  };

  /** On Enter from a line: focus next line if it exists, otherwise create and focus a new line. */
  const handleEnterFromLine = (currentLineId: string) => {
    if (isReadOnly) return;
    const idx = section.lines.findIndex((l) => l.lineId === currentLineId);
    const hasNext = idx >= 0 && idx < section.lines.length - 1;
    if (hasNext) {
      const nextLineId = section.lines[idx + 1].lineId;
      flushSync(() => setFocusedLineId(nextLineId));
      // Line component will focus its input when it enters edit mode (useEffect)
    } else if (song && !isTabStaffSectionType(section.sectionType)) {
      const lineId = crypto.randomUUID();
      flushSync(() => {
        setSong((s) => (s ? updaters.applyAddLine(s, section.sectionId, lineId, '') : s));
        setFocusedLineId(lineId);
      });
      enqueue({
        type: 'AddLine',
        payload: { sectionId: section.sectionId, text: '', source: 'typed' },
        clientGeneratedId: lineId,
      });
      // Line component will focus its input when it mounts with focusedLineId (useEffect)
    }
  };

  useEffect(() => {
    if (!focusedLineId) return;
    const t = setTimeout(() => setFocusedLineId(null), 150);
    return () => clearTimeout(t);
  }, [focusedLineId]);

  // When parent asks to focus a line on mount (e.g. after add section + first line), set focusedLineId so LineComponent focuses
  useEffect(() => {
    if (focusLineIdOnMount && section.lines?.some((l) => l.lineId === focusLineIdOnMount)) {
      setFocusedLineId(focusLineIdOnMount);
    }
  }, [focusLineIdOnMount, section.lines]);

  const handleSaveSection = () => {
    if (isReadOnly || !song) return;
    const typeChanged = localSectionType !== section.sectionType;
    const trimmedLabel = (localSectionLabel ?? '').trim();
    const sameTypeSectionsForSave = (song?.sections ?? [])
      .filter((s) => s.sectionType === localSectionType)
      .sort((a, b) => a.orderIndex - b.orderIndex);
    const withThisSection =
      section.sectionType === localSectionType
        ? sameTypeSectionsForSave
        : [...sameTypeSectionsForSave, { ...section, sectionType: localSectionType }].sort(
            (a, b) => a.orderIndex - b.orderIndex
          );
    const typeOrderForSave = withThisSection.findIndex((s) => s.sectionId === section.sectionId) + 1;
    const inferredLabel = `${sectionTypeDisplay(localSectionType)} ${typeOrderForSave}`;
    const labelToSave = trimmedLabel !== '' ? trimmedLabel : inferredLabel;
    const labelChanged = labelToSave !== (section.label ?? '');
    if (!typeChanged && !labelChanged) {
      setIsEditingSection(false);
      return;
    }
    setSong((s) => (s ? updaters.applyEditSection(s, section.sectionId, localSectionType, labelToSave) : s));
    enqueue({
      type: 'EditSection',
      payload: { sectionId: section.sectionId, sectionType: localSectionType, label: labelToSave },
    });
    setIsEditingSection(false);
    if (typeChanged && localSectionType === 'GUITAR_TAB' && (section.lines?.length ?? 0) === 0) {
      setGuitarTabInitialStaff(null);
      setGuitarTabReplaceLineIds(null);
      setGuitarTabBarModalOpen(true);
    }
  };

  const handleCancelSectionEdit = () => {
    setLocalSectionType(section.sectionType);
    setLocalSectionLabel(section.label ?? '');
    setIsEditingSection(false);
  };

  const handleDeleteSection = () => {
    if (isReadOnly || !song) return;
    setSong((s) => (s ? updaters.applyArchiveSection(s, section.sectionId) : s));
    enqueue({ type: 'ArchiveSection', payload: { sectionId: section.sectionId } });
    setIsEditingSection(false);
  };

  const handleSectionFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSaveSection();
  };

  // Section title: custom label if set, otherwise "Verse 1", "Verse 2", etc. by order of appearance
  const sameTypeSections = (song?.sections ?? [])
    .filter((s) => s.sectionType === section.sectionType)
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const typeOrder = sameTypeSections.findIndex((s) => s.sectionId === section.sectionId) + 1;
  const sectionTitleDisplay =
    (section.label?.trim() ?? '') !== ''
      ? section.label!.trim()
      : `${sectionTypeDisplay(section.sectionType)} ${typeOrder}`;

  const getSectionDisplayLabel = (s: Section) => {
    const sameType = (song?.sections ?? [])
      .filter((sec) => sec.sectionType === s.sectionType)
      .sort((a, b) => a.orderIndex - b.orderIndex);
    const order = sameType.findIndex((sec) => sec.sectionId === s.sectionId) + 1;
    return (s.label?.trim() ?? '') !== ''
      ? s.label!.trim()
      : `${sectionTypeDisplay(s.sectionType)} ${order}`;
  };

  const otherSections = (song?.sections ?? []).filter((s) => s.sectionId !== section.sectionId);
  const targetSection = copyChordsTargetSectionId
    ? (song?.sections ?? []).find((s) => s.sectionId === copyChordsTargetSectionId) ?? null
    : null;
  const targetHasNoLines = targetSection ? (targetSection.lines?.length ?? 0) === 0 : true;
  const sectionHasChords = section.lines?.some((l) => (l.chords?.length ?? 0) > 0) ?? false;

  const measureRowPreview = useMemo(
    () =>
      generateInstrumentalMeasureRowAscii({
        barCount: measureRowBars,
        beatsPerBar: measureRowBeats,
        subdivision: measureRowSubdivision,
      }),
    [measureRowBars, measureRowBeats, measureRowSubdivision]
  );

  const handleInsertMeasureRow = () => {
    if (isReadOnly || !song) return;
    const rowTexts = generateInstrumentalMeasureRowAscii({
      barCount: measureRowBars,
      beatsPerBar: measureRowBeats,
      subdivision: measureRowSubdivision,
    }).split('\n');
    const replaceIds = measureRowReplaceLineIds;

    if (replaceIds && replaceIds.length > 0) {
      const specs = updaters.buildMeasureReplaceLineSpecs(replaceIds, rowTexts);
      setSong((s) => (s ? updaters.applyReplaceMeasureBlock(s, section.sectionId, replaceIds, specs) : s));
      const nOld = replaceIds.length;
      const nNew = specs.length;
      const min = Math.min(nOld, nNew);
      for (let i = 0; i < min; i++) {
        enqueue({
          type: 'EditLine',
          payload: { lineId: replaceIds[i]!, text: specs[i]!.text, source: 'typed' },
        });
      }
      if (nOld > nNew) {
        for (let i = nNew; i < nOld; i++) {
          enqueue({ type: 'ArchiveLine', payload: { lineId: replaceIds[i]! } });
        }
      }
      if (nNew > nOld) {
        let afterId = replaceIds[nOld - 1]!;
        for (let i = nOld; i < nNew; i++) {
          const spec = specs[i]!;
          enqueue({
            type: 'AddLine',
            payload: {
              sectionId: section.sectionId,
              text: spec.text,
              source: 'typed',
              afterLineId: afterId,
            },
            clientGeneratedId: spec.lineId,
          });
          afterId = spec.lineId;
        }
      }
    } else {
      const lineIds = rowTexts.map(() => crypto.randomUUID());
      setSong((s) => {
        if (!s) return s;
        let next = s;
        rowTexts.forEach((text, i) => {
          next = updaters.applyAddLine(next, section.sectionId, lineIds[i], text);
        });
        return next;
      });
      rowTexts.forEach((text, i) => {
        enqueue({
          type: 'AddLine',
          payload: { sectionId: section.sectionId, text, source: 'typed' },
          clientGeneratedId: lineIds[i],
        });
      });
    }

    setMeasureRowReplaceLineIds(null);
    setMeasureRowModalOpen(false);
  };

  const handleInsertGuitarTabLines = (
    rowTexts: string[],
    replaceLineIds?: string[],
    tabContext?: { barCount: number; widthPreset: string }
  ) => {
    if (isReadOnly || !song) return;
    const barCount = tabContext?.barCount;
    const widthPreset = tabContext?.widthPreset;
    if (replaceLineIds?.length === 6) {
      setSong((s) => {
        if (!s) return s;
        const anchorsPre = collectChordAnchorsOnTabBlockLines(s, replaceLineIds);
        let next = s;
        rowTexts.forEach((text, i) => {
          const id = replaceLineIds[i];
          if (id) next = updaters.applyEditLine(next, id, text);
        });
        for (const a of anchorsPre) {
          const ln = next.sections
            .flatMap((sec) => sec.lines ?? [])
            .find((l) => l.lineId === a.lineId);
          const r = updaters.tokenAtAbsoluteCharOffset(ln, a.absoluteCharOffset);
          if (r) {
            next = updaters.applyMoveChord(next, a.chordId, r.tokenId, r.charOffsetInToken);
          }
        }
        return next;
      });
      const editLines = rowTexts
        .map((text, i) => {
          const lineId = replaceLineIds[i];
          return lineId ? { lineId, text } : null;
        })
        .filter((x): x is { lineId: string; text: string } => x != null);
      if (editLines.length === 6 && song) {
        const reanchor = collectChordAnchorsOnTabBlockLines(song, replaceLineIds);
        enqueue({
          type: 'EditTabBlock',
          payload: {
            lines: editLines,
            ...(barCount != null ? { barCount } : {}),
            ...(widthPreset != null ? { widthPreset } : {}),
            source: 'typed',
          },
        });
        for (const a of reanchor) {
          enqueue({
            type: 'MoveChord',
            payload: {
              chordId: a.chordId,
              lineId: a.lineId,
              absoluteCharOffset: a.absoluteCharOffset,
            },
          });
        }
      }
      return;
    }
    const lineIds = rowTexts.map(() => crypto.randomUUID());
    setSong((s) => {
      if (!s) return s;
      let next = s;
      rowTexts.forEach((text, i) => {
        next = updaters.applyAddLine(next, section.sectionId, lineIds[i]!, text);
      });
      return next;
    });
    enqueue({
      type: 'AddTabBlock',
      payload: {
        sectionId: section.sectionId,
        lines: rowTexts.map((text, i) => ({ lineId: lineIds[i], text })),
        ...(barCount != null ? { barCount } : {}),
        ...(widthPreset != null ? { widthPreset } : {}),
        source: 'typed',
      },
    });
  };

  const handleArchiveGuitarTabBlock = (replaceLineIds: string[]) => {
    if (isReadOnly || !song || replaceLineIds.length !== 6) return;
    setSong((s) => {
      if (!s) return s;
      let next = s;
      for (const lineId of replaceLineIds) {
        next = updaters.applyArchiveLine(next, lineId);
      }
      return next;
    });
    for (const lineId of replaceLineIds) {
      enqueue({ type: 'ArchiveLine', payload: { lineId } });
    }
  };

  const handleCopyChords = async () => {
    if (!song || !copyChordsTargetSectionId || targetHasNoLines || copyChordsLoading) return;
    const target = (song.sections ?? []).find((s) => s.sectionId === copyChordsTargetSectionId);
    if (!target) return;
    setCopyChordsError(null);
    setCopyChordsLoading(true);
    try {
      const result = await copyChordsFromSectionToSection(songId, section, target);
      setCopyChordsModalOpen(false);
      setCopyChordsTargetSectionId(null);
      onUpdate();
      toast.success(
        result.skipped > 0
          ? `Copied ${result.copied} chord${result.copied !== 1 ? 's' : ''} (${result.skipped} skipped)`
          : `Copied ${result.copied} chord${result.copied !== 1 ? 's' : ''}`
      );
    } catch (err) {
      console.error('Copy chords failed', err);
      setCopyChordsError('Failed to copy chords. Please try again.');
    } finally {
      setCopyChordsLoading(false);
    }
  };

  const sectionOverflowMenu =
    !isReadOnly && song ? (
      <DropdownMenu>
        <DropdownMenuTrigger
          asChild
          onClick={(e) => e.stopPropagation()}
          className="flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-background/80"
          aria-label="Section menu"
        >
          <button type="button">
            <MoreVertical className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[10rem]">
          <DropdownMenuItem
            disabled={section.orderIndex === 0}
            onClick={(e) => {
              e.stopPropagation();
              if (section.orderIndex <= 0) return;
              const newOrderIndex = section.orderIndex - 1;
              setSong((s) => (s ? updaters.applyRepositionSection(s, section.sectionId, newOrderIndex) : s));
              enqueue({ type: 'RepositionSection', payload: { sectionId: section.sectionId, newOrderIndex } });
            }}
          >
            Position Up
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={section.orderIndex >= (song.sections?.length ?? 1) - 1}
            onClick={(e) => {
              e.stopPropagation();
              const maxIdx = (song.sections?.length ?? 1) - 1;
              if (section.orderIndex >= maxIdx) return;
              const newOrderIndex = section.orderIndex + 1;
              setSong((s) => (s ? updaters.applyRepositionSection(s, section.sectionId, newOrderIndex) : s));
              enqueue({ type: 'RepositionSection', payload: { sectionId: section.sectionId, newOrderIndex } });
            }}
          >
            Position Down
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={section.orderIndex === 0}
            onClick={(e) => {
              e.stopPropagation();
              if (section.orderIndex === 0) return;
              setSong((s) => (s ? updaters.applyRepositionSection(s, section.sectionId, 0) : s));
              enqueue({ type: 'RepositionSection', payload: { sectionId: section.sectionId, newOrderIndex: 0 } });
            }}
          >
            Position Top
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={section.orderIndex >= (song.sections?.length ?? 1) - 1}
            onClick={(e) => {
              e.stopPropagation();
              const newOrderIndex = (song.sections?.length ?? 1) - 1;
              if (section.orderIndex >= newOrderIndex) return;
              setSong((s) => (s ? updaters.applyRepositionSection(s, section.sectionId, newOrderIndex) : s));
              enqueue({ type: 'RepositionSection', payload: { sectionId: section.sectionId, newOrderIndex } });
            }}
          >
            Position Bottom
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {sectionHasChords ? (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                setCopyChordsTargetSectionId(null);
                setCopyChordsError(null);
                setCopyChordsModalOpen(true);
              }}
            >
              <Copy className="size-4 shrink-0" aria-hidden />
              Copy chords
            </DropdownMenuItem>
          ) : null}
          {sectionHasChords ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem
            variant="destructive"
            title="Recorded as section removed"
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteSection();
            }}
          >
            <Trash2 className="size-4 shrink-0" aria-hidden />
            Remove section
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

  return (
    <div className={`bg-surface rounded-lg shadow p-6 ${isReadOnly ? 'opacity-75' : ''}`}>
      {!isReadOnly && isEditingSection ? (
        <form onSubmit={handleSectionFormSubmit} className="mb-4 space-y-2">
          <select
            value={localSectionType}
            onChange={(e) => setLocalSectionType(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-md text-foreground"
          >
            {SECTION_TYPES_IN_MENU_ORDER.map((t) => (
              <option key={t} value={t}>
                {sectionTypeDisplay(t)}
              </option>
            ))}
          </select>
          <input
            ref={sectionLabelRefCallback}
            type="text"
            value={localSectionLabel}
            onChange={(e) => setLocalSectionLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              handleSaveSection();
              const lines = section.lines ?? [];
              if (lines.length === 0 && song) {
                if (localSectionType === 'GUITAR_TAB') {
                  setGuitarTabInitialStaff(null);
                  setGuitarTabReplaceLineIds(null);
                  setGuitarTabBarModalOpen(true);
                } else if (localSectionType === 'INSTRUMENTAL') {
                  /* Empty instrumental: user adds tab or measure row from section actions. */
                } else {
                  const lineId = crypto.randomUUID();
                  flushSync(() => {
                    setSong((s) => (s ? updaters.applyAddLine(s, section.sectionId, lineId, '') : s));
                    setFocusedLineId(lineId);
                  });
                  enqueue({
                    type: 'AddLine',
                    payload: { sectionId: section.sectionId, text: '', source: 'typed' },
                    clientGeneratedId: lineId,
                  });
                }
              } else if (lines.length > 0) {
                // Section has lines: move focus to first line (Enter = next field)
                const sorted = [...lines].sort((a, b) => a.orderIndex - b.orderIndex);
                const firstLineId = sorted[0].lineId;
                flushSync(() => setFocusedLineId(firstLineId));
                // Line will focus its input when it enters edit mode (useEffect in LineComponent)
              }
            }}
            placeholder="Section label (optional)"
            className="w-full px-3 py-2 border border-border rounded-md text-foreground placeholder:text-muted"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="px-3 py-1 bg-accent text-white text-sm rounded-md hover:bg-accent-hover"
            >
              Save
            </button>
            <button
              type="button"
              onClick={handleCancelSectionEdit}
              className="px-3 py-1 bg-border text-foreground text-sm rounded-md hover:opacity-90"
            >
              Cancel
            </button>
            {sectionOverflowMenu}
          </div>
        </form>
      ) : (
        <div className="mb-4 flex items-center gap-2">
          <h3
            className={`text-lg font-semibold text-foreground flex-1 min-w-0 ${
              isReadOnly ? '' : 'cursor-text hover:bg-background rounded px-1 -mx-1'
            }`}
            onClick={() => {
              if (!isReadOnly) {
                shouldFocusSectionLabelRef.current = true;
                setIsEditingSection(true);
              }
            }}
            onKeyDown={(e) => {
              if (!isReadOnly && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                shouldFocusSectionLabelRef.current = true;
                setIsEditingSection(true);
              }
            }}
            role={isReadOnly ? undefined : 'button'}
            tabIndex={isReadOnly ? undefined : 0}
            title={isReadOnly ? undefined : 'Click to edit section type and title'}
          >
            {sectionTitleDisplay}
          </h3>
          {!isReadOnly && (onOpenSectionRecord || onPlaySectionRecording) && (
            <div className="flex shrink-0 items-center gap-0.5">
              {primarySectionRecording && onPlaySectionRecording && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPlaySectionRecording(primarySectionRecording);
                  }}
                  className="flex size-6 items-center justify-center rounded-full text-accent/70 transition-all hover:bg-accent/10 hover:text-accent"
                  aria-label={`Play ${sectionTitleDisplay}`}
                  title={`Play ${sectionTitleDisplay}`}
                >
                  <Play className="size-3.5" />
                </button>
              )}
              {onOpenSectionRecord && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenSectionRecord(section.sectionId, sectionTitleDisplay);
                  }}
                  className="flex size-6 items-center justify-center rounded-full text-accent/70 transition-all hover:bg-accent/10 hover:text-accent"
                  aria-label={`Record ${sectionTitleDisplay}`}
                  title={primarySectionRecording ? `Record new version of ${sectionTitleDisplay}` : `Record ${sectionTitleDisplay}`}
                >
                  <Mic className="size-3.5" />
                </button>
              )}
            </div>
          )}
          {sectionOverflowMenu}
        </div>
      )}
      <div className="space-y-1">
        {(() => {
          const nodes: ReactNode[] = [];
          const lines = [...(section.lines ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
          const scrollBlockClass =
            'max-w-full min-w-0 overflow-x-auto overscroll-x-contain py-0.5 [touch-action:pan-x_pan-y]';

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]!;

            if (isTabStaffSectionType(section.sectionType)) {
              const tabSpan = guitarTabStaffDisplayBlockLineCount(lines, i);
              if (tabSpan > 0) {
                const blockLines = lines.slice(i, i + tabSpan);
                nodes.push(
                  <div key={`tab-scroll-${line.lineId}`} className={scrollBlockClass}>
                    {blockLines.map((bl) => {
                      const tabFlags = guitarTabLineFlags(section.sectionType, bl.text);
                      const rail = isGuitarTabChordGuideLine(bl.text ?? '');
                      return (
                        <LineComponent
                          key={bl.lineId}
                          line={bl}
                          songId={songId}
                          song={song}
                          setSong={setSong}
                          enqueue={enqueue}
                          onUpdate={onUpdate}
                          isReadOnly={isReadOnly}
                          preferredInstrument={preferredInstrument}
                          songKey={songKey}
                          onSongKeyChange={onSongKeyChange}
                          chordExplorerTour={chordExplorerTour}
                          setPendingVoicingSelection={setPendingVoicingSelection}
                          setChordBuilderInsertContext={setChordBuilderInsertContext}
                          focusedLineId={focusedLineId}
                          onEnterFromLine={handleEnterFromLine}
                          editingLineId={editingLineId}
                          onStartEditing={setEditingLineId}
                          registerLineInputRef={registerLineInputRef}
                          runWithPluginGate={runWithPluginGate}
                          guitarTabChordRail={rail}
                          tabStaffReadOnly={tabFlags.tabStaffReadOnly}
                          tabStaffChordRow={tabFlags.tabStaffChordRow}
                          suppressHorizontalScroll
                          onOpenGuitarTabEditor={
                            isTabStaffSectionType(section.sectionType) && !isReadOnly
                              ? () => openGuitarTabEditorForLine(bl.lineId)
                              : undefined
                          }
                        />
                      );
                    })}
                  </div>
                );
                i += tabSpan - 1;
                continue;
              }
            }

            const measureSpan = instrumentalMeasureBlockLineCount(lines, i);
            if (measureSpan > 0) {
              const blockLines = lines.slice(i, i + measureSpan);
              nodes.push(
                <div key={`measure-scroll-${line.lineId}`} className={scrollBlockClass}>
                  {blockLines.map((bl) => {
                    const tabFlags = guitarTabLineFlags(section.sectionType, bl.text);
                    return (
                      <LineComponent
                        key={bl.lineId}
                        line={bl}
                        songId={songId}
                        song={song}
                        setSong={setSong}
                        enqueue={enqueue}
                        onUpdate={onUpdate}
                        isReadOnly={isReadOnly}
                        preferredInstrument={preferredInstrument}
                        songKey={songKey}
                        onSongKeyChange={onSongKeyChange}
                        chordExplorerTour={chordExplorerTour}
                        setPendingVoicingSelection={setPendingVoicingSelection}
                        setChordBuilderInsertContext={setChordBuilderInsertContext}
                        focusedLineId={focusedLineId}
                        onEnterFromLine={handleEnterFromLine}
                        editingLineId={editingLineId}
                        onStartEditing={setEditingLineId}
                        registerLineInputRef={registerLineInputRef}
                        runWithPluginGate={runWithPluginGate}
                        tabStaffReadOnly={tabFlags.tabStaffReadOnly}
                        tabStaffChordRow={tabFlags.tabStaffChordRow}
                        suppressHorizontalScroll
                        onOpenGuitarTabEditor={
                          isTabStaffSectionType(section.sectionType) && !isReadOnly
                            ? () => openGuitarTabEditorForLine(bl.lineId)
                            : undefined
                        }
                        instrumentalMeasureRowLine
                        onOpenMeasureRowEditor={
                          !isReadOnly ? () => openMeasureRowEditorForLine(bl.lineId) : undefined
                        }
                      />
                    );
                  })}
                </div>
              );
              i += measureSpan - 1;
              continue;
            }

            const tabFlags = guitarTabLineFlags(section.sectionType, line.text);
            nodes.push(
              <LineComponent
                key={line.lineId}
                line={line}
                songId={songId}
                song={song}
                setSong={setSong}
                enqueue={enqueue}
                onUpdate={onUpdate}
                isReadOnly={isReadOnly}
                preferredInstrument={preferredInstrument}
                songKey={songKey}
                onSongKeyChange={onSongKeyChange}
                chordExplorerTour={chordExplorerTour}
                setPendingVoicingSelection={setPendingVoicingSelection}
                setChordBuilderInsertContext={setChordBuilderInsertContext}
                focusedLineId={focusedLineId}
                onEnterFromLine={handleEnterFromLine}
                editingLineId={editingLineId}
                onStartEditing={setEditingLineId}
                registerLineInputRef={registerLineInputRef}
                runWithPluginGate={runWithPluginGate}
                tabStaffReadOnly={tabFlags.tabStaffReadOnly}
                tabStaffChordRow={tabFlags.tabStaffChordRow}
                onOpenGuitarTabEditor={
                  isTabStaffSectionType(section.sectionType) && !isReadOnly
                    ? () => openGuitarTabEditorForLine(line.lineId)
                    : undefined
                }
              />
            );
          }
          return nodes;
        })()}
      </div>

      {!isReadOnly && (
        !addingLine ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            {!isTabStaffSectionType(section.sectionType) && (
              <button
                onClick={() => setAddingLine(true)}
                className="text-sm text-accent hover:text-accent-hover"
              >
                + Add line
              </button>
            )}
            {isTabStaffSectionType(section.sectionType) && (
              <button
                type="button"
                onClick={() => {
                  setGuitarTabInitialStaff(null);
                  setGuitarTabReplaceLineIds(null);
                  setGuitarTabBarModalOpen(true);
                }}
                className="text-sm text-accent hover:text-accent-hover"
              >
                + Add Tab
              </button>
            )}
            {section.sectionType !== 'GUITAR_TAB' && (
              <button
                type="button"
                onClick={() => {
                  setMeasureRowReplaceLineIds(null);
                  setMeasureRowModalOpen(true);
                }}
                className="text-sm text-accent hover:text-accent-hover"
              >
                + Add measure row
              </button>
            )}
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <input
              ref={newLineInputRef}
              type="text"
              value={newLineText}
              onChange={(e) => setNewLineText(e.target.value)}
              onPaste={(e) => {
                e.preventDefault();
                setPendingPasteText(e.clipboardData?.getData('text') ?? '');
                setPasteWarningOpen(true);
              }}
              placeholder="Enter lyric line..."
              className="w-full px-3 py-2 border border-border rounded-md text-foreground placeholder:text-muted"
              onKeyDown={(e) => {
                if (e.key === 'Escape' && pasteWarningOpen) {
                  e.preventDefault();
                  setPasteWarningOpen(false);
                  setPendingPasteText('');
                  return;
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setNewLineText('');
                  setAddingLine(false);
                  newLineInputRef.current?.blur();
                  return;
                }
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (newLineText.trim()) handleAddLineAndContinue();
                }
              }}
            />
            {pasteWarningOpen && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="paste-warning-title">
                <div className="absolute inset-0 bg-black/50" onClick={() => { setPasteWarningOpen(false); setPendingPasteText(''); }} aria-hidden />
                <div className="relative bg-surface rounded-xl shadow-xl border border-border p-6 w-full mx-4 max-w-md">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setPasteWarningOpen(false); setPendingPasteText(''); }}
                    className="absolute right-4 top-4 p-1 rounded text-muted hover:text-foreground hover:bg-border/50"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                  <h2 id="paste-warning-title" className="text-lg font-semibold text-foreground mb-2 pr-8">
                    Copy &amp; Paste detected
                  </h2>
                  <p className="text-sm text-muted mb-4">
                    Copy &amp; Paste has been detected. This action has been prevented to ensure authenticity. Click Force to proceed anyway or otherwise cancel or close the dialog.
                  </p>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { setPasteWarningOpen(false); setPendingPasteText(''); }}
                      className="px-4 py-2 text-foreground bg-surface border border-border rounded-lg hover:bg-border text-sm font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setNewLineText((prev) => prev + pendingPasteText);
                        nextAddLineSourceRef.current = 'paste';
                        setPasteWarningOpen(false);
                        setPendingPasteText('');
                      }}
                      className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover"
                    >
                      Force
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div className="flex space-x-2">
              <button
                onClick={handleAddLine}
                disabled={!newLineText.trim()}
                className="px-3 py-1 bg-accent text-white text-sm rounded-md hover:bg-accent-hover disabled:opacity-50 disabled:bg-accent"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setAddingLine(false);
                  setNewLineText('');
                }}
                className="px-3 py-1 bg-border text-foreground text-sm rounded-md hover:opacity-90"
              >
                Cancel
              </button>
            </div>
          </div>
        )
      )}

      <GuitarTabBarModal
        open={guitarTabBarModalOpen}
        onOpenChange={(open) => {
          setGuitarTabBarModalOpen(open);
          if (!open) {
            setGuitarTabInitialStaff(null);
            setGuitarTabReplaceLineIds(null);
          }
        }}
        initialStaffLines={guitarTabInitialStaff}
        replaceLineIds={guitarTabReplaceLineIds}
        onInsert={handleInsertGuitarTabLines}
        onArchiveTabBlock={handleArchiveGuitarTabBlock}
      />

      {measureRowModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="measure-row-title"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              setMeasureRowReplaceLineIds(null);
              setMeasureRowModalOpen(false);
            }}
            aria-hidden
          />
          <div className="relative bg-surface border border-border rounded-xl shadow-xl max-w-2xl w-full p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <h2 id="measure-row-title" className="text-lg font-semibold text-foreground">
                {measureRowReplaceLineIds ? 'Edit measure row' : 'Add measure row'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setMeasureRowReplaceLineIds(null);
                  setMeasureRowModalOpen(false);
                }}
                className="p-1 rounded text-muted hover:text-foreground"
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="space-y-4 mb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="measure-row-bars" className="text-xs font-medium uppercase tracking-wide text-muted">
                    Bars
                  </label>
                  <select
                    id="measure-row-bars"
                    value={measureRowBars}
                    onChange={(e) => setMeasureRowBars(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-border rounded-md text-foreground bg-background"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="measure-row-beats" className="text-xs font-medium uppercase tracking-wide text-muted">
                    Beats
                  </label>
                  <select
                    id="measure-row-beats"
                    value={measureRowBeats}
                    onChange={(e) => setMeasureRowBeats(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-border rounded-md text-foreground bg-background"
                  >
                    {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <span className="block text-xs font-medium uppercase tracking-wide text-muted">Subdivision</span>
                <div className="flex rounded-lg border border-border bg-background p-0.5 gap-0.5">
                  {(
                    [
                      'beat',
                      'ampersand',
                      'sixteenth',
                      'triplet',
                    ] as const satisfies readonly MeasureSubdivision[]
                  ).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setMeasureRowSubdivision(key)}
                      className={`flex-1 min-w-0 rounded-md px-2 py-2 text-sm font-medium transition-colors touch-manipulation ${
                        measureRowSubdivision === key
                          ? 'bg-accent text-white'
                          : 'text-muted hover:text-foreground hover:bg-border/40'
                      }`}
                    >
                      {MEASURE_SUBDIVISION_LABELS[key]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted mb-1">Preview</p>
            <pre
              className="mb-4 p-3 rounded-lg border border-border bg-background text-foreground text-xs font-mono whitespace-pre-wrap break-all overflow-x-auto max-h-56 overflow-y-auto"
              aria-live="polite"
            >
              {measureRowPreview}
            </pre>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setMeasureRowReplaceLineIds(null);
                  setMeasureRowModalOpen(false);
                }}
                className="px-4 py-2 border border-border rounded-md text-foreground hover:bg-border/50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleInsertMeasureRow}
                className="px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-hover"
              >
                {measureRowReplaceLineIds
                  ? measureRowPreview.includes('\n')
                    ? 'Save rows'
                    : 'Save line'
                  : measureRowPreview.includes('\n')
                    ? 'Insert rows'
                    : 'Insert line'}
              </button>
            </div>
          </div>
        </div>
      )}

      {copyChordsModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="copy-chords-title"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !copyChordsLoading && setCopyChordsModalOpen(false)}
            aria-hidden
          />
          <div className="relative bg-surface border border-border rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <h2 id="copy-chords-title" className="text-lg font-semibold text-foreground">
                Copy chords to another section
              </h2>
              <button
                type="button"
                onClick={() => !copyChordsLoading && setCopyChordsModalOpen(false)}
                className="p-1 rounded text-muted hover:text-foreground"
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>
            <p className="text-sm text-muted mb-3">
              Chords from this section will be copied to the same line and word positions. You can drag them to adjust after.
            </p>
            <div className="space-y-1.5 mb-4 max-h-48 overflow-y-auto">
              {otherSections.length === 0 ? (
                <p className="text-sm text-muted">No other sections.</p>
              ) : (
                otherSections.map((s) => {
                  const label = getSectionDisplayLabel(s);
                  const hasLines = (s.lines?.length ?? 0) > 0;
                  const selected = copyChordsTargetSectionId === s.sectionId;
                  return (
                    <button
                      key={s.sectionId}
                      type="button"
                      onClick={() => setCopyChordsTargetSectionId(s.sectionId)}
                      className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                        selected
                          ? 'border-accent bg-accent/10 text-foreground'
                          : 'border-border hover:bg-border/50 text-foreground'
                      } ${!hasLines ? 'opacity-60' : ''}`}
                    >
                      <span className="font-medium">{label}</span>
                      {!hasLines && (
                        <span className="block text-xs text-muted mt-0.5">No lines yet</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
            {targetSection && targetHasNoLines && (
              <p className="text-sm text-muted mb-3">
                Target section has no lines. Add lines there first.
              </p>
            )}
            {copyChordsError && (
              <p className="text-sm text-destructive mb-3">{copyChordsError}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !copyChordsLoading && setCopyChordsModalOpen(false)}
                className="px-4 py-2 border border-border rounded-md text-foreground hover:bg-border/50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCopyChords}
                disabled={
                  !copyChordsTargetSectionId || targetHasNoLines || copyChordsLoading
                }
                className="px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-hover disabled:opacity-50"
              >
                {copyChordsLoading ? 'Copying…' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Renders line.text with gaps between \\S+ tokens taken from the string (preserves spaces / alignment). */
function renderLyricTokensPreservingWhitespace(
  line: Line,
  dropHighlight: { tokenId: string; charOffset: number } | null,
  isReadOnly: boolean,
  disableCharClick: boolean,
  onTokenCharClick: (token: Token, charOffsetInToken: number, e: React.MouseEvent) => void
): React.ReactNode[] {
  const text = line.text ?? '';
  const sorted = [...line.tokens].sort((a, b) => a.startOffset - b.startOffset);
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  const len = text.length;

  sorted.forEach((token, idx) => {
    const start = Math.min(Math.max(0, token.startOffset), len);
    const end = Math.min(Math.max(start, token.endOffset), len);
    if (start > cursor) {
      nodes.push(
        <span key={`${line.lineId}-gap-${idx}-${cursor}`} className="whitespace-pre">
          {text.slice(cursor, start)}
        </span>
      );
    }
    nodes.push(
      <span key={token.tokenId}>
        {token.text.split('').map((char, charOffset) => (
          <span
            key={`${token.tokenId}-${charOffset}`}
            data-char-index={start + charOffset}
            onClick={
              disableCharClick || isReadOnly
                ? undefined
                : (e) => {
                    e.stopPropagation();
                    onTokenCharClick(token, charOffset, e);
                  }
            }
            className={`rounded-sm ${
              !disableCharClick && !isReadOnly
                ? 'hover:underline hover:decoration-yellow-400 hover:decoration-2 cursor-pointer'
                : ''
            } ${
              dropHighlight?.tokenId === token.tokenId && dropHighlight?.charOffset === charOffset
                ? 'bg-yellow-200 dark:bg-accent-dim/30 underline decoration-accent decoration-2'
                : ''
            }`}
            title={disableCharClick || isReadOnly ? '' : 'Click for chord options at this character'}
          >
            {char}
          </span>
        ))}
      </span>
    );
    cursor = end;
  });

  if (cursor < len) {
    nodes.push(
      <span key={`${line.lineId}-tail`} className="whitespace-pre">
        {text.slice(cursor)}
      </span>
    );
  }

  return nodes;
}

// Line Component with Chord Support
function LineComponent({
  line,
  songId,
  song,
  setSong,
  enqueue,
  onUpdate,
  isReadOnly,
  preferredInstrument,
  songKey,
  onSongKeyChange,
  chordExplorerTour,
  setPendingVoicingSelection,
  setChordBuilderInsertContext,
  focusedLineId,
  onEnterFromLine,
  editingLineId,
  onStartEditing,
  registerLineInputRef,
  runWithPluginGate,
  guitarTabChordRail,
  tabStaffReadOnly = false,
  tabStaffChordRow = false,
  onOpenGuitarTabEditor,
  /** Parent provides `overflow-x-auto`; avoid nested per-row horizontal scroll (tab / measure blocks). */
  suppressHorizontalScroll = false,
  instrumentalMeasureRowLine = false,
  onOpenMeasureRowEditor,
}: {
  line: Line;
  songId: string;
  song: SongDetail | null;
  setSong: React.Dispatch<React.SetStateAction<SongDetail | null>>;
  enqueue: (cmd: import('@/lib/batch-types').BatchCommand) => void;
  onUpdate: () => void;
  isReadOnly: boolean;
  preferredInstrument: Instrument;
  songKey: string;
  onSongKeyChange: (newKey: string) => void;
  chordExplorerTour: ChordExplorerTourProps;
  setPendingVoicingSelection: (value: { chordId: string; symbol: string; voicingId?: string | null } | null) => void;
  setChordBuilderInsertContext: (value: {
    lineId: string;
    tokenId: string;
    token: Token;
    charOffsetInToken: number;
  } | null) => void;
  focusedLineId?: string | null;
  onEnterFromLine?: (lineId: string) => void;
  editingLineId?: string | null;
  onStartEditing?: (lineId: string) => void;
  registerLineInputRef?: (lineId: string, ref: HTMLInputElement | null) => void;
  runWithPluginGate?: (pluginId: string, proceed: () => void) => void;
  /** Legacy: middle-dot chord guide line above first staff string. */
  guitarTabChordRail?: boolean;
  /** ASCII tab staff (or legacy dot row): no inline lyric-style editing. */
  tabStaffReadOnly?: boolean;
  /** This line accepts chord placement (high e string, or legacy dot row). */
  tabStaffChordRow?: boolean;
  /** Open tab bar modal (non–chord-row staff lines only). */
  onOpenGuitarTabEditor?: () => void;
  /** Parent provides `overflow-x-auto`; avoid nested per-row horizontal scroll (tab / measure blocks). */
  suppressHorizontalScroll?: boolean;
  /** Instrumental ASCII measure row: context menu opens measure editor instead of lyric chord tools. */
  instrumentalMeasureRowLine?: boolean;
  onOpenMeasureRowEditor?: () => void;
}) {
  const [localText, setLocalText] = useState(line.text);
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  /** Token-relative offset for Chord Explorer insert (clicked character). */
  const [chordInsertCharOffset, setChordInsertCharOffset] = useState(0);
  const [showChordSelector, setShowChordSelector] = useState(false);
  const [editingChord, setEditingChord] = useState<Chord | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draggingChordId, setDraggingChordId] = useState<string | null>(null);
  /** While dragging, the token + char offset under the cursor (for highlight and drop). */
  const [dropHighlight, setDropHighlight] = useState<{ tokenId: string; charOffset: number } | null>(null);
  const lineInputRef = useRef<HTMLInputElement>(null);
  /** When true, focus line input after next render (e.g. when entering edit mode via focusedLineId). */
  const shouldFocusLineInputRef = useRef(false);
  const lyricLineRef = useRef<HTMLDivElement>(null);
  /** Bounds of the actual rendered text (tokens) so pointer → character stays in sync. */
  const lyricTextRef = useRef<HTMLSpanElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null);
  const touchDragChordIdRef = useRef<string | null>(null);
  const dropHighlightRef = useRef<{ tokenId: string; charOffset: number } | null>(null);
  const touchDragJustEndedRef = useRef(false);
  const magnifierRef = useRef<ChordDragMagnifierHandle>(null);
  const touchDragChordSymbolRef = useRef<string | null>(null);
  /** Set to 'paste' when user pastes into line input; passed to editLine and reset after. */
  const nextEditSourceRef = useRef<'typed' | 'paste'>('typed');
  /** When true, next input blur must not persist (Escape cancelled edit). */
  const skipLineBlurPersistRef = useRef(false);
  const [pasteWarningOpen, setPasteWarningOpen] = useState(false);
  const [pendingPasteText, setPendingPasteText] = useState('');
  const [pendingPasteSelection, setPendingPasteSelection] = useState({ start: 0, end: 0 });
  /** Context menu when user clicks a word: Chord Explorer, Chord Builder, Edit line, Archive line. */
  const [tokenMenu, setTokenMenu] = useState<{
    token: Token;
    charOffsetInToken: number;
    clientX: number;
    clientY: number;
  } | null>(null);
  /** Context menu when user clicks an existing chord: Chord Explorer, Chord Builder, Archive. */
  const [chordMenu, setChordMenu] = useState<{ chord: Chord; clientX: number; clientY: number } | null>(null);

  // Register line input ref with parent for mobile-safe focus
  const lineInputRefCallback = useCallback((node: HTMLInputElement | null) => {
    lineInputRef.current = node;
    registerLineInputRef?.(line.lineId, node);
  }, [line.lineId, registerLineInputRef]);

  // When parent requests focus on this line, enter editing mode and focus once input is rendered
  useEffect(() => {
    if (focusedLineId === line.lineId && !tabStaffReadOnly) {
      shouldFocusLineInputRef.current = true;
      setIsEditing(true);
      onStartEditing?.(line.lineId);
    }
  }, [focusedLineId, line.lineId, onStartEditing, tabStaffReadOnly]);

  useEffect(() => {
    if (tabStaffReadOnly && isEditing) {
      skipLineBlurPersistRef.current = true;
      setIsEditing(false);
      setLocalText(line.text);
    }
  }, [tabStaffReadOnly, isEditing, line.text]);

  // Focus line input when we've just entered edit mode (so keyboard appears / focus is correct)
  useEffect(() => {
    if (!isEditing || !shouldFocusLineInputRef.current) return;
    shouldFocusLineInputRef.current = false;
    lineInputRef.current?.focus();
  }, [isEditing]);

  useEffect(() => {
    if (isEditing) skipLineBlurPersistRef.current = false;
  }, [isEditing]);

  /** When user clicks another line: persist this line and exit edit mode. */
  useEffect(() => {
    if (isEditing && editingLineId != null && editingLineId !== line.lineId) {
      persistLine();
      setIsEditing(false);
    }
  }, [editingLineId, isEditing, line.lineId]);

  useEffect(() => {
    if (!isEditing) setLocalText(line.text);
  }, [line.text, isEditing]);

  const handleTextChange = (newText: string) => {
    if (isReadOnly) return;
    setLocalText(newText);
    setIsEditing(true);
    onStartEditing?.(line.lineId);
  };

  const persistLine = () => {
    if (isReadOnly) return;
    const source = nextEditSourceRef.current;
    nextEditSourceRef.current = 'typed';
    setSong((s) => (s ? updaters.applyEditLine(s, line.lineId, localText) : s));
    enqueue({ type: 'EditLine', payload: { lineId: line.lineId, text: localText, source } });
    setIsEditing(false);
  };

  const handleSaveLine = () => {
    persistLine();
  };

  const handleCancelEdit = () => {
    const isEmpty = (line.text?.trim() ?? '') === '' && (!line.tokens || line.tokens.length === 0);
    if (isEmpty && !tabStaffReadOnly) {
      handleDeleteLine();
    } else {
      setLocalText(line.text);
      setIsEditing(false);
    }
  };

  const handleDeleteLine = () => {
    if (isReadOnly || !song || tabStaffReadOnly) return;
    setSong((s) => (s ? updaters.applyArchiveLine(s, line.lineId) : s));
    enqueue({ type: 'ArchiveLine', payload: { lineId: line.lineId } });
    setIsEditing(false);
  };

  /** On Enter: persist current line (line edited event), then focus next line or create new one.
   *  On Backspace when the line is empty: delete the line (same as trash control).
   *  On Escape: close paste warning, or cancel edit (revert draft; remove line if still empty). */
  const handleLineKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isReadOnly) return;
    if (e.key === 'Escape' && pasteWarningOpen) {
      e.preventDefault();
      setPasteWarningOpen(false);
      setPendingPasteText('');
      setPendingPasteSelection({ start: 0, end: 0 });
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      skipLineBlurPersistRef.current = true;
      handleCancelEdit();
      e.currentTarget.blur();
      return;
    }
    if (e.key === 'Backspace') {
      const input = e.currentTarget;
      const start = input.selectionStart ?? 0;
      const end = input.selectionEnd ?? 0;
      const isEmpty = localText.length === 0;
      const noSelection = start === 0 && end === 0;
      if (isEmpty && noSelection) {
        e.preventDefault();
        if (!tabStaffReadOnly) handleDeleteLine();
        return;
      }
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const source = nextEditSourceRef.current;
    nextEditSourceRef.current = 'typed';
    setSong((s) => (s ? updaters.applyEditLine(s, line.lineId, localText) : s));
    enqueue({ type: 'EditLine', payload: { lineId: line.lineId, text: localText, source } });
    setIsEditing(false);
    onEnterFromLine?.(line.lineId);
  };

  // Get previous chord for context (chord before the selected token)
  // Also considers chords from previous lines in the same section
  const getPreviousChord = (song: SongDetail, line: Line, selectedToken: Token | null): string | null => {
    if (!selectedToken || !song) return null;
    
    // First, check chords on the same line before this token
    if (line.chords && line.chords.length > 0) {
      const tokenStart = selectedToken.startOffset;
      const previousChords = line.chords
        .filter((chord) => {
          const chordPos = getChordPosition(chord);
          return chordPos < tokenStart;
        })
        .sort((a, b) => getChordPosition(b) - getChordPosition(a)); // Most recent first
      
      if (previousChords.length > 0) {
        return previousChords[0].chordSymbol;
      }
    }
    
    // If no previous chord on this line, check previous lines in the section
    const section = song.sections.find(s => 
      s.lines.some(l => l.lineId === line.lineId)
    );
    
    if (section) {
      // Find all chords from previous lines, most recent first
      const allPreviousChords: Array<{ chord: Chord; lineIndex: number; position: number }> = [];
      
      section.lines.forEach((l, lineIdx) => {
        if (l.lineId === line.lineId) return; // Skip current line
        
        // Only consider lines before the current one
        if (l.orderIndex < line.orderIndex && l.chords) {
          l.chords.forEach(chord => {
            allPreviousChords.push({
              chord,
              lineIndex: lineIdx,
              position: getChordPosition(chord),
            });
          });
        }
      });
      
      // Sort by line order (descending) then position (descending)
      allPreviousChords.sort((a, b) => {
        if (a.lineIndex !== b.lineIndex) {
          return b.lineIndex - a.lineIndex; // More recent lines first
        }
        return b.position - a.position; // Later position in line first
      });
      
      if (allPreviousChords.length > 0) {
        return allPreviousChords[0].chord.chordSymbol;
      }
    }
    
    return null;
  };
  
  // Get phrase context (all chords before the selected token)
  const getPhraseContext = (song: SongDetail, line: Line, selectedToken: Token | null): string[] => {
    if (!selectedToken || !song) return [];
    
    const phrase: string[] = [];
    
    // Find the section
    const section = song.sections.find(s => 
      s.lines.some(l => l.lineId === line.lineId)
    );
    
    if (section) {
      // Collect all chords from all previous lines
      section.lines.forEach((l) => {
        if (l.orderIndex > line.orderIndex) return; // Only lines before or at current
        if (l.orderIndex === line.orderIndex && l.lineId === line.lineId) {
          // Current line - only chords before the selected token
          if (l.chords && l.chords.length > 0) {
            const tokenStart = selectedToken.startOffset;
            l.chords
              .filter(chord => getChordPosition(chord) < tokenStart)
              .sort((a, b) => getChordPosition(a) - getChordPosition(b))
              .forEach(chord => phrase.push(chord.chordSymbol));
          }
        } else {
          // Previous lines - all chords
          if (l.chords && l.chords.length > 0) {
            l.chords
              .sort((a, b) => getChordPosition(a) - getChordPosition(b))
              .forEach(chord => phrase.push(chord.chordSymbol));
          }
        }
      });
    }
    
    return phrase;
  };

  const handleChordInsertionSuccess = (chordId: string, symbol: string) => {
    setShowChordSelector(false);
    setSelectedToken(null);
    setChordInsertCharOffset(0);
    setPendingVoicingSelection({ chordId, symbol });
    // Do not call onUpdate() here: chord was added optimistically; loadSong() would overwrite with stale server state before batch flushes.
  };

  const handleChordInsertionError = (error: string) => {
    console.error('Failed to insert chord', error);
    alert(`Failed to insert chord: ${error}`); // Temporary - could be replaced with toast
  };

  const handleEditChord = (chordId: string, symbol: string) => {
    if (isReadOnly || !song) return;
    setSong((s) => (s ? updaters.applyEditChord(s, chordId, symbol) : s));
    enqueue({ type: 'EditChord', payload: { chordId, symbol } });
    setEditingChord(null);
  };

  /** When user updates chord from Chord Explorer: if symbol changed, clear voicing and open voicing selection. */
  const handleEditChordFromExplorer = (chordId: string, symbol: string) => {
    if (isReadOnly || !song) return;
    const symbolChanged = editingChord && symbol !== editingChord.chordSymbol;
    setSong((s) => (s ? updaters.applyEditChord(s, chordId, symbol) : s));
    enqueue({ type: 'EditChord', payload: { chordId, symbol } });
    setEditingChord(null);
    if (symbolChanged) {
      setPendingVoicingSelection({ chordId, symbol });
    }
  };

  const handleChordEditSuccess = (chordId: string, symbol: string) => {
    setEditingChord(null);
    setShowChordSelector(false);
    onUpdate();
  };

  const handleChordEditError = (error: string) => {
    console.error('Failed to edit chord', error);
  };

  const handleRemoveChord = (chordId: string) => {
    if (isReadOnly || !song) return;
    setSong((s) => (s ? updaters.applyRemoveChord(s, chordId) : s));
    enqueue({ type: 'RemoveChord', payload: { chordId } });
    setEditingChord(null);
  };

  /** Move chord to a token at the given character offset (e.g. from drag-and-drop). */
  const handleMoveChord = (chordId: string, tokenId: string, charOffset: number) => {
    if (isReadOnly || !song || !line.lineId) return;
    setSong((s) => (s ? updaters.applyMoveChord(s, chordId, tokenId, charOffset) : s));
    const token = line.tokens?.find((t) => t.tokenId === tokenId);
    const rel = Number.isFinite(charOffset) ? charOffset : 0;
    const absoluteCharOffset = Math.max(
      0,
      Math.floor(token != null ? token.startOffset + rel : rel)
    );
    enqueue({
      type: 'MoveChord',
      payload: { chordId, lineId: line.lineId, absoluteCharOffset },
    });
    setDraggingChordId(null);
    setDropHighlight(null);
  };

  /** Map a character index in line.text to token + offset (for drag position → highlight and drop). */
  const getTokenAndOffsetAtCharIndex = (
    line: Line,
    charIndex: number
  ): { tokenId: string; charOffset: number } | null => {
    if (!line.tokens?.length) return null;
    const clamped = Math.max(0, Math.min(charIndex, line.text.length));
    for (const token of line.tokens) {
      if (clamped >= token.startOffset && clamped < token.endOffset) {
        return { tokenId: token.tokenId, charOffset: clamped - token.startOffset };
      }
    }
    // In a space: snap to start of next word, or end of last word
    const next = line.tokens.find((t) => t.startOffset > clamped);
    if (next) return { tokenId: next.tokenId, charOffset: 0 };
    const last = line.tokens[line.tokens.length - 1];
    return { tokenId: last.tokenId, charOffset: last.text.length };
  };

  /** Bounds of the rendered lyric text (not the full container) so highlight stays in sync with letters. */
  const getLyricTextRect = (): { left: number; width: number; top: number; bottom: number } | null => {
    const el = lyricTextRef.current ?? lyricLineRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { left: rect.left, width: rect.width, top: rect.top, bottom: rect.bottom };
  };

  /** Compute char index in line from pointer position; uses per-character hit testing for accuracy. */
  const getCharIndexFromPointer = (clientX: number, _clientY: number): number => {
    const el = lyricTextRef.current ?? lyricLineRef.current;
    if (!el) return 0;
    const charSpans = el.querySelectorAll<HTMLElement>('span[data-char-index]');
    if (charSpans.length > 0) {
      let closestIdx = 0;
      let closestDist = Infinity;
      charSpans.forEach((span) => {
        const r = span.getBoundingClientRect();
        const center = r.left + r.width / 2;
        const dist = Math.abs(clientX - center);
        if (dist < closestDist) {
          closestDist = dist;
          closestIdx = parseInt(span.dataset.charIndex ?? '0', 10);
        }
      });
      return closestIdx;
    }
    const rect = getLyricTextRect();
    if (!rect || rect.width <= 0) return 0;
    const x = clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    return Math.round(ratio * line.text.length);
  };

  const getCharIndexFromDrag = (e: React.DragEvent): number =>
    getCharIndexFromPointer(e.clientX, e.clientY);

  /** Start touch-drag mode (document listeners) after long press; shows magnifier. */
  const startTouchDrag = (chordId: string) => {
    touchDragChordIdRef.current = chordId;
    setDraggingChordId(chordId);

    const chord = line.chords?.find((c) => c.chordId === chordId);
    touchDragChordSymbolRef.current = chord?.chordSymbol ?? null;

    // Pre-populate the drop highlight with the chord's current position so
    // releasing immediately doesn't lose the chord (avoids null ref).
    if (chord) {
      const currentTarget = chord.tokenId
        ? { tokenId: chord.tokenId, charOffset: chord.charOffset }
        : getTokenAndOffsetAtCharIndex(line, chord.charOffset);
      dropHighlightRef.current = currentTarget;
    } else {
      dropHighlightRef.current = null;
    }

    const touchMoveHandler = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      if (!t) return;
      const rect = getLyricTextRect();
      if (!rect) return;

      // Clamp pointer into the lyric text bounds so the highlight and
      // magnifier always track the nearest valid character, even when the
      // finger wanders outside the line. This prevents the magnifier from
      // hiding mid-drag and keeps the drop position in sync.
      const clampedX = Math.max(rect.left, Math.min(t.clientX, rect.left + rect.width));
      const charIndex = getCharIndexFromPointer(clampedX, t.clientY);
      const target = getTokenAndOffsetAtCharIndex(line, charIndex);
      dropHighlightRef.current = target;
      setDropHighlight(target);

      magnifierRef.current?.updatePosition({
        clientX: clampedX,
        clientY: rect.top + (rect.bottom - rect.top) / 2,
        chordSymbol: touchDragChordSymbolRef.current ?? undefined,
      });
    };

    const touchEndHandler = (e: TouchEvent) => {
      cleanup();
      e.preventDefault();
      magnifierRef.current?.hide();
      const highlight = dropHighlightRef.current;
      if (chordId && highlight) {
        void handleMoveChord(chordId, highlight.tokenId, highlight.charOffset);
      }
      touchDragJustEndedRef.current = true;
      setDraggingChordId(null);
      setDropHighlight(null);
      touchDragChordIdRef.current = null;
      touchDragChordSymbolRef.current = null;
    };

    const touchCancelHandler = () => {
      cleanup();
      magnifierRef.current?.hide();
      touchDragJustEndedRef.current = false;
      setDraggingChordId(null);
      setDropHighlight(null);
      touchDragChordIdRef.current = null;
      touchDragChordSymbolRef.current = null;
    };

    const cleanup = () => {
      document.removeEventListener('touchmove', touchMoveHandler, { capture: true });
      document.removeEventListener('touchend', touchEndHandler, { capture: true });
      document.removeEventListener('touchcancel', touchCancelHandler, { capture: true });
    };

    document.addEventListener('touchmove', touchMoveHandler, { passive: false, capture: true });
    document.addEventListener('touchend', touchEndHandler, { passive: false, capture: true });
    document.addEventListener('touchcancel', touchCancelHandler, { passive: false, capture: true });

    const firstRect = getLyricTextRect();
    if (firstRect) {
      magnifierRef.current?.show({
        clientX: firstRect.left + firstRect.width / 2,
        clientY: firstRect.top + (firstRect.bottom - firstRect.top) / 2,
        chordSymbol: touchDragChordSymbolRef.current ?? undefined,
      });
    }
  };

  // Calculate absolute chord position from token + offset
  const getChordPosition = (chord: Chord): number => {
    if (chord.tokenId && line.tokens) {
      const token = line.tokens.find(t => t.tokenId === chord.tokenId);
      if (token) {
        return token.startOffset + chord.charOffset;
      }
    }
    return chord.charOffset;
  };

  // Build chord line as text for proper alignment with lyrics
  const buildChordLine = (): { text: string; chordPositions: Array<{ chord: Chord; start: number; end: number }> } => {
    if (!line.chords || line.chords.length === 0) {
      return { text: '', chordPositions: [] };
    }
    
    const lineLength = Math.max(line.text.length, 100);
    const chordArray = new Array(lineLength).fill(' ');
    const chordPositions: Array<{ chord: Chord; start: number; end: number }> = [];
    
    // Sort chords by position to handle overlapping correctly
    const sortedChords = [...line.chords].sort((a, b) => getChordPosition(a) - getChordPosition(b));
    
    sortedChords.forEach((chord) => {
      const absolutePosition = getChordPosition(chord);
      const symbol = chord.chordSymbol;
      const start = absolutePosition;
      const end = absolutePosition + symbol.length;
      
      for (let i = 0; i < symbol.length; i++) {
        if (absolutePosition + i < chordArray.length) {
          chordArray[absolutePosition + i] = symbol[i];
        }
      }
      
      chordPositions.push({ chord, start, end });
    });
    
    return { text: chordArray.join('').trimEnd(), chordPositions };
  };

  const { text: chordLineText, chordPositions } = buildChordLine();

  // Render chord line with clickable chord segments and diagram tooltips
  const renderChordLine = () => {
    if (!chordLineText) return null;
    
    const elements: React.ReactNode[] = [];
    let lastEnd = 0;
    
    chordPositions.forEach(({ chord, start, end }, index) => {
      // Add spaces before this chord
      if (start > lastEnd) {
        elements.push(
          <span key={`space-${index}`}>{' '.repeat(start - lastEnd)}</span>
        );
      }
      
      // Add the chord (draggable, clickable with diagram tooltip on hover)
      elements.push(
        <ChordDiagramTooltip
          key={chord.chordId}
          chordSymbol={chord.chordSymbol}
          instrument={preferredInstrument}
          voicingId={chord.voicingId}
          chordId={!isReadOnly ? chord.chordId : undefined}
          onRequestVoicingChange={
            !isReadOnly
              ? (chordId, symbol, voicingId) =>
                  setPendingVoicingSelection({ chordId, symbol, voicingId })
              : undefined
          }
        >
          <span
            draggable={!isReadOnly}
            onDragStart={(e) => {
              if (isReadOnly) return;
              e.dataTransfer.setData('application/json', JSON.stringify({ chordId: chord.chordId, lineId: line.lineId }));
              e.dataTransfer.effectAllowed = 'move';
              setDraggingChordId(chord.chordId);
            }}
            onDragEnd={() => {
              setDraggingChordId(null);
              setDropHighlight(null);
            }}
            onTouchStart={(e) => {
              if (isReadOnly) return;
              e.preventDefault();
              const touch = e.touches[0];
              longPressOriginRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
              longPressTimerRef.current = setTimeout(() => {
                longPressTimerRef.current = null;
                longPressOriginRef.current = null;
                if (navigator.vibrate) navigator.vibrate(30);
                startTouchDrag(chord.chordId);
              }, 400);
            }}
            onTouchMove={(e) => {
              if (!longPressTimerRef.current) return;
              const touch = e.touches[0];
              const origin = longPressOriginRef.current;
              if (touch && origin) {
                const dx = touch.clientX - origin.x;
                const dy = touch.clientY - origin.y;
                if (dx * dx + dy * dy > 15 * 15) {
                  clearTimeout(longPressTimerRef.current);
                  longPressTimerRef.current = null;
                  longPressOriginRef.current = null;
                }
              }
            }}
            onTouchEnd={() => {
              if (longPressTimerRef.current) {
                clearTimeout(longPressTimerRef.current);
                longPressTimerRef.current = null;
              }
              longPressOriginRef.current = null;
            }}
            onTouchCancel={() => {
              if (longPressTimerRef.current) {
                clearTimeout(longPressTimerRef.current);
                longPressTimerRef.current = null;
              }
              longPressOriginRef.current = null;
            }}
            className={`transition-colors select-none ${
              chord.orphaned
                ? 'text-red-400 line-through'
                : 'text-accent'
            } ${!isReadOnly ? 'cursor-grab active:cursor-grabbing hover:text-accent-hover' : ''} ${
              draggingChordId === chord.chordId ? 'opacity-60 scale-110' : ''
            }`}
            onClick={(e) => {
              if (isReadOnly) return;
              if (touchDragJustEndedRef.current) {
                touchDragJustEndedRef.current = false;
                return;
              }
              setChordMenu({ chord, clientX: e.clientX, clientY: e.clientY });
            }}
            title={chord.orphaned ? 'Orphaned – drag to a word to reattach' : isReadOnly ? '' : 'Click for options'}
          >
            {chord.chordSymbol}
          </span>
        </ChordDiagramTooltip>
      );
      
      lastEnd = end;
    });
    
    return elements;
  };

  const chordRailTitle =
    guitarTabChordRail && !isReadOnly
      ? 'Click a character on this row to place chords above the tab. Edit tab with + Add Tab.'
      : '';

  return (
    <div
      className={`group relative ${
        suppressHorizontalScroll
          ? 'overflow-x-visible w-max max-w-none min-w-0'
          : 'overflow-x-auto'
      } ${guitarTabChordRail ? 'font-mono' : ''}`}
      title={chordRailTitle || undefined}
    >
      {/* Chord layer - rendered as monospace text line for proper alignment */}
      {line.chords && line.chords.length > 0 && (
        <div
          className={`font-mono text-sm whitespace-pre min-h-[1.5rem] ml-[1px] px-2 ${guitarTabChordRail ? 'text-foreground' : ''}`}
        >
          {renderChordLine()}
        </div>
      )}

      {/* Lyric line: edit + chords; tab staff (non–chord-row) is read-only monospace */}
      <div className="flex items-center space-x-2">
        {tabStaffReadOnly && !tabStaffChordRow ? (
          <div
            className={`flex-1 px-2 py-1 border border-transparent rounded font-mono text-sm min-h-[34px] flex items-center whitespace-pre text-foreground select-text ${
              !isReadOnly && onOpenGuitarTabEditor ? 'cursor-pointer hover:bg-muted/50 rounded-md' : ''
            }`}
            role={!isReadOnly && onOpenGuitarTabEditor ? 'button' : undefined}
            tabIndex={!isReadOnly && onOpenGuitarTabEditor ? 0 : undefined}
            onClick={() => {
              if (isReadOnly || !onOpenGuitarTabEditor) return;
              onOpenGuitarTabEditor();
            }}
            onKeyDown={(e) => {
              if (isReadOnly || !onOpenGuitarTabEditor) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenGuitarTabEditor();
              }
            }}
            title={
              isReadOnly
                ? ''
                : onOpenGuitarTabEditor
                  ? 'Click to edit tab in the tab editor'
                  : ''
            }
          >
            {line.text}
          </div>
        ) : !isEditing && line.tokens && line.tokens.length > 0 ? (
          <div
            ref={lyricLineRef}
            role={tabStaffReadOnly ? undefined : 'button'}
            tabIndex={tabStaffReadOnly ? -1 : 0}
            onClick={(e) => {
              if (tabStaffReadOnly || isReadOnly) return;
              if (e.target === e.currentTarget) {
                onStartEditing?.(line.lineId);
                flushSync(() => setIsEditing(true));
                lineInputRef.current?.focus();
              }
            }}
            onKeyDown={(e) => {
              if (tabStaffReadOnly || isReadOnly) return;
              if ((e.key === 'Enter' || e.key === ' ') && !isReadOnly) {
                e.preventDefault();
                onStartEditing?.(line.lineId);
                flushSync(() => setIsEditing(true));
                lineInputRef.current?.focus();
              }
            }}
            onDragOver={(e) => {
              if (isReadOnly || !draggingChordId) return;
              if (tabStaffReadOnly && !tabStaffChordRow) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              const rect = getLyricTextRect();
              if (!rect) return;
              const near = 12;
              const inOrNear =
                e.clientX >= rect.left &&
                e.clientX <= rect.left + rect.width &&
                e.clientY >= rect.top - near &&
                e.clientY <= rect.bottom + near;
              if (!inOrNear) {
                setDropHighlight(null);
                return;
              }
              const charIndex = getCharIndexFromDrag(e);
              const target = getTokenAndOffsetAtCharIndex(line, charIndex);
              setDropHighlight(target);
            }}
            onDragLeave={() => setDropHighlight(null)}
            onDrop={(e) => {
              e.preventDefault();
              if (isReadOnly || !draggingChordId) return;
              if (tabStaffReadOnly && !tabStaffChordRow) return;
              const highlight = dropHighlight;
              setDropHighlight(null);
              try {
                const raw = e.dataTransfer.getData('application/json');
                if (!raw) return;
                const { chordId, lineId: dragLineId } = JSON.parse(raw) as { chordId: string; lineId: string };
                if (dragLineId !== line.lineId) return;
                if (!highlight) return;
                void handleMoveChord(chordId, highlight.tokenId, highlight.charOffset);
              } catch (err) {
                console.error('Drop parse error', err);
              }
            }}
            className={`flex-1 px-2 py-1 border border-transparent rounded font-mono text-sm min-h-[34px] flex items-center whitespace-pre text-foreground ${
              isReadOnly
                ? 'bg-background cursor-not-allowed'
                : tabStaffReadOnly
                  ? 'cursor-default'
                  : 'cursor-text'
            } ${draggingChordId && !isReadOnly ? 'cursor-copy' : ''}`}
            title={
              isReadOnly
                ? ''
                : tabStaffReadOnly
                  ? 'Click a character for chord options; click another string row to open the tab editor'
                  : 'Click empty space to edit line; drag chord here to reposition'
            }
          >
            <span ref={lyricTextRef} className="inline">
              {renderLyricTokensPreservingWhitespace(
                line,
                dropHighlight,
                isReadOnly,
                isReadOnly,
                (token, charOffsetInToken, e) => {
                  if (isReadOnly) return;
                  setTokenMenu({
                    token,
                    charOffsetInToken,
                    clientX: e.clientX,
                    clientY: e.clientY,
                  });
                }
              )}
            </span>
          </div>
        ) : isEditing ? (
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex min-w-0 items-center gap-2">
              <input
                ref={lineInputRefCallback}
                type="text"
                value={localText}
                onChange={(e) => handleTextChange(e.target.value)}
                onPaste={(e) => {
                  e.preventDefault();
                  const input = lineInputRef.current;
                  setPendingPasteText(e.clipboardData?.getData('text') ?? '');
                  setPendingPasteSelection({
                    start: input?.selectionStart ?? localText.length,
                    end: input?.selectionEnd ?? localText.length,
                  });
                  setPasteWarningOpen(true);
                }}
                onKeyDown={handleLineKeyDown}
                onBlur={() => {
                  if (pasteWarningOpen) return;
                  if (skipLineBlurPersistRef.current) {
                    skipLineBlurPersistRef.current = false;
                    setIsEditing(false);
                    return;
                  }
                  if (!isReadOnly && localText !== line.text) {
                    persistLine();
                  } else {
                    setIsEditing(false);
                  }
                }}
                className={`min-w-0 flex-1 px-2 py-1 border-2 border-accent rounded focus:outline-none font-mono text-base md:text-sm text-foreground placeholder:text-muted ${
                  isReadOnly ? 'bg-background cursor-not-allowed text-muted' : ''
                }`}
                placeholder="Enter lyrics..."
                disabled={isReadOnly}
              />
              {!isReadOnly && !tabStaffReadOnly && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleDeleteLine()}
                  className="shrink-0 rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Archive line"
                  title="Archive line"
                >
                  <Trash2 className="size-5" aria-hidden />
                </button>
              )}
            </div>
            {pasteWarningOpen && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="paste-warning-title-edit">
                <div className="absolute inset-0 bg-black/50" onClick={() => { setPasteWarningOpen(false); setPendingPasteText(''); setPendingPasteSelection({ start: 0, end: 0 }); }} aria-hidden />
                <div className="relative bg-surface rounded-xl shadow-xl border border-border p-6 w-full mx-4 max-w-md">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setPasteWarningOpen(false); setPendingPasteText(''); setPendingPasteSelection({ start: 0, end: 0 }); }}
                    className="absolute right-4 top-4 p-1 rounded text-muted hover:text-foreground hover:bg-border/50"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                  <h2 id="paste-warning-title-edit" className="text-lg font-semibold text-foreground mb-2 pr-8">
                    Copy &amp; Paste detected
                  </h2>
                  <p className="text-sm text-muted mb-4">
                    Copy &amp; Paste has been detected. This action has been prevented to ensure authenticity. Click Force to proceed anyway or otherwise cancel or close the dialog.
                  </p>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { setPasteWarningOpen(false); setPendingPasteText(''); setPendingPasteSelection({ start: 0, end: 0 }); }}
                      className="px-4 py-2 text-foreground bg-surface border border-border rounded-lg hover:bg-border text-sm font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        const { start, end } = pendingPasteSelection;
                        setLocalText((prev) => prev.slice(0, start) + pendingPasteText + prev.slice(end));
                        nextEditSourceRef.current = 'paste';
                        setPasteWarningOpen(false);
                        setPendingPasteText('');
                        setPendingPasteSelection({ start: 0, end: 0 });
                      }}
                      className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover"
                    >
                      Force
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Not editing and no tokens yet (e.g. after optimistic save): show plain text, click to edit */
          <div
            role={tabStaffReadOnly ? undefined : 'button'}
            tabIndex={tabStaffReadOnly ? -1 : 0}
            onClick={(e) => {
              if (tabStaffReadOnly || isReadOnly) return;
              if (e.target === e.currentTarget) {
                onStartEditing?.(line.lineId);
                flushSync(() => setIsEditing(true));
                lineInputRef.current?.focus();
              }
            }}
            onKeyDown={(e) => {
              if (tabStaffReadOnly || isReadOnly) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onStartEditing?.(line.lineId);
                flushSync(() => setIsEditing(true));
                lineInputRef.current?.focus();
              }
            }}
            className={`flex-1 px-2 py-1 border border-transparent rounded font-mono text-sm min-h-[34px] flex items-center whitespace-pre text-foreground ${
              isReadOnly || tabStaffReadOnly ? 'cursor-not-allowed' : 'cursor-text'
            }`}
            title={isReadOnly || tabStaffReadOnly ? '' : 'Click to edit'}
          >
            {(localText || line.text) || '\u00A0'}
          </div>
        )}
      </div>

      {/* Context menu (Chord Explorer / Chord Builder / Edit line / Archive line) when clicking a word */}
      {tokenMenu && !isReadOnly && (
        <>
          <div
            className="fixed inset-0 z-[90]"
            aria-hidden
            onClick={() => setTokenMenu(null)}
          />
          <div
            className="fixed z-[91] min-w-[10rem] rounded-lg border border-border bg-surface py-1 shadow-lg"
            style={{
              left: Math.min(tokenMenu.clientX, window.innerWidth - 180),
              top: tokenMenu.clientY + 8,
            }}
            role="menu"
            aria-label={
              instrumentalMeasureRowLine
                ? 'Measure row options'
                : tabStaffReadOnly
                  ? 'Chord options'
                  : 'Word options'
            }
          >
            <>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-accent/10"
                onClick={() => {
                  runWithPluginGate?.('chord_explorer', () => {
                    setSelectedToken(tokenMenu.token);
                    setChordInsertCharOffset(tokenMenu.charOffsetInToken);
                    setShowChordSelector(true);
                    setTokenMenu(null);
                  });
                }}
              >
                <Music2 className="size-4 shrink-0 text-accent" />
                Chord Explorer
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-accent/10"
                onClick={() => {
                  runWithPluginGate?.('chord_voicing_selection', () => {
                    const chordAtToken = line.chords?.find((c) => c.tokenId === tokenMenu.token.tokenId);
                    if (chordAtToken) {
                      setPendingVoicingSelection({
                        chordId: chordAtToken.chordId,
                        symbol: chordAtToken.chordSymbol,
                        voicingId: chordAtToken.voicingId ?? null,
                      });
                    } else {
                      setChordBuilderInsertContext({
                        lineId: line.lineId,
                        tokenId: tokenMenu.token.tokenId,
                        token: tokenMenu.token,
                        charOffsetInToken: tokenMenu.charOffsetInToken,
                      });
                    }
                    setTokenMenu(null);
                  });
                }}
              >
                <Sliders className="size-4 shrink-0 text-accent" />
                Chord Builder
              </button>
              {!tabStaffReadOnly && instrumentalMeasureRowLine && (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-accent/10"
                  onClick={() => {
                    onOpenMeasureRowEditor?.();
                    setTokenMenu(null);
                  }}
                >
                  <Pencil className="size-4 shrink-0 text-muted" />
                  Edit measure
                </button>
              )}
              {!tabStaffReadOnly && !instrumentalMeasureRowLine && (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-accent/10"
                  onClick={() => {
                    onStartEditing?.(line.lineId);
                    setTokenMenu(null);
                    flushSync(() => setIsEditing(true));
                    lineInputRef.current?.focus();
                  }}
                >
                  <Pencil className="size-4 shrink-0 text-muted" />
                  Edit line
                </button>
              )}
              {!tabStaffReadOnly && (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    handleDeleteLine();
                    setTokenMenu(null);
                  }}
                >
                  <Trash2 className="size-4 shrink-0" />
                  Archive line
                </button>
              )}
            </>
          </div>
        </>
      )}

      {/* Chord click: context menu (Chord Explorer / Chord Builder / Archive chord) */}
      {chordMenu && !isReadOnly && (
        <>
          <div
            className="fixed inset-0 z-[90]"
            aria-hidden
            onClick={() => setChordMenu(null)}
          />
          <div
            className="fixed z-[91] min-w-[10rem] rounded-lg border border-border bg-surface py-1 shadow-lg"
            style={{
              left: Math.min(chordMenu.clientX, window.innerWidth - 180),
              top: chordMenu.clientY + 8,
            }}
            role="menu"
            aria-label="Chord options"
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-accent/10"
              onClick={() => {
                runWithPluginGate?.('chord_explorer', () => {
                  setEditingChord(chordMenu.chord);
                  setChordMenu(null);
                });
              }}
            >
              <Music2 className="size-4 shrink-0 text-accent" />
              Chord Explorer
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-accent/10"
              onClick={() => {
                runWithPluginGate?.('chord_voicing_selection', () => {
                  setPendingVoicingSelection({
                    chordId: chordMenu.chord.chordId,
                    symbol: chordMenu.chord.chordSymbol,
                    voicingId: chordMenu.chord.voicingId ?? null,
                  });
                  setChordMenu(null);
                });
              }}
            >
              <Sliders className="size-4 shrink-0 text-accent" />
              Chord Builder
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
              onClick={() => {
                handleRemoveChord(chordMenu.chord.chordId);
                setChordMenu(null);
              }}
            >
              <Trash2 className="size-4 shrink-0" />
              Archive chord
            </button>
          </div>
        </>
      )}

      {/* Chord Explorer modal (imported) - for adding new chords */}
      {showChordSelector && selectedToken && !isReadOnly && song && (
        <ChordExplorerModal
          isOpen={true}
          mode="insert"
          songKey={songKey}
          previousChordSymbol={getPreviousChord(song, line, selectedToken)}
          insertionContext={{
            songId,
            lineId: line.lineId,
            tokenId: selectedToken.tokenId,
            charOffset: chordInsertCharOffset,
          }}
          insertChordOverride={async (symbol, ctx) => {
            const { normalizeChordSymbol } = await import('@/lib/chordService');
            const normalized = normalizeChordSymbol(symbol);
            const chordId = crypto.randomUUID();

            const absoluteCharOffset = selectedToken
              ? selectedToken.startOffset + ctx.charOffset
              : ctx.charOffset;

            setSong((s) =>
              s
                ? updaters.applyAddChord(
                    s,
                    ctx.lineId,
                    chordId,
                    ctx.tokenId,
                    ctx.charOffset,
                    normalized
                  )
                : s
            );
            enqueue({
              type: 'AddChord',
              payload: {
                lineId: ctx.lineId,
                tokenId: ctx.tokenId,
                charOffset: absoluteCharOffset,
                chordSymbol: normalized,
              },
              clientGeneratedId: chordId,
            });
            return { success: true, chordId };
          }}
          onInsertionSuccess={handleChordInsertionSuccess}
          onInsertionError={handleChordInsertionError}
          onClose={() => {
            setShowChordSelector(false);
            setSelectedToken(null);
            setChordInsertCharOffset(0);
          }}
          onSongKeyChange={onSongKeyChange}
          showTutorialOnOpen={chordExplorerTour.showTutorialOnOpen}
          onTutorialComplete={chordExplorerTour.onTutorialComplete}
          onTutorialSkipPermanent={chordExplorerTour.onTutorialSkipPermanent}
        />
      )}

      {/* Chord Explorer modal (imported) - for editing existing chords */}
      {editingChord && !isReadOnly && song && (
        <ChordExplorerModal
          isOpen={true}
          mode="edit"
          songKey={songKey}
          currentChord={editingChord}
          previousChordSymbol={
            editingChord.tokenId
              ? getPreviousChord(song, line, line.tokens?.find((t) => t.tokenId === editingChord.tokenId) ?? null)
              : null
          }
          onEditChord={handleEditChordFromExplorer}
          onRemoveChord={handleRemoveChord}
          onClose={() => setEditingChord(null)}
          onSongKeyChange={onSongKeyChange}
          showTutorialOnOpen={chordExplorerTour.showTutorialOnOpen}
          onTutorialComplete={chordExplorerTour.onTutorialComplete}
          onTutorialSkipPermanent={chordExplorerTour.onTutorialSkipPermanent}
        />
      )}

      {/* Magnifying glass for touch chord drag positioning */}
      {!isReadOnly && (
        <ChordDragMagnifier
          ref={magnifierRef}
          sourceRef={lyricTextRef}
        />
      )}

    </div>
  );
}


export default function SongEditorPage() {
  return (
    <Suspense fallback={null}>
      <SongEditorPageInner />
    </Suspense>
  );
}
