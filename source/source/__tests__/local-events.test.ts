/**
 * Tests for the local event log + hash chain (port of the original
 * PostgresEventStore / HashChainService semantics).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import {
  appendLocalEvents,
  deleteLocalEventsForSong,
  getStoredEvents,
  setStoredEvents,
  sha256Hex,
  validateLocalChain,
} from '@/lib/localEvents';

const SONG = 'song-test-1';

function expectedHash(eventType: string, timestamp: string, payload: string, previousHash: string) {
  return createHash('sha256').update(eventType + timestamp + payload + previousHash, 'utf8').digest('hex');
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('sha256Hex', () => {
  it('matches known vectors', async () => {
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('matches node crypto for multi-block and non-ASCII input', async () => {
    const samples = ['x'.repeat(1000), 'héllo ☃ 世界', 'LineAddedEvent2026-10-31T17:00:00.123Z{"lineId":"a"}'];
    for (const s of samples) {
      expect(await sha256Hex(s)).toBe(createHash('sha256').update(s, 'utf8').digest('hex'));
    }
  });
});

describe('appendLocalEvents', () => {
  it('appends genesis event with empty previousHash and sequence 0', async () => {
    const [e] = await appendLocalEvents(SONG, [
      { eventType: 'SongCreatedEvent', payload: { songId: SONG }, source: 'system' },
    ]);
    expect(e!.sequenceNumber).toBe(0);
    expect(e!.previousHash).toBe('');
    expect(e!.eventHash).toBe(expectedHash('SongCreatedEvent', e!.timestamp, e!.payload, ''));
  });

  it('chains a batch of events in order', async () => {
    const appended = await appendLocalEvents(SONG, [
      { eventType: 'SongCreatedEvent', payload: { songId: SONG }, source: 'system' },
      { eventType: 'LineAddedEvent', payload: { lineId: 'l1', text: 'hello' }, source: 'typed' },
      { eventType: 'ChordAddedEvent', payload: { chordId: 'c1', chordSymbol: 'G' }, source: 'typed' },
    ]);
    expect(appended.map((e) => e.sequenceNumber)).toEqual([0, 1, 2]);
    expect(appended[1]!.previousHash).toBe(appended[0]!.eventHash);
    expect(appended[2]!.previousHash).toBe(appended[1]!.eventHash);
    expect(getStoredEvents(SONG)).toHaveLength(3);
  });

  it('continues the chain across separate appends', async () => {
    const first = await appendLocalEvents(SONG, [
      { eventType: 'SongCreatedEvent', payload: { songId: SONG }, source: 'system' },
    ]);
    const second = await appendLocalEvents(SONG, [
      { eventType: 'SongTitleSetEvent', payload: { songId: SONG, newTitle: 'T' }, source: 'typed' },
    ]);
    expect(second[0]!.sequenceNumber).toBe(1);
    expect(second[0]!.previousHash).toBe(first[0]!.eventHash);
  });
});

describe('validateLocalChain', () => {
  it('validates an empty log as valid', async () => {
    expect((await validateLocalChain([])).valid).toBe(true);
  });

  it('validates a freshly appended log', async () => {
    await appendLocalEvents(SONG, [
      { eventType: 'SongCreatedEvent', payload: { songId: SONG }, source: 'system' },
      { eventType: 'LineAddedEvent', payload: { lineId: 'l1', text: 'hi' }, source: 'typed' },
    ]);
    expect((await validateLocalChain(getStoredEvents(SONG))).valid).toBe(true);
  });

  it('detects payload tampering with the original reason', async () => {
    await appendLocalEvents(SONG, [
      { eventType: 'SongCreatedEvent', payload: { songId: SONG }, source: 'system' },
      { eventType: 'LineAddedEvent', payload: { lineId: 'l1', text: 'original' }, source: 'typed' },
    ]);
    const events = getStoredEvents(SONG);
    events[1]!.payload = JSON.stringify({ lineId: 'l1', text: 'tampered' });
    const result = await validateLocalChain(events);
    expect(result.valid).toBe(false);
    expect(result.violationEventIndex).toBe(1);
    expect(result.violationReason).toContain('Event hash does not match recomputed hash');
  });

  it('detects a broken chain link with the original reason', async () => {
    await appendLocalEvents(SONG, [
      { eventType: 'SongCreatedEvent', payload: { songId: SONG }, source: 'system' },
      { eventType: 'LineAddedEvent', payload: { lineId: 'l1', text: 'a' }, source: 'typed' },
      { eventType: 'LineAddedEvent', payload: { lineId: 'l2', text: 'b' }, source: 'typed' },
    ]);
    const events = getStoredEvents(SONG);
    events[2]!.previousHash = 'deadbeef';
    const result = await validateLocalChain(events);
    expect(result.valid).toBe(false);
    expect(result.violationEventIndex).toBe(2);
    expect(result.violationReason).toContain('Previous hash does not match');
  });

  it('detects reordering', async () => {
    await appendLocalEvents(SONG, [
      { eventType: 'SongCreatedEvent', payload: { songId: SONG }, source: 'system' },
      { eventType: 'LineAddedEvent', payload: { lineId: 'l1', text: 'a' }, source: 'typed' },
      { eventType: 'LineAddedEvent', payload: { lineId: 'l2', text: 'b' }, source: 'typed' },
    ]);
    const events = getStoredEvents(SONG);
    [events[1], events[2]] = [events[2]!, events[1]!];
    expect((await validateLocalChain(events)).valid).toBe(false);
  });
});

describe('verbatim restore', () => {
  it('a byte-identical restored log re-verifies', async () => {
    await appendLocalEvents(SONG, [
      { eventType: 'SongCreatedEvent', payload: { songId: SONG }, source: 'system' },
      { eventType: 'LineAddedEvent', payload: { lineId: 'l1', text: 'kept' }, source: 'typed' },
    ]);
    const snapshot = JSON.parse(JSON.stringify(getStoredEvents(SONG)));
    deleteLocalEventsForSong(SONG);
    expect(getStoredEvents(SONG)).toHaveLength(0);
    setStoredEvents(SONG, snapshot);
    expect((await validateLocalChain(getStoredEvents(SONG))).valid).toBe(true);
  });
});
