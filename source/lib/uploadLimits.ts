/**
 * Client-side pre-checks only — must stay aligned with backend
 * `provenance.upload` in application.yml (defaults).
 */
export const UPLOAD_MAX_SONG_IMPORT_BYTES = 5 * 1024 * 1024;
export const UPLOAD_MAX_LYRICS_SCAN_BYTES = 20 * 1024 * 1024;
export const UPLOAD_MAX_AUDIO_BYTES = 50 * 1024 * 1024;
export const UPLOAD_MAX_VIDEO_BYTES = 150 * 1024 * 1024;

export function uploadMaxMb(bytes: number): number {
  return Math.round(bytes / (1024 * 1024));
}

/** Extract server `error` field or sensible default for multipart/upload failures. */
export function getUploadErrorMessage(err: unknown): string {
  const e = err as {
    response?: { status?: number; data?: { error?: string } };
    message?: string;
  };
  const body = e?.response?.data?.error;
  if (typeof body === 'string' && body.trim()) return body;
  if (e?.response?.status === 413) {
    return 'Upload exceeds the server size limit. Use a smaller file or split Track Lab saves.';
  }
  if (typeof e?.message === 'string' && e.message && e.message !== 'Network Error') {
    return e.message;
  }
  return 'Upload failed. Please try again.';
}
