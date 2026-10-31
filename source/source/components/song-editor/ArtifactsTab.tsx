'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Mic,
  StickyNote,
  Trash2,
  ArchiveRestore,
  ImageIcon,
  Video,
  Play,
  Eye,
  Pencil,
  Headphones,
  FolderOpen,
  Download,
  Check,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { songApi, profileApi } from '@/lib/api';
import { getClerkToken } from '@/lib/clerkTokenProvider';
import { downloadWithAuth, downloadTextFile, extFromMime } from '@/lib/artifactDownload';
import type { LyricsScan, Note, Recording, SongVideo, TrackLabProject } from '@/lib/types';
import { SECTION_TYPE_PREFIX_REGEX } from '@/lib/sectionTypes';

export interface ArtifactsTabProps {
  songId: string;
  /** When this value changes, the list is refetched (e.g. after adding/editing a note). */
  refreshKey?: number;
  /** Open the notes modal for viewing/editing this note. */
  onOpenNote?: (noteId: string) => void;
  /** Open the Audio Player modal with these tracks; when set, play button uses this instead of the legacy player. */
  onPlayRecordings?: (tracks: Recording[], startIndex: number) => void;
  /** Open Track Lab with this project loaded. */
  onOpenTrackLabProject?: (project: TrackLabProject) => void;
}

/** Format recording label: user-named takes show as-is; otherwise strip section type prefix,
 * show "Chorus 1 (V1)" for sections; demos as-is. */
function formatRecordingLabelForDisplay(rec: {
  label?: string | null;
  sectionId?: string | null;
  customLabel?: boolean;
}): string {
  const raw = rec.label?.trim() || '';
  if (!raw) return '';
  if (rec.customLabel) return raw;
  const isSection = rec.sectionId != null && rec.sectionId !== '';
  if (!isSection) return raw;
  const label = raw.replace(SECTION_TYPE_PREFIX_REGEX, '').trim() || raw;
  const match = label.match(/^(.+?)\s+v(\d+)$/i);
  if (match) return `${match[1].trim()} (V${match[2]})`;
  return `${label} (V1)`;
}

/** Click target for image/video thumbnails (div role="button" avoids nesting a button around video). */
function ThumbnailOpenTrigger({
  label,
  onOpen,
  children,
}: {
  label: string;
  onOpen?: () => void;
  children: ReactNode;
}) {
  if (!onOpen) return children;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className="shrink-0 cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      aria-label={label}
    >
      {children}
    </div>
  );
}

function noteDownloadFilename(note: { title?: string | null }): string {
  const raw = (note.title?.trim() || 'note').replace(/[/\\?%*:|"<>]/g, '-').trim() || 'note';
  return `${raw.slice(0, 80)}.md`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function useAuthImageUrl(songId: string, scanId: string | null) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!scanId || !songId) {
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
      if (!token || cancelled) {
        if (!cancelled) setSrc(null);
        return;
      }
      const artifactUrl = songApi.getLyricsScanArtifactUrl(songId, scanId);
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
  }, [songId, scanId]);
  return src;
}

function useAuthVideoUrl(songId: string, videoId: string | null) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!videoId || !songId) {
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
      if (!token || cancelled) {
        if (!cancelled) setSrc(null);
        return;
      }
      const artifactUrl = songApi.getSongVideoArtifactUrl(songId, videoId);
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
  }, [songId, videoId]);
  return src;
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

function LyricsScanThumbnail({
  songId,
  scan,
  onOpen,
}: {
  songId: string;
  scan: LyricsScan;
  onOpen?: () => void;
}) {
  const src = useAuthImageUrl(songId, scan.scanId);
  const inner = !src ? (
    <div className="size-14 shrink-0 rounded bg-surface flex items-center justify-center text-muted">
      <ImageIcon className="size-6" />
    </div>
  ) : (
    <img
      src={src}
      alt=""
      className="size-14 shrink-0 rounded object-cover bg-surface pointer-events-none"
    />
  );
  return (
    <ThumbnailOpenTrigger label="View lyrics scan full size" onOpen={onOpen}>
      {inner}
    </ThumbnailOpenTrigger>
  );
}

