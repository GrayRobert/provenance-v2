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
  hashesFromApi = false,
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
          This certificate is cryptographically secured using SHA-256 hash chaining. Each event
          references the hash of its predecessor, forming an immutable provenance chain. Any
          modification to historical data will invalidate all subsequent hashes, making tampering
          immediately detectable. Chain depth: {eventCount} blocks.
          {!hashesFromApi && (
            <span className="mt-1 block">
              Hash values will be shown here when the API supports them.
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
