/**
 * api.ts - LOCAL-FIRST replacement for the hosted backend API.
 *
 * Same exported surface as the original server-backed module, implemented over
 * browser localStorage (see ./localDb). Features that genuinely need the hosted
 * backend (recordings, videos, lyrics scans, Track Lab audio, chat, teams,
 * certificates, the guitar chord library) are inert stubs for this slice:
 * reads return empty data and writes throw a clear error.
 */
import type { BatchCommand, BatchCommandRequest, BatchCommandResponse, BatchCommandResultItem } from './batch-types';
import type {
  ChatMessageView,
  ChatUnreadSummary,
  Event,
  LyricsFile,
  LyricsScan,
  MetadataType,
  Note,
  Recording,
  SongDetail,
  SongSummary,
  SongPresence,
  SongVideo,
  SongWriteLock,
  Team,
  TeamMember,
  TeamSong,
  TimelineData,
  TrackLabProject,
  WorkMetadataItem,
} from './types';
import {
  applyAddChord,
  applyAddLine,
  applyAddSection,
  applyArchiveLine,
  applyArchiveSection,
  applyEditChord,
  applyEditLine,
  applyEditSection,
  applyMoveChord,
  applyRemoveChord,
  applyRepositionSection,
  applySetChordVoicing,
  applySetTitle,
  tokenAtAbsoluteCharOffset,
} from './song-state-updaters';
import {
  LOCAL_USER_ID,
  createSongRecord,
  estimateUsedBytes,
  getLocalProfile,
  getMetadataItems,
  getNotes as getLocalNotes,
  getPluginSettings as getLocalPluginSettings,
  getSongDetail,
  getLocalProfile as readProfile,
  getUserVoicings,
  listSongIndex,
  removeSongRecord,
  saveLocalProfile,
  saveMetadataItems,
  saveNotes,
  saveSongDetail,
  saveUserVoicings,
  setPluginSetting as setLocalPluginSetting,
  getTourState as getLocalTourState,
  setTourState as setLocalTourState,
  type LocalNote,
} from './localDb';
import {
  deleteLocalRecordingsForSong,
  getCachedRecordingUrl,
  listLocalRecordings,
  saveLocalRecording,
  setLocalRecordingArchived,
} from './localRecordings';

const NOT_IN_LOCAL = (feature: string) =>
  new Error(`${feature} is not available in this local-only version yet.`);

/* ---------- analytics (no-op locally) ---------- */

export async function trackPageView(_path: string, _durationMs?: number): Promise<void> {}
export async function trackLogin(): Promise<void> {}
export async function trackLogout(): Promise<void> {}

/* ---------- auth (no accounts in the local version) ---------- */

export const authApi = {
  register: async (): Promise<never> => {
    throw NOT_IN_LOCAL('Accounts');
  },
  login: async (): Promise<never> => {
    throw NOT_IN_LOCAL('Accounts');
  },
};

/* ---------- command application ---------- */

function requireSong(songId: string): SongDetail {
  const song = getSongDetail(songId);
  if (!song) throw new Error('Song not found locally.');
  return song;
}

