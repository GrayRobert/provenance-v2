/**
 * Adapter between Provenance recording/artifact types and the audio-recorder plugin.
 * Maps backend Recording to plugin RecordingSummary (with playback URL) and plugin
 * export format to upload payload.
 */

import type { Recording } from './types';
import { songApi } from './api';

/** Plugin-side summary: id, duration, label, and URL or blob for playback. */
export interface PluginRecordingSummary {
  id: string;
  recordingId: string;
  trackIndex: number;
  label: string | null;
  durationSeconds: number | null;
  /** URL to stream the artifact (requires auth). */
  playbackUrl: string;
  mimeType: string;
}

/** Plugin export: per-track blob + metadata for upload. */
export interface ExportRecording {
  trackIndex: number;
  label: string | null;
  durationSeconds: number | null;
  blob: Blob;
  mimeType: string;
}

/**
 * Map backend Recording to plugin RecordingSummary (with playback URL).
 */
export function recordingToPluginSummary(
  recording: Recording,
  songId: string
): PluginRecordingSummary {
  return {
    id: recording.artifactId,
    recordingId: recording.recordingId,
    trackIndex: recording.trackIndex,
    label: recording.label ?? null,
    durationSeconds: recording.durationSeconds ?? null,
    playbackUrl: songApi.getRecordingArtifactUrl(songId, recording.recordingId),
    mimeType: recording.mimeType,
  };
}

/**
 * Map list of backend recordings to plugin summaries (for initialRecordings).
 */
export function recordingsToPluginSummaries(
  recordings: Recording[],
  songId: string
): PluginRecordingSummary[] {
  return recordings
    .sort((a, b) => a.trackIndex - b.trackIndex)
    .map((r) => recordingToPluginSummary(r, songId));
}

/**
 * Upload a single exported recording via Provenance API.
 * When sectionId is set, this is a section recording (one primary per section).
 */
export async function uploadExportRecording(
  songId: string,
  exportRec: ExportRecording,
  options?: { sectionId?: string | null }
): Promise<{ recordingId: string }> {
  return songApi.uploadRecording(songId, exportRec.blob, {
    sectionId: options?.sectionId ?? undefined,
    trackIndex: exportRec.trackIndex,
    label: exportRec.label ?? undefined,
    durationSeconds: exportRec.durationSeconds ?? undefined,
  });
}

/**
 * Upload multiple exported recordings. When sectionId is set, only the first track
 * is uploaded (one recording per section). Otherwise all tracks are uploaded as demos.
 */
export async function uploadExportRecordings(
  songId: string,
  exports: ExportRecording[],
  options?: { sectionId?: string | null }
): Promise<{ recordingId: string }[]> {
  const toUpload =
    options?.sectionId != null && options.sectionId !== ''
      ? exports.slice(0, 1)
      : exports;
  const results: { recordingId: string }[] = [];
  for (let i = 0; i < toUpload.length; i++) {
    const exp = toUpload[i];
    const result = await uploadExportRecording(songId, exp, {
      sectionId: options?.sectionId ?? undefined,
    });
    results.push(result);
  }
  return results;
}
