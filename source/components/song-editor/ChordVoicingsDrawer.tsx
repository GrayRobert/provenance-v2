'use client';

import type { RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquare, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { SongChatTab } from '@/components/song-editor/SongChatTab';
import { useChatUnreadCount } from '@/lib/chatUnreadContext';
import ChordVoicingsPanel from '@/components/chords/ChordVoicingsPanel';
import type { ChordVoicingsPanelChord } from '@/components/chords/ChordVoicingsPanel';
import type { Instrument, Recording, TrackLabProject } from '@/lib/types';
import { ArtifactsTab } from '@/components/song-editor/ArtifactsTab';

type DrawerTab = 'voicings' | 'artifacts' | 'chat';

const DRAG_CLOSE_THRESHOLD_PX = 80;
const DRAG_VELOCITY_THRESHOLD = 0.3;
const TRANSITION_MS = 300;

export interface ChordVoicingsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chords: ChordVoicingsPanelChord[];
  instrument: Instrument;
  isReadOnly?: boolean;
  /** Song id for loading artifacts (recordings, notes) in the Artifacts tab. */
  songId?: string;
  /** Increment to trigger Artifacts tab refetch (e.g. after adding/editing a note). */
  artifactsRefreshKey?: number;
  /** When user opens a note from the Artifacts tab, call with noteId to open the notes modal. */
  onOpenNote?: (noteId: string) => void;
  /** When user clicks play on a recording in Artifacts, open the Audio Player with these tracks. */
  onPlayRecordings?: (tracks: Recording[], startIndex: number) => void;
  /** When user opens a Track Lab project from Artifacts, open Track Lab with that project. */
  onOpenTrackLabProject?: (project: TrackLabProject) => void;
  /** Optional ref to the panel content container (e.g. for capturing HTML for export). */
  contentRef?: RefObject<HTMLDivElement | null>;
  onRequestVoicingChange?: (chordId: string, symbol: string, voicingId?: string | null) => void;
  /** When true, show Team chat tab (song shared to a workspace). */
  collaborationChatEnabled?: boolean;
  /**
   * When true, hide chat composer (and message archive). If omitted, falls back to `isReadOnly`.
   * Pass `song.archived` so view-only collaborators can still use chat; lyric edit access is separate.
   */
  chatReadOnly?: boolean;
}

/**
 * Chord Voicings as a right-side sliding panel (no Vaul).
 * Full viewport height, no overlay. Supports drag-to-close and animated open/close.
 */