function VideoThumbnail({
  songId,
  video,
  onOpen,
}: {
  songId: string;
  video: SongVideo;
  onOpen?: () => void;
}) {
  const src = useAuthVideoUrl(songId, video.videoId);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [frameReady, setFrameReady] = useState(false);

  useEffect(() => {
    setFrameReady(false);
  }, [src]);

  const inner = !src ? (
    <div className="size-14 shrink-0 rounded bg-surface flex items-center justify-center text-muted">
      <Video className="size-6" />
    </div>
  ) : (
    <div className="relative size-14 shrink-0 rounded bg-surface overflow-hidden">
      <video
        ref={videoRef}
        src={src}
        muted
        preload="metadata"
        playsInline
        onLoadedData={() => {
          const el = videoRef.current;
          if (el) {
            el.currentTime = 0.1;
          }
        }}
        onSeeked={() => setFrameReady(true)}
        className="size-full object-cover pointer-events-none"
        aria-hidden
      />
      {!frameReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface text-muted">
          <Video className="size-6" />
        </div>
      )}
      {frameReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <Play className="size-5 text-white drop-shadow" />
        </div>
      )}
    </div>
  );
  return (
    <ThumbnailOpenTrigger label="Play video" onOpen={onOpen}>
      {inner}
    </ThumbnailOpenTrigger>
  );
}

