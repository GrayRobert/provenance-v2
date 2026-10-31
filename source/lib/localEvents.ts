/**
 * localEvents.ts - LOCAL-FIRST append-only event log with SHA-256 hash chaining.
 *
 * Faithful port of the original hosted backend semantics (PostgresEventStore +
 * HashChainService + CertValidationService):
 *
 *   eventHash = SHA256(eventType + timestamp + exactStoredPayloadJson + previousHash)
 *
 * - Events are ordered by sequenceNumber (0-based per song).
 * - The genesis event uses "" as previousHash.
 * - The payload string stored is the exact string that was hashed; validation
 *   re-hashes the stored string (never a re-serialization), so the chain is
 *   stable across app upgrades.
 * - Validation checks link integrity (previousHash matches the previous
 *   eventHash) and payload integrity (recomputed hash matches stored hash),
 *   reporting the first violating index with the original reason strings.
 *
 * Honest scope of the local chain: it detects changes relative to the chain
 * stored in this browser. It cannot prove original creation times (no trusted
 * timestamp authority), cannot detect an owner rewriting the whole stored
 * history, and is not independently witnessed. UI copy must not imply more.
 */
import type { Event } from './types';

const PREFIX = 'prov2.';
const eventsKey = (songId: string) => `${PREFIX}events.${songId}`;

/** Stored event record: mirrors the original event_log row. */
export interface StoredEvent {
  eventId: string;
  eventType: string;
  sequenceNumber: number;
  timestamp: string;
  /** Exact JSON string written at append time; this is what gets hashed. */
  payload: string;
  source: string;
  previousHash: string;
  eventHash: string;
}

/** An event to append. Payload keys are serialized in object insertion order. */
export interface PendingEvent {
  eventType: string;
  payload: Record<string, unknown>;
  source: string;
}

/* ---------- SHA-256 ---------- */

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/** Pure-TS SHA-256 (FIPS 180-4) over UTF-8 bytes; used when WebCrypto is unavailable. */
function sha256HexSync(data: Uint8Array): string {
  const bitLenHi = Math.floor(data.length / 0x20000000);
  const bitLenLo = (data.length * 8) >>> 0;
  const paddedLen = (((data.length + 8) >> 6) + 1) << 6;
  const buf = new Uint8Array(paddedLen);
  buf.set(data);
  buf[data.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(paddedLen - 4, bitLenLo);
  view.setUint32(paddedLen - 8, bitLenHi);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let block = 0; block < paddedLen; block += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(block + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^ ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^ (w[i - 15] >>> 3);
      const s1 = ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^ ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + SHA256_K[i]! + w[i]!) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  [h0, h1, h2, h3, h4, h5, h6, h7].forEach((hh, i) => ov.setUint32(i * 4, hh));
  return Array.from(out, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 hex of a string, via WebCrypto when available, else the pure-TS fallback. */
export async function sha256Hex(message: string): Promise<string> {
  const data = new TextEncoder().encode(message);
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    try {
      const digest = await subtle.digest('SHA-256', data as BufferSource);
      return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // fall through to the pure-TS implementation
    }
  }
  return sha256HexSync(data);
}

/* ---------- storage ---------- */

function readEvents(songId: string): StoredEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(eventsKey(songId));
    if (raw == null) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredEvent[]) : [];
  } catch {
    return [];
  }
}

export function getStoredEvents(songId: string): StoredEvent[] {
  return readEvents(songId);
}

/** Overwrites the stored log verbatim (backup restore). No re-hashing: the exact
 *  stored strings are what the chain is made of, so a restored log re-verifies
 *  only if it is byte-identical to what was appended. */
export function setStoredEvents(songId: string, events: StoredEvent[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(eventsKey(songId), JSON.stringify(events));
}

export function deleteLocalEventsForSong(songId: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(eventsKey(songId));
}

/* ---------- append ---------- */

function randomId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Appends events to a song's log with chain hashing. The whole batch is hashed
 * in memory and written with a single localStorage write: either every event in
 * the batch is persisted or none is. A storage failure throws, so callers can
 * abort the surrounding edit instead of silently dropping history.
 */
export async function appendLocalEvents(
  songId: string,
  pending: PendingEvent[]
): Promise<StoredEvent[]> {
  if (pending.length === 0) return [];
  const existing = readEvents(songId);
  let previousHash = existing.length > 0 ? existing[existing.length - 1]!.eventHash : '';
  let sequenceNumber = existing.length > 0 ? existing[existing.length - 1]!.sequenceNumber + 1 : 0;
  const appended: StoredEvent[] = [];
  for (const p of pending) {
    const timestamp = new Date().toISOString();
    const payload = JSON.stringify(p.payload);
    const eventHash = await sha256Hex(p.eventType + timestamp + payload + previousHash);
    appended.push({
      eventId: randomId(),
      eventType: p.eventType,
      sequenceNumber: sequenceNumber++,
      timestamp,
      payload,
      source: p.source,
      previousHash,
      eventHash,
    });
    previousHash = eventHash;
  }
  // Single write: throws (e.g. quota) before anything is persisted.
  setStoredEvents(songId, [...existing, ...appended]);
  return appended;
}

/* ---------- validation ---------- */

export interface LocalChainValidation {
  valid: boolean;
  violationEventIndex?: number;
  violationReason?: string;
}

/** Recomputes the chain from stored strings. Empty logs validate as valid. */
export async function validateLocalChain(events: StoredEvent[]): Promise<LocalChainValidation> {
  let expectedPreviousHash = '';
  for (let i = 0; i < events.length; i++) {
    const entity = events[i]!;
    if (entity.previousHash !== expectedPreviousHash) {
      return {
        valid: false,
        violationEventIndex: i,
        violationReason:
          'Previous hash does not match the hash of the previous event (chain link broken or events reordered).',
      };
    }
    const computedHash = await sha256Hex(
      entity.eventType + entity.timestamp + entity.payload + expectedPreviousHash
    );
    if (entity.eventHash !== computedHash) {
      return {
        valid: false,
        violationEventIndex: i,
        violationReason: 'Event hash does not match recomputed hash (event payload may have been altered).',
      };
    }
    expectedPreviousHash = entity.eventHash;
  }
  return { valid: true };
}

/* ---------- conversion ---------- */

/** Maps stored rows to the public Event shape the timeline UI consumes. */
export function toPublicEvents(stored: StoredEvent[]): Event[] {
  return stored.map((e) => ({
    eventId: e.eventId,
    eventType: e.eventType,
    sequenceNumber: e.sequenceNumber,
    timestamp: e.timestamp,
    payload: e.payload,
    source: e.source,
    eventHash: e.eventHash,
    previousHash: e.previousHash,
  }));
}
