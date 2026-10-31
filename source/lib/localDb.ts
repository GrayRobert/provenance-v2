/**
 * localDb - browser-local persistence for the local-first Provenance v2.
 *
 * All song data lives in localStorage. Nothing here talks to a server.
 * The backup/restore functions serialize the whole workspace to one JSON file.
 */
import type { Note, Recording, SongDetail, SongSummary, TrackLabProject, WorkMetadataItem } from './types';
import {
  base64ToBlob,
  blobToBase64,
  importStoredRecording,
  listAllStoredRecordings,
} from './localRecordings';

const PREFIX = 'prov2.';
const SONGS_INDEX_KEY = `${PREFIX}songs`;
const PROFILE_KEY = `${PREFIX}profile`;
const VOICINGS_KEY = `${PREFIX}voicings`;

function songKey(songId: string): string {
  return `${PREFIX}song.${songId}`;
}
function notesKey(songId: string): string {
  return `${PREFIX}notes.${songId}`;
}
function metadataKey(songId: string): string {
  return `${PREFIX}meta.${songId}`;
}
function pluginKey(pluginId: string): string {
  return `${PREFIX}plugin.${pluginId}`;
}
function tourKey(tourId: string): string {
  return `${PREFIX}tour.${tourId}`;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function removeKey(key: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(key);
}

/* ---------- songs ---------- */

export function listSongIndex(): SongSummary[] {
  return readJson<SongSummary[]>(SONGS_INDEX_KEY, []);
}

function writeSongIndex(index: SongSummary[]): void {
  writeJson(SONGS_INDEX_KEY, index);
}

function upsertIndexEntry(detail: SongDetail): void {
  const index = listSongIndex();
  const entry: SongSummary = {
    songId: detail.songId,
    title: detail.title,
    updatedAt: detail.updatedAt,
    archived: detail.archived,
  };
  const i = index.findIndex((s) => s.songId === detail.songId);
  if (i >= 0) index[i] = entry;
  else index.push(entry);
  index.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  writeSongIndex(index);
}

export function getSongDetail(songId: string): SongDetail | null {
  return readJson<SongDetail | null>(songKey(songId), null);
}

export function saveSongDetail(detail: SongDetail): SongDetail {
  const stamped = { ...detail, updatedAt: new Date().toISOString() };
  writeJson(songKey(detail.songId), stamped);
  upsertIndexEntry(stamped);
  return stamped;
}

export function createSongRecord(): SongDetail {
  const now = new Date().toISOString();
  const detail: SongDetail = {
    songId: crypto.randomUUID(),
    userId: LOCAL_USER_ID,
    title: 'Untitled Song',
    createdAt: now,
    updatedAt: now,
    lastEventSequence: 0,
    archived: false,
    sections: [],
  };
  writeJson(songKey(detail.songId), detail);
  upsertIndexEntry(detail);
  return detail;
}

export function removeSongRecord(songId: string): void {
  removeKey(songKey(songId));
  removeKey(notesKey(songId));
  removeKey(metadataKey(songId));
  writeSongIndex(listSongIndex().filter((s) => s.songId !== songId));
}

/* ---------- notes ---------- */

export type LocalNote = Note & { body?: string };

export function getNotes(songId: string): LocalNote[] {
  return readJson<LocalNote[]>(notesKey(songId), []);
}

export function saveNotes(songId: string, notes: LocalNote[]): void {
  writeJson(notesKey(songId), notes);
}

/* ---------- metadata ---------- */

export function getMetadataItems(songId: string): WorkMetadataItem[] {
  return readJson<WorkMetadataItem[]>(metadataKey(songId), []);
}

export function saveMetadataItems(songId: string, items: WorkMetadataItem[]): void {
  writeJson(metadataKey(songId), items);
}

/* ---------- plugin settings ---------- */

export function getPluginSettings(pluginId: string): Record<string, unknown> {
  return readJson<Record<string, unknown>>(pluginKey(pluginId), {});
}

export function setPluginSetting(pluginId: string, key: string, value: unknown): void {
  const current = getPluginSettings(pluginId);
  current[key] = value;
  writeJson(pluginKey(pluginId), current);
}

/* ---------- tours ---------- */

export function getTourState(tourId: string): string | null {
  return readJson<string | null>(tourKey(tourId), null);
}

export function setTourState(tourId: string, status: string): void {
  writeJson(tourKey(tourId), status);
}

/* ---------- profile ---------- */

export const LOCAL_USER_ID = 'local-user';

export interface LocalProfile {
  userId: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  authorName: string | null;
  authorNameObfuscate: boolean;
  linkedAuthMethods: string[];
  createdAt: string;
  plan: string | null;
  role?: string;
}

export function getLocalProfile(): LocalProfile {
  const existing = readJson<LocalProfile | null>(PROFILE_KEY, null);
  if (existing) return existing;
  const created: LocalProfile = {
    userId: LOCAL_USER_ID,
    email: '',
    displayName: 'You',
    avatarUrl: null,
    authorName: null,
    authorNameObfuscate: false,
    linkedAuthMethods: [],
    createdAt: new Date().toISOString(),
    plan: 'local',
    role: 'standard',
  };
  writeJson(PROFILE_KEY, created);
  return created;
}

export function saveLocalProfile(profile: LocalProfile): void {
  writeJson(PROFILE_KEY, profile);
}

/* ---------- user voicings ---------- */

export function getUserVoicings<T>(): T[] {
  return readJson<T[]>(VOICINGS_KEY, []);
}

export function saveUserVoicings<T>(voicings: T[]): void {
  writeJson(VOICINGS_KEY, voicings);
}

/* ---------- storage usage ---------- */

export function estimateUsedBytes(): number {
  if (typeof window === 'undefined') return 0;
  let total = 0;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(PREFIX)) {
        total += (window.localStorage.getItem(k) ?? '').length * 2;
      }
    }
  } catch {
    /* ignore */
  }
  return total;
}

