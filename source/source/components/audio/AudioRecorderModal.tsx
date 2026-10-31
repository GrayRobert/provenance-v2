'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mountAudioRecorder } from '@/lib/audio-recorder';
import type { AudioRecorderInstance, ExportRecordingItem, TrackLabProjectData } from '@/lib/audio-recorder';
import {
  recordingsToPluginSummaries,
} from '@/lib/audio-recorder-adapter';
import type { TrackLabProject } from '@/lib/types';
import { songApi, pluginSettingsApi } from '@/lib/api';
import {
  UPLOAD_MAX_AUDIO_BYTES,
  getUploadErrorMessage,
  uploadMaxMb,
} from '@/lib/uploadLimits';
import '@/lib/audio-recorder/styles.css';

export interface AudioRecorderModalProps {
  isOpen: boolean;
  songId: string;
  onClose: () => void;
  /** When set, recording is for this section (one primary per section). When null, demo. */
  recordingSectionId?: string | null;
  /** Optional label for this recording (e.g. section name "Verse 1"). Applied when not section-scoped. */
  recordingLabel?: string | null;
  /** When set, load this Track Lab project (recordings + settings) instead of all song recordings. */
  initialProject?: TrackLabProject | null;
  /** When true and no initialProject, start with empty tracks (new project) instead of loading song recordings. */
  startNewProject?: boolean;
  /** Called after recordings were successfully uploaded. */
  onSaveSuccess?: () => void;
  /** Called when save fails. */
  onSaveError?: (error: string) => void;
}

