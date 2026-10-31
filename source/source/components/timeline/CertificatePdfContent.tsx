'use client';

import type { CertificatePdfPayload } from '@/lib/certificatePdf';
import { formatTsTimestamp } from '@/lib/format';
import { CertificateHeader } from '@/components/timeline/CertificateHeader';
import { SectionDivider } from '@/components/timeline/SectionDivider';
import { MetadataGrid } from '@/components/timeline/MetadataGrid';
import { SplitsTable } from '@/components/timeline/SplitsTable';
import { CertificateFooter } from '@/components/timeline/CertificateFooter';
import { ProvenanceLogo } from '@/components/shared/ProvenanceLogo';

interface CertificatePdfContentProps {
  payload: CertificatePdfPayload;
}

/**
 * Renders the certificate sections with full styles, layout, colours and hash
 * visualisation for capture to PDF (html2canvas + jsPDF). Same components as
 * timeline so the PDF matches the on-screen certificate.
 */
export function CertificatePdfContent({ payload }: CertificatePdfContentProps) {
  return (
    <div
      className="bg-background text-foreground"
      style={{
        width: 794,
        minHeight: 800,
        backgroundColor: 'var(--background)',
        color: 'var(--foreground)',
      }}
      data-certificate-pdf-content
    >
      <div className="flex flex-col gap-8 p-10">
        <CertificateHeader
          songTitle={payload.songTitle}
          certificateId={payload.certificateId}
          rootHash={payload.rootHash}
          chainVerified={payload.chainVerified}
        />

        <SectionDivider />

        <SectionDivider label="Work Details" />
        <MetadataGrid data={payload.workMetadata} />
        <SplitsTable data={{ splits: payload.splits }} />

        <SectionDivider label="Verification" />
        <div className="rounded-lg border border-border bg-surface p-5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
            Public verification
          </p>
          <p className="mt-1 break-all font-mono text-[11px] leading-relaxed text-foreground">
            /authenticate/{payload.certificateId}
          </p>
          <p className="mt-2 font-mono text-[10px] text-muted/80">
            Certificate ID: {payload.certificateId}
          </p>
        </div>

        <CertificateFooter
          rootHash={payload.rootHash}
          latestHash={payload.latestHash}
          eventCount={payload.eventCount}
          hashesFromApi
        />

        {(payload.tsaProvider ?? payload.tsaVerificationStatus) && (
          <div className="rounded-lg border border-border bg-surface p-5">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-muted">
              External Timestamp
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {payload.tsaProvider && (
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
                    TSA Provider
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-foreground">
                    {payload.tsaProvider}
                  </p>
                </div>
              )}
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
                  Timestamp (UTC)
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-foreground">
                  {payload.tsaGenTime
                    ? formatTsTimestamp(payload.tsaGenTime)
                    : '—'}
                </p>
              </div>
              {payload.snapshotHash && (
                <div className="sm:col-span-2">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
                    Snapshot hash
                  </p>
                  <p className="mt-0.5 break-all font-mono text-[11px] leading-relaxed text-foreground">
                    {payload.snapshotHash}
                  </p>
                </div>
              )}
              {payload.tsaVerificationStatus && (
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
                    Status
                  </p>
                  <p
                    className={`mt-0.5 text-[11px] font-medium ${
                      payload.tsaVerificationStatus === 'verified'
                        ? 'text-green-600 dark:text-green-400'
                        : payload.tsaVerificationStatus === 'failed'
                          ? 'text-destructive'
                          : 'text-muted-foreground'
                    }`}
                  >
                    {payload.tsaVerificationStatus}
                  </p>
                </div>
              )}
            </div>
            {payload.tsaVerificationError && (
              <p className="mt-3 text-[10px] text-destructive">
                {payload.tsaVerificationError}
              </p>
            )}
          </div>
        )}

        <div className="rounded-lg border border-border bg-surface p-5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-muted">
            Evidence summary
          </h2>
          <p className="mb-1 text-[10px] font-semibold text-foreground">
            Evidence covered:
          </p>
          <p className="mb-4 text-sm text-foreground">
            {payload.evidenceSummary.covered.length > 0
              ? payload.evidenceSummary.covered.join(', ')
              : 'None'}
          </p>
          {payload.evidenceSummary.questionable.length > 0 && (
            <>
              <p className="mb-1 text-[10px] font-semibold text-accent">
                Questionable:
              </p>
              <ul className="list-disc pl-4 text-sm text-foreground space-y-1">
                {payload.evidenceSummary.questionable.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="flex flex-col items-center gap-2 pt-4">
          <div className="flex items-center gap-1.5">
            <ProvenanceLogo iconSize={14} hideText />
            <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
              Tamper-Proof · Hash-Chained · Immutable
            </span>
          </div>
          <p className="font-mono text-[10px] text-muted/60">{payload.certificateId}</p>
        </div>
      </div>
    </div>
  );
}
