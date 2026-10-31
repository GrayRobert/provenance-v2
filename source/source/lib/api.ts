/**
 * api.ts - LOCAL-FIRST replacement for the hosted backend API.
 *
 * Same exported surface as the original server-backed module, implemented over
 * browser localStorage (see ./localDb) plus a local append-only event log with
 * SHA-256 hash chaining (see ./localEvents, a port of the original
 * PostgresEventStore / HashChainService semantics). Features that genuinely
 * need the hosted backend (videos, lyrics scans, chat, teams, TSA-anchored
 * public certificates, the guitar chord library) are inert stubs for this
 * slice: reads return empty data and writes throw a clear error.
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
  deleteLocalTrackLabProjectsForSong,
  getLocalTrackLabProjects,
  renameLocalTrackLabProject,
  setLocalTrackLabProjectArchived,
  upsertLocalTrackLabProject,
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
  getLocalAudioBytes,
  deleteLocalRecordingsForSong,
  getCachedRecordingUrl,
  listLocalRecordings,
  archiveActiveProjectTrackRecording,
  renameLocalRecording,
  saveLocalRecording,
  setLocalRecordingArchived,
} from './localRecordings';
import {
  appendLocalEvents,
  deleteLocalEventsForSong,
  getStoredEvents,
  toPublicEvents,
  validateLocalChain,
  type PendingEvent,
} from './localEvents';

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

/* ---------- event recording helpers ---------- */

function findLineById(song: SongDetail, lineId: string) {
  for (const section of song.sections) {
    for (const line of section.lines ?? []) {
      if (line.lineId === lineId) return line;
    }
  }
  return undefined;
}

function findChordLocation(song: SongDetail, chordId: string) {
  for (const section of song.sections) {
    for (const line of section.lines ?? []) {
      const chord = (line.chords ?? []).find((c) => c.chordId === chordId);
      if (chord) return { line, chord };
    }
  }
  return undefined;
}

function eventSource(source: string | undefined, fallback: string = 'typed'): string {
  return source && source.length > 0 ? source : fallback;
}

