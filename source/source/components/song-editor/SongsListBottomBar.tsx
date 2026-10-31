'use client';

import { Plus, Trash2, ArchiveRestore, Users, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SongsListBottomBarProps {
  showArchived: boolean;
  onToggleArchived: () => void;
  onNewSong: () => void;
  creating: boolean;
  communityDrawerOpen?: boolean;
  onCommunityClick?: () => void;
  /** When 'share', right slot shows "Share a Song" instead of Community (e.g. on team workspace). */
  rightButton?: 'community' | 'share';
  onShareSongClick?: () => void;
}

export function SongsListBottomBar({
  showArchived,
  onToggleArchived,
  onNewSong,
  creating,
  communityDrawerOpen = false,
  onCommunityClick,
  rightButton = 'community',
  onShareSongClick,
}: SongsListBottomBarProps) {
  const isShareMode = rightButton === 'share' && onShareSongClick != null;
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border nav-bottom-bar backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Songs list tools"
    >
      <div className="mx-auto flex h-16 max-w-screen-xl items-center justify-around px-2 sm:px-4 md:px-8">
        {/* Left: Show Archived */}
        <button
          type="button"
          onClick={onToggleArchived}
          className="flex flex-col items-center justify-center gap-0.5 px-2 py-1 transition-all"
          aria-label={showArchived ? 'Hide archived' : 'Show archived'}
          aria-pressed={showArchived}
        >
          <span
            className={cn(
              'flex size-9 items-center justify-center rounded-lg border transition-all',
              'shadow-[0_2px_4px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.06)]',
              'active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] active:translate-y-px',
              showArchived
                ? 'border-accent/40 bg-accent/10 text-accent'
                : 'hover:border-muted-foreground/30 hover:text-foreground'
            )}
          >
            {showArchived ? (
              <ArchiveRestore className="size-5" />
            ) : (
              <Trash2 className="size-5" />
            )}
          </span>
          <span
            className={cn(
              'text-[10px] font-semibold tracking-wide min-w-[5.25rem] text-center',
              showArchived ? 'text-accent' : 'text-muted-foreground'
            )}
          >
            {showArchived ? 'Hide archived' : 'Show archived'}
          </span>
        </button>

        {/* Center: New Song (main orange button, same as Record on song editor) */}
        <div className="relative flex flex-col items-center">
          <button
            type="button"
            onClick={onNewSong}
            disabled={creating}
            className={cn(
              'relative -mt-6 flex size-14 items-center justify-center rounded-full border-2 border-accent/30 bg-accent text-white shadow-[0_2px_12px_var(--accent-dim),inset_0_1px_0_rgba(255,255,255,0.15)] transition-all hover:scale-105 hover:shadow-[0_4px_20px_var(--accent-dim),inset_0_1px_0_rgba(255,255,255,0.2)] active:scale-95 disabled:opacity-50 disabled:hover:scale-100'
            )}
            aria-label={creating ? 'Creating…' : 'New Song'}
          >
            <Plus className="size-6" />
          </button>
          <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
            {creating ? 'Creating…' : 'New Song'}
          </span>
        </div>

        {/* Right: Community or Share a Song (team workspace) */}
        {isShareMode ? (
          <button
            type="button"
            onClick={onShareSongClick}
            className="flex flex-col items-center justify-center gap-0.5 px-2 py-1 transition-all"
            aria-label="Share a Song"
          >
            <span
              className={cn(
                'flex size-9 items-center justify-center rounded-lg border transition-all',
                'shadow-[0_2px_4px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.06)]',
                'active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] active:translate-y-px',
                'hover:border-muted-foreground/30 hover:text-foreground'
              )}
            >
              <Share2 className="size-5" />
            </span>
            <span className="text-[10px] font-semibold tracking-wide text-muted-foreground min-w-[5.25rem] text-center">
              Share a Song
            </span>
          </button>
        ) : onCommunityClick == null ? (
          <span className="min-w-[5.25rem]" />
        ) : (
          <button
            type="button"
            onClick={onCommunityClick}
            className="flex flex-col items-center justify-center gap-0.5 px-2 py-1 transition-all"
            aria-label="Community"
            aria-expanded={communityDrawerOpen}
          >
            <span
              className={cn(
                'flex size-9 items-center justify-center rounded-lg border transition-all',
                'shadow-[0_2px_4px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.06)]',
                'active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] active:translate-y-px',
                communityDrawerOpen
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'hover:border-muted-foreground/30 hover:text-foreground'
              )}
            >
              <Users className="size-5" />
            </span>
            <span
              className={cn(
                'text-[10px] font-semibold tracking-wide',
                communityDrawerOpen ? 'text-accent' : 'text-muted-foreground'
              )}
            >
              Community
            </span>
          </button>
        )}
      </div>
    </nav>
  );
}
