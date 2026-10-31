/**
 * Regression test: pending commands must be flushed on unmount (client-side
 * navigation) instead of being silently dropped when the debounce timer is
 * cleared.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const submitBatch = vi.fn();

vi.mock('@/lib/api', () => ({
  songApi: {
    submitBatch: (...args: unknown[]) => submitBatch(...args),
  },
}));

import { useSongCommandQueue } from '@/lib/useSongCommandQueue';

const CMD = { type: 'UpdateLineText', lineId: 'l1', text: 'hello' } as never;

beforeEach(() => {
  submitBatch.mockReset();
  submitBatch.mockResolvedValue({ lastEventSequence: 1, createdIds: {} });
});

describe('useSongCommandQueue unmount flush', () => {
  it('flushes pending commands on unmount before the debounce elapses', async () => {
    const { result, unmount } = renderHook(() =>
      useSongCommandQueue({ songId: 'song-1', syncedUpToSequence: 0 })
    );
    act(() => {
      result.current.enqueue(CMD);
    });
    expect(submitBatch).not.toHaveBeenCalled();
    unmount();
    await waitFor(() => expect(submitBatch).toHaveBeenCalledTimes(1));
    expect(submitBatch.mock.calls[0][1].commands).toHaveLength(1);
  });

  it('still flushes via the debounce when not unmounted', async () => {
    const { result } = renderHook(() =>
      useSongCommandQueue({ songId: 'song-1', syncedUpToSequence: 0 })
    );
    act(() => {
      result.current.enqueue(CMD);
    });
    await waitFor(() => expect(submitBatch).toHaveBeenCalledTimes(1), { timeout: 3000 });
  });

  it('flushes pending commands on pagehide', async () => {
    const { result } = renderHook(() =>
      useSongCommandQueue({ songId: 'song-1', syncedUpToSequence: 0 })
    );
    act(() => {
      result.current.enqueue(CMD);
    });
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    await waitFor(() => expect(submitBatch).toHaveBeenCalledTimes(1));
  });
});