function applyCommand(
  song: SongDetail,
  command: BatchCommand,
  results: BatchCommandResultItem[],
  pending: PendingEvent[]
): SongDetail {
  const songId = song.songId;
  const userId = LOCAL_USER_ID;
  switch (command.type) {
    case 'SetTitle': {
      pending.push({
        eventType: 'SongTitleSetEvent',
        payload: { songId, previousTitle: song.title, newTitle: command.payload.title, userId },
        source: 'typed',
      });
      return applySetTitle(song, command.payload.title);
    }
    case 'AddSection': {
      const id = command.clientGeneratedId ?? crypto.randomUUID();
      results.push({ type: 'addSection', id });
      const sectionType = command.payload.sectionType || 'VERSE';
      const label = command.payload.label ?? '';
      pending.push({
        eventType: 'SectionAddedEvent',
        payload: { sectionId: id, songId, sectionType, label, orderIndex: song.sections.length, userId },
        source: 'system',
      });
      return applyAddSection(song, id, command.payload.sectionType, command.payload.label);
    }
    case 'EditSection': {
      const prev = song.sections.find((s) => s.sectionId === command.payload.sectionId);
      const type = command.payload.sectionType || prev?.sectionType || 'VERSE';
      const label = command.payload.label ?? prev?.label ?? '';
      pending.push({
        eventType: 'SectionEditedEvent',
        payload: {
          sectionId: command.payload.sectionId,
          previousType: prev?.sectionType ?? '',
          type,
          previousLabel: prev?.label ?? '',
          label,
          userId,
        },
        source: 'typed',
      });
      return applyEditSection(song, command.payload.sectionId, command.payload.sectionType, command.payload.label);
    }
    case 'RepositionSection':
      pending.push({
        eventType: 'SectionRepositionedEvent',
        payload: { sectionId: command.payload.sectionId, newOrderIndex: command.payload.newOrderIndex, userId },
        source: 'reorder',
      });
      return applyRepositionSection(song, command.payload.sectionId, command.payload.newOrderIndex);
    case 'ArchiveSection':
      pending.push({
        eventType: 'SectionArchivedEvent',
        payload: { sectionId: command.payload.sectionId, userId },
        source: 'system',
      });
      return applyArchiveSection(song, command.payload.sectionId);
    case 'AddLine': {
      const id = command.clientGeneratedId ?? crypto.randomUUID();
      results.push({ type: 'addLine', id });
      const section = song.sections.find((s) => s.sectionId === command.payload.sectionId);
      pending.push({
        eventType: 'LineAddedEvent',
        payload: {
          lineId: id,
          sectionId: command.payload.sectionId,
          text: command.payload.text,
          orderIndex: section?.lines?.length ?? 0,
          userId,
        },
        source: eventSource(command.payload.source),
      });
      return applyAddLine(song, command.payload.sectionId, id, command.payload.text);
    }
    case 'EditLine': {
      const prev = findLineById(song, command.payload.lineId);
      const source = eventSource(command.payload.source);
      pending.push({
        eventType: 'LineEditedEvent',
        payload: { lineId: command.payload.lineId, previousText: prev?.text ?? '', newText: command.payload.text, userId },
        source,
      });
      const next = applyEditLine(song, command.payload.lineId, command.payload.text);
      // Chords orphaned by the edit (their token was deleted) get their own event,
      // matching the original backend's provenance tracking.
      const after = findLineById(next, command.payload.lineId);
      for (const chord of after?.chords ?? []) {
        const before = (prev?.chords ?? []).find((c) => c.chordId === chord.chordId);
        if (chord.orphaned && before && !before.orphaned && before.tokenId) {
          pending.push({
            eventType: 'ChordOrphanedEvent',
            payload: { chordId: chord.chordId, lineId: command.payload.lineId, tokenId: before.tokenId, chordSymbol: chord.chordSymbol, userId },
            source,
          });
        }
      }
      return next;
    }
    case 'AddTabBlock': {
      const section = song.sections.find((s) => s.sectionId === command.payload.sectionId);
      const orderBase = section?.lines?.length ?? 0;
      const added: { lineId: string; text: string; orderIndex: number }[] = [];
      const edited: { lineId: string; previousText: string; newText: string }[] = [];
      let next = song;
      command.payload.lines.forEach((line, i) => {
        const id = line.lineId ?? crypto.randomUUID();
        if (line.lineId) {
          const prev = findLineById(next, line.lineId);
          edited.push({ lineId: line.lineId, previousText: prev?.text ?? '', newText: line.text });
          next = applyEditLine(next, line.lineId, line.text);
        } else {
          results.push({ type: 'addLine', id });
          added.push({ lineId: id, text: line.text, orderIndex: orderBase + i });
          next = applyAddLine(next, command.payload.sectionId, id, line.text);
        }
      });
      const source = eventSource(command.payload.source);
      if (added.length > 0) {
        pending.push({
          eventType: 'TabAddedEvent',
          payload: { sectionId: command.payload.sectionId, lines: added, barCount: command.payload.barCount ?? null, widthPreset: command.payload.widthPreset ?? null, userId },
          source,
        });
      }
      if (edited.length > 0) {
        pending.push({
          eventType: 'TabEditedEvent',
          payload: { lines: edited, barCount: command.payload.barCount ?? null, widthPreset: command.payload.widthPreset ?? null, userId },
          source,
        });
      }
      return next;
    }
    case 'EditTabBlock': {
      const edits: { lineId: string; previousText: string; newText: string }[] = [];
      const orphanEvents: PendingEvent[] = [];
      const source = eventSource(command.payload.source);
      let next = song;
      for (const row of command.payload.lines) {
        const prev = findLineById(next, row.lineId);
        edits.push({ lineId: row.lineId, previousText: prev?.text ?? '', newText: row.text });
        next = applyEditLine(next, row.lineId, row.text);
        const after = findLineById(next, row.lineId);
        for (const chord of after?.chords ?? []) {
          const before = (prev?.chords ?? []).find((c) => c.chordId === chord.chordId);
          if (chord.orphaned && before && !before.orphaned && before.tokenId) {
            orphanEvents.push({
              eventType: 'ChordOrphanedEvent',
              payload: { chordId: chord.chordId, lineId: row.lineId, tokenId: before.tokenId, chordSymbol: chord.chordSymbol, userId },
              source,
            });
          }
        }
      }
      pending.push({
        eventType: 'TabEditedEvent',
        payload: { lines: edits, barCount: command.payload.barCount ?? null, widthPreset: command.payload.widthPreset ?? null, userId },
        source,
      });
      pending.push(...orphanEvents);
      return next;
    }
    case 'ArchiveLine':
      pending.push({
        eventType: 'LineArchivedEvent',
        payload: { lineId: command.payload.lineId, userId },
        source: 'system',
      });
      return applyArchiveLine(song, command.payload.lineId);
    case 'AddChord': {
      const id = command.clientGeneratedId ?? crypto.randomUUID();
      results.push({ type: 'addChord', id });
      pending.push({
        eventType: 'ChordAddedEvent',
        payload: {
          chordId: id,
          lineId: command.payload.lineId,
          tokenId: command.payload.tokenId,
          charOffset: command.payload.charOffset,
          chordSymbol: command.payload.chordSymbol,
          userId,
        },
        source: eventSource((command.payload as { source?: string }).source),
      });
      return applyAddChord(
        song,
        command.payload.lineId,
        id,
        command.payload.tokenId,
        command.payload.charOffset,
        command.payload.chordSymbol
      );
    }
    case 'EditChord': {
      const loc = findChordLocation(song, command.payload.chordId);
      pending.push({
        eventType: 'ChordEditedEvent',
        payload: {
          chordId: command.payload.chordId,
          lineId: loc?.line.lineId ?? '',
          previousSymbol: loc?.chord.chordSymbol ?? '',
          newSymbol: command.payload.symbol,
          userId,
        },
        source: 'typed',
      });
      return applyEditChord(song, command.payload.chordId, command.payload.symbol);
    }
    case 'RemoveChord':
      pending.push({
        eventType: 'ChordRemovedEvent',
        payload: { chordId: command.payload.chordId, userId },
        source: 'system',
      });
      return applyRemoveChord(song, command.payload.chordId);
    case 'MoveChord': {
      const line = findLineById(song, command.payload.lineId);
      const resolved = tokenAtAbsoluteCharOffset(line, command.payload.absoluteCharOffset);
      const prevChord = song.sections
        .flatMap((s) => s.lines ?? [])
        .flatMap((l) => l.chords ?? [])
        .find((c) => c.chordId === command.payload.chordId);
      pending.push({
        eventType: 'ChordMovedEvent',
        payload: {
          chordId: command.payload.chordId,
          previousTokenId: prevChord?.tokenId ?? null,
          newTokenId: resolved?.tokenId ?? command.payload.lineId,
          newCharOffset: resolved?.charOffsetInToken ?? 0,
          userId,
        },
        source: 'typed',
      });
      return applyMoveChord(
        song,
        command.payload.chordId,
        resolved?.tokenId ?? command.payload.lineId,
        resolved?.charOffsetInToken ?? 0
      );
    }
    case 'SetChordVoicing': {
      const loc = findChordLocation(song, command.payload.chordId);
      pending.push({
        eventType: 'VoicingSelectedEvent',
        payload: { chordId: command.payload.chordId, lineId: loc?.line.lineId ?? '', voicingId: command.payload.voicingId, userId },
        source: 'typed',
      });
      return applySetChordVoicing(song, command.payload.chordId, command.payload.voicingId);
    }
    case 'RecordSongScaffold':
      // Structure provenance is not stored in the local song document; content
      // arrives via the section/line commands that accompany this marker.
      pending.push({
        eventType: 'SongScaffoldAppliedEvent',
        payload: {
          songId,
          genreId: command.payload.genreId,
          genreName: command.payload.genreName,
          structureId: command.payload.structureId,
          structureName: command.payload.structureName,
          source: command.payload.source ?? '',
          userId,
        },
        source: 'system',
      });
      return song;
    default:
      return song;
  }
}

