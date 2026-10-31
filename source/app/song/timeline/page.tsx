'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { songApi, profileApi, type UserProfileResponse } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { Event, type SongDetail } from '@/lib/types';
import { groupEventsIntoSessions } from '@/lib/sessionGrouping';
import { getEventsSummary } from '@/lib/eventInterpreter';
import { transformTimelineEvents } from '@/lib/timelineEventTransforms';
import { exportAsText, getStoredSongRhythmForExport } from '@/lib/export';
import { buildAuthorSnapshot } from '@/lib/authorSnapshot';
import { analyzeEvidenceCoverage, getEvidenceSummary } from '@/lib/evidenceAnalysis';
import {
  mockWorkMetadata,
  buildOwnerSplits,
  type Split,
  type MockArtifact,
  type MockArtifactKind,
} from '@/lib/mockCertificateData';
import type { Recording, LyricsScan, LyricsFile, SongVideo, Note, WorkMetadataItem, TrackLabProject, ContributorSplit } from '@/lib/types';
import SessionGroup from '@/components/timeline/SessionGroup';
import EvidenceCoverage from '@/components/timeline/EvidenceCoverage';
import { AppHeader } from '@/components/shared/AppHeader';
import { Breadcrumbs } from '@/components/shared/Breadcrumbs';
import { ProvenanceLogo } from '@/components/shared/ProvenanceLogo';
import { CertificateHeader } from '@/components/timeline/CertificateHeader';
import { SectionDivider } from '@/components/timeline/SectionDivider';
import { ChainIntegrityBanner } from '@/components/timeline/ChainIntegrityBanner';
import { MetadataGrid } from '@/components/timeline/MetadataGrid';
import { SplitsTable } from '@/components/timeline/SplitsTable';
import { ArtifactsSection } from '@/components/timeline/ArtifactsSection';
import { CertificateFooter } from '@/components/timeline/CertificateFooter';
import { formatTsTimestamp } from '@/lib/format';
import { TimelineBottomBar } from '@/components/timeline/TimelineBottomBar';
import { Activity, FileText, Home, Loader2, UsersRound } from 'lucide-react';
import { useAuthGuard } from '@/lib/useAuthGuard';

function buildChordVoicingMap(song: {
  sections?: Array<{
    lines?: Array<{ chords?: Array<{ chordId: string; voicingId?: string }> }>;
  }>;
} | null): Record<string, string> {
  const map: Record<string, string> = {};
  if (!song?.sections) return map;
  for (const section of song.sections) {
    for (const line of section.lines ?? []) {
      for (const chord of line.chords ?? []) {
        if (chord.voicingId) map[chord.chordId] = chord.voicingId;
      }
    }
  }
  return map;
}

const PLACEHOLDER_HASH = '0x' + '0'.repeat(64);

interface CertSnapshot {
  certificateId: string;
  rootHash: string;
  latestHash: string;
  eventCount: number;
  snapshotHash?: string;
  tsaProvider?: string;
  tsaVerificationStatus?: string;
  tsaGenTime?: string;
  violationEventIndex?: number;
  violationReason?: string;
}