/* ---------- backup / restore ---------- */

/* ---------- Track Lab projects (metadata only; track audio lives in IndexedDB) ---------- */

/** Project row without its recordings (recordings join in from IndexedDB by projectId). */
export type LocalTrackLabProject = Omit<TrackLabProject, 'recordings'>;

function trackLabKey(songId: string): string {
  return `${PREFIX}tracklab.${songId}`;
}

export function getLocalTrackLabProjects(songId: string): LocalTrackLabProject[] {
  return readJson(trackLabKey(songId), [] as LocalTrackLabProject[]);
}

function saveLocalTrackLabProjects(songId: string, projects: LocalTrackLabProject[]): void {
  writeJson(trackLabKey(songId), projects);
}

export function upsertLocalTrackLabProject(project: LocalTrackLabProject): void {
  const projects = getLocalTrackLabProjects(project.songId);
  const idx = projects.findIndex((p) => p.projectId === project.projectId);
  if (idx >= 0) projects[idx] = project;
  else projects.push(project);
  saveLocalTrackLabProjects(project.songId, projects);
}

export function setLocalTrackLabProjectArchived(songId: string, projectId: string, archived: boolean): void {
  const projects = getLocalTrackLabProjects(songId);
  const idx = projects.findIndex((p) => p.projectId === projectId);
  if (idx < 0) return;
  projects[idx] = {
    ...projects[idx],
    archivedAt: archived ? new Date().toISOString() : null,
    updatedAt: new Date().toISOString(),
  };
  saveLocalTrackLabProjects(songId, projects);
}

export function renameLocalTrackLabProject(songId: string, projectId: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Project name cannot be empty.');
  const projects = getLocalTrackLabProjects(songId);
  const idx = projects.findIndex((p) => p.projectId === projectId);
  if (idx < 0) throw new Error('Project not found.');
  projects[idx] = { ...projects[idx], name: trimmed, updatedAt: new Date().toISOString() };
  saveLocalTrackLabProjects(songId, projects);
}

export function deleteLocalTrackLabProjectsForSong(songId: string): void {
  if (typeof window !== 'undefined') window.localStorage.removeItem(trackLabKey(songId));
}

export const BACKUP_FORMAT = 'provenance-v2-backup';
/**
 * v1: songs/notes/metadata only.
 * v2: adds recordings metadata + base64 audio (recordings/audioData).
 * v1 backups still restore; the audio fields are simply absent.
 */
