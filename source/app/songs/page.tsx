'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { songApi, profileApi, pluginSettingsApi, type UserProfileResponse } from '@/lib/api';
import { applySongScaffold } from '@/lib/applySongScaffold';
import { parsePluginBooleanSetting } from '@/lib/pluginSettingsBooleans';
import { usePremiumPluginGate } from '@/lib/usePremiumPluginGate';
import { getAccountGraceDaysRemaining } from '@/lib/usePluginAccess';
import { PluginGraceModal } from '@/components/shared/PluginGraceModal';
import { SongStructurePickerModal } from '@/components/song-structure/SongStructurePickerModal';
import type { SongStructureOutput } from '@/lib/songStructureContract';
import { useAuthStore } from '@/lib/store';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { SongSummary } from '@/lib/types';
import { AppHeader } from '@/components/shared/AppHeader';
import { Breadcrumbs } from '@/components/shared/Breadcrumbs';
import { SongsListBottomBar } from '@/components/song-editor/SongsListBottomBar';
import { DeleteSongConfirmModal } from '@/components/songs/DeleteSongConfirmModal';
import { SongScaffoldProgressOverlay } from '@/components/songs/SongScaffoldProgressOverlay';
import { toast } from 'sonner';
import {
  UPLOAD_MAX_SONG_IMPORT_BYTES,
  getUploadErrorMessage,
  uploadMaxMb,
} from '@/lib/uploadLimits';
import { buildBackup, restoreBackup } from '@/lib/localDb';
import { Home, Trash2, ArchiveRestore, X, FileUp, Download, Upload } from 'lucide-react';

const IMPORT_MODAL_DONT_SHOW_KEY = 'provenance.importLyrics.dontShowAgain';