export function ChordVoicingsDrawer({
  open,
  onOpenChange,
  chords,
  instrument,
  isReadOnly = false,
  songId,
  artifactsRefreshKey,
  onOpenNote,
  onPlayRecordings,
  onOpenTrackLabProject,
  contentRef,
  onRequestVoicingChange,
  collaborationChatEnabled = false,
  chatReadOnly,
}: ChordVoicingsDrawerProps) {
  const [activeTab, setActiveTab] = useState<DrawerTab>('voicings');
  const chatUnread = useChatUnreadCount(songId);
  const [dragOffsetPx, setDragOffsetPx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const lastMoveTime = useRef(0);
  const lastMoveX = useRef(0);
  /** Only run drag logic after a pointer down on the panel; ignore move without prior down */
  const hasActivePointer = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  /** Ref synced with isDragging so the native touchmove listener can read it without blocking scroll until we're actually dragging. */
  const isDraggingRef = useRef(false);

  useEffect(() => {
    if (!open) {
      queueMicrotask(() => {
        setDragOffsetPx(0);
        setActiveTab('voicings');
      });
    }
  }, [open]);

  useEffect(() => {
    if (!collaborationChatEnabled && activeTab === 'chat') {
      queueMicrotask(() => setActiveTab('voicings'));
    }
  }, [collaborationChatEnabled, activeTab]);

  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);

  // On touch devices, only preventDefault when we're actually in a horizontal drag (isDragging).
  // The list has touch-pan-y so the browser treats it as the scroll container; we only claim the gesture when dragging from the header.
  useEffect(() => {
    const el = panelRef.current;
    if (!el || !open) return;
    const onTouchMove = (e: TouchEvent) => {
      if (isDraggingRef.current) e.preventDefault();
    };
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, [open]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!open) return;
      // Don't start drag when pointer is on a tab (so tab clicks work)
      const isOnTab = (e.target as Element).closest?.('button[role="tab"]');
      if (isOnTab) return;
      // Only start drag when pointer goes down on the header; on touch, the scrollable content would otherwise steal the gesture
      const isOnDragHandle = (e.target as Element).closest?.('[data-drag-handle]');
      if (!isOnDragHandle) return;
      hasActivePointer.current = true;
      dragStart.current = { x: e.clientX, y: e.clientY };
      lastMoveTime.current = Date.now();
      lastMoveX.current = e.clientX;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [open]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!open || !hasActivePointer.current) return;
      const { x: startX, y: startY } = dragStart.current;
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      if (!isDragging) {
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);
        if (absX > 10 && absX > absY && deltaX > 0) {
          setIsDragging(true);
          setDragOffsetPx(Math.max(0, deltaX));
        } else return;
      } else {
        setDragOffsetPx(Math.max(0, deltaX));
      }

      const now = Date.now();
      lastMoveTime.current = now;
      lastMoveX.current = e.clientX;
    },
    [open, isDragging]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      hasActivePointer.current = false;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Ignore if we don't have capture
      }
      if (!open || !isDragging) {
        setIsDragging(false);
        return;
      }
      const velocity =
        (e.clientX - lastMoveX.current) / Math.max(1, Date.now() - lastMoveTime.current);
      const shouldClose =
        dragOffsetPx >= DRAG_CLOSE_THRESHOLD_PX || velocity >= DRAG_VELOCITY_THRESHOLD;
      setIsDragging(false);
      if (shouldClose) {
        setDragOffsetPx(0);
        onOpenChange(false);
      } else {
        setDragOffsetPx(0);
      }
    },
    [open, isDragging, dragOffsetPx, onOpenChange]
  );

  const transform = open ? `translateX(${dragOffsetPx}px)` : 'translateX(100%)';
  const transitionValue = isDragging
    ? 'none'
    : `transform ${TRANSITION_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`;

  return (
    <>
      {/* Sliding panel: fixed, full height, slides in from right; no visibility toggle so close animates */}
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Chord voicings, artifacts, and team chat"
        aria-hidden={!open}
        className="fixed top-16 right-0 bottom-0 z-50 flex w-[min(360px,90vw)] max-w-full flex-col border-l border-border bg-background shadow-lg"
        style={{
          transform,
          transition: transitionValue,
          pointerEvents: open ? undefined : 'none',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={() => onOpenChange(false)}
      >
        {/* Close tab on the left edge of the panel; only show when open so it doesn't double with the open tab when panel is off-screen */}
        {open && (
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute left-0 top-1/2 z-10 flex h-24 w-10 -translate-x-full -translate-y-1/2 items-center justify-center rounded-l-md border border-r-0 border-accent/50 bg-accent text-accent-foreground shadow-md shadow-accent/25 transition-colors hover:border-accent hover:bg-accent/90 hover:brightness-110"
            aria-label="Close panel"
          >
            <PanelRightClose className="size-5" aria-hidden />
          </button>
        )}
        <div className="flex min-h-0 flex-1 flex-col rounded-l-lg">
          <header className="shrink-0 touch-none border-b border-border" data-drag-handle>
            <div
              className={collaborationChatEnabled ? 'grid grid-cols-3 gap-0 border-b border-border bg-secondary/50' : 'grid grid-cols-2 gap-0 border-b border-border bg-secondary/50'}
              role="tablist"
              aria-label="Drawer sections"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'voicings'}
                aria-controls="drawer-tabpanel-voicings"
                id="drawer-tab-voicings"
                className="touch-manipulation rounded-none border-b-2 px-2 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-muted-foreground/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                style={{
                  borderBottomColor: activeTab === 'voicings' ? 'var(--accent)' : 'transparent',
                  color: activeTab === 'voicings' ? 'var(--foreground)' : 'var(--muted)',
                }}
                onClick={() => setActiveTab('voicings')}
              >
                Chord Voicings
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'artifacts'}
                aria-controls="drawer-tabpanel-artifacts"
                id="drawer-tab-artifacts"
                className="touch-manipulation rounded-none border-b-2 px-2 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-muted-foreground/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                style={{
                  borderBottomColor: activeTab === 'artifacts' ? 'var(--accent)' : 'transparent',
                  color: activeTab === 'artifacts' ? 'var(--foreground)' : 'var(--muted)',
                }}
                onClick={() => setActiveTab('artifacts')}
              >
                Artifacts
              </button>
              {collaborationChatEnabled && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'chat'}
                  aria-controls="drawer-tabpanel-chat"
                  id="drawer-tab-chat"
                  className="relative touch-manipulation rounded-none border-b-2 px-2 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-muted-foreground/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  style={{
                    borderBottomColor: activeTab === 'chat' ? 'var(--accent)' : 'transparent',
                    color: activeTab === 'chat' ? 'var(--foreground)' : 'var(--muted)',
                  }}
                  onClick={() => setActiveTab('chat')}
                >
                  <span className="inline-flex items-center justify-center gap-1">
                    <MessageSquare className="size-4 shrink-0" aria-hidden />
                    Chat
                    {chatUnread > 0 && (
                      <span className="min-w-[1.125rem] rounded-full bg-accent px-1 text-center text-[10px] font-semibold leading-tight text-accent-foreground">
                        {chatUnread > 99 ? '99+' : chatUnread}
                      </span>
                    )}
                  </span>
                </button>
              )}
            </div>
          </header>
          <div
            className={
              activeTab === 'chat' && collaborationChatEnabled
                ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
                : 'min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3 touch-pan-y'
            }
            style={
              activeTab !== 'chat' || !collaborationChatEnabled
                ? ({ WebkitOverflowScrolling: 'touch' } as React.CSSProperties)
                : undefined
            }
          >
            <div
              ref={contentRef}
              id="drawer-tabpanel-voicings"
              role="tabpanel"
              aria-labelledby="drawer-tab-voicings"
              hidden={activeTab !== 'voicings'}
              className={activeTab !== 'voicings' ? 'hidden' : undefined}
            >
              <ChordVoicingsPanel
                chords={chords}
                instrument={instrument}
                isReadOnly={isReadOnly}
                onRequestVoicingChange={(chordId, symbol, voicingId) => {
                  onRequestVoicingChange?.(chordId, symbol, voicingId);
                  onOpenChange(false);
                }}
              />
            </div>
            <div
              id="drawer-tabpanel-artifacts"
              role="tabpanel"
              aria-labelledby="drawer-tab-artifacts"
              hidden={activeTab !== 'artifacts'}
              className={activeTab !== 'artifacts' ? 'hidden' : undefined}
            >
              {songId ? (
                <ArtifactsTab
                  songId={songId}
                  refreshKey={artifactsRefreshKey}
                  onOpenNote={onOpenNote}
                  onPlayRecordings={onPlayRecordings}
                  onOpenTrackLabProject={onOpenTrackLabProject}
                />
              ) : (
                <p className="text-sm text-muted">Open a song to see artifacts.</p>
              )}
            </div>
            {collaborationChatEnabled && songId && (
              <div
                id="drawer-tabpanel-chat"
                role="tabpanel"
                aria-labelledby="drawer-tab-chat"
                hidden={activeTab !== 'chat'}
                className={
                  activeTab !== 'chat'
                    ? 'hidden'
                    : 'flex min-h-0 min-w-0 flex-1 flex-col px-3 pb-3 pt-2'
                }
              >
                <SongChatTab
                  songId={songId}
                  isReadOnly={chatReadOnly ?? isReadOnly}
                  isActive={open && activeTab === 'chat'}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fixed tab on the right edge when panel is closed: opens the panel */}
      {!open && (
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          className="fixed right-0 top-1/2 z-[60] flex h-24 w-10 -translate-y-1/2 items-center justify-center rounded-l-md border border-r-0 border-accent/50 bg-accent text-accent-foreground shadow-md shadow-accent/25 transition-colors hover:border-accent hover:bg-accent/90 hover:brightness-110"
          aria-label="Open chord voicings, artifacts, and team chat"
        >
          <span className="relative inline-flex">
            <PanelRightOpen className="size-5" aria-hidden />
            {collaborationChatEnabled && chatUnread > 0 && (
              <span className="absolute -right-1 -top-1 min-w-[14px] rounded-full border border-accent bg-background px-0.5 text-center text-[9px] font-bold leading-[14px] text-accent">
                {chatUnread > 9 ? '9+' : chatUnread}
              </span>
            )}
          </span>
        </button>
      )}
    </>
  );
}
