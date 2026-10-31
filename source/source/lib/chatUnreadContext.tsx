'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ChatUnreadContextValue = {
  unreadBySongId: Record<string, number>;
  setUnreadForSong: (songId: string, count: number) => void;
  mergeUnreadFromSummary: (items: { songId: string; unreadCount: number }[]) => void;
  clearUnreadForSong: (songId: string) => void;
};

const ChatUnreadContext = createContext<ChatUnreadContextValue | null>(null);

export function ChatUnreadProvider({ children }: { children: ReactNode }) {
  const [unreadBySongId, setUnreadBySongId] = useState<Record<string, number>>({});

  const setUnreadForSong = useCallback((songId: string, count: number) => {
    setUnreadBySongId((prev) => {
      const next = { ...prev };
      if (count <= 0) delete next[songId];
      else next[songId] = count;
      return next;
    });
  }, []);

  const mergeUnreadFromSummary = useCallback((items: { songId: string; unreadCount: number }[]) => {
    setUnreadBySongId((prev) => {
      const next = { ...prev };
      for (const it of items) {
        if (it.unreadCount > 0) next[it.songId] = it.unreadCount;
        else delete next[it.songId];
      }
      return next;
    });
  }, []);

  const clearUnreadForSong = useCallback((songId: string) => {
    setUnreadBySongId((prev) => {
      const next = { ...prev };
      delete next[songId];
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      unreadBySongId,
      setUnreadForSong,
      mergeUnreadFromSummary,
      clearUnreadForSong,
    }),
    [unreadBySongId, setUnreadForSong, mergeUnreadFromSummary, clearUnreadForSong]
  );

  return <ChatUnreadContext.Provider value={value}>{children}</ChatUnreadContext.Provider>;
}

export function useChatUnreadContext() {
  const ctx = useContext(ChatUnreadContext);
  if (!ctx) {
    throw new Error('useChatUnreadContext must be used within ChatUnreadProvider');
  }
  return ctx;
}

export function useChatUnreadCount(songId: string | undefined): number {
  const ctx = useContext(ChatUnreadContext);
  if (!ctx || !songId) return 0;
  return ctx.unreadBySongId[songId] ?? 0;
}

/** Returns null when ChatUnreadProvider is not mounted (e.g. tests). */
export function useOptionalChatUnread(): ChatUnreadContextValue | null {
  return useContext(ChatUnreadContext);
}
