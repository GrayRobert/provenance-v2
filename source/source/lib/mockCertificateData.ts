/**
 * Mock data for certificate sections not yet backed by API (Work Details, Artifacts).
 * Work metadata is now API-backed; this fallback is used when no metadata or loading.
 */

export const mockWorkMetadata = {
  items: [
    { name: 'Album', value: '—' },
    { name: 'ISRC', value: '—' },
    { name: 'ISWC', value: '—' },
    { name: 'Duration', value: '—' },
    { name: 'BPM', value: '—' },
    { name: 'Key', value: '—' },
    { name: 'Genre', value: '—' },
    { name: 'Publisher', value: '—' },
  ] as { name: string; value: string }[],
};

export interface Split {
  name: string;
  role: string;
  share: number;
}

export const mockSplits: Split[] = [
  { name: '—', role: '—', share: 100 },
];

/** Build ownership splits: 100% to current user. Name from profile author name or obfuscated id. */
export function buildOwnerSplits(profile: { userId: string; authorName?: string | null; authorNameObfuscate?: boolean; displayName?: string | null } | null): Split[] {
  if (!profile) return mockSplits;
  const name = profile.authorNameObfuscate
    ? `Owner #${profile.userId.replace(/-/g, '').slice(0, 8)}`
    : (profile.authorName?.trim() || profile.displayName?.trim() || 'Owner');
  return [{ name, role: 'Owner', share: 100 }];
}

export type MockArtifactKind =
  | 'demo_recording'
  | 'handwritten_lyrics'
  | 'lyrics_import'
  | 'music_notation'
  | 'photo'
  | 'stem'
  | 'contract'
  | 'video'
  | 'note';

export interface MockArtifact {
  id: string;
  kind: MockArtifactKind;
  label: string;
  filename: string;
  fileSize: string;
  mimeType: string;
  uploadedAt: string;
  uploadedBy: string;
  hash: string;
  linkedEventId?: string;
  /** When set, this artifact (recording) is part of a Track Lab project. */
  trackLabProjectId?: string;
  trackLabProjectName?: string;
}

export const mockArtifacts: MockArtifact[] = [
  {
    id: 'art-001',
    kind: 'demo_recording',
    label: 'Demo (mock)',
    filename: 'demo.m4a',
    fileSize: '—',
    mimeType: 'audio/mp4',
    uploadedAt: new Date().toISOString(),
    uploadedBy: '—',
    hash: '0x' + '0'.repeat(64),
  },
  {
    id: 'art-002',
    kind: 'handwritten_lyrics',
    label: 'Lyrics scan (mock)',
    filename: 'lyrics.jpg',
    fileSize: '—',
    mimeType: 'image/jpeg',
    uploadedAt: new Date().toISOString(),
    uploadedBy: '—',
    hash: '0x' + '0'.repeat(64),
  },
];
