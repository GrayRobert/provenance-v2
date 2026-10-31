'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { songApi } from './api';
import type { BatchCommand, BatchCommandRequest, BatchCommandResponse } from './batch-types';

const FLUSH_DELAY_MS = 1000;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 1000;
const CONFLICT_RETRY_DELAY_MS = 2000;
const MAX_CONFLICT_ROUNDS = 3;

export interface UseSongCommandQueueOptions {
  songId: string;
  /** Initial value (e.g. from getSong().lastEventSequence). Updated after successful flush. */
  syncedUpToSequence: number;
  onSyncedSequenceChange?: (sequence: number) => void;
  /** Called after successful flush with created IDs (for patching local state if needed). */
  onFlushSuccess?: (response: BatchCommandResponse) => void;
  /** Called on 409 after all retries are exhausted; consumer can update local state. */
  onConflict?: (lastEventSequence: number) => void;
}

export interface UseSongCommandQueueResult {
  enqueue: (command: BatchCommand) => void;
  /** Current pending command count. */
  pendingCount: number;
  /** Last known synced sequence (from initial load or last successful flush). */
  syncedUpToSequence: number;
  /** Flush immediately (e.g. before navigate or on visibility change). */
  flush: () => Promise<void>;
  /** Call after refetch to set new base sequence before retry (e.g. after 409). */
  setSyncedUpToSequence: (seq: number) => void;
}

export function useSongCommandQueue({
  songId,
  syncedUpToSequence: initialSynced,
  onSyncedSequenceChange,
  onFlushSuccess,
  onConflict,
}: UseSongCommandQueueOptions): UseSongCommandQueueResult {
  const [pendingCount, setPendingCount] = useState(0);
  const [syncedUpToSequence, setSyncedUpToSequence] = useState(initialSynced);
  const syncedSeqRef = useRef(initialSynced);
  syncedSeqRef.current = syncedUpToSequence;
  const queueRef = useRef<BatchCommand[]>([]);
  useEffect(() => {
    setSyncedUpToSequence(initialSynced);
    syncedSeqRef.current = initialSynced;
  }, [initialSynced]);
  const flushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFlushingRef = useRef(false);
  const flushFnRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const conflictRoundsRef = useRef(0);

  useEffect(() => {
    return () => {
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
        flushTimeoutRef.current = null;
      }
    };
  }, []);

  const flush = useCallback(async () => {
    if (isFlushingRef.current || queueRef.current.length === 0) return;
    isFlushingRef.current = true;
    const toSend = [...queueRef.current];
    queueRef.current = [];
    setPendingCount(0);

    let expectedSeq = syncedSeqRef.current;
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const request: BatchCommandRequest = {
          commands: toSend,
          expectedAfterSequence: expectedSeq,
        };
        const response = await songApi.submitBatch(songId, request);
        setSyncedUpToSequence(response.lastEventSequence);
        syncedSeqRef.current = response.lastEventSequence;
        onSyncedSequenceChange?.(response.lastEventSequence);
        onFlushSuccess?.(response);
        isFlushingRef.current = false;
        conflictRoundsRef.current = 0;
        return;
      } catch (err: unknown) {
        lastError = err;
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 409) {
          const body = (err as { response?: { data?: { lastEventSequence?: number } } })?.response?.data;
          const lastSeq = body?.lastEventSequence ?? 0;
          expectedSeq = lastSeq;
          syncedSeqRef.current = lastSeq;
          if (attempt < MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
          }
          continue;
        }
        if (status != null && status >= 400 && status < 500) {
          queueRef.current = toSend;
          setPendingCount(toSend.length);
          isFlushingRef.current = false;
          throw err;
        }
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS * Math.pow(2, attempt)));
        }
      }
    }

    queueRef.current = toSend;
    setPendingCount(toSend.length);
    isFlushingRef.current = false;

    const lastStatus = (lastError as { response?: { status?: number } })?.response?.status;
    if (lastStatus === 409) {
      const body = (lastError as { response?: { data?: { lastEventSequence?: number } } })?.response?.data;
      const lastSeq = body?.lastEventSequence ?? 0;
      setSyncedUpToSequence(lastSeq);
      syncedSeqRef.current = lastSeq;
      onConflict?.(lastSeq);

      conflictRoundsRef.current++;
      if (conflictRoundsRef.current <= MAX_CONFLICT_ROUNDS) {
        if (flushTimeoutRef.current) clearTimeout(flushTimeoutRef.current);
        flushTimeoutRef.current = setTimeout(() => {
          flushTimeoutRef.current = null;
          void flushFnRef.current?.();
        }, CONFLICT_RETRY_DELAY_MS);
      } else {
        conflictRoundsRef.current = 0;
      }
      return;
    }
    throw lastError;
  }, [songId, onSyncedSequenceChange, onFlushSuccess, onConflict]);

  flushFnRef.current = flush;

  const scheduleFlush = useCallback(() => {
    if (flushTimeoutRef.current) clearTimeout(flushTimeoutRef.current);
    flushTimeoutRef.current = setTimeout(() => {
      flushTimeoutRef.current = null;
      void flush();
    }, FLUSH_DELAY_MS);
  }, [flush]);

  const enqueue = useCallback(
    (command: BatchCommand) => {
      queueRef.current.push(command);
      setPendingCount(queueRef.current.length);
      scheduleFlush();
    },
    [scheduleFlush]
  );

  const setSynced = useCallback((seq: number) => {
    setSyncedUpToSequence(seq);
    syncedSeqRef.current = seq;
  }, []);

  return { enqueue, pendingCount, syncedUpToSequence, flush, setSyncedUpToSequence: setSynced };
}