async function runBatch(songId: string, commands: BatchCommand[]): Promise<BatchCommandResponse> {
  const song = requireSong(songId);
  const results: BatchCommandResultItem[] = [];
  const pending: PendingEvent[] = [];
  let next = song;
  for (const command of commands) {
    next = applyCommand(next, command, results, pending);
  }
  // Events are appended before the song state is saved: if the append fails
  // (e.g. localStorage quota) the edit is not persisted either, so a change is
  // never silently missing from the history.
  const appended = await appendLocalEvents(songId, pending);
  const lastEventSequence = appended.length
    ? appended[appended.length - 1]!.sequenceNumber
    : (song.lastEventSequence ?? 0);
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

  getEvents: async (songId: string, after?: number): Promise<Event[]> => {
    const events = toPublicEvents(getStoredEvents(songId));
    return after == null ? events : events.filter((e) => e.sequenceNumber > after);
  },

  getTimelineData: async (songId: string): Promise<TimelineData> => ({
    events: toPublicEvents(getStoredEvents(songId)),
    song: requireSong(songId),
    recordings: await listLocalRecordings(songId),
    lyricsScans: [],
    lyricsFiles: [],
    videos: [],
    notes: getLocalNotes(songId),
    metadata: getMetadataItems(songId),
    contributorSplits: [],
  }),

  submitBatch: async (songId: string, request: BatchCommandRequest): Promise<BatchCommandResponse> =>
    runBatch(songId, request.commands),

  /**
   * Verifies the song's local hash chain against the events stored in this
   * browser. The returned certificateId identifies this validation result;
   * it is not an independent attestation: the local chain detects changes to
   * the stored history but is not externally witnessed or timestamped.
   */
  validateSong: async (songId: string): Promise<ValidateResponse> => {
    const events = getStoredEvents(songId);
    const validation = await validateLocalChain(events);
    return {
      valid: validation.valid,
      certificateId: crypto.randomUUID(),
      rootHash: events.length > 0 ? events[0]!.eventHash : '',
      latestHash: events.length > 0 ? events[events.length - 1]!.eventHash : '',
      eventCount: events.length,
      ...(validation.valid
        ? {}
        : {
            violationEventIndex: validation.violationEventIndex,
            violationReason: validation.violationReason,
          }),
    };
  },

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
    // import directly here instead of through runBatch, recording events as we go.
    const pending: PendingEvent[] = [
      { eventType: 'SongCreatedEvent', payload: { songId: song.songId, userId: LOCAL_USER_ID }, source: 'system' },
    ];
    let next = getSongDetail(song.songId)!;
    if (parsed.title) {
      pending.push({
        eventType: 'SongTitleSetEvent',
        payload: { songId: song.songId, previousTitle: next.title, newTitle: parsed.title, userId: LOCAL_USER_ID },
        source: 'import',
      });
      next = applySetTitle(next, parsed.title);
    }
    for (const secName of sectionOrder) {
      const secId = sectionIdMap.get(secName)!;
      const secIndex = next.sections.length;
      pending.push({
        eventType: 'SectionAddedEvent',
        payload: { sectionId: secId, songId: song.songId, sectionType: 'custom', label: secName, orderIndex: secIndex, userId: LOCAL_USER_ID },
        source: 'import',
      });
      next = applyAddSection(next, secId, 'custom', secName);
    }
    for (const line of parsed.lines) {
      const secId = sectionIdMap.get(line.section ?? 'Lyrics')!;
      const lineId = crypto.randomUUID();
      const lineOrder = next.sections.find((s) => s.sectionId === secId)?.lines?.length ?? 0;
      pending.push({
        eventType: 'LineAddedEvent',
        payload: { lineId, sectionId: secId, text: line.text, orderIndex: lineOrder, userId: LOCAL_USER_ID },
        source: 'import',
      });
      next = applyAddLine(next, secId, lineId, line.text);
      for (const chord of line.chords) {
        const lineObj = next.sections.flatMap((s) => s.lines ?? []).find((l) => l.lineId === lineId);
        const resolved = tokenAtAbsoluteCharOffset(lineObj, chord.charOffset);
        const chordId = crypto.randomUUID();
        pending.push({
          eventType: 'ChordAddedEvent',
          payload: {
            chordId,
            lineId,
            tokenId: resolved?.tokenId ?? null,
            charOffset: resolved?.charOffsetInToken ?? chord.charOffset,
            chordSymbol: chord.symbol,
            userId: LOCAL_USER_ID,
          },
          source: 'import',
        });
        next = applyAddChord(next, lineId, chordId, resolved?.tokenId ?? null, resolved?.charOffsetInToken ?? chord.charOffset, chord.symbol);
      }
    }
    void commands;
    const appended = await appendLocalEvents(song.songId, pending);
    saveSongDetail({ ...next, lastEventSequence: appended.length ? appended[appended.length - 1]!.sequenceNumber : 0 });
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
    await appendLocalEvents(songId, [
      {
        eventType: 'WorkMetadataItemAddedEvent',
        payload: { songId, itemId: item.itemId, name: item.name, value: item.value, showOnTimeline: item.showOnTimeline, userId: LOCAL_USER_ID },
        source: 'typed',
      },
    ]);
    return { itemId: item.itemId };
  },
  editMetadataItem: async (
    songId: string,
    itemId: string,
    payload: { name?: string; value?: string; showOnTimeline?: boolean }
  ): Promise<void> => {
    const prev = getMetadataItems(songId).find((it) => it.itemId === itemId);
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
    const next = items.find((it) => it.itemId === itemId);
    if (next) {
      await appendLocalEvents(songId, [
        {
          eventType: 'WorkMetadataItemEditedEvent',
          payload: {
            songId,
            itemId,
            previousName: prev?.name ?? '',
            previousValue: prev?.value ?? '',
            name: next.name,
            value: next.value,
            showOnTimeline: next.showOnTimeline,
            userId: LOCAL_USER_ID,
          },
          source: 'typed',
        },
      ]);
    }
  },
  archiveMetadataItem: async (songId: string, itemId: string): Promise<void> => {
    saveMetadataItems(
      songId,
      getMetadataItems(songId).map((it) =>
        it.itemId === itemId ? { ...it, archivedAt: new Date().toISOString() } : it
      )
    );
    await appendLocalEvents(songId, [
      { eventType: 'WorkMetadataItemArchivedEvent', payload: { songId, itemId, userId: LOCAL_USER_ID }, source: 'system' },
    ]);
  },
  unarchiveMetadataItem: async (songId: string, itemId: string): Promise<void> => {
    saveMetadataItems(
      songId,
      getMetadataItems(songId).map((it) => (it.itemId === itemId ? { ...it, archivedAt: null } : it))
    );
    await appendLocalEvents(songId, [
      { eventType: 'WorkMetadataItemUnarchivedEvent', payload: { songId, itemId, userId: LOCAL_USER_ID }, source: 'system' },
    ]);
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
    await appendLocalEvents(songId, [
      {
        eventType: 'NoteAddedEvent',
        payload: { songId, noteId: note.noteId, artifactId: note.artifactId, title: note.title, userId: LOCAL_USER_ID },
        source: 'typed',
      },
    ]);
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
    await appendLocalEvents(songId, [
      {
        eventType: 'NoteEditedEvent',
        payload: { songId, noteId, previousArtifactId: updated.artifactId, artifactId: updated.artifactId, title: updated.title, userId: LOCAL_USER_ID },
        source: 'typed',
      },
    ]);
    return updated;
  },
  archiveNote: async (songId: string, noteId: string): Promise<void> => {
    saveNotes(
      songId,
      getLocalNotes(songId).map((n) => (n.noteId === noteId ? { ...n, archivedAt: new Date().toISOString() } : n))
    );
    await appendLocalEvents(songId, [
      { eventType: 'NoteArchivedEvent', payload: { songId, noteId, userId: LOCAL_USER_ID }, source: 'system' },
    ]);
  },
  unarchiveNote: async (songId: string, noteId: string): Promise<void> => {
    saveNotes(
      songId,
      getLocalNotes(songId).map((n) => (n.noteId === noteId ? { ...n, archivedAt: null } : n))
    );
    await appendLocalEvents(songId, [
      { eventType: 'NoteUnarchivedEvent', payload: { songId, noteId, userId: LOCAL_USER_ID }, source: 'system' },
    ]);
  },

  /* videos / scans / recordings (audio milestones later) */
  archiveVideo: async (..._args: unknown[]): Promise<void> => {},
  unarchiveVideo: async (..._args: unknown[]): Promise<void> => {},
  archiveLyricsScan: async (..._args: unknown[]): Promise<void> => {},
  unarchiveLyricsScan: async (..._args: unknown[]): Promise<void> => {},
  archiveRecording: async (songId: string, recordingId: string): Promise<void> => {
    await setLocalRecordingArchived(recordingId, true);
    await appendLocalEvents(songId, [
      { eventType: 'RecordingArchivedEvent', payload: { songId, recordingId, userId: LOCAL_USER_ID }, source: 'audio-recorder' },
    ]);
  },
  unarchiveRecording: async (songId: string, recordingId: string): Promise<void> => {
    await setLocalRecordingArchived(recordingId, false);
    await appendLocalEvents(songId, [
      { eventType: 'RecordingUnarchivedEvent', payload: { songId, recordingId, userId: LOCAL_USER_ID }, source: 'audio-recorder' },
    ]);
  },
  renameRecording: async (songId: string, recordingId: string, label: string): Promise<void> => {
    const before = (await listLocalRecordings(songId)).find((r) => r.recordingId === recordingId);
    await renameLocalRecording(recordingId, label);
    await appendLocalEvents(songId, [
      {
        eventType: 'RecordingEditedEvent',
        payload: {
          songId,
          recordingId,
          previousArtifactId: before?.artifactId ?? '',
          artifactId: before?.artifactId ?? '',
          label,
          userId: LOCAL_USER_ID,
        },
        source: 'audio-recorder',
      },
    ]);
  },

  /* individual song mutations */
  createSong: async (): Promise<{ songId: string }> => {
    const record = createSongRecord();
    await appendLocalEvents(record.songId, [
      { eventType: 'SongCreatedEvent', payload: { songId: record.songId, userId: LOCAL_USER_ID }, source: 'system' },
    ]);
    return { songId: record.songId };
  },
  setTitle: async (songId: string, title: string): Promise<void> => {
    await runBatch(songId, [{ type: 'SetTitle', payload: { title } }]);
  },
  addSection: async (songId: string, type: string, label: string): Promise<{ sectionId: string }> => {
    const sectionId = crypto.randomUUID();
    await runBatch(songId, [
      { type: 'AddSection', payload: { sectionType: type, label }, clientGeneratedId: sectionId },
    ]);
    return { sectionId };
  },
  editSection: async (songId: string, sectionId: string, type: string, label: string): Promise<void> => {
    await runBatch(songId, [{ type: 'EditSection', payload: { sectionId, sectionType: type, label } }]);
  },
  deleteSection: async (songId: string, sectionId: string): Promise<void> => {
    await runBatch(songId, [{ type: 'ArchiveSection', payload: { sectionId } }]);
  },
  addLine: async (songId: string, sectionId: string, text: string): Promise<{ lineId: string }> => {
    const lineId = crypto.randomUUID();
    await runBatch(songId, [
      { type: 'AddLine', payload: { sectionId, text }, clientGeneratedId: lineId },
    ]);
    return { lineId };
  },
  editLine: async (songId: string, lineId: string, text: string): Promise<void> => {
    await runBatch(songId, [{ type: 'EditLine', payload: { lineId, text } }]);
  },
  deleteLine: async (songId: string, lineId: string): Promise<void> => {
    await runBatch(songId, [{ type: 'ArchiveLine', payload: { lineId } }]);
  },
  addChord: async (
    songId: string,
    lineId: string,
    tokenId: string | null,
    charOffset: number,
    chordSymbol: string
  ): Promise<{ chordId: string }> => {
    const chordId = crypto.randomUUID();
    await runBatch(songId, [
      { type: 'AddChord', payload: { lineId, tokenId, charOffset, chordSymbol }, clientGeneratedId: chordId },
    ]);
    return { chordId };
  },
  editChord: async (songId: string, chordId: string, symbol: string): Promise<void> => {
    await runBatch(songId, [{ type: 'EditChord', payload: { chordId, symbol } }]);
  },
  setChordVoicing: async (songId: string, chordId: string, voicingId: string | null): Promise<void> => {
    await runBatch(songId, [{ type: 'SetChordVoicing', payload: { chordId, voicingId } }]);
  },
  moveChord: async (songId: string, chordId: string, tokenId: string, charOffset: number): Promise<void> => {
    const song = requireSong(songId);
    const prevChord = song.sections
      .flatMap((s) => s.lines ?? [])
      .flatMap((l) => l.chords ?? [])
      .find((c) => c.chordId === chordId);
    await appendLocalEvents(songId, [
      {
        eventType: 'ChordMovedEvent',
        payload: { chordId, previousTokenId: prevChord?.tokenId ?? null, newTokenId: tokenId, newCharOffset: charOffset, userId: LOCAL_USER_ID },
        source: 'typed',
      },
    ]);
    saveSongDetail(applyMoveChord(song, chordId, tokenId, charOffset));
  },
  removeChord: async (songId: string, chordId: string): Promise<void> => {
    await runBatch(songId, [{ type: 'RemoveChord', payload: { chordId } }]);
  },
  archiveSong: async (songId: string): Promise<void> => {
    await appendLocalEvents(songId, [
      { eventType: 'SongArchivedEvent', payload: { songId, userId: LOCAL_USER_ID }, source: 'system' },
    ]);
    saveSongDetail({ ...requireSong(songId), archived: true });
  },
  restoreSong: async (songId: string): Promise<void> => {
    await appendLocalEvents(songId, [
      { eventType: 'SongRestoredEvent', payload: { songId, userId: LOCAL_USER_ID }, source: 'system' },
    ]);
    saveSongDetail({ ...requireSong(songId), archived: false });
  },
  deleteSong: async (songId: string): Promise<void> => {
    removeSongRecord(songId);
    deleteLocalEventsForSong(songId);
    deleteLocalTrackLabProjectsForSong(songId);
    await deleteLocalRecordingsForSong(songId);
  },

  uploadRecording: async (
    songId: string,
    blob: Blob,
    options?: {
      sectionId?: string | null;
      trackIndex?: number;
      label?: string;
      labelIsCustom?: boolean;
      durationSeconds?: number;
    }
  ): Promise<{ recordingId: string }> => {
    requireSong(songId);
    // Section recordings archive the previous primary; record that like the
    // original backend does (archive event before the add event).
    const replaced = options?.sectionId
      ? (await listLocalRecordings(songId)).filter((r) => r.sectionId === options.sectionId && !r.archivedAt)
      : [];
    const rec = await saveLocalRecording(songId, blob, options ?? {});
    await appendLocalEvents(songId, [
      ...replaced.map((r) => ({
        eventType: 'RecordingArchivedEvent',
        payload: { songId, recordingId: r.recordingId, userId: LOCAL_USER_ID },
        source: 'audio-recorder',
      })),
      {
        eventType: 'RecordingAddedEvent',
        payload: {
          songId,
          recordingId: rec.recordingId,
          artifactId: rec.artifactId,
          contentHash: rec.contentHash ?? '',
          mimeType: rec.mimeType,
          sizeBytes: rec.sizeBytes,
          sectionId: rec.sectionId ?? null,
          source: 'recorded',
          trackIndex: rec.trackIndex,
          label: rec.label ?? null,
          durationSeconds: rec.durationSeconds ?? null,
          userId: LOCAL_USER_ID,
        },
        source: 'audio-recorder',
      },
    ]);
    return { recordingId: rec.recordingId };
  },
  uploadMixdown: async (
    songId: string,
    blob: Blob,
    options: { durationSeconds?: number; label?: string } = {}
  ): Promise<{ recordingId: string }> => {
    requireSong(songId);
    const rec = await saveLocalRecording(songId, blob, {
      trackIndex: 0,
      label: options.label,
      labelIsCustom: true,
      durationSeconds: options.durationSeconds,
    });
    await appendLocalEvents(songId, [
      {
        eventType: 'RecordingAddedEvent',
        payload: {
          songId,
          recordingId: rec.recordingId,
          artifactId: rec.artifactId,
          contentHash: rec.contentHash ?? '',
          mimeType: rec.mimeType,
          sizeBytes: rec.sizeBytes,
          sectionId: null,
          source: 'mixdown',
          trackIndex: rec.trackIndex,
          label: rec.label ?? null,
          durationSeconds: rec.durationSeconds ?? null,
          userId: LOCAL_USER_ID,
        },
        source: 'track-lab',
      },
    ]);
    return { recordingId: rec.recordingId };
  },
  getTrackLabProjects: async (songId: string): Promise<TrackLabProject[]> => {
    const recordings = await listLocalRecordings(songId);
    const projects = getLocalTrackLabProjects(songId);
    return projects.map((p) => ({
      ...p,
      recordings: recordings
        .filter((r) => r.projectId === p.projectId && !r.archivedAt)
        .sort((a, b) => a.trackIndex - b.trackIndex),
    }));
  },
  saveTrackLabProject: async (
    songId: string,
    name: string,
    projectData: string,
    tracks: Array<{ trackIndex: number; label: string | null; durationSeconds: number | null; blob: Blob }>,
    projectId?: string | null
  ): Promise<{ projectId: string }> => {
    requireSong(songId);
    const now = new Date().toISOString();
    let project =
      (projectId ? getLocalTrackLabProjects(songId).find((p) => p.projectId === projectId) : undefined) ??
      null;
    if (projectId && !project) throw new Error('Project not found.');
    if (!project) {
      project = {
        projectId: crypto.randomUUID(),
        songId,
        name,
        projectData,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      };
    }
    const pending: PendingEvent[] = [];
    const newRecordingIds: string[] = [];
    for (const track of tracks) {
      if (!track.blob || track.blob.size === 0) continue;
      if (projectId) {
        // Backend parity: saving a new take on a track archives the previous active one.
        const replaced = (await listLocalRecordings(songId)).find(
          (r) => r.projectId === project.projectId && r.trackIndex === track.trackIndex && !r.archivedAt
        );
        await archiveActiveProjectTrackRecording(project.projectId, track.trackIndex);
        if (replaced) {
          pending.push({
            eventType: 'RecordingArchivedEvent',
            payload: { songId, recordingId: replaced.recordingId, userId: LOCAL_USER_ID },
            source: 'track-lab',
          });
        }
      }
      const rec = await saveLocalRecording(songId, track.blob, {
        trackIndex: track.trackIndex,
        label: track.label ?? undefined,
        durationSeconds: track.durationSeconds ?? undefined,
        projectId: project.projectId,
      });
      newRecordingIds.push(rec.recordingId);
      pending.push({
        eventType: 'RecordingAddedEvent',
        payload: {
          songId,
          recordingId: rec.recordingId,
          artifactId: rec.artifactId,
          contentHash: rec.contentHash ?? '',
          mimeType: rec.mimeType,
          sizeBytes: rec.sizeBytes,
          sectionId: null,
          source: 'track_lab',
          trackIndex: rec.trackIndex,
          label: rec.label ?? null,
          durationSeconds: rec.durationSeconds ?? null,
          userId: LOCAL_USER_ID,
        },
        source: 'track-lab',
      });
    }
    upsertLocalTrackLabProject({ ...project, name, projectData, updatedAt: now });
    pending.push(
      projectId
        ? {
            eventType: 'TrackLabProjectUpdatedEvent',
            payload: { songId, projectId: project.projectId, name, projectData, newRecordingIds, userId: LOCAL_USER_ID },
            source: 'track-lab',
          }
        : {
            eventType: 'TrackLabProjectSavedEvent',
            payload: { songId, projectId: project.projectId, name, projectData, recordingIds: newRecordingIds, userId: LOCAL_USER_ID },
            source: 'track-lab',
          }
    );
    await appendLocalEvents(songId, pending);
    return { projectId: project.projectId };
  },
  archiveTrackLabProject: async (songId: string, projectId: string): Promise<void> => {
    setLocalTrackLabProjectArchived(songId, projectId, true);
    await appendLocalEvents(songId, [
      { eventType: 'TrackLabProjectArchivedEvent', payload: { songId, projectId, userId: LOCAL_USER_ID }, source: 'track-lab' },
    ]);
  },
  unarchiveTrackLabProject: async (songId: string, projectId: string): Promise<void> => {
    setLocalTrackLabProjectArchived(songId, projectId, false);
    await appendLocalEvents(songId, [
      { eventType: 'TrackLabProjectUnarchivedEvent', payload: { songId, projectId, userId: LOCAL_USER_ID }, source: 'track-lab' },
    ]);
  },
  updateTrackLabProjectName: async (songId: string, projectId: string, name: string): Promise<void> => {
    renameLocalTrackLabProject(songId, projectId, name);
    await appendLocalEvents(songId, [
      { eventType: 'TrackLabProjectRenamedEvent', payload: { songId, projectId, name, userId: LOCAL_USER_ID }, source: 'track-lab' },
    ]);
  },
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
  /** Bytes of recorded/uploaded audio kept in this device's IndexedDB. */
  audioBytes: number;
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
    audioBytes: await getLocalAudioBytes(),
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
