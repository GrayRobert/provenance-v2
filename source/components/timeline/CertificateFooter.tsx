'use client';

import { HashVisualizer } from '@/components/timeline/HashVisualizer';

interface CertificateFooterProps {
  rootHash: string;
  latestHash: string;
  eventCount: number;
  hashesFromApi?: boolean;
}

export function CertificateFooter({
  rootHash,
  latestHash,
  eventCount,
}: CertificateFooterProps) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-muted">
        Cryptographic Summary
      </h2>
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex items-start gap-3">
          <HashVisualizer hash={rootHash} size={6} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
              Genesis Block Hash
            </p>
            <p className="mt-0.5 break-all font-mono text-[11px] leading-relaxed text-foreground">
              {rootHash}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <HashVisualizer hash={latestHash} size={6} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
              Latest Block Hash
            </p>
            <p className="mt-0.5 break-all font-mono text-[11px] leading-relaxed text-foreground">
              {latestHash}
            </p>
          </div>
        </div>
      </div>
      <div className="mt-5 border-t border-border pt-4">
        <p className="text-[10px] leading-relaxed text-muted">
          Each event references the SHA-256 hash of its predecessor, forming a tamper-evident
          chain over the history stored in this browser. Modifying the stored history invalidates
          all subsequent hashes, which this verification detects. Verification happens entirely on
          this device: it is not a trusted timestamp and not independent proof of authorship.
          Chain depth: {eventCount} events.
        </p>
      </div>
    </div>
  );
}