export function ArtifactsTab({ songId, refreshKey, onOpenNote, onPlayRecordings, onOpenTrackLabProject }: ArtifactsTabProps) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [trackLabProjects, setTrackLabProjects] = useState<TrackLabProject[]>([]);
  const [lyricsScans, setLyricsScans] = useState<LyricsScan[]>([]);
  const [songVideos, setSongVideos] = useState<SongVideo[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingScanId, setViewingScanId] = useState<string | null>(null);
  const [viewingVideoId, setViewingVideoId] = useState<string | null>(null);
  const [playingRecordingId, setPlayingRecordingId] = useState<string | null>(null);
  const [renamingRecordingId, setRenamingRecordingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [storageUsage, setStorageUsage] = useState<{
    usedBytes: number;
    limitBytes: number;
    tier: string;
    audioBytes: number;
  } | null>(null);
  const viewImageUrl = useAuthImageUrl(songId, viewingScanId);
  const viewVideoUrl = useAuthVideoUrl(songId, viewingVideoId);
  const playRecordingUrl = useAuthRecordingUrl(songId, playingRecordingId);

  const viewingScan = viewingScanId ? lyricsScans.find((s) => s.scanId === viewingScanId) : undefined;
  const viewingVideo = viewingVideoId ? songVideos.find((v) => v.videoId === viewingVideoId) : undefined;
  const playingRecording = playingRecordingId
    ? recordings.find((r) => r.recordingId === playingRecordingId)
    : undefined;

  const downloadScanFile = (scan: LyricsScan) => {
    const url = songApi.getLyricsScanArtifactUrl(songId, scan.scanId);
    const name = `lyrics-scan-${scan.scanId.slice(0, 8)}.${extFromMime(scan.mimeType)}`;
    downloadWithAuth(url, name).catch(() => toast.error('Could not download scan'));
  };

  const downloadVideoFile = (video: SongVideo) => {
    const url = songApi.getSongVideoArtifactUrl(songId, video.videoId);
    const name = `video-${video.videoId.slice(0, 8)}.${extFromMime(video.mimeType)}`;
    downloadWithAuth(url, name).catch(() => toast.error('Could not download video'));
  };

  const downloadRecordingFile = (rec: Recording) => {
    const url = songApi.getRecordingArtifactUrl(songId, rec.recordingId);
    const slug =
      (formatRecordingLabelForDisplay(rec) || `track-${rec.trackIndex + 1}`)
        .replace(/[/\\?%*:|"<>]/g, '-')
        .slice(0, 48) || 'recording';
    const name = `${slug}-${rec.recordingId.slice(0, 8)}.${extFromMime(rec.mimeType)}`;
    downloadWithAuth(url, name).catch(() => toast.error('Could not download audio'));
  };

  const downloadNoteFile = async (noteId: string) => {
    try {
      const note = await songApi.getNote(songId, noteId);
      const title = note.title?.trim() || 'Untitled';
      const body = note.body ?? '';
      const md = `# ${title}\n\n${body}`;
      downloadTextFile(noteDownloadFilename(note), md, 'text/markdown;charset=utf-8');
    } catch {
      toast.error('Could not download note');
    }
  };

  const startRenameRecording = (rec: Recording) => {
    setRenamingRecordingId(rec.recordingId);
    setRenameValue(rec.label?.trim() || '');
  };

  const saveRenameRecording = async () => {
    if (!renamingRecordingId) return;
    const value = renameValue.trim();
    if (!value) {
      toast.error('Name cannot be empty');
      return;
    }
    setRenameSaving(true);
    try {
      await songApi.renameRecording(songId, renamingRecordingId, value);
      setRenamingRecordingId(null);
      load();
    } catch {
      toast.error('Could not rename recording');
    } finally {
      setRenameSaving(false);
    }
  };

  const load = useCallback(() => {
    if (!songId) return;
    setLoading(true);
    Promise.all([
      songApi.getRecordings(songId),
      songApi.getTrackLabProjects(songId),
      songApi.getLyricsScans(songId),
      songApi.getSongVideos(songId),
      songApi.getNotes(songId),
    ])
      .then(([recs, projects, scans, videos, nts]) => {
        setRecordings(recs);
        setTrackLabProjects(projects);
        setLyricsScans(scans);
        setSongVideos(videos);
        setNotes(nts);
        profileApi.getStorageUsage().then(setStorageUsage).catch(() => setStorageUsage(null));
      })
      .catch(() => {
        setRecordings([]);
        setTrackLabProjects([]);
        setLyricsScans([]);
        setSongVideos([]);
        setNotes([]);
      })
      .finally(() => setLoading(false));
  }, [songId]);

  useEffect(() => {
    if (!songId) return;
    load();
  }, [songId, load, refreshKey]);

  useEffect(() => {
    profileApi.getStorageUsage().then(setStorageUsage).catch(() => setStorageUsage(null));
  }, []);

  function formatMb(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return '0';
    const mb = bytes / (1024 * 1024);
    return mb >= 10 || mb === 0 ? Math.round(mb).toString() : mb.toFixed(1);
  }

  if (loading) {
    return (
      <div className="py-4 text-sm text-muted">
        Loading artifacts…
      </div>
    );
  }

  const standaloneRecordings = recordings.filter((r) => !r.projectId);
  const activeRecordings = standaloneRecordings.filter((r) => !r.archivedAt);
  const archivedRecordings = standaloneRecordings.filter((r) => !!r.archivedAt);
  const activeProjects = trackLabProjects.filter((p) => !p.archivedAt);
  const archivedProjects = trackLabProjects.filter((p) => !!p.archivedAt);
  const activeScans = lyricsScans.filter((s) => !s.archivedAt);
  const archivedScans = lyricsScans.filter((s) => !!s.archivedAt);
  const activeVideos = songVideos.filter((v) => !v.archivedAt);
  const archivedVideos = songVideos.filter((v) => !!v.archivedAt);
  const activeNotes = notes.filter((n) => !n.archivedAt);
  const archivedNotes = notes.filter((n) => !!n.archivedAt);

  const archivedCount =
    archivedRecordings.length +
    archivedProjects.length +
    archivedScans.length +
    archivedVideos.length +
    archivedNotes.length;
  const hasAnyArchived = archivedCount > 0;

  return (
    <div className="space-y-4">
      {hasAnyArchived && (
        <p className="text-sm text-muted">
          {showArchived ? (
            <>
              Showing archived items.{' '}
              <button
                type="button"
                onClick={() => setShowArchived(false)}
                className="text-accent hover:underline"
              >
                Hide archived
              </button>
            </>
          ) : (
            <>
              You have {archivedCount} archived item{archivedCount !== 1 ? 's' : ''}.{' '}
              <button
                type="button"
                onClick={() => setShowArchived(true)}
                className="text-accent hover:underline"
              >
                Show archived
              </button>
            </>
          )}
        </p>
      )}

      {(activeRecordings.length > 0 || (showArchived && archivedRecordings.length > 0)) && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
            Audio
          </h3>
          <div className="flex flex-col gap-2">
            {activeRecordings.map((rec) => (
              <div
                key={rec.recordingId}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5"
              >
                <Mic className="size-4 shrink-0 text-accent" aria-hidden />
                {renamingRecordingId === rec.recordingId ? (
                  <form
                    className="flex min-w-0 flex-1 items-center gap-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveRenameRecording();
                    }}
                  >
                    <input
                      autoFocus
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      maxLength={80}
                      aria-label="Recording name"
                      className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                    <button
                      type="submit"
                      disabled={renameSaving}
                      className="shrink-0 rounded p-1.5 text-accent hover:bg-accent/10 transition-colors disabled:opacity-60"
                      title="Save name"
                      aria-label="Save name"
                    >
                      <Check className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenamingRecordingId(null)}
                      className="shrink-0 rounded p-1.5 text-muted hover:text-foreground hover:bg-border transition-colors"
                      title="Cancel"
                      aria-label="Cancel rename"
                    >
                      <X className="size-4" />
                    </button>
                  </form>
                ) : (
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {formatRecordingLabelForDisplay(rec) || `Track ${rec.trackIndex + 1}`}
                    </p>
                    <p className="text-xs text-muted">
                      {rec.sectionId ? 'Section' : 'Demo'}
                      {rec.updatedAt ? ` · ${formatDate(rec.updatedAt)}` : ''}
                      {rec.durationSeconds != null && Number.isFinite(rec.durationSeconds) && (
                        <> · {Math.round(rec.durationSeconds)}s</>
                      )}
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (onPlayRecordings) {
                      const idx = activeRecordings.findIndex((r) => r.recordingId === rec.recordingId);
                      onPlayRecordings(activeRecordings, idx >= 0 ? idx : 0);
                    } else {
                      setPlayingRecordingId(rec.recordingId);
                    }
                  }}
                  className="shrink-0 rounded p-1.5 text-accent hover:bg-accent/10 transition-colors"
                  title="Play recording"
                  aria-label="Play recording"
                >
                  <Play className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => downloadRecordingFile(rec)}
                  className="shrink-0 rounded p-1.5 text-muted hover:text-foreground hover:bg-border transition-colors"
                  title="Download audio"
                  aria-label="Download audio"
                >
                  <Download className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => startRenameRecording(rec)}
                  className="shrink-0 rounded p-1.5 text-muted hover:text-foreground hover:bg-border transition-colors"
                  title="Rename recording"
                  aria-label="Rename recording"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    songApi.archiveRecording(songId, rec.recordingId).then(() => load())
                  }
                  className="shrink-0 rounded p-1.5 text-muted hover:text-foreground hover:bg-border transition-colors"
                  title="Archive recording"
                  aria-label="Archive recording"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            {showArchived && archivedRecordings.length > 0 && (
              <>
                <p className="text-xs font-medium text-muted mt-2">Archived</p>
                {archivedRecordings.map((rec) => (
                  <div
                    key={rec.recordingId}
                    className="flex items-center gap-3 rounded-lg border border-border bg-surface/60 px-3 py-2.5 opacity-75"
                  >
                    <Trash2 className="size-4 shrink-0 text-muted" aria-hidden />
                    {renamingRecordingId === rec.recordingId ? (
                      <form
                        className="flex min-w-0 flex-1 items-center gap-1"
                        onSubmit={(e) => {
                          e.preventDefault();
                          saveRenameRecording();
                        }}
                      >
                        <input
                          autoFocus
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          maxLength={80}
                          aria-label="Recording name"
                          className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                        />
                        <button
                          type="submit"
                          disabled={renameSaving}
                          className="shrink-0 rounded p-1.5 text-accent hover:bg-accent/10 transition-colors disabled:opacity-60"
                          title="Save name"
                          aria-label="Save name"
                        >
                          <Check className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenamingRecordingId(null)}
                          className="shrink-0 rounded p-1.5 text-muted hover:text-foreground hover:bg-border transition-colors"
                          title="Cancel"
                          aria-label="Cancel rename"
                        >
                          <X className="size-4" />
                        </button>
                      </form>
                    ) : (
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">
                          {formatRecordingLabelForDisplay(rec) || `Track ${rec.trackIndex + 1}`}
                        </p>
                        <p className="text-xs text-muted">
                          {rec.sectionId ? 'Section' : 'Demo'}
                          {rec.updatedAt ? ` · ${formatDate(rec.updatedAt)}` : ''}
                          {rec.durationSeconds != null && Number.isFinite(rec.durationSeconds) && (
                            <> · {Math.round(rec.durationSeconds)}s</>
                          )}
                        </p>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => downloadRecordingFile(rec)}
                      className="shrink-0 rounded p-1.5 text-muted hover:text-foreground hover:bg-border transition-colors"
                      title="Download audio"
                      aria-label="Download audio"
                    >
                      <Download className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => startRenameRecording(rec)}
                      className="shrink-0 rounded p-1.5 text-muted hover:text-foreground hover:bg-border transition-colors"
                      title="Rename recording"
                      aria-label="Rename recording"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        songApi.unarchiveRecording(songId, rec.recordingId).then(() => load())
                      }
                      className="shrink-0 rounded p-1.5 text-muted hover:text-foreground hover:bg-border transition-colors"
                      title={rec.sectionId ? 'Restore as primary for this section' : 'Unarchive recording'}
                      aria-label={rec.sectionId ? 'Restore as primary' : 'Unarchive recording'}
                    >
                      <ArchiveRestore className="size-4" />
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {(activeProjects.length > 0 || (showArchived && archivedProjects.length > 0)) && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
            Track Lab Projects
          </h3>
          <div className="flex flex-col gap-2">
            {activeProjects.map((project) => (
              <div
                key={project.projectId}
                className={`flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 ${onOpenTrackLabProject ? 'cursor-pointer hover:bg-surface/80 transition-colors' : ''}`}
                role={onOpenTrackLabProject ? 'button' : undefined}
                tabIndex={onOpenTrackLabProject ? 0 : undefined}
                onClick={onOpenTrackLabProject ? () => onOpenTrackLabProject(project) : undefined}
                onKeyDown={
                  onOpenTrackLabProject
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onOpenTrackLabProject(project);
                        }
                      }
                    : undefined
                }
              >
                <Headphones className="size-4 shrink-0 text-accent" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {project.name}
                  </p>
                  <p className="text-xs text-muted">
                    {project.recordings.length} track{project.recordings.length !== 1 ? 's' : ''}
                    {project.updatedAt ? ` · ${formatDate(project.updatedAt)}` : ''}
                  </p>
                </div>
                {onOpenTrackLabProject && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenTrackLabProject(project);
                    }}
                    className="shrink-0 rounded p-1.5 text-accent hover:bg-accent/10 transition-colors"
                    title="Open in Track Lab"
                    aria-label="Open in Track Lab"
                  >
                    <FolderOpen className="size-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    songApi.archiveTrackLabProject(songId, project.projectId).then(() => load());
                  }}
                  className="shrink-0 rounded p-1.5 text-muted hover:text-foreground hover:bg-border transition-colors"
                  title="Archive project"
                  aria-label="Archive project"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            {showArchived && archivedProjects.length > 0 && (
              <>
                <p className="text-xs font-medium text-muted mt-2">Archived</p>
                {archivedProjects.map((project) => (
                  <div
                    key={project.projectId}
                    className="flex items-center gap-3 rounded-lg border border-border bg-surface/60 px-3 py-2.5 opacity-75"
                  >
                    <Trash2 className="size-4 shrink-0 text-muted" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {project.name}
                      </p>
                      <p className="text-xs text-muted">
                        {project.recordings.length} track{project.recordings.length !== 1 ? 's' : ''}
                        {project.updatedAt ? ` · ${formatDate(project.updatedAt)}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        songApi.unarchiveTrackLabProject(songId, project.projectId).then(() => load())
                      }
                      className="shrink-0 rounded p-1.5 text-muted hover:text-foreground hover:bg-border transition-colors"
                      title="Unarchive project"
                      aria-label="Unarchive project"
                    >
                      <ArchiveRestore className="size-4" />
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {(activeScans.length > 0 || (showArchived && archivedScans.length > 0)) && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
            Scanned lyrics
          </h3>
          <div className="flex flex-col gap-2">
            {activeScans.map((scan) => (
              <div
                key={scan.scanId}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5"
              >
                <LyricsScanThumbnail
                  songId={songId}
                  scan={scan}
                  onOpen={() => setViewingScanId(scan.scanId)}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted">
                    {formatDate(scan.createdAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setViewingScanId(scan.scanId)}
                  className="shrink-0 rounded p-1.5 text-accent hover:bg-accent/10 transition-colors"
                  title="View scan"
                  aria-label="View scan"
                >
                  <Eye className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => downloadScanFile(scan)}
                  className="shrink-0 rounded p-1.5 text-muted hover:text-foreground hover:bg-border transition-colors"
                  title="Download scan"
                  aria-label="Download scan"
                >
                  <Download className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    songApi.archiveLyricsScan(songId, scan.scanId).then(() => load())
                  }
                  className="shrink-0 rounded p-1.5 text-muted hover:text-foreground hover:bg-border transition-colors"
                  title="Archive scan"
                  aria-label="Archive scan"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            {showArchived && archivedScans.length > 0 && (
              <>
                <p className="text-xs font-medium text-muted mt-2">Archived</p>
                {archivedScans.map((scan) => (
                  <div
                    key={scan.scanId}
                    className="flex items-center gap-3 rounded-lg border border-border bg-surface/60 px-3 py-2.5 opacity-75"
                  >
                    <Trash2 className="size-4 shrink-0 text-muted" aria-hidden />
                    <LyricsScanThumbnail
                      songId={songId}
                      scan={scan}
                      onOpen={() => setViewingScanId(scan.scanId)}
                    />
                    <p className="min-w-0 flex-1 text-xs text-muted">
                      {formatDate(scan.createdAt)}
                    </p>
                    <button
                      type="button"
                      onClick={() => setViewingScanId(scan.scanId)}
                      className="shrink-0 rounded p-1.5 text-accent hover:bg-accent/10 transition-colors"
                      title="View scan"
                      aria-label="View scan"
                    >
                      <Eye className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadScanFile(scan)}
                      className="shrink-0 rounded p-1.5 text-muted hover:text-foreground hover:bg-border transition-colors"
                      title="Download scan"
                      aria-label="Download scan"
                    >
                      <Download className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        songApi.unarchiveLyricsScan(songId, scan.scanId).then(() => load())
                      }
                      className="shrink-0 rounded p-1.5 text-muted hover:text-foreground hover:bg-border transition-colors"
                      title="Unarchive scan"
                      aria-label="Unarchive scan"
                    >
                      <ArchiveRestore className="size-4" />
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {(activeVideos.length > 0 || (showArchived && archivedVideos.length > 0)) && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
            Videos
          </h3>
          <div className="flex flex-col gap-2">
            {activeVideos.map((video) => (
              <div
                key={video.videoId}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5"
              >
                <VideoThumbnail
                  songId={songId}
                  video={video}
                  onOpen={() => setViewingVideoId(video.videoId)}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted">
                    {formatDate(video.createdAt)}
                    {video.durationSeconds != null && Number.isFinite(video.durationSeconds) && (
                      <> · {Math.round(video.durationSeconds)}s</>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setViewingVideoId(video.videoId)}
                  className="shrink-0 rounded p-1.5 text-accent hover:bg-accent/10 transition-colors"
                  title="Play video"
                  aria-label="Play video"
                >
                  <Play className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => downloadVideoFile(video)}
                  className="shrink-0 rounded p-1.5 text-muted hover:text-foreground hover:bg-border transition-colors"
                  title="Download video"
                  aria-label="Download video"
                >
                  <Download className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    songApi.archiveVideo(songId, video.videoId).then(() => load())
                  }
                  className="shrink-0 rounded p-1.5 text-muted hover:text-foreground hover:bg-border transition-colors"
                  title="Archive video"
                  aria-label="Archive video"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            {showArchived && archivedVideos.length > 0 && (
              <>
                <p className="text-xs font-medium text-muted mt-2">Archived</p>
                {archivedVideos.map((video) => (
                  <div
                    key={video.videoId}
                    className="flex items-center gap-3 rounded-lg border border-border bg-surface/60 px-3 py-2.5 opacity-75"
                  >
                    <Trash2 className="size-4 shrink-0 text-muted" aria-hidden />
                    <VideoThumbnail
                      songId={songId}
                      video={video}
                      onOpen={() => setViewingVideoId(video.videoId)}
                    />
                    <p className="min-w-0 flex-1 text-xs text-muted">
                      {formatDate(video.createdAt)}
                      {video.durationSeconds != null && Number.isFinite(video.durationSeconds) && (
                        <> · {Math.round(video.durationSeconds)}s</>
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={() => setViewingVideoId(video.videoId)}
                      className="shrink-0 rounded p-1.5 text-accent hover:bg-accent/10 transition-colors"
                      title="Play video"
                      aria-label="Play video"
                    >
                      <Play className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadVideoFile(video)}
                      className="shrink-0 rounded p-1.5 text-muted hover:text-foreground hover:bg-border transition-colors"
                      title="Download video"
                      aria-label="Download video"
                    >
                      <Download className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        songApi.unarchiveVideo(songId, video.videoId).then(() => load())
                      }
                      className="shrink-0 rounded p-1.5 text-muted hover:text-foreground hover:bg-border transition-colors"
                      title="Unarchive video"
                      aria-label="Unarchive video"
                    >
                      <ArchiveRestore className="size-4" />
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {(activeNotes.length > 0 || (showArchived && archivedNotes.length > 0)) && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
            Notes
          </h3>
          <div className="flex flex-col gap-2">
            {activeNotes.map((note) => (
              <div
                key={note.noteId}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5"
              >
                <button
                  type="button"
                  onClick={() => onOpenNote?.(note.noteId)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left transition-colors hover:bg-accent/10 rounded -m-1 p-1 min-h-0"
                >
                  <StickyNote className="size-4 shrink-0 text-accent" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {note.title || 'Untitled note'}
                    </p>
                    <p className="text-xs text-muted">
                      {formatDate(note.updatedAt)}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenNote?.(note.noteId)}
                  className="shrink-0 rounded p-1.5 text-accent hover:bg-accent/10 transition-colors"
                  title="Edit note"
                  aria-label="Edit note"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => downloadNoteFile(note.noteId)}
                  className="shrink-0 rounded p-1.5 text-muted hover:text-foreground hover:bg-border transition-colors"
                  title="Download note as Markdown"
                  aria-label="Download note as Markdown"
                >
                  <Download className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    songApi.archiveNote(songId, note.noteId).then(() => load());
                  }}
                  className="shrink-0 rounded p-1.5 text-muted hover:text-foreground hover:bg-border transition-colors"
                  title="Archive note"
                  aria-label="Archive note"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            {showArchived && archivedNotes.length > 0 && (
              <>
                <p className="text-xs font-medium text-muted mt-2">Archived</p>
                {archivedNotes.map((note) => (
                  <div
                    key={note.noteId}
                    className="flex items-center gap-3 rounded-lg border border-border bg-surface/60 px-3 py-2.5 opacity-75"
                  >
                    <Trash2 className="size-4 shrink-0 text-muted" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {note.title || 'Untitled note'}
                      </p>
                      <p className="text-xs text-muted">
                        {formatDate(note.updatedAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => downloadNoteFile(note.noteId)}
                      className="shrink-0 rounded p-1.5 text-muted hover:text-foreground hover:bg-border transition-colors"
                      title="Download note as Markdown"
                      aria-label="Download note as Markdown"
                    >
                      <Download className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        songApi.unarchiveNote(songId, note.noteId).then(() => load())
                      }
                      className="shrink-0 rounded p-1.5 text-muted hover:text-foreground hover:bg-border transition-colors"
                      title="Unarchive note"
                      aria-label="Unarchive note"
                    >
                      <ArchiveRestore className="size-4" />
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {standaloneRecordings.length === 0 &&
        trackLabProjects.length === 0 &&
        lyricsScans.length === 0 &&
        songVideos.length === 0 &&
        notes.length === 0 && (
        <p className="text-sm text-muted">
          No recordings, scanned lyrics, videos, or notes yet. Add audio, scan lyrics, video, or notes from the Add menu.
        </p>
      )}

      {storageUsage != null && (
        <p className="text-xs text-muted border-t border-border pt-3 mt-2">
          On this device: song text {formatMb(storageUsage.usedBytes)} MB of ~
          {formatMb(storageUsage.limitBytes)} MB browser limit
          {storageUsage.audioBytes > 0 && ` · audio ${formatMb(storageUsage.audioBytes)} MB`}
        </p>
      )}

      {viewingScanId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="View lyrics scan"
          onClick={() => setViewingScanId(null)}
        >
          <div
            className="flex max-h-full max-w-full flex-col items-stretch gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {viewImageUrl && viewingScan && (
                <a
                  href={viewImageUrl}
                  download={`lyrics-scan-${viewingScanId.slice(0, 8)}.${extFromMime(viewingScan.mimeType)}`}
                  className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-3 py-1.5 text-sm text-white hover:bg-white/25"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Download className="size-4 shrink-0" aria-hidden />
                  Download
                </a>
              )}
              <button
                type="button"
                onClick={() => setViewingScanId(null)}
                className="rounded-md bg-white/15 px-3 py-1.5 text-sm text-white hover:bg-white/25"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 min-w-0 overflow-auto">
              {viewImageUrl ? (
                <img
                  src={viewImageUrl}
                  alt="Lyrics scan full size"
                  className="max-h-[min(85vh,100%)] max-w-[min(100vw-2rem,100%)] object-contain"
                />
              ) : (
                <span className="text-sm text-white">Loading…</span>
              )}
            </div>
          </div>
        </div>
      )}

      {viewingVideoId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Play video"
          onClick={() => setViewingVideoId(null)}
        >
          <div
            className="flex max-h-full max-w-full flex-col items-stretch gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {viewVideoUrl && viewingVideo && (
                <a
                  href={viewVideoUrl}
                  download={`video-${viewingVideoId.slice(0, 8)}.${extFromMime(viewingVideo.mimeType)}`}
                  className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-3 py-1.5 text-sm text-white hover:bg-white/25"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Download className="size-4 shrink-0" aria-hidden />
                  Download
                </a>
              )}
              <button
                type="button"
                onClick={() => setViewingVideoId(null)}
                className="rounded-md bg-white/15 px-3 py-1.5 text-sm text-white hover:bg-white/25"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 min-w-0 overflow-auto">
              {viewVideoUrl ? (
                <video
                  src={viewVideoUrl}
                  controls
                  autoPlay
                  className="max-h-[min(85vh,100%)] max-w-[min(100vw-2rem,100%)]"
                />
              ) : (
                <span className="text-sm text-white">Loading…</span>
              )}
            </div>
          </div>
        </div>
      )}

      {playingRecordingId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Play recording"
          onClick={() => setPlayingRecordingId(null)}
        >
          <div
            className="bg-surface rounded-lg shadow-lg p-4 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
              {playRecordingUrl && playingRecording && playingRecordingId && (
                <a
                  href={playRecordingUrl}
                  download={`${(formatRecordingLabelForDisplay(playingRecording) || `track-${playingRecording.trackIndex + 1}`).replace(/[/\\?%*:|"<>]/g, '-').slice(0, 48) || 'recording'}-${playingRecordingId.slice(0, 8)}.${extFromMime(playingRecording.mimeType)}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent/10"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Download className="size-4 shrink-0" aria-hidden />
                  Download
                </a>
              )}
            </div>
            {playRecordingUrl ? (
              <audio
                src={playRecordingUrl}
                controls
                autoPlay
                className="w-full"
              />
            ) : (
              <span className="text-sm text-muted-foreground">Loading…</span>
            )}
            <button
              type="button"
              onClick={() => setPlayingRecordingId(null)}
              className="mt-3 w-full rounded border border-border px-3 py-2 text-sm font-medium hover:bg-accent/10"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
