export interface User {
  userId: string;
  email: string;
}

export interface LoginResponse {
  token: string;
  userId: string;
  email: string;
}

export interface SongSummary {
  songId: string;
  title: string;
  updatedAt: string;
  archived: boolean;
}

export interface SongDetail {
  songId: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastEventSequence: number;
  archived: boolean;
  sections: Section[];
}

export interface Section {
  sectionId: string;
  sectionType: string;
  label: string;
  orderIndex: number;
  lines: Line[];
}

export interface Token {
  tokenId: string;
  text: string;
  tokenIndex: number;
  startOffset: number;
  endOffset: number;
}

export interface Line {
  lineId: string;
  text: string;
  orderIndex: number;
  tokens: Token[];
  chords: Chord[];
}

export interface Chord {
  chordId: string;
  tokenId: string | null;
  charOffset: number;
  chordSymbol: string;
  voicingId?: string;
  orphaned: boolean;
}

export interface ChordVoicing {
  id: string;
  name: string;
  positions: number[];
  baseFret: number;
}

export interface PianoVoicing {
  id: string;
  name: string;
  notes: string[]; // e.g., ['C4', 'E4', 'G4']
}

export type Instrument = 'guitar' | 'piano';

/** Recording (audio track) for a song; current version points to one artifact. */
export interface Recording {
  recordingId: string;
  songId: string;
  /** When set, section recording; when null, demo (full song). */
  sectionId?: string | null;
  artifactId: string;
  contentHash: string;
  mimeType: string;
  sizeBytes: number;
  trackIndex: number;
  label: string | null;
  /** True when the user named this take themselves; the label is shown as-is (no version formatting). */
  customLabel?: boolean;
  durationSeconds: number | null;
  /** When the recording was last updated (artifact list). */
  updatedAt?: string;
  archivedAt: string | null;
  /** When non-null, recording belongs to a Track Lab project. */
  projectId?: string | null;
}

/** Track Lab multitrack project for a song. */
export interface TrackLabProject {
  projectId: string;
  songId: string;
  name: string;
  /** JSON string with track configuration (tempo, timeSignature, track settings). */
  projectData: string;
  /** Recordings that belong to this project. */
  recordings: Recording[];
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

/** Note (markdown) for a song; current version points to one artifact. body when loaded from getNote. */
export interface Note {
  noteId: string;
  songId: string;
  artifactId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  contentHash?: string;
  body?: string;
}

/** Lyrics scan: image artifact (e.g. photo of hand-written lyrics) for a song. */
export interface LyricsScan {
  scanId: string;
  artifactId: string;
  createdAt: string;
  mimeType?: string;
  contentHash?: string;
  archivedAt: string | null;
}

/** Imported lyrics file (.txt/.html) stored as artifact for provenance. */
export interface LyricsFile {
  lyricsFileId: string;
  songId: string;
  artifactId: string;
  filename: string;
  mimeType: string;
  contentHash: string;
  sizeBytes: number;
  createdAt: string;
  archivedAt: string | null;
}

/** Song video: video artifact (e.g. recorded clip) for a song. */
export interface SongVideo {
  videoId: string;
  artifactId: string;
  createdAt: string;
  mimeType?: string;
  durationSeconds?: number | null;
  contentHash?: string;
  archivedAt: string | null;
}

/** Predefined metadata type for dropdown (Album, ISRC, Publisher, Custom, etc.). */
export interface MetadataType {
  id: string;
  name: string;
  sortOrder: number;
}

/** Work metadata item: one name/value row for a song (single set per song). */
export interface WorkMetadataItem {
  itemId: string;
  name: string;
  value: string;
  showOnTimeline: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Event {
  eventId: string;
  eventType: string;
  sequenceNumber: number;
  timestamp: string;
  payload: string;
  source: string;
  /** SHA-256 hash of this event (64-char hex). From API when available. */
  eventHash?: string;
  /** Hash of the previous event (64-char hex, or empty for genesis). From API when available. */
  previousHash?: string;
}

export interface WritingSession {
  id: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  events: Event[];
  summary: {
    linesWritten: number;
    sectionsCreated: number;
    chordsAdded: number;
    editsMode: number;
  };
}

/** Contributor split for a song (even ownership split based on event log contributors). */
export interface ContributorSplit {
  userId: string;
  name: string;
  role: string;
  share: number;
}

/** Combined payload returned by the /timeline-data endpoint (single request for all timeline data). */
export interface TimelineData {
  events: Event[];
  song: SongDetail;
  recordings: Recording[];
  lyricsScans: LyricsScan[];
  lyricsFiles: LyricsFile[];
  videos: SongVideo[];
  notes: Note[];
  metadata: WorkMetadataItem[];
  contributorSplits: ContributorSplit[];
}

export interface EvidenceCoverage {
  lyrics: boolean;         // Any lines added
  structure: boolean;      // Sections created
  chords: boolean;        // Chord annotations
  iterations: boolean;     // Edit events present
  typedInput: boolean;     // Typed events (direct keyboard)
  pastedInput: boolean;    // Paste events (content pasted from clipboard)
  importedInput: boolean;  // Some lyrics imported from file
  audioOrDemo: boolean;    // At least one recording (demo or section) uploaded
}

/** Team workspace for collaboration. */
export interface Team {
  teamId: string;
  name: string;
  createdBy: string;
  inviteCode: string;
  createdAt: string;
  memberCount: number;
  role: string;
}

/** Member of a team workspace. */
export interface TeamMember {
  userId: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  role: string;
  joinedAt: string;
  /** When set, member has read-only access to songs shared before this time; no write access. */
  disabledAt?: string | null;
}

/** Song shared into a team workspace. */
export interface TeamSong {
  songId: string;
  title: string | null;
  ownerId: string;
  ownerDisplayName: string | null;
  sharedBy: string;
  sharedAt: string;
  updatedAt: string;
  archived: boolean;
}

/** Write lock on a song (one writer at a time). */
export interface SongWriteLock {
  songId: string;
  lockedBy: string;
  lockedByDisplayName: string | null;
  acquiredAt: string;
  expiresAt: string;
}

/** Presence of a user on a song. */
export interface SongPresence {
  userId: string;
  displayName: string | null;
  /** When display name is empty. */
  authorName?: string | null;
  /** For email-local fallback when names are empty. */
  email?: string | null;
  avatarUrl: string | null;
  lastSeenAt: string;
  isEditing: boolean;
}

/** Enriched reader row (matches backend {@link ChatReaderMiniDTO}). */
export interface ChatReaderMini {
  userId: string;
  authorDisplayName: string | null;
  authorEmail?: string | null;
  authorUsername: string | null;
  avatarUrl: string | null;
}

/** Team workspace song chat message (from event-sourced log). */
export interface ChatMessageView {
  messageId: string;
  userId: string;
  body: string;
  sequenceNumber: number;
  timestamp: string;
  archived: boolean;
  authorDisplayName: string | null;
  /** For label fallback (local part before @); absent on older API responses. */
  authorEmail?: string | null;
  authorUsername: string | null;
  avatarUrl: string | null;
  readByUserIds: string[];
  /** When present, use for read-receipt avatars (works when reader is offline). */
  readByReaders?: ChatReaderMini[];
}

export interface ChatUnreadItem {
  songId: string;
  unreadCount: number;
}

export interface ChatUnreadSummary {
  items: ChatUnreadItem[];
}