function applyCommand(
  song: SongDetail,
  command: BatchCommand,
  results: BatchCommandResultItem[]
): SongDetail {
  switch (command.type) {
    case 'SetTitle':
      return applySetTitle(song, command.payload.title);
    case 'AddSection': {
      const id = command.clientGeneratedId ?? crypto.randomUUID();
      results.push({ type: 'addSection', id });
      return applyAddSection(song, id, command.payload.sectionType, command.payload.label);
    }
    case 'EditSection':
      return applyEditSection(song, command.payload.sectionId, command.payload.sectionType, command.payload.label);
    case 'RepositionSection':
      return applyRepositionSection(song, command.payload.sectionId, command.payload.newOrderIndex);
    case 'ArchiveSection':
      return applyArchiveSection(song, command.payload.sectionId);
    case 'AddLine': {
      const id = command.clientGeneratedId ?? crypto.randomUUID();
      results.push({ type: 'addLine', id });
      return applyAddLine(song, command.payload.sectionId, id, command.payload.text);
    }
    case 'EditLine':
      return applyEditLine(song, command.payload.lineId, command.payload.text);
    case 'AddTabBlock': {
      let next = song;
      for (const line of command.payload.lines) {
        const id = line.lineId ?? crypto.randomUUID();
        if (line.lineId) {
          next = applyEditLine(next, line.lineId, line.text);
        } else {
          results.push({ type: 'addLine', id });
          next = applyAddLine(next, command.payload.sectionId, id, line.text);
        }
      }
      return next;
    }
    case 'EditTabBlock': {
      let next = song;
      for (const line of command.payload.lines) {
        next = applyEditLine(next, line.lineId, line.text);
      }
      return next;
    }
    case 'ArchiveLine':
      return applyArchiveLine(song, command.payload.lineId);
    case 'AddChord': {
      const id = command.clientGeneratedId ?? crypto.randomUUID();
      results.push({ type: 'addChord', id });
      return applyAddChord(
        song,
        command.payload.lineId,
        id,
        command.payload.tokenId,
        command.payload.charOffset,
        command.payload.chordSymbol
      );
    }
    case 'EditChord':
      return applyEditChord(song, command.payload.chordId, command.payload.symbol);
    case 'RemoveChord':
      return applyRemoveChord(song, command.payload.chordId);
    case 'MoveChord': {
      const line = song.sections
        .flatMap((s) => s.lines ?? [])
        .find((l) => l.lineId === command.payload.lineId);
      const resolved = tokenAtAbsoluteCharOffset(line, command.payload.absoluteCharOffset);
      return applyMoveChord(
        song,
        command.payload.chordId,
        resolved?.tokenId ?? command.payload.lineId,
        resolved?.charOffsetInToken ?? 0
      );
    }
    case 'SetChordVoicing':
      return applySetChordVoicing(song, command.payload.chordId, command.payload.voicingId);
    case 'RecordSongScaffold':
      // Structure provenance is not stored in the local song document; content
      // arrives via the section/line commands that accompany this marker.
      return song;
    default:
      return song;
  }
}

function runBatch(songId: string, commands: BatchCommand[]): BatchCommandResponse {
  const song = requireSong(songId);
  const results: BatchCommandResultItem[] = [];
  let next = song;
  for (const command of commands) {
    next = applyCommand(next, command, results);
  }
  const lastEventSequence = (song.lastEventSequence ?? 0) + commands.length;
  saveSongDetail({ ...next, lastEventSequence });
  return { lastEventSequence, results };
}

/* ---------- simple text/ChordPro import ---------- */

function parseImportedSong(fileName: string, text: string): { title: string; lines: { section: string | null; text: string; chords: { charOffset: number; symbol: string }[] }[] } {
  const isChordPro = /\.(cho|crd)$/i.test(fileName) || /\{(title|t|start_of_)/i.test(text);
  const rawLines = text.replace(/<[^>]+>/g, '\n').split(/\r?\n/);
  let title = '';
  const out: { section: string | null; text: string; chords: { charOffset: number; symbol: string }[] }[] = [];
  let section: string | null = null;
  let inBlock = false;
  for (let raw of rawLines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) continue;
    const directive = trimmed.match(/^\{(title|t)\s*:\s*(.+)\}$/i);
    if (directive) {
      title = directive[2]!.trim();
      continue;
    }
    const blockStart = trimmed.match(/^\{start_of_(\w+)(?::\s*(.+))?\}$/i);
    if (blockStart) {
      section = blockStart[2]?.trim() || blockStart[1]!;
      inBlock = true;
      continue;
    }
    if (/^\{end_of_\w+\}$/i.test(trimmed)) {
      inBlock = false;
      continue;
    }
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) continue; // other ChordPro directives
    const sectionHeader = trimmed.match(/^\[([^\]]+)\]$/)?.[1];
    if (sectionHeader && !isChordPro) {
      section = sectionHeader.trim();
      continue;
    }
    if (isChordPro && sectionHeader && !inBlock) {
      // A bare [C] style line in ChordPro is a chord-only line, not a section header.
    }
    if (!title && out.length === 0 && !section) {
      title = trimmed;
      continue;
    }
    // inline chords: [C] [Am7] etc.
    const chords: { charOffset: number; symbol: string }[] = [];
    let lyricText = '';
    let i = 0;
    const chordRe = /\[([^\]\s][^\]]*)\]/g;
    let m: RegExpExecArray | null;
    let last = 0;
    while ((m = chordRe.exec(line)) !== null) {
      lyricText += line.slice(last, m.index);
      const offset = lyricText.length;
      last = m.index + m[0].length;
      if (isChordPro) {
        chords.push({ charOffset: offset, symbol: m[1]! });
      } else {
        lyricText += m[0];
      }
      void i;
    }
    lyricText += line.slice(last);
    out.push({ section, text: isChordPro ? lyricText : line, chords });
  }
  return { title: title || fileName.replace(/\.[^.]+$/, ''), lines: out };
}