export const BACKUP_VERSION = 2;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  songs: SongDetail[];
  notes: Record<string, LocalNote[]>;
  metadata: Record<string, WorkMetadataItem[]>;
  profile: LocalProfile;
  pluginSettings: Record<string, Record<string, unknown>>;
  /** Recording metadata per song (v2+; includes Track Lab track recordings). */
  recordings?: Record<string, Recording[]>;
  /** Track Lab project metadata per song (v2+). */
  trackLabProjects?: Record<string, LocalTrackLabProject[]>;
  /** Base64 audio payload per recordingId (v2+). */
  audioData?: Record<string, string>;
}

export async function buildBackup(): Promise<BackupFile> {
  const index = listSongIndex();
  const songs: SongDetail[] = [];
  const notes: Record<string, LocalNote[]> = {};
  const metadata: Record<string, WorkMetadataItem[]> = {};
  const recordings: Record<string, Recording[]> = {};
  const audioData: Record<string, string> = {};
  const trackLabProjects: Record<string, LocalTrackLabProject[]> = {};
  for (const summary of index) {
    const detail = getSongDetail(summary.songId);
    if (detail) {
      songs.push(detail);
      notes[summary.songId] = getNotes(summary.songId);
      metadata[summary.songId] = getMetadataItems(summary.songId);
      const projects = getLocalTrackLabProjects(summary.songId);
      if (projects.length > 0) trackLabProjects[summary.songId] = projects;
    }
  }
  try {
    const stored = await listAllStoredRecordings();
    const songIds = new Set(songs.map((song) => song.songId));
    for (const rec of stored) {
      if (!songIds.has(rec.songId) || !rec.blob) continue;
      const { blob, ...meta } = rec;
      (recordings[rec.songId] ??= []).push(meta);
      audioData[rec.recordingId] = await blobToBase64(blob);
    }
  } catch {
    // IndexedDB unavailable (e.g. restricted browser mode): export without audio.
  }
  const pluginSettings: Record<string, Record<string, unknown>> = {};
  if (typeof window !== 'undefined') {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(`${PREFIX}plugin.`)) {
        pluginSettings[k.slice(`${PREFIX}plugin.`.length)] = readJson(k, {});
      }
    }
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    songs,
    notes,
    metadata,
    profile: getLocalProfile(),
    pluginSettings,
    recordings,
    audioData,
    trackLabProjects,
  };
}

export interface RestoreResult {
  songsRestored: number;
}

export async function restoreBackup(raw: string): Promise<RestoreResult> {
  let parsed: BackupFile;
  try {
    parsed = JSON.parse(raw) as BackupFile;
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (parsed.format !== BACKUP_FORMAT) {
    throw new Error('That file is not a Provenance backup.');
  }
  if (typeof parsed.version !== 'number' || parsed.version > BACKUP_VERSION) {
    throw new Error('That backup is from a newer version of the app.');
  }
  if (!Array.isArray(parsed.songs)) {
    throw new Error('The backup file is missing its songs.');
  }
  let restored = 0;
  for (const song of parsed.songs) {
    if (!song || typeof song.songId !== 'string' || !Array.isArray(song.sections)) continue;
    writeJson(songKey(song.songId), song);
    upsertIndexEntry(song);
    if (parsed.notes?.[song.songId]) saveNotes(song.songId, parsed.notes[song.songId]);
    if (parsed.metadata?.[song.songId]) saveMetadataItems(song.songId, parsed.metadata[song.songId]);
    if (Array.isArray(parsed.trackLabProjects?.[song.songId])) {
      writeJson(trackLabKey(song.songId), parsed.trackLabProjects[song.songId]);
    }
    restored++;
    // v2+: restore this song's recordings (audio payload required; skip entries without it).
    const recs = parsed.recordings?.[song.songId];
    if (Array.isArray(recs)) {
      for (const rec of recs) {
        if (!rec || typeof rec.recordingId !== 'string') continue;
        const b64 = parsed.audioData?.[rec.recordingId];
        if (typeof b64 !== 'string') continue;
        try {
          await importStoredRecording(
            { ...rec, songId: song.songId },
            base64ToBlob(b64, rec.mimeType || 'audio/webm')
          );
        } catch {
          // IndexedDB unavailable: skip audio, keep the songs.
        }
      }
    }
  }
  if (parsed.pluginSettings && typeof parsed.pluginSettings === 'object') {
    for (const [pluginId, settings] of Object.entries(parsed.pluginSettings)) {
      writeJson(pluginKey(pluginId), settings);
    }
  }
  return { songsRestored: restored };
}
