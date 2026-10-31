/**
 * localRecordings - IndexedDB-backed audio storage for the local-first build.
 *
 * Audio blobs are far too big for localStorage, so recordings live in
 * IndexedDB while song structure stays in localStorage (see localDb).
 * Recording metadata and its blob are stored in one row so they cannot
 * drift apart. Playback URLs are blob: object URLs kept in an in-memory
 * cache, warmed whenever a song's recordings are listed.
 */
import type { Recording } from './types';

const DB_NAME = 'prov2-audio';
const DB_VERSION = 1;
const STORE = 'recordings';

export interface StoredRecording extends Recording {
  blob: Blob;
}

/* ---------- object URL cache (playback) ---------- */

const urlCache = new Map<string, string>();

function cacheUrl(recordingId: string, blob: Blob): string {
  const existing = urlCache.get(recordingId);
  if (existing) return existing;
  const url = URL.createObjectURL(blob);
  urlCache.set(recordingId, url);
  return url;
}

function dropUrl(recordingId: string): void {
  const existing = urlCache.get(recordingId);
  if (existing) {
    URL.revokeObjectURL(existing);
    urlCache.delete(recordingId);
  }
}

/** Sync lookup used by songApi.getRecordingArtifactUrl. Warmed by list/save. */
export function getCachedRecordingUrl(recordingId: string): string | null {
  return urlCache.get(recordingId) ?? null;
}

/* ---------- IndexedDB plumbing ---------- */

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser does not support local audio storage (IndexedDB).'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'recordingId' });
        store.createIndex('songId', 'songId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open local audio storage.'));
  });
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Local audio storage operation failed.'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Local audio storage operation failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('Local audio storage operation aborted.'));
  });
}

async function getStored(recordingId: string): Promise<StoredRecording | null> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readonly');
    const rec = await requestToPromise(tx.objectStore(STORE).get(recordingId));
    return (rec as StoredRecording | undefined) ?? null;
  } finally {
    db.close();
  }
}

async function allStored(): Promise<StoredRecording[]> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readonly');
    const rows = await requestToPromise(tx.objectStore(STORE).getAll());
    return (rows as StoredRecording[]) ?? [];
  } finally {
    db.close();
  }
}

/* ---------- public API ---------- */

function toMetadata(rec: StoredRecording): Recording {
  const { blob: _blob, ...meta } = rec;
  return meta;
}

function sortRecordings(list: Recording[]): Recording[] {
  return [...list].sort((a, b) => {
    if (a.trackIndex !== b.trackIndex) return a.trackIndex - b.trackIndex;
    return (a.updatedAt ?? '').localeCompare(b.updatedAt ?? '');
  });
}

/** List a song's recordings (newest object URLs warmed for playback). */
export async function listLocalRecordings(songId: string): Promise<Recording[]> {
  const rows = (await allStored()).filter((r) => r.songId === songId);
  for (const row of rows) {
    if (row.blob) cacheUrl(row.recordingId, row.blob);
  }
  return sortRecordings(rows.map(toMetadata));
}

export interface SaveRecordingOptions {
  sectionId?: string | null;
  trackIndex?: number;
  label?: string;
  durationSeconds?: number;
}

async function sha256Hex(blob: Blob): Promise<string> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return '';
  }
}

/**
 * Save a recording for a song. Section recordings keep one primary per section:
 * earlier active recordings for that section are archived, and the label gets a
 * version suffix ("Verse 1 v2") to match the original app's display format.
 */
export async function saveLocalRecording(
  songId: string,
  blob: Blob,
  options: SaveRecordingOptions = {}
): Promise<Recording> {
  const now = new Date().toISOString();
  const sectionId = options.sectionId ?? null;
  const existing = (await allStored()).filter((r) => r.songId === songId);

  let label = options.label ?? null;
  if (sectionId) {
    const sectionRecs = existing.filter((r) => r.sectionId === sectionId);
    const version = sectionRecs.length + 1;
    const base = label?.trim() || 'Section recording';
    label = `${base} v${version}`;
    // Archive the previous primary(s) for this section.
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      for (const rec of sectionRecs) {
        if (!rec.archivedAt) {
          await requestToPromise(store.put({ ...rec, archivedAt: now, updatedAt: now }));
        }
      }
      await txDone(tx);
    } finally {
      db.close();
    }
  }

  const recordingId = crypto.randomUUID();
  const trackIndex =
    options.trackIndex ?? (existing.length ? Math.max(...existing.map((r) => r.trackIndex)) + 1 : 0);
  const record: StoredRecording = {
    recordingId,
    songId,
    sectionId,
    artifactId: recordingId,
    contentHash: await sha256Hex(blob),
    mimeType: blob.type || 'audio/webm',
    sizeBytes: blob.size,
    trackIndex,
    label,
    durationSeconds: options.durationSeconds ?? null,
    updatedAt: now,
    archivedAt: null,
    projectId: null,
    blob,
  };
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    await requestToPromise(tx.objectStore(STORE).put(record));
    await txDone(tx);
  } finally {
    db.close();
  }
  cacheUrl(recordingId, blob);
  return toMetadata(record);
}

export async function setLocalRecordingArchived(recordingId: string, archived: boolean): Promise<void> {
  const rec = await getStored(recordingId);
  if (!rec) return;
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    await requestToPromise(
      tx.objectStore(STORE).put({
        ...rec,
        archivedAt: archived ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString(),
      })
    );
    await txDone(tx);
  } finally {
    db.close();
  }
}

export async function deleteLocalRecordingsForSong(songId: string): Promise<void> {
  const rows = (await allStored()).filter((r) => r.songId === songId);
  if (rows.length === 0) return;
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const row of rows) {
      dropUrl(row.recordingId);
      await requestToPromise(store.delete(row.recordingId));
    }
    await txDone(tx);
  } finally {
    db.close();
  }
}

/* ---------- backup / restore ---------- */

/** Total bytes of audio stored on this device (from recording metadata). */
export async function getLocalAudioBytes(): Promise<number> {
  const rows = await allStored();
  return rows.reduce((sum, r) => sum + (r.sizeBytes || 0), 0);
}

export async function listAllStoredRecordings(): Promise<StoredRecording[]> {
  return allStored();
}

export async function importStoredRecording(rec: Recording, blob: Blob): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    await requestToPromise(tx.objectStore(STORE).put({ ...rec, blob }));
    await txDone(tx);
  } finally {
    db.close();
  }
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}
