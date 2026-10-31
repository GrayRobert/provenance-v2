'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { collaborationApi, effectiveAvatarUrl, WRITE_DISABLED_BY_OWNER_CODE } from '@/lib/api';
import { avatarFallbackText } from '@/lib/avatarFallback';
import { accountDisplayLabel } from '@/lib/profileDisplayName';
import { useAuthStore } from '@/lib/store';
import type { SongPresence, SongWriteLock } from '@/lib/types';
import { Lock, Unlock, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface CollaborationBarProps {
  songId: string;
  songOwnerId: string;
  onWriteAccessChange?: (hasWriteAccess: boolean) => void;
}

const HEARTBEAT_INTERVAL = 10_000;
const PRESENCE_POLL_INTERVAL = 5_000;
const LOCK_RENEW_INTERVAL = 60_000;

export function CollaborationBar({ songId, songOwnerId, onWriteAccessChange }: CollaborationBarProps) {
  const { user } = useAuthStore();
  const [presence, setPresence] = useState<SongPresence[]>([]);
  const [lock, setLock] = useState<SongWriteLock | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [showWriteDisabledModal, setShowWriteDisabledModal] = useState(false);
  const lockRenewRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isOwner = user?.userId === songOwnerId;
  const isLockedByMe = lock?.lockedBy === user?.userId;
  const isLockedByOther = lock != null && lock.lockedBy !== user?.userId;
  const hasWriteAccess = isOwner ? !isLockedByOther : isLockedByMe;

  const otherPresence = presence.filter((p) => p.userId !== user?.userId);
  const showBar = otherPresence.length > 0 || lock != null || !isOwner;

  const loadState = useCallback(async () => {
    try {
      const [p, l] = await Promise.all([
        collaborationApi.getPresence(songId),
        collaborationApi.getLock(songId),
      ]);
      setPresence(p);
      setLock(l);
    } catch {
      // ignore
    }
  }, [songId]);

  useEffect(() => {
    loadState();
    collaborationApi.heartbeat(songId).catch(() => {});

    let heartbeatInFlight = false;
    const heartbeat = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (heartbeatInFlight) return;
      heartbeatInFlight = true;
      collaborationApi.heartbeat(songId).catch(() => {}).finally(() => { heartbeatInFlight = false; });
    }, HEARTBEAT_INTERVAL);

    let presenceInFlight = false;
    const presencePoll = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (presenceInFlight) return;
      presenceInFlight = true;
      loadState().finally(() => { presenceInFlight = false; });
    }, PRESENCE_POLL_INTERVAL);

    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      void loadState();
      collaborationApi.heartbeat(songId).catch(() => {});
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      clearInterval(heartbeat);
      clearInterval(presencePoll);
      document.removeEventListener('visibilitychange', onVis);
      if (lockRenewRef.current) clearInterval(lockRenewRef.current);
    };
  }, [songId, loadState]);

  useEffect(() => {
    onWriteAccessChange?.(hasWriteAccess);
  }, [hasWriteAccess, onWriteAccessChange]);

  useEffect(() => {
    if (isLockedByMe) {
      lockRenewRef.current = setInterval(async () => {
        try {
          const renewed = await collaborationApi.renewLock(songId);
          setLock(renewed);
        } catch {
          setLock(null);
        }
      }, LOCK_RENEW_INTERVAL);
    } else if (lockRenewRef.current) {
      clearInterval(lockRenewRef.current);
      lockRenewRef.current = null;
    }
    return () => {
      if (lockRenewRef.current) clearInterval(lockRenewRef.current);
    };
  }, [isLockedByMe, songId]);

  const handleAcquireLock = async () => {
    setRequesting(true);
    try {
      const l = await collaborationApi.acquireLock(songId);
      setLock(l);
    } catch (err: unknown) {
      if ((err as Error & { code?: string }).code === WRITE_DISABLED_BY_OWNER_CODE) {
        setShowWriteDisabledModal(true);
      } else {
        await loadState();
      }
    } finally {
      setRequesting(false);
    }
  };

  const handleReleaseLock = async () => {
    try {
      await collaborationApi.releaseLock(songId);
      setLock(null);
    } catch {
      await loadState();
    }
  };

  const handleForceAcquire = async () => {
    setRequesting(true);
    try {
      const l = await collaborationApi.forceAcquireLock(songId);
      setLock(l);
    } catch (err: unknown) {
      if ((err as Error & { code?: string }).code === WRITE_DISABLED_BY_OWNER_CODE) {
        setShowWriteDisabledModal(true);
      } else {
        await loadState();
      }
    } finally {
      setRequesting(false);
    }
  };

  if (!showBar) return null;

  return (
    <div className="flex items-center gap-3 text-sm">
      {/* Presence avatars */}
      {otherPresence.length > 0 && (
        <div className="flex items-center gap-1">
          <div className="flex -space-x-2">
            {otherPresence.slice(0, 5).map((p) => (
              <PresenceAvatar key={p.userId} presence={p} />
            ))}
          </div>
          {otherPresence.length > 5 && (
            <span className="text-xs text-muted-foreground ml-1">+{otherPresence.length - 5}</span>
          )}
        </div>
      )}

      {/* Lock status + controls */}
      {isLockedByMe && (
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-green-600 font-medium flex items-center gap-1">
            <Lock className="size-3" />
            You have write access
          </span>
          <button
            type="button"
            onClick={handleReleaseLock}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <Unlock className="size-3" />
            Release
          </button>
        </div>
      )}

      {isLockedByOther && (
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
            <Lock className="size-3" />
            {lock?.lockedByDisplayName || 'Another user'} is editing
          </span>
          <button
            type="button"
            onClick={handleForceAcquire}
            disabled={requesting}
            className="text-xs text-accent hover:underline flex items-center gap-1 disabled:opacity-50"
          >
            <RefreshCw className={cn('size-3', requesting && 'animate-spin')} />
            Request control
          </button>
        </div>
      )}

      {!lock && !isOwner && (
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-muted-foreground">Read-only</span>
          <button
            type="button"
            onClick={handleAcquireLock}
            disabled={requesting}
            className="text-xs text-accent hover:underline flex items-center gap-1 disabled:opacity-50"
          >
            <Lock className="size-3" />
            {requesting ? 'Requesting…' : 'Request write access'}
          </button>
        </div>
      )}

      <Dialog open={showWriteDisabledModal} onOpenChange={setShowWriteDisabledModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Write access disabled</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Write access has been disabled by the workspace owner.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PresenceAvatar({ presence }: { presence: SongPresence }) {
  const avatarSrc = effectiveAvatarUrl(presence.avatarUrl);
  const label = presenceAccountLabel(presence);
  const initials = avatarFallbackText(
    presence.displayName?.trim() || presence.authorName?.trim() || null,
    presence.email?.split('@')[0] ?? undefined
  );

  return (
    <div
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-surface text-[10px] font-medium',
        presence.isEditing ? 'bg-green-500/20 text-green-700 ring-2 ring-green-400' : 'bg-accent/20 text-accent'
      )}
      title={`${label}${presence.isEditing ? ' (editing)' : ' (viewing)'}`}
    >
      {avatarSrc ? (
        <img src={avatarSrc} alt="" className="size-full rounded-full object-cover" />
      ) : (
        initials
      )}
    </div>
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
