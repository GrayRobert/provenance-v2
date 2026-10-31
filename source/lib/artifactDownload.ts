import { getClerkToken } from '@/lib/clerkTokenProvider';

/** File extension from a MIME type (fallback `bin`). */
export function extFromMime(mime?: string | null): string {
  const m = (mime ?? '').toLowerCase();
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  if (m.includes('webm')) return 'webm';
  if (m.includes('mp4')) return 'mp4';
  if (m.includes('quicktime') || m.includes('m4v')) return 'm4v';
  if (m.includes('wav')) return 'wav';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('ogg')) return 'ogg';
  return 'bin';
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * GET an artifact URL with Bearer auth and save as a file (for list rows where no blob URL exists yet).
 */
export async function downloadWithAuth(url: string, filename: string): Promise<void> {
  const token =
    (typeof window !== 'undefined' ? await getClerkToken() : null) ??
    (typeof window !== 'undefined' ? localStorage.getItem('jwt') : null);
  if (!token) {
    throw new Error('Sign in to download');
  }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`Download failed (${res.status})`);
  }
  const blob = await res.blob();
  triggerBlobDownload(blob, filename);
}

/** Download plain text / markdown (e.g. note export). */
export function downloadTextFile(filename: string, content: string, mimeType = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mimeType });
  triggerBlobDownload(blob, filename);
}
