'use client';

import { ProvenanceLogo } from '@/components/shared/ProvenanceLogo';
import { HashVisualizer } from './HashVisualizer';

interface CertificateHeaderProps {
  songTitle: string;
  certificateId: string;
  rootHash: string;
  chainVerified: boolean | null;
  /** Rendered to the right of the song title (e.g. Export PDF). */
  actions?: React.ReactNode;
}

export function CertificateHeader({
  songTitle,
  certificateId,
  rootHash,
  chainVerified,
  actions,
}: CertificateHeaderProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ProvenanceLogo iconSize={28} hideText />
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted">
              Song History
            </p>
            <p className="font-mono text-xs text-muted">{certificateId}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <HashVisualizer hash={rootHash} size={6} />
          <div className="text-right">
            <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted">
              Chain Integrity
            </p>
            <p className={`flex items-center gap-1.5 text-xs font-medium ${
              chainVerified === null ? 'text-muted' : chainVerified ? 'text-green-600 dark:text-green-400' : 'text-destructive'
            }`}>
              {chainVerified === null ? null : (
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${
                  chainVerified ? 'bg-green-500 dark:bg-green-400' : 'bg-destructive'
                }`} />
              )}
              {chainVerified === null ? '—' : chainVerified ? 'Verified' : 'Violation'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-balance text-xl font-semibold tracking-tight text-foreground sm:text-2xl md:text-3xl lg:text-4xl">
          {songTitle}
        </h1>
        {actions}
      </div>
    </div>
  );
}
