'use client';

import '@/app/technology-font.css';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, X, GripVertical } from 'lucide-react';
import { songApi, pluginSettingsApi } from '@/lib/api';
import { getClerkToken } from '@/lib/clerkTokenProvider';
import type { Recording } from '@/lib/types';
import { SECTION_TYPE_PREFIX_REGEX } from '@/lib/sectionTypes';
import { cn } from '@/lib/utils';

const PANEL_WIDTH = 320;
const PANEL_HEIGHT_ESTIMATE = 380;
const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_THRESHOLD_PX = 10;

function formatCountdown(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/** Format track label: section = "Chorus 1 (V1)" (section name + version, no section type prefix); demos = label as-is. */
function formatTrackLabelForDisplay(track: { label?: string | null; sectionId?: string | null } | null): string {
  if (!track?.label?.trim()) return '—';
  let label = track.label.trim();
  const isSection = track.sectionId != null && track.sectionId !== '';
  if (!isSection) return label;
  label = label.replace(SECTION_TYPE_PREFIX_REGEX, '').trim() || label;
  const match = label.match(/^(.+?)\s+v(\d+)$/i);
  if (match) {
    const sectionName = match[1].trim();
    const version = match[2];
    return `${sectionName} (V${version})`;
  }
  return `${label} (V1)`;
}

function getCenteredPosition() {
  if (typeof window === 'undefined') return { x: 24, y: 24 };
  return {
    x: Math.max(0, (window.innerWidth - PANEL_WIDTH) / 2),
    y: Math.max(0, (window.innerHeight - PANEL_HEIGHT_ESTIMATE) / 2),
  };
}

export interface AudioPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  songId: string;
  /** All Track Lab tracks (section primaries + demos) in playlist order. */
  tracks: Recording[];
  /** Index in tracks to start playback from. */
  startIndex?: number;
  /** Optional override; otherwise uses saved Audio Player theme from profile. */
  theme?: 'light' | 'dark';
}

function useAuthRecordingUrl(songId: string, recordingId: string | null) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!recordingId || !songId) {
      setSrc(null);
      return;
    }

    let cancelled = false;
    let urlToRevoke: string | null = null;
    const ac = new AbortController();

    (async () => {
      const token =
        (typeof window !== 'undefined' ? await getClerkToken() : null) ??
        (typeof window !== 'undefined' ? localStorage.getItem('jwt') : null);
      const artifactUrl = songApi.getRecordingArtifactUrl(songId, recordingId);
      if (!token) {
        // Local-first build: the artifact URL is already a playable blob: URL.
        if (!cancelled) setSrc(artifactUrl === '#' ? null : artifactUrl);
        return;
      }
      try {
        const res = await fetch(artifactUrl, {
          signal: ac.signal,
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) {
          if (!cancelled) setSrc(null);
          return;
        }
        const blob = await res.blob();
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        urlToRevoke = objectUrl;
        setSrc(objectUrl);
      } catch {
        if (!cancelled) setSrc(null);
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
      if (urlToRevoke) {
        URL.revokeObjectURL(urlToRevoke);
        urlToRevoke = null;
      }
      setSrc(null);
    };
  }, [songId, recordingId]);
  return src;
}