function mimeToExt(mime: string): string {
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'webm';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('png')) return 'png';
  return 'bin';
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function buildTimelineArtifacts(
  recordings: Recording[],
  lyricsScans: LyricsScan[],
  lyricsFiles: LyricsFile[],
  videos: SongVideo[],
  notes: Note[],
  trackLabProjects: TrackLabProject[] = []
): MockArtifact[] {
  const list: MockArtifact[] = [];
  const projectMap = new Map(trackLabProjects.map((p) => [p.projectId, p]));
  const noArchived = <T extends { archivedAt?: string | null }>(x: T) => !x.archivedAt;
  recordings.filter(noArchived).forEach((r) => {
    const kind: MockArtifactKind = r.sectionId ? 'stem' : 'demo_recording';
    const project = r.projectId ? projectMap.get(r.projectId) : undefined;
    list.push({
      id: r.recordingId,
      kind,
      label: r.label || 'Demo',
      filename: `recording.${mimeToExt(r.mimeType)}`,
      fileSize: r.sizeBytes != null ? formatBytes(r.sizeBytes) : '—',
      mimeType: r.mimeType,
      uploadedAt: r.updatedAt ?? r.recordingId,
      uploadedBy: '—',
      hash: r.contentHash ?? '—',
      ...(project && {
        trackLabProjectId: project.projectId,
        trackLabProjectName: project.name,
      }),
    });
  });
  lyricsScans.filter(noArchived).forEach((s) => {
    list.push({
      id: s.scanId,
      kind: 'handwritten_lyrics',
      label: 'Lyrics scan',
      filename: `lyrics-scan.${mimeToExt(s.mimeType ?? 'image/jpeg')}`,
      fileSize: '—',
      mimeType: s.mimeType ?? 'image/jpeg',
      uploadedAt: s.createdAt,
      uploadedBy: '—',
      hash: s.contentHash ?? '—',
    });
  });
  lyricsFiles.filter(noArchived).forEach((f) => {
    list.push({
      id: f.lyricsFileId,
      kind: 'lyrics_import',
      label: 'Imported lyrics file',
      filename: f.filename,
      fileSize: formatBytes(f.sizeBytes),
      mimeType: f.mimeType,
      uploadedAt: f.createdAt,
      uploadedBy: '—',
      hash: f.contentHash ?? '—',
    });
  });
  videos.filter(noArchived).forEach((v) => {
    list.push({
      id: v.videoId,
      kind: 'video',
      label: 'Video',
      filename: `video.${mimeToExt(v.mimeType ?? 'video/webm')}`,
      fileSize: '—',
      mimeType: v.mimeType ?? 'video/webm',
      uploadedAt: v.createdAt,
      uploadedBy: '—',
      hash: v.contentHash ?? '—',
    });
  });
  notes.filter(noArchived).forEach((n) => {
    list.push({
      id: n.noteId,
      kind: 'note',
      label: n.title || 'Note',
      filename: 'note.md',
      fileSize: '—',
      mimeType: 'text/markdown',
      uploadedAt: n.updatedAt,
      uploadedBy: '—',
      hash: n.contentHash ?? '—',
    });
  });
  return list.sort(
    (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
  );
}

function ValidationSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted" />
        <span className="text-xs text-muted">Verifying hash chain integrity…</span>
      </div>
      <div className="mt-3 space-y-2">
        <div className="h-3 w-3/4 rounded bg-muted/20" />
        <div className="h-3 w-1/2 rounded bg-muted/20" />
      </div>
    </div>
  );
}

