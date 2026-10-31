/* eslint-disable @next/next/no-img-element -- external avatar URLs; match CollaborationBar */
'use client';

import { collaborationApi, effectiveAvatarUrl, songChatApi } from '@/lib/api';
import { avatarFallbackText } from '@/lib/avatarFallback';
import { useOptionalChatUnread } from '@/lib/chatUnreadContext';
import { formatChatRelativeTime } from '@/lib/formatChatRelativeTime';
import { accountDisplayLabel, chatMessageAuthorLabel } from '@/lib/profileDisplayName';
import { useAuthStore } from '@/lib/store';
import type { ChatMessageView, ChatReaderMini, SongPresence } from '@/lib/types';
import { getClerkToken } from '@/lib/clerkTokenProvider';
import { cn } from '@/lib/utils';
import { Check, Send } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

const POLL_MS = 45_000;
/** Initial + each “scroll up” history page */
const CHAT_PAGE_SIZE = 50;
/** Load older when within this many px of the top */
const LOAD_OLDER_SCROLL_THRESHOLD_PX = 72;
/** Treat as “at bottom” for auto-follow on new messages */
const STICK_TO_BOTTOM_THRESHOLD_PX = 100;
/** Collapse read/read-state bursts from SSE + state updates */
const MARK_READ_DEBOUNCE_MS = 500;
/** Refresh relative timestamps in the list */
const RELATIVE_TIME_TICK_MS = 60_000;

/** Match AppHeader profile avatar (orange “flash” / you). */
const avatarYouImgClass = 'ring-2 ring-accent/30';
const avatarYouFallbackColors =
  'bg-accent/20 text-accent ring-2 ring-accent/30 font-medium';

/** Match others’ message stripe (sky); distinct from profile orange. */
const avatarOtherImgClass = 'ring-2 ring-sky-500/45 dark:ring-sky-400/50';
/** Thinner ring for ≤20px avatars (online chips, read facepile). */
const avatarOtherImgClassSm = 'ring-1 ring-sky-500/45 dark:ring-sky-400/50';
const avatarOtherFallbackColors =
  'bg-sky-500/15 text-sky-800 ring-2 ring-sky-500/45 dark:bg-sky-500/20 dark:text-sky-200 dark:ring-sky-400/50 font-medium';
const avatarOtherFallbackColorsSm =
  'bg-sky-500/15 text-sky-800 ring-1 ring-sky-500/45 dark:bg-sky-500/20 dark:text-sky-200 dark:ring-sky-400/50 font-medium';

function usePointerCoarse(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const upd = () => setCoarse(mq.matches);
    upd();
    mq.addEventListener('change', upd);
    return () => mq.removeEventListener('change', upd);
  }, []);
  return coarse;
}

function PresenceNameTooltip({ label, children }: { label: string; children: ReactNode }) {
  const coarse = usePointerCoarse();
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className="inline-flex touch-manipulation rounded-full p-0 outline-none focus-visible:ring-2 focus-visible:ring-muted-foreground/45"
        aria-label={label}
        onMouseEnter={() => !coarse && setOpen(true)}
        onMouseLeave={() => !coarse && setOpen(false)}
        onFocus={() => !coarse && setOpen(true)}
        onBlur={() => !coarse && setOpen(false)}
        onClick={() => coarse && setOpen((o) => !o)}
      >
        {children}
      </button>
      {open && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-1/2 top-full z-50 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
        >
          {label}
        </span>
      )}
    </span>
  );
}

function readerMiniLabel(r: ChatReaderMini): string {
  return accountDisplayLabel({
    displayName: r.authorDisplayName,
    authorEmail: r.authorEmail,
    authorUsername: r.authorUsername,
  });
}

function readerMiniInitials(r: ChatReaderMini): string {
  return avatarFallbackText(
    r.authorDisplayName ?? null,
    r.authorEmail?.split('@')[0] ?? r.authorUsername ?? undefined
  );
}

function presenceAccountLabel(p: SongPresence): string {
  return accountDisplayLabel({
    displayName: p.displayName,
    authorName: p.authorName,
    authorEmail: p.email,
    authorUsername: null,
  });
}