export default function AudioPlayerModal({
  isOpen,
  onClose,
  songId,
  tracks,
  startIndex = 0,
  theme: themeProp,
}: AudioPlayerModalProps) {
  const [pluginTheme, setPluginTheme] = useState<'light' | 'dark' | null>(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(
    Math.max(0, Math.min(startIndex, tracks.length - 1))
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(NaN);
  const [position, setPosition] = useState(() => getCenteredPosition());
  const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, startLeft: 0, startTop: 0 });
  const longPressRef = useRef<{
    timer: ReturnType<typeof setTimeout>;
    pointerId: number;
    target: Element;
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
  } | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (isOpen) setPosition(getCenteredPosition());
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    pluginSettingsApi
      .getPluginSettings('audio-player')
      .then((settings) => {
        const t = settings.theme;
        if (t === 'light') setPluginTheme('light');
        else if (t === 'dark') setPluginTheme('dark');
        else {
          const doc = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : null;
          setPluginTheme(doc === 'dark' ? 'dark' : 'light');
        }
      })
      .catch(() => setPluginTheme('light'));
  }, [isOpen]);

  const clearLongPress = useCallback(() => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current.timer);
      longPressRef.current = null;
    }
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const startLeft = position.x;
      const startTop = position.y;

      if (e.pointerType === 'touch') {
        clearLongPress();
        longPressRef.current = {
          timer: setTimeout(() => {
            const lp = longPressRef.current;
            if (!lp) return;
            (lp.target as HTMLElement).setPointerCapture(lp.pointerId);
            dragRef.current = {
              isDragging: true,
              startX: lp.startX,
              startY: lp.startY,
              startLeft: lp.startLeft,
              startTop: lp.startTop,
            };
            longPressRef.current = null;
          }, LONG_PRESS_MS),
          pointerId: e.pointerId,
          target: e.currentTarget,
          startX,
          startY,
          startLeft,
          startTop,
        };
      } else {
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = {
          isDragging: true,
          startX,
          startY,
          startLeft,
          startTop,
        };
      }
    },
    [position, clearLongPress]
  );

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const lp = longPressRef.current;
    if (lp) {
      const dx = e.clientX - lp.startX;
      const dy = e.clientY - lp.startY;
      if (dx * dx + dy * dy > LONG_PRESS_MOVE_THRESHOLD_PX * LONG_PRESS_MOVE_THRESHOLD_PX) {
        clearTimeout(lp.timer);
        longPressRef.current = null;
      }
      return;
    }
    if (!dragRef.current.isDragging) return;
    setPosition({
      x: Math.max(0, dragRef.current.startLeft + (e.clientX - dragRef.current.startX)),
      y: Math.max(0, dragRef.current.startTop + (e.clientY - dragRef.current.startY)),
    });
  }, []);

  const handlePointerUp = useCallback(() => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current.timer);
      longPressRef.current = null;
    }
    if (dragRef.current.isDragging) {
      dragRef.current.isDragging = false;
    }
  }, []);

  useEffect(() => {
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointerleave', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointerleave', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  const resolvedTheme: 'light' | 'dark' =
    themeProp ??
    pluginTheme ??
    (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark'
      ? 'dark'
      : 'light');

  const currentTrack = tracks[currentTrackIndex] ?? null;
  const playbackUrl = useAuthRecordingUrl(songId, currentTrack?.recordingId ?? null);

  useEffect(() => {
    if (!isOpen) return;
    setCurrentTrackIndex(Math.max(0, Math.min(startIndex, tracks.length - 1)));
    setCurrentTime(0);
    setDuration(NaN);
  }, [isOpen, startIndex, tracks.length]);

  useEffect(() => {
    setCurrentTime(0);
    setDuration(NaN);
    const el = audioRef.current;
    if (!el) return;
    const onTimeUpdate = () => setCurrentTime(el.currentTime);
    const onLoadedMetadata = () => setDuration(el.duration);
    const onDurationChange = () => setDuration(el.duration);
    const onEnded = () => setCurrentTime(0);
    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('loadedmetadata', onLoadedMetadata);
    el.addEventListener('durationchange', onDurationChange);
    el.addEventListener('ended', onEnded);
    return () => {
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('loadedmetadata', onLoadedMetadata);
      el.removeEventListener('durationchange', onDurationChange);
      el.removeEventListener('ended', onEnded);
    };
  }, [currentTrackIndex, playbackUrl]);

  // Assign blob URL when ready. Do not call play() here — the next effect handles it so we never
  // reject play() with no src (that used to run .catch(() => setIsPlaying(false)) and cancel playback).
  useEffect(() => {
    if (!audioRef.current || !playbackUrl) return;
    audioRef.current.src = playbackUrl;
  }, [playbackUrl]);

  useEffect(() => {
    if (!audioRef.current || !playbackUrl) return;
    if (isPlaying) {
      void audioRef.current.play().catch(() => setIsPlaying(false));
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, playbackUrl]);

  const handlePlayPause = useCallback(() => {
    if (!currentTrack) return;
    setIsPlaying((p) => !p);
  }, [currentTrack]);

  const handlePrevious = useCallback(() => {
    setCurrentTrackIndex((prev) =>
      prev === 0 ? Math.max(0, tracks.length - 1) : prev - 1
    );
    setIsPlaying(true);
  }, [tracks.length]);

  const handleNext = useCallback(() => {
    setCurrentTrackIndex((prev) =>
      prev >= tracks.length - 1 ? 0 : prev + 1
    );
    setIsPlaying(true);
  }, [tracks.length]);

  const handleTrackSelect = useCallback((index: number) => {
    setCurrentTrackIndex(index);
    setIsPlaying(true);
  }, []);

  const handleEnded = useCallback(() => {
    if (tracks.length <= 1) {
      setIsPlaying(false);
      return;
    }
    setCurrentTrackIndex((prev) => (prev >= tracks.length - 1 ? 0 : prev + 1));
  }, [tracks.length]);

  if (!isOpen) return null;

  const isDark = resolvedTheme === 'dark';
  const lcdBg = isDark ? '#2B2B2B' : '#D1D4C9';
  const lcdFg = isDark ? '#D1D4C9' : '#2B2B2B';
  const lcdBorder = isDark ? '#D1D4C9' : '#2B2B2B';

  return (
    <>
      <audio
        ref={audioRef}
        onEnded={handleEnded}
        playsInline
      />

      <div
        role="dialog"
        aria-label="Audio Player"
        data-theme={isDark ? 'dark' : 'light'}
        className="fixed z-[100] flex flex-col rounded-xl select-none shadow-[0_25px_50px_-12px_rgba(0,0,0,0.35),0_0_0_1px_rgba(0,0,0,0.06)]"
        style={{
          left: position.x,
          top: position.y,
          width: PANEL_WIDTH,
          background: isDark
            ? '#222222'
            : 'linear-gradient(lab(87 4.24 8.02), lab(45 2.45 5.2))',
        }}
      >
        {/* Drag handle header: mouse = drag immediately; touch = long press to drag */}
        <div
          onPointerDown={handlePointerDown}
          onContextMenu={(e) => e.preventDefault()}
          className={cn(
            'flex cursor-grab active:cursor-grabbing items-center justify-between rounded-t-xl border-b px-2 py-1.5 touch-none',
            isDark ? 'border-gray-600' : 'border-gray-300'
          )}
          title="Drag to move (long press on touch screens)"
        >
          <div
            className={cn(
              'flex items-center gap-1.5 font-mono text-xs font-medium',
              isDark ? 'text-orange-400' : 'text-gray-800'
            )}
          >
            <GripVertical className="size-3.5" aria-hidden />
            <span>Audio Player</span>
            <span className="text-[10px] opacity-80">v1.02</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'rounded p-1',
              isDark
                ? 'text-orange-400 hover:bg-orange-400/10 hover:text-orange-500'
                : 'text-gray-800 hover:bg-gray-800/10 hover:text-gray-900'
            )}
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col p-3">
          <div
            className={cn(
              'mb-4 flex gap-2 rounded-xl p-1.5',
              isDark ? 'bg-gray-800' : 'bg-gray-700'
            )}
          >
            <button
              type="button"
              onClick={handlePrevious}
              className={cn(
                'flex flex-1 items-center justify-center rounded-lg p-2.5 transition-all',
                isDark
                  ? 'bg-gradient-to-b from-gray-100 to-gray-200 text-gray-700'
                  : 'bg-gradient-to-b from-gray-100 to-gray-200 text-gray-700'
              )}
              aria-label="Previous"
            >
              <SkipBack className="size-4" />
            </button>
            <button
              type="button"
              onClick={handlePlayPause}
              disabled={!currentTrack}
              className={cn(
                'relative flex flex-[1.5] items-center justify-center rounded-lg p-3 transition-all disabled:opacity-50',
                isDark
                  ? 'bg-gradient-to-b from-orange-400 to-orange-500 text-white hover:from-orange-500 hover:to-orange-600'
                  : 'bg-gradient-to-b from-orange-400 to-orange-500 text-white hover:from-orange-500 hover:to-orange-600'
              )}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              <span
                className={cn(
                  'absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full transition-opacity',
                  'translate-x-[calc(-100%-0.375rem)]',
                  isPlaying ? 'animate-pulse opacity-100' : 'opacity-0',
                  isDark ? 'bg-lime-400' : 'bg-green-400'
                )}
                aria-hidden
              />
              {isPlaying ? (
                <Pause className="size-5" />
              ) : (
                <Play className="size-5 translate-x-0.5" />
              )}
            </button>
            <button
              type="button"
              onClick={handleNext}
              className={cn(
                'flex flex-1 items-center justify-center rounded-lg p-2.5 transition-all',
                isDark
                  ? 'bg-gradient-to-b from-gray-100 to-gray-200 text-gray-700'
                  : 'bg-gradient-to-b from-gray-100 to-gray-200 text-gray-700'
              )}
              aria-label="Next"
            >
              <SkipForward className="size-4" />
            </button>
          </div>

          <div
            className="mb-4 rounded-xl p-3 shadow-inner"
            style={{
              fontFamily: "'Technology', monospace",
              backgroundColor: lcdBg,
              color: lcdFg,
              border: `1px solid ${lcdBorder}`,
            }}
          >
            <div className="mx-auto mb-2 min-h-[2.8125rem] min-w-[11ch] text-center text-[2.8125rem] font-bold tabular-nums tracking-wider">
              {formatCountdown(
                Number.isFinite(duration) && duration > 0
                  ? Math.max(0, duration - currentTime)
                  : currentTrack?.durationSeconds != null && currentTrack.durationSeconds > 0
                    ? Math.max(0, currentTrack.durationSeconds - currentTime)
                    : 0
              )}
            </div>
            <div className="space-y-1">
              <div className="text-[1.125rem] opacity-80">PLAYING</div>
              <div className="text-[1.6875rem] font-bold tracking-wide">
                {formatTrackLabelForDisplay(currentTrack)}
              </div>
              <div className="text-[1.125rem] opacity-70">
                {currentTrack?.sectionId ? 'Section' : 'Demo'}
              </div>
              <div className="mt-2 border-t pt-2 text-[15px] opacity-70" style={{ borderColor: `${lcdBorder}66` }}>
                TRACK {currentTrackIndex + 1} OF {tracks.length}
              </div>
            </div>
          </div>

          {tracks.length > 0 && (
            <div
              className="mb-4 rounded-xl p-3"
              style={{
                fontFamily: "'Technology', monospace",
                backgroundColor: lcdBg,
                color: lcdFg,
                border: `1px solid ${lcdBorder}`,
              }}
            >
              <div className="mb-2 border-b pb-2 text-[15px] opacity-80" style={{ borderColor: `${lcdBorder}66` }}>
                PLAYLIST
              </div>
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {tracks.map((track, index) => (
                  <button
                    key={track.recordingId}
                    type="button"
                    onClick={() => handleTrackSelect(index)}
                    className={cn(
                      'w-full rounded-md px-2 py-1.5 text-left text-[1.125rem] transition-all',
                      index === currentTrackIndex
                        ? 'font-bold'
                        : isDark
                          ? 'hover:bg-[#D1D4C9]/15'
                          : 'hover:bg-[#2B2B2B]/15'
                    )}
                    style={
                      index === currentTrackIndex
                        ? { backgroundColor: lcdFg, color: lcdBg }
                        : undefined
                    }
                  >
                    <span className={index === currentTrackIndex ? 'opacity-90' : 'opacity-70'}>
                      {String(index + 1).padStart(2, '0')}.
                    </span>{' '}
                    {formatTrackLabelForDisplay(track)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