function TimelinePageInner() {
  const searchParams = useSearchParams();
  const songId = searchParams.get('id') ?? '';
  const [rawEvents, setRawEvents] = useState<Event[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [songDetail, setSongDetail] = useState<SongDetail | null>(null);
  const [chordVoicingMap, setChordVoicingMap] = useState<Record<string, string>>({});
  const [songTitle, setSongTitle] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfileResponse | null>(null);
  const [chainVerified, setChainVerified] = useState<boolean | null>(null);
  const [certSnapshot, setCertSnapshot] = useState<CertSnapshot | null>(null);
  const [validating, setValidating] = useState(false);
  const [validationLoading, setValidationLoading] = useState(true);
  const [artifacts, setArtifacts] = useState<MockArtifact[]>([]);
  const [workMetadataItems, setWorkMetadataItems] = useState<WorkMetadataItem[]>([]);
  const [contributorSplits, setContributorSplits] = useState<ContributorSplit[]>([]);
  const [workspaceContext, setWorkspaceContext] = useState<{
    teamId: string | null;
    teamName: string | null;
    collaborationChatEnabled: boolean;
  } | null>(null);
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { authChecked } = useAuthGuard();

  const applyValidationResult = useCallback((result: {
    valid: boolean;
    certificateId: string;
    rootHash: string;
    latestHash: string;
    eventCount: number;
    snapshotHash?: string;
    tsaProvider?: string;
    tsaVerificationStatus?: string;
    tsaGenTime?: string;
    violationEventIndex?: number;
    violationReason?: string;
  }) => {
    setChainVerified(result.valid);
    setCertSnapshot({
      certificateId: result.certificateId,
      rootHash: result.rootHash,
      latestHash: result.latestHash,
      eventCount: result.eventCount,
      snapshotHash: result.snapshotHash,
      tsaProvider: result.tsaProvider,
      tsaVerificationStatus: result.tsaVerificationStatus,
      tsaGenTime: result.tsaGenTime,
      violationEventIndex: result.violationEventIndex,
      violationReason: result.violationReason,
    });
  }, []);

  // Phase 1: Load core timeline data and Track Lab projects
  const loadTimelineData = useCallback(async () => {
    try {
      const [data, trackLabProjects] = await Promise.all([
        songApi.getTimelineData(songId),
        songApi.getTrackLabProjects(songId),
      ]);
      setRawEvents(data.events);
      setEvents(transformTimelineEvents(data.events));
      setSongDetail(data.song ?? null);
      setChordVoicingMap(buildChordVoicingMap(data.song));
      setSongTitle(data.song?.title || 'Untitled Song');
      setArtifacts(
        buildTimelineArtifacts(
          data.recordings,
          data.lyricsScans,
          data.lyricsFiles,
          data.videos,
          data.notes,
          trackLabProjects
        )
      );
      setWorkMetadataItems(data.metadata);
      setContributorSplits(data.contributorSplits ?? []);
    } catch (error) {
      console.error('Failed to load timeline data', error);
    } finally {
      setLoading(false);
    }
  }, [songId]);

  // Phase 2: Deferred validation (expensive: hash chain + TSA anchoring)
  const loadValidation = useCallback(async () => {
    setValidationLoading(true);
    try {
      const result = await songApi.validateSong(songId);
      applyValidationResult(result);
    } catch (error) {
      console.error('Failed to validate chain', error);
      setChainVerified(false);
    } finally {
      setValidationLoading(false);
    }
  }, [songId, applyValidationResult]);

  const handleValidate = async () => {
    setValidating(true);
    try {
      const result = await songApi.validateSong(songId);
      applyValidationResult(result);
      return result.valid;
    } finally {
      setValidating(false);
    }
  };

  useEffect(() => {
    if (authChecked && songId) {
      loadTimelineData();
    }
  }, [authChecked, songId, loadTimelineData]);

  // Defer validation until after core data is rendered
  useEffect(() => {
    if (!authChecked || loading) return;
    loadValidation();
  }, [authChecked, loading, loadValidation]);

  useEffect(() => {
    if (!authChecked || !user) return;
    profileApi.getProfile().then(setProfile).catch(() => setProfile(null));
  }, [authChecked, user]);

  useEffect(() => {
    if (!songId) return;
    songApi
      .getWorkspaceContext(songId)
      .then(setWorkspaceContext)
      .catch(() =>
        setWorkspaceContext({ teamId: null, teamName: null, collaborationChatEnabled: false })
      );
  }, [songId]);

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <p>Checking authentication...</p>
      </div>
    );
  }

  const sessions = groupEventsIntoSessions(events);
  const coverage = analyzeEvidenceCoverage(rawEvents);

  // History-start boundary: history recording was introduced after some songs
  // already had content, and backups from before it carry no events. Surface
  // that boundary instead of suggesting the log covers the song's lifetime.
  const songHasContent = Boolean(
    songDetail?.sections?.some((s) => (s.lines?.length ?? 0) > 0) ||
    artifacts.length > 0 ||
    workMetadataItems.length > 0
  );
  const earliestEvent = rawEvents.length > 0 ? rawEvents[0] : undefined;
  const songPredatesLog = Boolean(
    songDetail?.createdAt &&
    earliestEvent &&
    new Date(songDetail.createdAt).getTime() < new Date(earliestEvent.timestamp).getTime() - 60_000
  );

  const certificateId = certSnapshot?.certificateId ?? '—';
  const rootHash = certSnapshot?.rootHash ?? PLACEHOLDER_HASH;
  const latestHash = certSnapshot?.latestHash ?? PLACEHOLDER_HASH;
  const eventCount = certSnapshot?.eventCount ?? rawEvents.length;
  const hashesFromApi = certSnapshot != null;

  const workMetadataForDisplay = (() => {
    const visible = workMetadataItems.filter((i) => !i.archivedAt && i.showOnTimeline);
    if (visible.length > 0) {
      return { items: visible.map((i) => ({ name: i.name, value: i.value ?? '' })) };
    }
    return mockWorkMetadata;
  })();

  const ownerSplits: Split[] = contributorSplits.length > 0
    ? contributorSplits.map((c) => ({ name: c.name, role: c.role, share: c.share }))
    : buildOwnerSplits(profile);

  const pdfPayload =
    certSnapshot != null
      ? {
          songTitle: songTitle || 'Untitled Song',
          certificateId: certSnapshot.certificateId,
          rootHash: certSnapshot.rootHash,
          latestHash: certSnapshot.latestHash,
          eventCount: certSnapshot.eventCount,
          chainVerified,
          workMetadata: workMetadataForDisplay,
          splits: ownerSplits,
          evidenceSummary: getEvidenceSummary(coverage),
          artifacts: artifacts.map((a) => ({
            id: a.id,
            kind: a.kind,
            label: a.label,
            filename: a.filename,
            mimeType: a.mimeType,
            uploadedAt: a.uploadedAt,
            hash: a.hash !== '—' ? a.hash : undefined,
          })),
          writingSessions:
            sessions.length > 0
              ? sessions.map((s) => ({
                  durationMinutes: s.durationMinutes,
                  startTime: s.startTime,
                  endTime: s.endTime,
                  summaryText: getEventsSummary(s.events),
                  eventCount: s.events.length,
                }))
              : undefined,
          songAsText: songDetail
            ? exportAsText(
                songDetail,
                getStoredSongRhythmForExport(songDetail.songId),
                buildAuthorSnapshot(profile)
              )
            : undefined,
          authorSnapshot: buildAuthorSnapshot(profile) ?? undefined,
          snapshotHash: certSnapshot.snapshotHash,
          tsaProvider: certSnapshot.tsaProvider,
          tsaGenTime: certSnapshot.tsaGenTime,
          tsaVerificationStatus: certSnapshot.tsaVerificationStatus,
        }
      : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader profile={profile} user={user} logout={logout} onProfileSaved={setProfile} />
        <main className="px-4 py-6 pb-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl flex flex-col gap-8">
            <div className="animate-pulse space-y-6">
              <div className="h-8 w-2/3 rounded bg-muted/20" />
              <div className="h-4 w-1/3 rounded bg-muted/20" />
              <div className="h-px w-full bg-border" />
              <div className="space-y-3">
                <div className="h-20 rounded-lg bg-muted/10" />
                <div className="h-16 rounded-lg bg-muted/10" />
                <div className="h-16 rounded-lg bg-muted/10" />
              </div>
              <div className="h-px w-full bg-border" />
              <div className="space-y-3">
                <div className="h-12 rounded-lg bg-muted/10" />
                <div className="h-12 rounded-lg bg-muted/10" />
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader profile={profile} user={user} logout={logout} onProfileSaved={setProfile} />

      <main className="px-4 py-6 pb-24 sm:px-6 lg:px-8">
        <div className="no-print mb-6">
          <Breadcrumbs
            items={[
              { href: '/songs', label: 'Workspaces', icon: <Home className="size-4" /> },
              ...(workspaceContext?.teamId && workspaceContext?.teamName
                ? [{ href: `/teams/${workspaceContext.teamId}`, label: workspaceContext.teamName, icon: <UsersRound className="size-4" /> }]
                : []),
              {
                href: `/song?id=${songId}`,
                label: songTitle || 'Song',
                icon: <FileText className="size-4" />,
              },
              { label: 'Event Timeline', icon: <Activity className="size-4" /> },
            ]}
          />
        </div>

        <div className="mx-auto max-w-3xl flex flex-col gap-8">
          <CertificateHeader
            songTitle={songTitle || 'Untitled Song'}
            certificateId={certificateId}
            rootHash={rootHash}
            chainVerified={chainVerified}
          />

          <SectionDivider />

          {validationLoading ? (
            <ValidationSkeleton />
          ) : (
            <ChainIntegrityBanner
              verified={chainVerified}
              violationEventIndex={certSnapshot?.violationEventIndex}
              violationReason={certSnapshot?.violationReason}
            />
          )}

          <EvidenceCoverage coverage={coverage} />

          <SectionDivider label="Work Details" />

          <MetadataGrid data={workMetadataForDisplay} />
          <SplitsTable data={{ splits: ownerSplits }} />

          <SectionDivider label="Supporting Evidence" />

          <ArtifactsSection artifacts={artifacts} />

          <SectionDivider label="Immutable Event Log" />

          {songPredatesLog && earliestEvent && (
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-xs leading-relaxed text-muted">
                History recording started after this song already existed, so the log begins
                at {formatTsTimestamp(earliestEvent.timestamp)}. Earlier activity is not
                shown and cannot be reconstructed.
              </p>
            </div>
          )}

          {sessions.length > 0 ? (
            <div>
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-[0.15em] text-muted">
                Writing Sessions
              </h2>
              <p className="mb-5 text-xs leading-relaxed text-muted/70">
                Your creative process grouped by activity. Sessions separated by more
                than 30 minutes are shown separately.
              </p>
              <div className="flex flex-col gap-4">
                {sessions.map((session, i) => {
                  const eventStartIndex = sessions
                    .slice(0, i)
                    .reduce((sum, s) => sum + s.events.length, 0);
                  const breakingIndex =
                    chainVerified === false && certSnapshot?.violationEventIndex != null
                      ? certSnapshot.violationEventIndex
                      : -1;
                  const containsBreakingEvent =
                    breakingIndex >= 0 &&
                    breakingIndex >= eventStartIndex &&
                    breakingIndex < eventStartIndex + session.events.length;
                  return (
                    <SessionGroup
                      key={session.id}
                      session={session}
                      eventStartIndex={eventStartIndex}
                      breakingEventIndex={breakingIndex}
                      violationReason={chainVerified === false ? certSnapshot?.violationReason : undefined}
                      defaultExpanded={
                        sessions.length === 1 || i === 0 || containsBreakingEvent
                      }
                      showTimestamps
                      chordVoicingMap={chordVoicingMap}
                    />
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-surface p-8 text-center">
              {songHasContent ? (
                <p className="text-muted">
                  This song&apos;s content predates history recording, so there are no events
                  to show yet. Everything you add or change from now on is recorded here.
                </p>
              ) : (
                <p className="text-muted">No events recorded yet. Start creating!</p>
              )}
            </div>
          )}

          <SectionDivider label="Verification" />

          <div className="rounded-lg border border-border bg-surface p-5">
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-[0.15em] text-muted">
              Verification
            </h2>
            <p className="mb-4 text-xs leading-relaxed text-muted/70">
              The hash chain is verified on this device against the history stored in this
              browser. This detects changes to that stored history; it does not prove when
              events originally happened and is not independently witnessed. The public
              verification page is not part of this local version.
            </p>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
                Validation ID
              </p>
              <p className="break-all font-mono text-sm text-foreground">{certificateId}</p>
            </div>
          </div>

          <CertificateFooter
            rootHash={rootHash}
            latestHash={latestHash}
            eventCount={eventCount}
            hashesFromApi={hashesFromApi}
          />

          {(certSnapshot?.tsaProvider ?? certSnapshot?.tsaVerificationStatus) && (
            <div className="rounded-lg border border-border bg-surface p-5">
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-muted">
                External Timestamp
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {certSnapshot?.tsaProvider && (
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
                      TSA Provider
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-foreground">
                      {certSnapshot.tsaProvider}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
                    Timestamp (UTC)
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-foreground">
                    {certSnapshot?.tsaGenTime
                      ? formatTsTimestamp(certSnapshot.tsaGenTime)
                      : '—'}
                  </p>
                </div>
                {certSnapshot?.tsaVerificationStatus && (
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
                      Status
                    </p>
                    <p
                      className={`mt-0.5 text-[11px] font-medium ${
                        certSnapshot.tsaVerificationStatus === 'verified'
                          ? 'text-green-600 dark:text-green-400'
                          : certSnapshot.tsaVerificationStatus === 'failed'
                            ? 'text-destructive'
                            : 'text-muted-foreground'
                      }`}
                    >
                      {certSnapshot.tsaVerificationStatus}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col items-center gap-2 pb-8 pt-4">
            <div className="flex items-center gap-1.5">
              <ProvenanceLogo iconSize={14} hideText />
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
                Hash-Chained · Tamper-Evident · Verified On This Device
              </span>
            </div>
            <p className="font-mono text-[10px] text-muted/60">{certificateId}</p>
          </div>
        </div>
      </main>
      <TimelineBottomBar
        pdfPayload={pdfPayload}
        onValidate={handleValidate}
        validating={validating}
        verified={chainVerified}
        profile={profile}
      />
    </div>
  );
}


export default function TimelinePage() {
  return (
    <Suspense fallback={null}>
      <TimelinePageInner />
    </Suspense>
  );
}