export default function AudioRecorderModal({
  isOpen,
  songId,
  onClose,
  recordingSectionId,
  recordingLabel,
  initialProject,
  startNewProject = false,
  onSaveSuccess,
  onSaveError,
}: AudioRecorderModalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<AudioRecorderInstance | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);
  type RecordingSummary = {
    id: string;
    recordingId: string;
    trackIndex: number;
    label: string | null;
    durationSeconds: number | null;
    playbackUrl: string;
    mimeType: string;
  };
  const [fetchedRecordings, setFetchedRecordings] = useState<RecordingSummary[]>([]);
  const initialRecordings = useMemo(() => {
    if (initialProject) {
      return recordingsToPluginSummaries(initialProject.recordings, songId);
    }
    if (startNewProject) {
      return [];
    }
    return fetchedRecordings;
  }, [initialProject, songId, fetchedRecordings, startNewProject]);

  const initialProjectData = useMemo(() => {
    if (!initialProject?.projectData) return undefined;
    try {
      return JSON.parse(initialProject.projectData) as import('@/lib/audio-recorder').TrackLabProjectData;
    } catch {
      return undefined;
    }
  }, [initialProject]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setTheme(null);
      return;
    }
    pluginSettingsApi
      .getPluginSettings('track-lab')
      .then((settings) => {
        const t = settings.theme;
        if (t === 'light') setTheme('light');
        else if (t === 'dark') setTheme('dark');
        else {
          const doc = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : null;
          setTheme(doc === 'dark' ? 'dark' : 'light');
        }
      })
      .catch(() => setTheme('light'));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !songId || initialProject || startNewProject) return;
    setLoading(true);
    songApi
      .getRecordings(songId)
      .then((recordings) => {
        setFetchedRecordings(recordingsToPluginSummaries(recordings, songId));
      })
      .catch(() => setFetchedRecordings([]))
      .finally(() => setLoading(false));
  }, [isOpen, songId, initialProject, startNewProject]);

  const handleSaveProject = useCallback(
    async (recordings: ExportRecordingItem[], projectData: TrackLabProjectData, projectName: string) => {
      if (recordings.length === 0 && !initialProject?.projectId) {
        onClose();
        return;
      }
      setSaving(true);
      try {
        const tracks = recordings.map((r) => ({
          trackIndex: r.trackIndex,
          label: r.label,
          durationSeconds: r.durationSeconds,
          blob: r.blob,
        }));
        for (const t of tracks) {
          if (t.blob.size > UPLOAD_MAX_AUDIO_BYTES) {
            onSaveError?.(
              `A track exceeds the ${uploadMaxMb(UPLOAD_MAX_AUDIO_BYTES)} MB limit. Shorten or export a smaller file.`
            );
            return;
          }
        }
        const name = projectName?.trim() || `Track Lab Project ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
        await songApi.saveTrackLabProject(songId, name, JSON.stringify(projectData), tracks, initialProject?.projectId);
        onSaveSuccess?.();
        onClose();
      } catch (e) {
        onSaveError?.(getUploadErrorMessage(e));
      } finally {
        setSaving(false);
      }
    },
    [songId, initialProject?.projectId, onClose, onSaveSuccess, onSaveError]
  );

  const handleProjectNameChange = useCallback(
    async (name: string) => {
      if (!initialProject?.projectId || !name?.trim()) return;
      try {
        await songApi.updateTrackLabProjectName(songId, initialProject.projectId, name.trim());
      } catch {
        // Silently ignore; user can retry
      }
    },
    [songId, initialProject?.projectId]
  );

  const handleMixDown = useCallback(
    async (blob: Blob, durationSeconds: number) => {
      try {
        if (blob.size > UPLOAD_MAX_AUDIO_BYTES) {
          onSaveError?.(
            `Mix down exceeds the ${uploadMaxMb(UPLOAD_MAX_AUDIO_BYTES)} MB limit. Try a shorter project.`
          );
          return;
        }
        const label = `Mix Down ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
        await songApi.uploadMixdown(songId, blob, { durationSeconds, label });
        onSaveSuccess?.();
        onClose();
      } catch (e) {
        onSaveError?.(getUploadErrorMessage(e));
      }
    },
    [songId, onClose, onSaveSuccess, onSaveError]
  );

  useEffect(() => {
    if (!isOpen || !containerRef.current || theme === null) return;
    const container = containerRef.current;
    instanceRef.current = mountAudioRecorder(container, {
      songId,
      theme,
      onSaveProject: handleSaveProject,
      onMixDown: handleMixDown,
      onClose,
      initialRecordings,
      initialProjectData,
      initialProjectName: initialProject?.name,
      projectId: initialProject?.projectId ?? null,
      onProjectNameChange: handleProjectNameChange,
      getPluginSetting: (key) =>
        pluginSettingsApi.getPluginSettings('track-lab').then((s) => (s as Record<string, unknown>)[key]),
      setPluginSetting: (key, value) => pluginSettingsApi.setPluginSetting('track-lab', key, value),
    });
    return () => {
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
    // Only remount when core data changes; callbacks are updated via updateProps to avoid
    // destroy/recreate on every parent re-render (which would reset the project name input).
  }, [isOpen, songId, theme, initialRecordings, initialProjectData]);

  useEffect(() => {
    if (instanceRef.current) {
      instanceRef.current.updateProps({
        songId,
        theme: theme ?? undefined,
        onSaveProject: handleSaveProject,
        onMixDown: handleMixDown,
        onClose,
        initialRecordings,
        initialProjectData,
        initialProjectName: initialProject?.name,
        projectId: initialProject?.projectId ?? null,
        onProjectNameChange: handleProjectNameChange,
        getPluginSetting: (key) =>
          pluginSettingsApi.getPluginSettings('track-lab').then((s) => (s as Record<string, unknown>)[key]),
        setPluginSetting: (key, value) => pluginSettingsApi.setPluginSetting('track-lab', key, value),
      });
    }
  }, [songId, theme, handleSaveProject, handleMixDown, initialRecordings, initialProjectData, initialProject?.name, initialProject?.projectId, handleProjectNameChange]);

  if (!isOpen) return null;

  /* Defer full render until theme is loaded – prevents flash of app theme */
  if (theme === null) {
    return (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-[#e8e6e3]"
        role="dialog"
        aria-modal="true"
        aria-label="Loading Track Lab"
      >
        <p className="text-sm text-[#4a4a4e]">Loading…</p>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-background overflow-hidden w-full h-full max-w-[100vw] max-h-[100dvh] audio-recorder-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="audio-recorder-title"
      data-theme={theme}
    >
      <div id="audio-recorder-title" className="sr-only">
        Audio Recorder
      </div>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10 text-muted-foreground">
          Loading recordings…
        </div>
      )}
      {saving && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-background/90 text-foreground"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" role="status" aria-label="Saving" />
          <p className="text-sm font-medium">Saving project…</p>
          <p className="text-xs text-muted-foreground">Uploading tracks. Please don&apos;t close.</p>
        </div>
      )}
      <div ref={containerRef} className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden audio-recorder-container" />
    </div>
  );
}