interface SongChatTabProps {
  songId: string;
  isReadOnly: boolean;
  isActive: boolean;
}

export function SongChatTab({ songId, isReadOnly, isActive }: SongChatTabProps) {
  const { user } = useAuthStore();
  const chatUnread = useOptionalChatUnread();
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [presence, setPresence] = useState<SongPresence[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  /** Wall clock for relative labels; updates on interval / visibility */
  const [relativeNowMs, setRelativeNowMs] = useState(() => Date.now());
  const [chatParticipantIds, setChatParticipantIds] = useState<string[]>([]);
  const [chatParticipantsLoaded, setChatParticipantsLoaded] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const songIdRef = useRef(songId);
  songIdRef.current = songId;
  const scrollPreserveRef = useRef<{ h: number; t: number } | null>(null);
  const scrollToBottomRef = useRef(false);
  /** When the list is shorter than the viewport, chain loadOlder until it scrolls or history ends (cap). */
  const fillViewportOlderAttemptsRef = useRef(0);
  const lastSeqRef = useRef(0);
  const esRef = useRef<EventSource | null>(null);
  /** Highest sequence we already synced read state for (avoids spamming POST /read on every messages refresh). */
  const lastAcknowledgedSeqRef = useRef(0);
  const messagesRef = useRef<ChatMessageView[]>([]);
  const markReadDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const presenceByUserId = Object.fromEntries(presence.map((p) => [p.userId, p]));

  const chatParticipantIdSet = useMemo(() => new Set(chatParticipantIds), [chatParticipantIds]);

  messagesRef.current = messages;

  useEffect(() => {
    lastAcknowledgedSeqRef.current = 0;
    fillViewportOlderAttemptsRef.current = 0;
    setChatParticipantIds([]);
    setChatParticipantsLoaded(false);
  }, [songId]);

  const syncChatParticipants = useCallback(async () => {
    const targetSong = songId;
    try {
      const ids = await collaborationApi.getChatParticipants(targetSong);
      if (songIdRef.current !== targetSong) return;
      setChatParticipantIds(ids);
    } catch {
      if (songIdRef.current === targetSong) setChatParticipantIds([]);
    } finally {
      if (songIdRef.current === targetSong) setChatParticipantsLoaded(true);
    }
  }, [songId]);

  const flushMarkAsRead = useCallback(async () => {
    if (!isActive || !user?.userId) return;
    const list = messagesRef.current;
    const others = list.filter((m) => m.userId !== user.userId && !m.archived);
    const chainMax = lastSeqRef.current;

    if (others.length === 0) {
      if (chainMax <= lastAcknowledgedSeqRef.current) return;
      await songChatApi.updateReadState(songId, chainMax).catch(() => {});
      lastAcknowledgedSeqRef.current = chainMax;
      return;
    }

    const maxOtherSeq = Math.max(...others.map((m) => m.sequenceNumber));
    if (maxOtherSeq <= lastAcknowledgedSeqRef.current) return;

    const ids = others.map((m) => m.messageId);
    await songChatApi.markRead(songId, ids).catch(() => {});
    const maxSeq = Math.max(maxOtherSeq, chainMax);
    await songChatApi.updateReadState(songId, maxSeq).catch(() => {});
    lastAcknowledgedSeqRef.current = maxSeq;
    chatUnread?.clearUnreadForSong(songId);
  }, [isActive, songId, user?.userId, chatUnread]);

  const scheduleMarkAsRead = useCallback(() => {
    if (markReadDebounceRef.current) clearTimeout(markReadDebounceRef.current);
    markReadDebounceRef.current = setTimeout(() => {
      markReadDebounceRef.current = null;
      void flushMarkAsRead();
    }, MARK_READ_DEBOUNCE_MS);
  }, [flushMarkAsRead]);

  const loadMessages = useCallback(async () => {
    const targetSong = songId;
    try {
      const list = await songChatApi.getMessages(targetSong, {
        limit: CHAT_PAGE_SIZE,
        includeArchived: false,
      });
      if (songIdRef.current !== targetSong) return;
      scrollToBottomRef.current = true;
      setMessages(list);
      lastSeqRef.current = list.reduce((m, x) => Math.max(m, x.sequenceNumber), 0);
      setHasMoreOlder(list.length >= CHAT_PAGE_SIZE);
      setLoadError(null);
      queueMicrotask(() => scheduleMarkAsRead());
    } catch {
      if (songIdRef.current === targetSong) setLoadError('Could not load chat.');
    }
  }, [songId, scheduleMarkAsRead]);

  const refreshIncremental = useCallback(async () => {
    const targetSong = songId;
    const el = listRef.current;
    const wasNearBottom = el
      ? el.scrollHeight - el.scrollTop - el.clientHeight < STICK_TO_BOTTOM_THRESHOLD_PX
      : true;
    try {
      const after = lastSeqRef.current;
      const list = await songChatApi.getMessages(targetSong, {
        afterSequence: after,
        includeArchived: false,
      });
      if (songIdRef.current !== targetSong || list.length === 0) return;
      if (wasNearBottom) scrollToBottomRef.current = true;
      setMessages((prev) => {
        const byId = new Map(prev.map((m) => [m.messageId, m]));
        for (const m of list) byId.set(m.messageId, m);
        return [...byId.values()].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
      });
      lastSeqRef.current = Math.max(lastSeqRef.current, ...list.map((m) => m.sequenceNumber));
      queueMicrotask(() => scheduleMarkAsRead());
    } catch {
      /* ignore */
    }
  }, [songId, scheduleMarkAsRead]);

  const loadOlder = useCallback(async () => {
    if (!hasMoreOlder || loadingOlder) return;
    const targetSong = songId;
    const list = messagesRef.current;
    if (list.length === 0) return;
    const minSeq = Math.min(...list.map((m) => m.sequenceNumber));
    const el = listRef.current;
    if (!el) return;
    setLoadingOlder(true);
    try {
      const older = await songChatApi.getMessages(targetSong, {
        beforeSequence: minSeq,
        limit: CHAT_PAGE_SIZE,
        includeArchived: false,
      });
      if (songIdRef.current !== targetSong) return;
      if (older.length === 0) {
        setHasMoreOlder(false);
        return;
      }
      if (older.length < CHAT_PAGE_SIZE) setHasMoreOlder(false);
      scrollPreserveRef.current = { h: el.scrollHeight, t: el.scrollTop };
      setMessages((prev) => {
        const byId = new Map(prev.map((m) => [m.messageId, m]));
        for (const m of older) byId.set(m.messageId, m);
        return [...byId.values()].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
      });
    } catch {
      /* ignore */
    } finally {
      if (songIdRef.current === targetSong) setLoadingOlder(false);
    }
  }, [songId, hasMoreOlder, loadingOlder]);

  const onListScroll = useCallback(() => {
    const el = listRef.current;
    if (!el || loadingOlder || !hasMoreOlder) return;
    const canScroll = el.scrollHeight > el.clientHeight + 8;
    if (canScroll && el.scrollTop <= LOAD_OLDER_SCROLL_THRESHOLD_PX) void loadOlder();
  }, [loadOlder, loadingOlder, hasMoreOlder]);

  const syncPresence = useCallback(async () => {
    try {
      const p = await collaborationApi.getPresence(songId);
      setPresence(p);
    } catch {
      /* ignore */
    }
  }, [songId]);

  useEffect(() => {
    return () => {
      if (markReadDebounceRef.current) {
        clearTimeout(markReadDebounceRef.current);
        markReadDebounceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => setRelativeNowMs(Date.now()), RELATIVE_TIME_TICK_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') setRelativeNowMs(Date.now());
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;
    loadMessages();
    syncPresence();
    void syncChatParticipants();
    collaborationApi.heartbeat(songId).catch(() => {});
  }, [isActive, loadMessages, syncPresence, syncChatParticipants, songId]);

  useEffect(() => {
    if (!isActive) return;
    let inFlight = false;
    const t = setInterval(() => {
      if (inFlight) return;
      inFlight = true;
      Promise.all([
        refreshIncremental(),
        syncPresence(),
        syncChatParticipants(),
        songChatApi.getUnreadCount(songId).then((n) => {
          if (n > 0) chatUnread?.setUnreadForSong(songId, n);
        }),
      ]).finally(() => { inFlight = false; });
    }, POLL_MS);
    return () => clearInterval(t);
  }, [isActive, refreshIncremental, syncPresence, syncChatParticipants, songId, chatUnread]);

  useEffect(() => {
    if (!isActive) return;
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        refreshIncremental();
        syncPresence();
        scheduleMarkAsRead();
      }
    };
    const onFocus = () => {
      refreshIncremental();
      scheduleMarkAsRead();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
  }, [isActive, refreshIncremental, syncPresence, scheduleMarkAsRead]);

  useEffect(() => {
    if (!isActive) {
      esRef.current?.close();
      esRef.current = null;
      return;
    }
    let cancelled = false;
    (async () => {
      const token = (await getClerkToken()) ?? (typeof window !== 'undefined' ? localStorage.getItem('jwt') : null);
      if (!token || cancelled) return;
      if (cancelled) return;
      const url = songChatApi.songStreamUrl(songId, token);
      const es = new EventSource(url);
      if (cancelled) {
        es.close();
        return;
      }
      esRef.current = es;
      es.addEventListener('chat', (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data as string) as { sequenceNumber?: number };
          if (typeof data.sequenceNumber === 'number') {
            refreshIncremental();
          }
        } catch {
          refreshIncremental();
        }
      });
      es.onerror = () => {
        /* EventSource reconnects; also rely on poll */
      };
    })();
    return () => {
      cancelled = true;
      esRef.current?.close();
      esRef.current = null;
    };
  }, [isActive, songId, refreshIncremental]);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || !isActive) return;
    const preserve = scrollPreserveRef.current;
    if (preserve) {
      scrollPreserveRef.current = null;
      el.scrollTop = preserve.t + (el.scrollHeight - preserve.h);
      return;
    }
    if (scrollToBottomRef.current) {
      scrollToBottomRef.current = false;
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, isActive]);

  /** If history may extend past the first page but the list doesn’t overflow, fetch older until it does or we hit the cap. */
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || !isActive || loadingOlder || !hasMoreOlder || messages.length === 0) return;
    if (el.scrollHeight > el.clientHeight + 8) {
      fillViewportOlderAttemptsRef.current = 0;
      return;
    }
    if (fillViewportOlderAttemptsRef.current >= 15) return;
    fillViewportOlderAttemptsRef.current += 1;
    void loadOlder();
  }, [messages, isActive, hasMoreOlder, loadingOlder, loadOlder]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || isReadOnly || sending) return;
    setSending(true);
    try {
      const msg = await songChatApi.postMessage(songId, text);
      setDraft('');
      scrollToBottomRef.current = true;
      setMessages((prev) => [...prev.filter((m) => m.messageId !== msg.messageId), msg].sort((a, b) => a.sequenceNumber - b.sequenceNumber));
      lastSeqRef.current = Math.max(lastSeqRef.current, msg.sequenceNumber);
    } catch {
      setLoadError('Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <div className="shrink-0 flex flex-wrap items-center gap-2 border-b border-border pb-2">
        {presence.filter((p) => p.userId !== user?.userId).length > 0 ? (
          <>
            <span className="text-xs text-muted-foreground">Online</span>
            {presence
              .filter((p) => p.userId !== user?.userId)
              .map((p) => {
                const src = effectiveAvatarUrl(p.avatarUrl);
                const tip = presenceAccountLabel(p);
                const initials = avatarFallbackText(
                  p.displayName ?? null,
                  p.email?.split('@')[0] ?? undefined
                );
                return (
                  <PresenceNameTooltip key={p.userId} label={tip}>
                    {src ? (
                      <img
                        src={src}
                        alt=""
                        className={cn('size-5 rounded-full object-cover', avatarOtherImgClassSm)}
                      />
                    ) : (
                      <span
                        className={cn(
                          'flex size-5 shrink-0 items-center justify-center rounded-full leading-none text-[10px]',
                          avatarOtherFallbackColorsSm
                        )}
                      >
                        {initials}
                      </span>
                    )}
                  </PresenceNameTooltip>
                );
              })}
          </>
        ) : (
          <span className="text-xs text-muted-foreground">Online: Just you</span>
        )}
      </div>

      {loadError && <p className="shrink-0 text-sm text-destructive">{loadError}</p>}

      <div
        ref={listRef}
        onScroll={onListScroll}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-2 touch-pan-y"
        style={{ WebkitOverflowScrolling: 'touch' } as CSSProperties}
      >
        {loadingOlder && (
          <p className="text-center text-xs text-muted-foreground" aria-live="polite">
            Loading older messages…
          </p>
        )}
        {messages.length === 0 && !loadError && (
          <p className="text-sm text-muted-foreground">No messages yet. Say hello to your team.</p>
        )}
        {messages.map((m) => {
          const mine = m.userId === user?.userId;
          const avatarSrc = effectiveAvatarUrl(m.avatarUrl);
          const senderLabel = mine ? null : chatMessageAuthorLabel(m);
          const senderInitials = avatarFallbackText(
            m.authorDisplayName ?? null,
            mine
              ? (m.authorUsername ?? user?.email)
              : (m.authorEmail ?? m.authorUsername ?? undefined)
          );
          /** Prefer chat-participant ids; if the list is empty after load, fall back to who is online (same song). */
          let eligibleRecipients: string[] = [];
          if (!chatParticipantsLoaded) {
            eligibleRecipients = [];
          } else if (chatParticipantIds.length > 0) {
            eligibleRecipients = chatParticipantIds.filter((id) => id !== m.userId);
          } else {
            eligibleRecipients = presence.filter((p) => p.userId !== user?.userId).map((p) => p.userId);
          }
          const readIds = new Set(
            m.readByReaders && m.readByReaders.length > 0
              ? m.readByReaders.map((r) => r.userId)
              : m.readByUserIds
          );
          const readerInScope = (uid: string) => {
            if (uid === m.userId) return false;
            if (chatParticipantIds.length > 0) return chatParticipantIdSet.has(uid);
            if (eligibleRecipients.length > 0) return eligibleRecipients.includes(uid);
            return true;
          };

          let readersForPile: ChatReaderMini[] = [];
          if (m.readByReaders && m.readByReaders.length > 0) {
            readersForPile = m.readByReaders.filter((r) => readerInScope(r.userId));
          } else {
            readersForPile = m.readByUserIds
              .filter((id) => readerInScope(id))
              .map((id) => {
                const pr = presenceByUserId[id];
                const row: ChatReaderMini = {
                  userId: id,
                  authorDisplayName: pr?.displayName ?? null,
                  authorEmail: pr?.email ?? null,
                  authorUsername: null,
                  avatarUrl: pr?.avatarUrl ?? null,
                };
                return row;
              });
          }
          readersForPile = [...readersForPile].sort((a, b) => a.userId.localeCompare(b.userId));

          let readCount = 0;
          for (const id of eligibleRecipients) {
            if (readIds.has(id)) readCount++;
          }

          let tickLeftGreen = false;
          let tickRightGreen = false;
          if (mine) {
            if (!chatParticipantsLoaded) {
              tickLeftGreen = false;
              tickRightGreen = false;
            } else if (eligibleRecipients.length === 0) {
              tickLeftGreen = true;
              tickRightGreen = true;
            } else if (readCount === 0) {
              tickLeftGreen = false;
              tickRightGreen = false;
            } else if (readCount === eligibleRecipients.length) {
              tickLeftGreen = true;
              tickRightGreen = true;
            } else {
              tickLeftGreen = true;
              tickRightGreen = false;
            }
          }

          const readTooltip = mine
            ? !chatParticipantsLoaded
              ? 'Read status loading…'
              : eligibleRecipients.length === 0
                ? 'Sent'
                : readCount === 0
                  ? 'Not read yet'
                  : readCount === eligibleRecipients.length
                    ? `Read by ${readersForPile.map((r) => readerMiniLabel(r)).join(', ')}`
                    : `Read by ${readersForPile.map((r) => readerMiniLabel(r)).join(', ')} (not everyone yet)`
            : '';

          const now = new Date(relativeNowMs);
          return (
            <div key={m.messageId} className={cn('flex gap-2', mine ? 'flex-row-reverse' : 'flex-row')}>
              <div className="shrink-0 pt-0.5">
                {avatarSrc ? (
                  <img
                    src={avatarSrc}
                    alt=""
                    className={cn(
                      'size-8 rounded-full object-cover',
                      mine ? avatarYouImgClass : avatarOtherImgClass
                    )}
                  />
                ) : (
                  <div
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-full text-xs leading-none',
                      mine ? avatarYouFallbackColors : avatarOtherFallbackColors
                    )}
                  >
                    {senderInitials}
                  </div>
                )}
              </div>
              <div className={cn('min-w-0 max-w-[85%]', mine ? 'items-end' : 'items-start')}>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
                  <span className="text-xs font-medium text-foreground">
                    {mine ? 'You' : senderLabel}
                  </span>
                  <time
                    className="text-[10px] text-muted-foreground"
                    dateTime={m.timestamp}
                    title={new Date(m.timestamp).toLocaleString()}
                  >
                    {formatChatRelativeTime(m.timestamp, now)}
                  </time>
                </div>
                <div
                  className={cn(
                    // Chord Explorer light (lib/chord-explorer/styles.css): .chord-button — bg-elevated, border-subtle,
                    // shadow-button, border-left 3px quality stripe (--chord-major / --chord-minor). Dark: :root defaults.
                    'mt-1 max-w-full rounded-lg border border-black/[0.08] px-3 py-2 text-sm leading-relaxed text-foreground',
                    'bg-[#e5e2dd] shadow-[0_2px_8px_rgba(0,0,0,0.1)] dark:border-white/[0.06] dark:bg-[#1a1a26] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]',
                    mine
                      ? 'rounded-br-md border-l-[3px] border-l-[#b8862e] dark:border-l-[#e8b86d]'
                      : 'rounded-bl-md border-l-[3px] border-l-[#4a7a9e] dark:border-l-[#7eb8da]'
                  )}
                >
                  <p className="whitespace-pre-wrap break-words text-inherit">{m.body}</p>
                </div>
                {mine && (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5" title={readTooltip}>
                    <span className="inline-flex -space-x-1.5" aria-hidden>
                      <Check
                        className={cn(
                          'size-3.5 shrink-0',
                          tickLeftGreen ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                        )}
                        strokeWidth={2.5}
                      />
                      <Check
                        className={cn(
                          'size-3.5 shrink-0',
                          tickRightGreen ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                        )}
                        strokeWidth={2.5}
                      />
                    </span>
                    <span className="sr-only">{readTooltip}</span>
                    {readersForPile.map((r) => {
                      const rSrc = effectiveAvatarUrl(r.avatarUrl);
                      const label = readerMiniLabel(r);
                      return rSrc ? (
                        <img
                          key={r.userId}
                          src={rSrc}
                          alt=""
                          className={cn('size-4 rounded-full object-cover', avatarOtherImgClassSm)}
                          title={label}
                        />
                      ) : (
                        <span
                          key={r.userId}
                          className={cn(
                            'flex size-4 items-center justify-center rounded-full text-[7px]',
                            avatarOtherFallbackColorsSm
                          )}
                          title={label}
                        >
                          {readerMiniInitials(r)}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!isReadOnly && (
        <div className="shrink-0 border-t border-border bg-background pt-2">
          <div className="flex gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Message your team…"
              rows={2}
              className="min-h-[2.5rem] flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-muted-foreground/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={sending || !draft.trim()}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground disabled:opacity-50"
              aria-label="Send message"
            >
              <Send className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
