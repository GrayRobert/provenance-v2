export interface WorkMetadata {
  items: { name: string; value: string }[];
}

export interface Split {
  name: string;
  role: string;
  share: number;
}

export interface CertificatePdfPayload {
  songTitle: string;
  certificateId: string;
  rootHash: string;
  latestHash: string;
  eventCount: number;
  chainVerified: boolean | null;
  workMetadata: WorkMetadata;
  splits: Split[];
  /** Explicit evidence summary: what is covered (reliable) and what is questionable (e.g. pasted). */
  evidenceSummary: {
    covered: string[];
    questionable: string[];
  };
  /** Supporting evidence files (recordings, lyrics scans, videos, notes) for the PDF evidence section. */
  artifacts?: Array<{
    id: string;
    kind: string;
    label: string;
    filename: string;
    mimeType: string;
    uploadedAt: string;
    hash?: string;
  }>;
  /** Optional QR code as data URL (authenticate URL); when set, included in Verification section. */
  qrDataUrl?: string;
  /** Optional logo image URL (e.g. origin + '/provenance-v2/logo/8thnote_cropped.svg'); when set, shown in header. */
  logoUrl?: string;
  /** Full URL to verify this certificate (e.g. https://provenancemusic.com/authenticate/{id} in prod, http://localhost:3000/authenticate/{id} in dev); when set, shown as hyperlink in Verification section. */
  verifyUrl?: string;
  /** Top-level writing session data for the PDF (proves when the song was written). */
  writingSessions?: Array<{
    durationMinutes: number;
    startTime: string;
    endTime: string;
    summaryText: string;
    eventCount: number;
  }>;
  /** Song content as plain text (from exportAsText), i.e. lyrics and chords as in the HTML export. */
  songAsText?: string;
  /** TSA (RFC 3161) anchoring: snapshot and external timestamp. When set, shown in PDF. */
  snapshotHash?: string;
  tsaProvider?: string;
  tsaGenTime?: string;
  tsaVerificationStatus?: string;
  tsaVerificationError?: string;
}

export function sanitizeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 80) || 'certificate';
}