/* ---------- song API ---------- */

export const songApi = {
  getSongs: async (includeArchived: boolean = false): Promise<SongSummary[]> => {
    const all = listSongIndex();
    return includeArchived ? all : all.filter((s) => !s.archived);
  },

  getSong: async (songId: string): Promise<SongDetail> => requireSong(songId),

  getWorkspaceContext: async (
    _songId: string
  ): Promise<{ teamId: string | null; teamName: string | null; collaborationChatEnabled: boolean }> => ({
    teamId: null,
    teamName: null,
    collaborationChatEnabled: false,
  }),

  getEvents: async (_songId: string, _after?: number): Promise<Event[]> => [],

  getTimelineData: async (songId: string): Promise<TimelineData> => ({
    events: [],
    song: requireSong(songId),
    recordings: [],
    lyricsScans: [],
    lyricsFiles: [],
    videos: [],
    notes: getLocalNotes(songId),
    metadata: getMetadataItems(songId),
    contributorSplits: [],
  }),

  submitBatch: async (songId: string, request: BatchCommandRequest): Promise<BatchCommandResponse> =>
    runBatch(songId, request.commands),

  validateSong: async (_songId: string): Promise<ValidateResponse> => ({
    valid: false,
    certificateId: '',
    rootHash: '',
    latestHash: '',
    eventCount: 0,
    violationReason: 'Certificates are not available in the local version yet.',
  }),

  getRecordings: async (songId: string): Promise<Recording[]> => listLocalRecordings(songId),
  getRecordingArtifactUrl: (_songId: string, recordingId: string): string =>
    getCachedRecordingUrl(recordingId) ?? '#',
  getLyricsScans: async (_songId: string): Promise<LyricsScan[]> => [],
  getLyricsFiles: async (_songId: string): Promise<LyricsFile[]> => [],
  getLyricsScanArtifactUrl: (_songId: string, _scanId: string): string => '#',
  uploadLyricsScan: async (..._args: unknown[]): Promise<{ scanId: string }> => {
    throw NOT_IN_LOCAL('Lyrics scans');
  },
  getSongVideos: async (_songId: string): Promise<SongVideo[]> => [],
  getSongVideoArtifactUrl: (_songId: string, _videoId: string): string => '#',
  uploadSongVideo: async (..._args: unknown[]): Promise<{ videoId: string }> => {
    throw NOT_IN_LOCAL('Video');
  },

  importSong: async (file: File): Promise<{ songId: string }> => {
    const text = await file.text();
    const parsed = parseImportedSong(file.name, text);
    const song = createSongRecord();
    const commands: BatchCommand[] = [];
    if (parsed.title) commands.push({ type: 'SetTitle', payload: { title: parsed.title } });
    const sectionIds = new Map<string, string>();
    const sectionOrder: string[] = [];
    for (const line of parsed.lines) {
      const secName = line.section ?? 'Lyrics';
      if (!sectionIds.has(secName)) {
        sectionOrder.push(secName);
        sectionIds.set(secName, secName);
      }
    }
    if (sectionOrder.length === 0) sectionOrder.push('Lyrics');
    const sectionIdByIndex: string[] = [];
    // Build sections and lines; ids must line up across commands, so we issue
    // AddSection/AddLine/AddChord with pre-generated client ids via tab-block-free flow.
    const sectionIdMap = new Map<string, string>();
    for (const secName of sectionOrder) {
      const id = crypto.randomUUID();
      sectionIdMap.set(secName, id);
      sectionIdByIndex.push(id);
      commands.push({ type: 'AddSection', payload: { sectionType: 'custom', label: secName } });
    }
    // The generic batch runner generates its own section ids, so apply the
    // import directly here instead of through runBatch.
    let next = getSongDetail(song.songId)!;
    const results: BatchCommandResultItem[] = [];
    if (parsed.title) next = applySetTitle(next, parsed.title);
    for (const secName of sectionOrder) {
      next = applyAddSection(next, sectionIdMap.get(secName)!, 'custom', secName);
    }
    for (const line of parsed.lines) {
      const secId = sectionIdMap.get(line.section ?? 'Lyrics')!;
      const lineId = crypto.randomUUID();
      next = applyAddLine(next, secId, lineId, line.text);
      for (const chord of line.chords) {
        const lineObj = next.sections.flatMap((s) => s.lines ?? []).find((l) => l.lineId === lineId);
        const resolved = tokenAtAbsoluteCharOffset(lineObj, chord.charOffset);
        next = applyAddChord(next, lineId, crypto.randomUUID(), resolved?.tokenId ?? null, resolved?.charOffsetInToken ?? chord.charOffset, chord.symbol);
      }
    }
    void commands;
    void results;
    saveSongDetail({ ...next, lastEventSequence: 1 });
    return { songId: song.songId };
  },

  /* metadata */
  getMetadataTypes: async (): Promise<MetadataType[]> => [],
  getSongMetadata: async (songId: string): Promise<WorkMetadataItem[]> =>
    songId ? getMetadataItems(songId) : [],
  addMetadataItem: async (
    songId: string,
    payload: { name: string; value?: string; showOnTimeline?: boolean }
  ): Promise<{ itemId: string }> => {
    if (!songId) throw new Error('Song is required');
    const items = getMetadataItems(songId);
    const now = new Date().toISOString();
    const item: WorkMetadataItem = {
      itemId: crypto.randomUUID(),
      name: payload.name,
      value: payload.value ?? '',
      showOnTimeline: payload.showOnTimeline ?? false,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    saveMetadataItems(songId, [...items, item]);
    return { itemId: item.itemId };
  },
  editMetadataItem: async (
    songId: string,
    itemId: string,
    payload: { name?: string; value?: string; showOnTimeline?: boolean }
  ): Promise<void> => {
    const items = getMetadataItems(songId).map((it) =>
      it.itemId === itemId
        ? {
            ...it,
            name: payload.name ?? it.name,
            value: payload.value ?? it.value,
            showOnTimeline: payload.showOnTimeline ?? it.showOnTimeline,
            updatedAt: new Date().toISOString(),
          }
        : it
    );
    saveMetadataItems(songId, items);
  },
  archiveMetadataItem: async (songId: string, itemId: string): Promise<void> => {
    saveMetadataItems(
      songId,
      getMetadataItems(songId).map((it) =>
        it.itemId === itemId ? { ...it, archivedAt: new Date().toISOString() } : it
      )
    );
  },
  unarchiveMetadataItem: async (songId: string, itemId: string): Promise<void> => {
    saveMetadataItems(
      songId,
      getMetadataItems(songId).map((it) => (it.itemId === itemId ? { ...it, archivedAt: null } : it))
    );
  },

  /* notes */
  getNotes: async (songId: string): Promise<Note[]> => (songId ? getLocalNotes(songId) : []),
  getNote: async (songId: string, noteId: string): Promise<Note> => {
    const note = getLocalNotes(songId).find((n) => n.noteId === noteId);
    if (!note) throw new Error('Note not found locally.');
    return note;
  },
  addNote: async (songId: string, payload: { title?: string; body?: string }): Promise<{ noteId: string }> => {
    if (!songId) throw new Error('Song is required to add a note');
    const now = new Date().toISOString();
    const note: LocalNote = {
      noteId: crypto.randomUUID(),
      songId,
      artifactId: 'local',
      title: payload.title ?? null,
      body: payload.body ?? '',
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
    saveNotes(songId, [...getLocalNotes(songId), note]);
    return { noteId: note.noteId };
  },
  editNote: async (songId: string, noteId: string, payload: { title?: string; body?: string }): Promise<Note> => {
    const notes = getLocalNotes(songId);
    const idx = notes.findIndex((n) => n.noteId === noteId);
    if (idx < 0) throw new Error('Note not found locally.');
    const updated: LocalNote = {
      ...notes[idx]!,
      title: payload.title ?? notes[idx]!.title,
      body: payload.body ?? notes[idx]!.body,
      updatedAt: new Date().toISOString(),
    };
    notes[idx] = updated;
    saveNotes(songId, notes);
    return updated;
  },
  archiveNote: async (songId: string, noteId: string): Promise<void> => {
    saveNotes(
      songId,
      getLocalNotes(songId).map((n) => (n.noteId === noteId ? { ...n, archivedAt: new Date().toISOString() } : n))
    );
  },
  unarchiveNote: async (songId: string, noteId: string): Promise<void> => {
    saveNotes(
      songId,
      getLocalNotes(songId).map((n) => (n.noteId === noteId ? { ...n, archivedAt: null } : n))
    );
  },

  /* videos / scans / recordings (audio milestones later) */
  archiveVideo: async (..._args: unknown[]): Promise<void> => {},
  unarchiveVideo: async (..._args: unknown[]): Promise<void> => {},
  archiveLyricsScan: async (..._args: unknown[]): Promise<void> => {},
  unarchiveLyricsScan: async (..._args: unknown[]): Promise<void> => {},
  archiveRecording: async (_songId: string, recordingId: string): Promise<void> => {
    await setLocalRecordingArchived(recordingId, true);
  },
  unarchiveRecording: async (_songId: string, recordingId: string): Promise<void> => {
    await setLocalRecordingArchived(recordingId, false);
  },

  /* individual song mutations */
  createSong: async (): Promise<{ songId: string }> => ({ songId: createSongRecord().songId }),
  setTitle: async (songId: string, title: string): Promise<void> => {
    runBatch(songId, [{ type: 'SetTitle', payload: { title } }]);
  },
  addSection: async (songId: string, type: string, label: string): Promise<{ sectionId: string }> => {
    const sectionId = crypto.randomUUID();
    const song = requireSong(songId);
    saveSongDetail(applyAddSection(song, sectionId, type, label));
    return { sectionId };
  },
  editSection: async (songId: string, sectionId: string, type: string, label: string): Promise<void> => {
    saveSongDetail(applyEditSection(requireSong(songId), sectionId, type, label));
  },
  deleteSection: async (songId: string, sectionId: string): Promise<void> => {
    saveSongDetail(applyArchiveSection(requireSong(songId), sectionId));
  },
  addLine: async (songId: string, sectionId: string, text: string): Promise<{ lineId: string }> => {
    const lineId = crypto.randomUUID();
    saveSongDetail(applyAddLine(requireSong(songId), sectionId, lineId, text));
    return { lineId };
  },
  editLine: async (songId: string, lineId: string, text: string): Promise<void> => {
    saveSongDetail(applyEditLine(requireSong(songId), lineId, text));
  },
  deleteLine: async (songId: string, lineId: string): Promise<void> => {
    saveSongDetail(applyArchiveLine(requireSong(songId), lineId));
  },
  addChord: async (
    songId: string,
    lineId: string,
    tokenId: string | null,
    charOffset: number,
    chordSymbol: string
  ): Promise<{ chordId: string }> => {
    const chordId = crypto.randomUUID();
    saveSongDetail(applyAddChord(requireSong(songId), lineId, chordId, tokenId, charOffset, chordSymbol));
    return { chordId };
  },
  editChord: async (songId: string, chordId: string, symbol: string): Promise<void> => {
    saveSongDetail(applyEditChord(requireSong(songId), chordId, symbol));
  },
  setChordVoicing: async (songId: string, chordId: string, voicingId: string | null): Promise<void> => {
    saveSongDetail(applySetChordVoicing(requireSong(songId), chordId, voicingId));
  },
  moveChord: async (songId: string, chordId: string, tokenId: string, charOffset: number): Promise<void> => {
    saveSongDetail(applyMoveChord(requireSong(songId), chordId, tokenId, charOffset));
  },
  removeChord: async (songId: string, chordId: string): Promise<void> => {
    saveSongDetail(applyRemoveChord(requireSong(songId), chordId));
  },
  archiveSong: async (songId: string): Promise<void> => {
    saveSongDetail({ ...requireSong(songId), archived: true });
  },
  restoreSong: async (songId: string): Promise<void> => {
    saveSongDetail({ ...requireSong(songId), archived: false });
  },
  deleteSong: async (songId: string): Promise<void> => {
    removeSongRecord(songId);
    await deleteLocalRecordingsForSong(songId);
  },

  uploadRecording: async (
    songId: string,
    blob: Blob,
    options?: { sectionId?: string | null; trackIndex?: number; label?: string; durationSeconds?: number }
  ): Promise<{ recordingId: string }> => {
    requireSong(songId);
    const rec = await saveLocalRecording(songId, blob, options ?? {});
    return { recordingId: rec.recordingId };
  },
  uploadMixdown: async (..._args: unknown[]): Promise<{ recordingId: string }> => {
    throw NOT_IN_LOCAL('Recording');
  },
  getTrackLabProjects: async (_songId: string): Promise<TrackLabProject[]> => [],
  saveTrackLabProject: async (..._args: unknown[]): Promise<{ projectId: string }> => {
    throw NOT_IN_LOCAL('Track Lab');
  },
  archiveTrackLabProject: async (..._args: unknown[]): Promise<void> => {},
  unarchiveTrackLabProject: async (..._args: unknown[]): Promise<void> => {},
  updateTrackLabProjectName: async (..._args: unknown[]): Promise<void> => {},
};

/* ---------- tours (local) ---------- */

export type UserTourStatus = 'completed' | 'skip_permanent';

export interface UserTourState {
  tourId: string;
  status: UserTourStatus;
}

export const userTourApi = {
  getState: async (tourId: string): Promise<UserTourState | null> => {
    const status = getLocalTourState(tourId);
    return status ? { tourId, status: status as UserTourStatus } : null;
  },
  setState: async (tourId: string, status: UserTourStatus): Promise<UserTourState> => {
    setLocalTourState(tourId, status);
    return { tourId, status };
  },
  resetState: async (tourId: string): Promise<void> => {
    setLocalTourState(tourId, '');
  },
};

/* ---------- profile (local) ---------- */

export function effectiveAvatarUrl(avatarUrl: string | null | undefined): string | undefined {
  return avatarUrl ?? undefined;
}

export interface UserProfileResponse {
  userId: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  authorName: string | null;
  authorNameObfuscate: boolean;
  linkedAuthMethods: string[];
  createdAt?: string;
  plan: string | null;
  role?: string;
}

export interface UserProfileUpdateRequest {
  displayName?: string | null;
  avatarUrl?: string | null;
  authorName?: string | null;
  authorNameObfuscate?: boolean | null;
}

export interface StorageUsage {
  usedBytes: number;
  limitBytes: number;
  tier: string;
}

const LOCAL_STORAGE_LIMIT_BYTES = 5 * 1024 * 1024;

export const profileApi = {
  syncSelf: async (_email: string, _plan?: string | null): Promise<UserProfileResponse> => getLocalProfile(),
  getProfile: async (): Promise<UserProfileResponse> => readProfile(),
  updateProfile: async (body: UserProfileUpdateRequest): Promise<UserProfileResponse> => {
    const current = getLocalProfile();
    const next = {
      ...current,
      displayName: body.displayName !== undefined ? body.displayName : current.displayName,
      avatarUrl: body.avatarUrl !== undefined ? body.avatarUrl : current.avatarUrl,
      authorName: body.authorName !== undefined ? body.authorName : current.authorName,
      authorNameObfuscate:
        body.authorNameObfuscate !== undefined
          ? Boolean(body.authorNameObfuscate)
          : current.authorNameObfuscate,
    };
    saveLocalProfile(next);
    return next;
  },
  getStorageUsage: async (): Promise<StorageUsage> => ({
    usedBytes: estimateUsedBytes(),
    limitBytes: LOCAL_STORAGE_LIMIT_BYTES,
    tier: 'local',
  }),
};

/* ---------- plugin settings (local) ---------- */

export const pluginSettingsApi = {
  getPluginSettings: async (pluginId: string): Promise<Record<string, unknown>> =>
    getLocalPluginSettings(pluginId),
  setPluginSetting: async (pluginId: string, key: string, value: unknown): Promise<void> => {
    setLocalPluginSetting(pluginId, key, value);
  },
};

/* ---------- certificates (hosted-only) ---------- */

export interface ValidateResponse {
  valid: boolean;
  certificateId: string;
  rootHash: string;
  latestHash: string;
  eventCount: number;
  snapshotHash?: string;
  tsaProvider?: string;
  tsaVerificationStatus?: string;
  tsaGenTime?: string;
  violationEventIndex?: number;
  violationReason?: string;
}

export interface CertPublic {
  certificateId: string;
  songId?: string;
  rootHash: string;
  latestHash: string;
  eventCount: number;
  status: string;
  createdAt?: string;
  snapshotHash?: string;
  snapshotHashAlg?: string;
  snapshotCanonicalization?: string;
  snapshotCreatedAt?: string;
  tsaProvider?: string;
  tsaUrl?: string;
  tsaGenTime?: string;
  tsaPolicyOid?: string;
  tsaSerial?: string;
  tsaVerificationStatus?: string;
  tsaVerificationError?: string;
}

export const certApi = {
  getCert: async (_certId: string): Promise<CertPublic | null> => null,
  getTsrUrl: (_certId: string): string => '#',
  verifyTsr: async (_certId: string): Promise<{ verified: boolean; message: string } | null> => null,
};

/* ---------- chord library (hosted guitar DB; piano computed client-side) ---------- */

export interface ChordVoicingDTO {
  id: string;
  chord: {
    frets?: number[];
    fingers?: number[];
    barres?: number[];
    baseFret?: number;
    capo?: boolean;
    notes?: string[];
  };
  name?: string;
  source?: string;
}

export const chordLibraryApi = {
  getVoicings: async (_instrument: string, _symbol: string): Promise<ChordVoicingDTO[]> => [],
  getVoicingById: async (_id: string): Promise<ChordVoicingDTO | null> => null,
  createPianoVoicing: async (..._args: unknown[]): Promise<ChordVoicingDTO> => {
    throw NOT_IN_LOCAL('Saving piano voicings');
  },
};

/* ---------- user voicings (local) ---------- */

export interface UserChordVoicingDTO {
  id: string;
  instrument: string;
  normalizedSymbol?: string;
  name?: string;
  chord: { frets?: number[]; fingers?: number[]; barres?: number[]; baseFret?: number; notes?: string[] };
  archived?: boolean;
}

export const userVoicingsApi = {
  create: async (params: {
    instrument: string;
    normalizedSymbol?: string;
    name?: string;
    chordData: Record<string, unknown>;
  }): Promise<UserChordVoicingDTO> => {
    const all = getUserVoicings<UserChordVoicingDTO>();
    const created: UserChordVoicingDTO = {
      id: crypto.randomUUID(),
      instrument: params.instrument,
      normalizedSymbol: params.normalizedSymbol,
      name: params.name,
      chord: params.chordData as UserChordVoicingDTO['chord'],
    };
    saveUserVoicings([...all, created]);
    return created;
  },
  getById: async (id: string): Promise<UserChordVoicingDTO | null> =>
    getUserVoicings<UserChordVoicingDTO>().find((v) => v.id === id) ?? null,
  list: async (instrument: string, normalizedSymbol: string): Promise<UserChordVoicingDTO[]> =>
    getUserVoicings<UserChordVoicingDTO>().filter(
      (v) => !v.archived && v.instrument === instrument && v.normalizedSymbol === normalizedSymbol
    ),
  archive: async (id: string): Promise<UserChordVoicingDTO> => {
    const all = getUserVoicings<UserChordVoicingDTO>();
    const found = all.find((v) => v.id === id);
    if (!found) throw new Error('Voicing not found locally.');
    found.archived = true;
    saveUserVoicings(all);
    return found;
  },
  update: async (id: string, params: { name?: string | null }): Promise<UserChordVoicingDTO> => {
    const all = getUserVoicings<UserChordVoicingDTO>();
    const found = all.find((v) => v.id === id);
    if (!found) throw new Error('Voicing not found locally.');
    if (params.name !== undefined) found.name = params.name ?? undefined;
    saveUserVoicings(all);
    return found;
  },
};

/* ---------- teams (hosted-only) ---------- */

export const WRITE_DISABLED_BY_OWNER_CODE = 'write_disabled_by_owner';

export const teamApi = {
  getTeams: async (): Promise<Team[]> => [],
  getTeam: async (..._args: unknown[]): Promise<Team> => {
    throw NOT_IN_LOCAL('Team workspaces');
  },
  createTeam: async (..._args: unknown[]): Promise<Team> => {
    throw NOT_IN_LOCAL('Team workspaces');
  },
  joinTeam: async (..._args: unknown[]): Promise<Team> => {
    throw NOT_IN_LOCAL('Team workspaces');
  },
  getMembers: async (_teamId: string): Promise<TeamMember[]> => [],
  disableMember: async (..._args: unknown[]): Promise<void> => {},
  enableMember: async (..._args: unknown[]): Promise<void> => {},
  shareSong: async (..._args: unknown[]): Promise<void> => {
    throw NOT_IN_LOCAL('Team workspaces');
  },
  unshareSong: async (..._args: unknown[]): Promise<void> => {},
  getTeamSongs: async (_teamId: string): Promise<TeamSong[]> => [],
  regenerateInviteCode: async (..._args: unknown[]): Promise<Team> => {
    throw NOT_IN_LOCAL('Team workspaces');
  },
};

/* ---------- collaboration (single local user: always editable) ---------- */

const localLock = (songId: string): SongWriteLock => ({
  songId,
  lockedBy: LOCAL_USER_ID,
  lockedByDisplayName: 'You',
  acquiredAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
});

export const collaborationApi = {
  acquireLock: async (songId: string): Promise<SongWriteLock> => localLock(songId),
  releaseLock: async (_songId: string): Promise<void> => {},
  renewLock: async (songId: string): Promise<SongWriteLock> => localLock(songId),
  forceAcquireLock: async (songId: string): Promise<SongWriteLock> => localLock(songId),
  getLock: async (_songId: string): Promise<SongWriteLock | null> => null,
  heartbeat: async (_songId: string): Promise<void> => {},
  getPresence: async (_songId: string): Promise<SongPresence[]> => [],
  getChatParticipants: async (_songId: string): Promise<string[]> => [],
};

/* ---------- chat (hosted-only) ---------- */

export type SongChatGetMessagesParams = {
  afterSequence?: number;
  beforeSequence?: number;
  limit?: number;
  includeArchived?: boolean;
};

export const songChatApi = {
  getMessages: async (_songId: string, _params: SongChatGetMessagesParams = {}): Promise<ChatMessageView[]> => [],
  getUnreadCount: async (_songId: string): Promise<number> => 0,
  postMessage: async (..._args: unknown[]): Promise<ChatMessageView> => {
    throw NOT_IN_LOCAL('Song chat');
  },
  archiveMessage: async (..._args: unknown[]): Promise<void> => {},
  markRead: async (..._args: unknown[]): Promise<void> => {},
  updateReadState: async (..._args: unknown[]): Promise<void> => {},
  songStreamUrl: (_songId: string, _accessToken: string) => '',
};

export const meChatApi = {
  getUnreadSummary: async (): Promise<ChatUnreadSummary> => ({ items: [] }),
  userStreamUrl: (_accessToken: string) => '',
};
