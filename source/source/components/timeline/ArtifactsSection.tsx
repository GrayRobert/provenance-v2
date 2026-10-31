'use client';

import { useState } from 'react';
import {
  Mic,
  PenLine,
  Music,
  Image as ImageIcon,
  Layers,
  FileText,
  FileUp,
  Video,
  ChevronDown,
  ChevronUp,
  Link2,
} from 'lucide-react';
import { HashVisualizer } from '@/components/timeline/HashVisualizer';
import type { MockArtifact, MockArtifactKind } from '@/lib/mockCertificateData';

const kindConfig: Record<
  MockArtifactKind,
  { icon: typeof Mic; label: string; accent: boolean }
> = {
  demo_recording: { icon: Mic, label: 'Demo Recording', accent: true },
  handwritten_lyrics: { icon: PenLine, label: 'Handwritten Lyrics', accent: false },
  lyrics_import: { icon: FileUp, label: 'Imported lyrics file', accent: false },
  music_notation: { icon: Music, label: 'Music Notation', accent: true },
  photo: { icon: ImageIcon, label: 'Photo', accent: false },
  stem: { icon: Layers, label: 'Audio Stem', accent: false },
  contract: { icon: FileText, label: 'Contract', accent: false },
  video: { icon: Video, label: 'Video', accent: true },
  note: { icon: FileText, label: 'Note', accent: false },
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function ArtifactCard({ artifact }: { artifact: MockArtifact }) {
  const [expanded, setExpanded] = useState(false);
  const config = kindConfig[artifact.kind];
  const Icon = config.icon;

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border ${
            config.accent ? 'bg-accent/10 text-accent' : 'bg-border text-muted'
          }`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-block rounded bg-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                  {config.label}
                </span>
                {artifact.linkedEventId && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-accent">
                    <Link2 className="h-2.5 w-2.5" />
                    {artifact.linkedEventId.replace('evt-', 'Block #')}
                  </span>
                )}
              </div>
              <h3 className="mt-1.5 text-sm font-semibold text-foreground">
                {artifact.label}
              </h3>
            </div>
            <p className="shrink-0 text-xs font-medium text-foreground">
              {formatDate(artifact.uploadedAt)}
            </p>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-[11px] text-muted">
              {artifact.filename}
            </span>
            <span className="text-[10px] text-muted/60">{artifact.fileSize}</span>
            <span className="text-[10px] text-muted/60">{artifact.mimeType}</span>
          </div>
          <p className="mt-1.5 text-xs text-muted">
            Uploaded by{' '}
            <span className="font-medium text-foreground">{artifact.uploadedBy}</span>
          </p>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="mt-3 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted transition-colors hover:text-foreground"
          >
            <Link2 className="h-3 w-3" />
            File Hash
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {expanded && (
            <div className="mt-3 flex items-start gap-3 rounded-md border border-border bg-border/30 p-3">
              <HashVisualizer hash={artifact.hash} size={4} />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
                  SHA-256 Fingerprint
                </p>
                <p className="mt-0.5 break-all font-mono text-[11px] leading-relaxed text-foreground">
                  {artifact.hash}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ArtifactsSection({ artifacts }: { artifacts: MockArtifact[] }) {
  // Group by Track Lab project first; artifacts without a project go under "other"
  const byProject = artifacts.reduce(
    (acc, artifact) => {
      const key = artifact.trackLabProjectId
        ? `project:${artifact.trackLabProjectId}`
        : 'other';
      if (!acc[key]) acc[key] = { name: artifact.trackLabProjectName ?? null, items: [] };
      acc[key].items.push(artifact);
      return acc;
    },
    {} as Record<string, { name: string | null; items: MockArtifact[] }>
  );

  // Within "other", group by kind
  const otherItems = byProject.other?.items ?? [];
  const otherGrouped = otherItems.reduce(
    (acc, artifact) => {
      const group = kindConfig[artifact.kind].label;
      if (!acc[group]) acc[group] = [];
      acc[group].push(artifact);
      return acc;
    },
    {} as Record<string, MockArtifact[]>
  );

  const projectEntries = Object.entries(byProject).filter(([k]) => k.startsWith('project:'));

  return (
    <div>
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-[0.15em] text-muted">
        Artifacts · {artifacts.length} Files
      </h2>
      <p className="mb-5 text-xs leading-relaxed text-muted/70">
        Supporting evidence: demo recordings, handwritten lyrics, music notation,
        session photos, audio stems, signed contracts. Each file is SHA-256 hashed at upload.
      </p>
      <div className="flex flex-col gap-4">
        {projectEntries.map(([key, { name, items }]) => (
          <div key={key} className="flex flex-col gap-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Track Lab Project: {name ?? 'Untitled'}
            </h3>
            <p className="text-[10px] text-muted/70 -mt-1">
              {items.length} track{items.length !== 1 ? 's' : ''} from a single multitrack session
            </p>
            <div className="flex flex-col gap-3">
              {items.map((artifact) => (
                <ArtifactCard key={artifact.id} artifact={artifact} />
              ))}
            </div>
          </div>
        ))}
        {Object.entries(otherGrouped).map(([group, items]) => (
          <div key={group} className="flex flex-col gap-3">
            {items.map((artifact) => (
              <ArtifactCard key={artifact.id} artifact={artifact} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
