'use client';

import { useState, useMemo } from 'react';
import { Share2, Music, ArrowLeft, Search } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import type { SongSummary } from '@/lib/types';

const SHOW_FILTER_THRESHOLD = 6;

export interface ShareSongDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamName: string;
  songs: SongSummary[];
  onShareSong: (songId: string) => void;
  sharingId: string | null;
}

type View = 'list' | 'confirm';

export function ShareSongDrawer({
  open,
  onOpenChange,
  teamName,
  songs,
  onShareSong,
  sharingId,
}: ShareSongDrawerProps) {
  const [view, setView] = useState<View>('list');
  const [songToShare, setSongToShare] = useState<SongSummary | null>(null);
  const [shareConfirmInput, setShareConfirmInput] = useState('');
  const [filter, setFilter] = useState('');

  const filteredSongs = useMemo(() => {
    if (!filter.trim()) return songs;
    const q = filter.trim().toLowerCase();
    return songs.filter(
      (s) =>
        (s.title || 'Untitled Song').toLowerCase().includes(q)
    );
  }, [songs, filter]);

  const showFilter = songs.length >= SHOW_FILTER_THRESHOLD;

  const close = () => {
    onOpenChange(false);
    setTimeout(() => {
      setView('list');
      setSongToShare(null);
      setShareConfirmInput('');
      setFilter('');
    }, 300);
  };

  const handleSelectSong = (song: SongSummary) => {
    setSongToShare(song);
    setView('confirm');
  };

  const handleBackFromConfirm = () => {
    setView('list');
    setSongToShare(null);
    setShareConfirmInput('');
  };

  const handleConfirmShare = () => {
    if (!songToShare || shareConfirmInput.trim().toLowerCase() !== 'share') return;
    onShareSong(songToShare.songId);
    close();
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="bottom">
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>
            {view === 'list' && `Share a song with ${teamName}`}
            {view === 'confirm' && (
              <button
                type="button"
                onClick={handleBackFromConfirm}
                className="flex items-center gap-2 text-left"
              >
                <ArrowLeft className="size-4" />
                Share a song with {teamName}
              </button>
            )}
          </DrawerTitle>
        </DrawerHeader>

        <div className="flex flex-col px-4 pb-8 max-h-[70vh] min-h-0">
          {view === 'list' && (
            <>
              {songs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  All your songs are already shared with this team.
                </p>
              ) : (
                <>
                  {showFilter && (
                    <div className="relative mb-3">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                      <input
                        type="text"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        placeholder="Filter songs…"
                        className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                        aria-label="Filter songs"
                      />
                    </div>
                  )}
                  <div className="overflow-y-auto flex-1 min-h-0 space-y-1 -mx-1 px-1">
                    {filteredSongs.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No songs match your filter.
                      </p>
                    ) : (
                      filteredSongs.map((song) => (
                        <button
                          key={song.songId}
                          type="button"
                          onClick={() => handleSelectSong(song)}
                          disabled={sharingId === song.songId}
                          className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent/10 disabled:opacity-50"
                        >
                          <Music className="size-4 text-muted-foreground shrink-0" />
                          <span className="flex-1 truncate text-foreground">
                            {song.title || 'Untitled Song'}
                          </span>
                          <Share2 className="size-4 text-accent shrink-0" />
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {view === 'confirm' && songToShare && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-foreground">
                Sharing a song with a song writing team and shared workspace
                can&apos;t be undone to protect the authorship and integrity of
                the song writing team. Please type the word <strong>share</strong>{' '}
                and press OK.
              </p>
              <input
                type="text"
                value={shareConfirmInput}
                onChange={(e) => setShareConfirmInput(e.target.value)}
                placeholder="Type share to confirm"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                aria-label="Type share to confirm"
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={handleBackFromConfirm}
                  className="px-3 py-2 text-sm font-medium text-foreground border border-border rounded-lg hover:bg-border/50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmShare}
                  disabled={
                    shareConfirmInput.trim().toLowerCase() !== 'share' ||
                    sharingId !== null
                  }
                  className="px-3 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:opacity-90 disabled:opacity-50"
                >
                  OK
                </button>
              </div>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