export default function SongsPage() {
  const [songs, setSongs] = useState<SongSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [profile, setProfile] = useState<UserProfileResponse | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [deleteModalSongId, setDeleteModalSongId] = useState<string | null>(null);
  const [deleteModalSongTitle, setDeleteModalSongTitle] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [structureModalOpen, setStructureModalOpen] = useState(false);
  const [scaffoldOverlayOpen, setScaffoldOverlayOpen] = useState(false);
  const [scaffoldOverlayKey, setScaffoldOverlayKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [restoring, setRestoring] = useState(false);
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { authChecked } = useAuthGuard();
  const {
    runWithPluginGate,
    graceModalOpen,
    graceModalPlugin,
    handleGraceModalClose,
    premiumPluginEnabledByGateId,
  } = usePremiumPluginGate(profile);

  const loadSongs = async () => {
    try {
      // Always fetch all songs (including archived) so we can filter on the client
      // This ensures we always know the archived count and avoids stale closure issues
      const data = await songApi.getSongs(true);
      setSongs(data);
    } catch (error) {
      console.error('Failed to load songs', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authChecked) {
      loadSongs();
    }
  }, [authChecked]);

  // Load profile for avatar and display name in header
  useEffect(() => {
    if (!authChecked || !user) return;
    profileApi.getProfile().then(setProfile).catch(() => setProfile(null));
  }, [authChecked, user]);

  const createBlankSongAndNavigate = useCallback(async () => {
    setCreating(true);
    try {
      const { songId } = await songApi.createSong();
      router.push(`/song?id=${songId}`);
    } catch (error: unknown) {
      console.error('Failed to create song', error);
      toast.error('Could not create the song.');
    } finally {
      setCreating(false);
    }
  }, [router]);

  const handleStructureComplete = useCallback(
    async (structure: SongStructureOutput | null) => {
      setStructureModalOpen(false);
      setCreating(true);
      setScaffoldOverlayKey((k) => k + 1);
      setScaffoldOverlayOpen(true);
      try {
        const { songId } = await songApi.createSong();
        await applySongScaffold(songId, structure, 0);
        router.push(`/song?id=${songId}`);
      } catch (error: unknown) {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status === 403) {
          toast.error('Song limit reached for your plan. Upgrade to create more songs.');
          router.push(`/pricing?from=${encodeURIComponent('/songs')}`);
        } else {
          console.error('Failed to create song', error);
        }
      } finally {
        setCreating(false);
        setScaffoldOverlayOpen(false);
      }
    },
    [router]
  );

  // Don't render anything until auth is checked (all hooks must run above this return)
  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <p>Checking authentication...</p>
      </div>
    );
  }

  const handleCreateSong = () => {
    void (async () => {
      let usePicker = true;
      try {
        const s = await pluginSettingsApi.getPluginSettings('song-structure');
        usePicker = parsePluginBooleanSetting(s.use_song_structure_picker, true);
      } catch {
        usePicker = true;
      }
      const structurePluginOff =
        premiumPluginEnabledByGateId !== null &&
        premiumPluginEnabledByGateId.song_structure === false;
      if (structurePluginOff && !usePicker) {
        await createBlankSongAndNavigate();
        return;
      }
      runWithPluginGate('song_structure', () => {
        if (!usePicker) {
          void createBlankSongAndNavigate();
          return;
        }
        setStructureModalOpen(true);
      });
    })();
  };

  const handleArchiveSong = async (e: React.MouseEvent, songId: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await songApi.archiveSong(songId);
      loadSongs();
    } catch (error) {
      console.error('Failed to archive song', error);
    }
  };

  const handleRestoreSong = async (e: React.MouseEvent, songId: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await songApi.restoreSong(songId);
      loadSongs();
    } catch (error) {
      console.error('Failed to restore song', error);
    }
  };

  const handleDeleteSongConfirm = async () => {
    if (!deleteModalSongId) return;
    setDeleting(true);
    try {
      await songApi.deleteSong(deleteModalSongId);
      loadSongs();
      setDeleteModalSongId(null);
      setDeleteModalSongTitle('');
      toast.success('Song deleted permanently.');
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number; data?: { error?: string } } })?.response?.status;
      const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (status === 403) {
        toast.error(message || 'Cannot delete this song. It may be in a shared workspace or not archived.');
      } else {
        toast.error('Failed to delete song. Please try again.');
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleImportClick = () => {
    setImportError(null);
    const dontShow = typeof window !== 'undefined' && localStorage.getItem(IMPORT_MODAL_DONT_SHOW_KEY) === 'true';
    if (dontShow) {
      fileInputRef.current?.click();
    } else {
      setImportModalOpen(true);
    }
  };

  const handleImportModalChooseFile = () => {
    setImportModalOpen(false);
    fileInputRef.current?.click();
  };

  const handleImportFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const ext = file.name.toLowerCase();
    if (
      !ext.endsWith('.txt') &&
      !ext.endsWith('.html') &&
      !ext.endsWith('.htm') &&
      !ext.endsWith('.cho') &&
      !ext.endsWith('.crd')
    ) {
      setImportError(
        'Only .txt, .html, .htm, .cho (ChordPro), and .crd files are supported.'
      );
      return;
    }
    if (file.size > UPLOAD_MAX_SONG_IMPORT_BYTES) {
      setImportError(
        `File is too large. Maximum size is ${uploadMaxMb(UPLOAD_MAX_SONG_IMPORT_BYTES)} MB for lyrics import.`
      );
      return;
    }
    setImporting(true);
    setImportError(null);
    try {
      const { songId } = await songApi.importSong(file);
      router.push(`/song?id=${songId}`);
    } catch (err: unknown) {
      setImportError(getUploadErrorMessage(err));
      setImporting(false);
    }
  };


  const handleExportBackup = async () => {
    try {
      const backup = await buildBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `provenance-backup-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Backup downloaded (${backup.songs.length} song${backup.songs.length === 1 ? '' : 's'}).`);
    } catch (err) {
      console.error('Failed to export backup', err);
      toast.error('Could not create the backup file.');
    }
  };

  const handleRestoreClick = () => {
    restoreInputRef.current?.click();
  };

  const handleRestoreFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setRestoring(true);
    try {
      const text = await file.text();
      const result = await restoreBackup(text);
      toast.success(`Restored ${result.songsRestored} song${result.songsRestored === 1 ? '' : 's'} from the backup.`);
      await loadSongs();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not restore that backup file.';
      toast.error(message);
    } finally {
      setRestoring(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <p>Loading songs...</p>
      </div>
    );
  }

  const activeSongs = songs.filter(s => !s.archived);
  const archivedSongs = songs.filter(s => s.archived);
  const myWorkspaceActiveSongs = activeSongs;
  const myWorkspaceArchivedSongs = archivedSongs;
  const hasAnyMyWorkspaceSongs = myWorkspaceActiveSongs.length > 0 || myWorkspaceArchivedSongs.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <SongScaffoldProgressOverlay key={scaffoldOverlayKey} open={scaffoldOverlayOpen} />
      <DeleteSongConfirmModal
        open={deleteModalSongId != null}
        songTitle={deleteModalSongTitle}
        onClose={() => {
          if (!deleting) {
            setDeleteModalSongId(null);
            setDeleteModalSongTitle('');
          }
        }}
        onConfirm={handleDeleteSongConfirm}
        loading={deleting}
      />
      <AppHeader profile={profile} user={user} logout={logout} onProfileSaved={setProfile} />

      <main className="px-4 sm:px-6 lg:px-8 py-6 pb-24">
        <Breadcrumbs
          items={[{ label: 'Workspaces', href: '/songs', icon: <Home className="size-4" /> }]}
          className="mb-4"
        />
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-foreground">Workspaces</h2>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.html,.htm,.cho,.crd,text/plain,text/html"
          className="hidden"
          onChange={handleImportFileSelect}
          aria-label="Choose lyrics file"
        />
        <input
          ref={restoreInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleRestoreFileSelect}
          aria-label="Choose backup file"
        />
        <SongsListBottomBar
          showArchived={showArchived}
          onToggleArchived={() => setShowArchived(!showArchived)}
          onNewSong={handleCreateSong}
          creating={creating}
        />

        {/* Songs */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportBackup}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground shadow-sm hover:shadow"
          >
            <Download className="size-4" />
            Export backup
          </button>
          <button
            type="button"
            onClick={handleRestoreClick}
            disabled={restoring}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground shadow-sm hover:shadow disabled:opacity-50"
          >
            <Upload className="size-4" />
            {restoring ? 'Restoring...' : 'Restore backup'}
          </button>
        </div>


        {importModalOpen && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-lyrics-title"
          >
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setImportModalOpen(false)}
              aria-hidden
            />
            <div className="relative bg-surface border border-border rounded-xl shadow-xl max-w-md w-full p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <h2 id="import-lyrics-title" className="text-lg font-semibold text-foreground">
                  Import song from file
                </h2>
                <button
                  type="button"
                  onClick={() => setImportModalOpen(false)}
                  className="p-1 rounded text-muted hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="size-5" />
                </button>
              </div>
              <div className="text-sm text-foreground space-y-3 mb-6">
                <p>
                  Supported formats: <strong>.txt</strong>, <strong>.html</strong>, <strong>.htm</strong>,{' '}
                  <strong>.cho</strong> / <strong>.crd</strong> (ChordPro). Max{' '}
                  {uploadMaxMb(UPLOAD_MAX_SONG_IMPORT_BYTES)} MB.
                </p>
                <p>
                  <strong>Plain text / HTML:</strong> the first line is the song title. Use section lines like{' '}
                  <code className="bg-border px-1 rounded">[Verse 1]</code> or <code className="bg-border px-1 rounded">[Chorus]</code>.
                  Chord rows above lyrics are supported. Use plain HTML without external scripts.
                </p>
                <p>
                  <strong>ChordPro:</strong> title comes from <code className="bg-border px-1 rounded">{'{title: ...}'}</code> (or{' '}
                  <code className="bg-border px-1 rounded">{'{t: ...}'}</code>). Sections can use the same{' '}
                  <code className="bg-border px-1 rounded">[Verse 1]</code> lines or ChordPro directives such as{' '}
                  <code className="bg-border px-1 rounded">{'{start_of_chorus}'}</code>. Inline chords use{' '}
                  <code className="bg-border px-1 rounded">[C]</code> in the lyric line. Export from the song editor as ChordPro for a full round trip.
                </p>
                <p>Provenance will record the import and store the file as supporting evidence on the timeline.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleImportModalChooseFile}
                  className="px-4 py-2 bg-accent text-white rounded-md hover:opacity-90 font-medium"
                >
                  Choose file
                </button>
                <button
                  type="button"
                  onClick={() => setImportModalOpen(false)}
                  className="px-4 py-2 border border-border rounded-md text-foreground hover:bg-border/50"
                >
                  Cancel
                </button>
                <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
                  <input
                    type="checkbox"
                    onChange={(e) => {
                      if (typeof window !== 'undefined') {
                        if (e.target.checked) localStorage.setItem(IMPORT_MODAL_DONT_SHOW_KEY, 'true');
                        else localStorage.removeItem(IMPORT_MODAL_DONT_SHOW_KEY);
                      }
                    }}
                    className="rounded border-border"
                  />
                  Don&apos;t show again
                </label>
              </div>
            </div>
          </div>
        )}

        {importError && (
          <div className="fixed bottom-24 left-4 right-4 z-50 rounded-lg bg-destructive/10 border border-destructive text-destructive px-4 py-3 text-sm">
            {importError}
          </div>
        )}

        {!hasAnyMyWorkspaceSongs ? (
          <div className="text-center py-12 bg-surface rounded-lg border border-border shadow">
            <p className="text-muted mb-4">No songs in your workspace yet</p>
            <button
              onClick={handleCreateSong}
              disabled={creating}
              className="px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-hover"
            >
              Create your first song
            </button>
            <p className="mt-4">
              <button
                type="button"
                onClick={handleImportClick}
                disabled={importing}
                className="inline-flex items-center gap-2 rounded-lg border border-dashed border-border bg-surface/50 px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-border hover:bg-surface hover:text-foreground disabled:opacity-50"
              >
                <FileUp className="size-4 shrink-0" />
                {importing ? 'Importing…' : 'Import song from file'}
              </button>
            </p>
          </div>
        ) : (
          <>
            {myWorkspaceActiveSongs.length > 0 && (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
                {myWorkspaceActiveSongs.map((song) => (
                  <div
                    key={song.songId}
                    className="relative group"
                  >
                    <Link
                      href={`/song?id=${song.songId}`}
                      className="block p-6 bg-surface rounded-lg border border-border shadow hover:shadow-md transition-shadow"
                    >
                      <h3 className="text-lg font-semibold text-foreground mb-2 pr-8">
                        {song.title || 'Untitled Song'}
                      </h3>
                      <p className="text-sm text-muted">
                        Updated {formatDate(song.updatedAt)}
                      </p>
                    </Link>
                    <button
                      onClick={(e) => handleArchiveSong(e, song.songId)}
                      className="absolute top-4 right-4 p-2 text-muted hover:text-red-500 transition-colors"
                      title="Archive song"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {myWorkspaceActiveSongs.length > 0 && (
              <div className="mb-8">
                <button
                  type="button"
                  onClick={handleImportClick}
                  disabled={importing}
                  className="flex w-full max-w-md items-center gap-3 rounded-lg border border-dashed border-border bg-surface/50 px-4 py-3 text-left text-sm font-medium text-muted-foreground transition-colors hover:border-border hover:bg-surface hover:text-foreground disabled:opacity-50 sm:max-w-sm"
                  aria-label={importing ? 'Importing…' : 'Import song from file'}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
                    <FileUp className="size-4 text-muted-foreground" />
                  </span>
                  <span>{importing ? 'Importing…' : 'Import song from file'}</span>
                </button>
              </div>
            )}

            {showArchived && myWorkspaceArchivedSongs.length > 0 && (
              <>
                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center">
                  <Trash2 className="h-5 w-5 mr-2 text-muted" />
                  Archived Songs
                </h3>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {myWorkspaceArchivedSongs.map((song) => (
                    <div
                      key={song.songId}
                      className="relative group"
                    >
                      <Link
                        href={`/song?id=${song.songId}`}
                        className="block p-6 bg-surface rounded-lg shadow hover:shadow-md transition-shadow border-2 border-dashed border-border opacity-80"
                      >
                        <h3 className="text-lg font-semibold text-muted mb-2 pr-20">
                          {song.title || 'Untitled Song'}
                        </h3>
                        <p className="text-sm text-muted">
                          Updated {formatDate(song.updatedAt)}
                        </p>
                        <span className="inline-block mt-2 px-2 py-1 text-xs bg-border text-muted rounded">
                          Archived
                        </span>
                      </Link>
                      <div className="absolute top-4 right-4 flex items-center gap-0.5">
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDeleteModalSongId(song.songId);
                            setDeleteModalSongTitle(song.title || 'Untitled Song');
                          }}
                          className="p-2 text-destructive hover:bg-destructive/10 transition-colors rounded"
                          title="Delete permanently"
                          aria-label="Delete song permanently"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                        <button
                          onClick={(e) => handleRestoreSong(e, song.songId)}
                          className="p-2 text-muted hover:text-green-500 transition-colors rounded"
                          title="Restore song"
                          aria-label="Restore song"
                        >
                          <ArchiveRestore className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {myWorkspaceActiveSongs.length === 0 && myWorkspaceArchivedSongs.length > 0 && !showArchived && (
              <div className="text-center py-12 bg-surface rounded-lg border border-border shadow">
                <p className="text-muted mb-4">No active songs in your workspace</p>
                <p className="text-sm text-muted mb-4">
                  You have {myWorkspaceArchivedSongs.length} archived song{myWorkspaceArchivedSongs.length !== 1 ? 's' : ''}.
                  <button
                    onClick={() => setShowArchived(true)}
                    className="text-accent hover:underline ml-1"
                  >
                    Show archived
                  </button>
                </p>
                <button
                  onClick={handleCreateSong}
                  disabled={creating}
                  className="px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-hover"
                >
                  Create a new song
                </button>
                <p className="mt-4">
                  <button
                    type="button"
                    onClick={handleImportClick}
                    disabled={importing}
                    className="inline-flex items-center gap-2 rounded-lg border border-dashed border-border bg-surface/50 px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-border hover:bg-surface hover:text-foreground disabled:opacity-50"
                  >
                    <FileUp className="size-4 shrink-0" />
                    {importing ? 'Importing…' : 'Import song from file'}
                  </button>
                </p>
              </div>
            )}
          </>
        )}
      </main>
      <PluginGraceModal
        open={graceModalOpen}
        onClose={handleGraceModalClose}
        pluginName={graceModalPlugin}
        graceDaysRemaining={getAccountGraceDaysRemaining(profile)}
      />
      <SongStructurePickerModal
        open={structureModalOpen}
        onOpenChange={setStructureModalOpen}
        onComplete={handleStructureComplete}
      />
    </div>
  );
}
