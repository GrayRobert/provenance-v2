'use client';

import React, { useCallback } from 'react';
import { Download } from 'lucide-react';
import { pdf } from '@react-pdf/renderer';
import { CertificatePdfDocument } from './CertificatePdfDocument';
import { sanitizeFilename, type CertificatePdfPayload } from '@/lib/certificatePdf';

interface ExportPdfButtonProps {
  /** Certificate data for PDF. When null, button is disabled. */
  payload: CertificatePdfPayload | null;
}

/** Export the song history as PDF (used by ExportPdfButton and TimelineBottomBar). */
export async function exportCertificatePdf(payload: CertificatePdfPayload): Promise<void> {
  const logoUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/provenance-v2/logo/8thnote_cropped.png`
      : undefined;
  const payloadWithQr = { ...payload, logoUrl };
  const blob = await pdf(
    <CertificatePdfDocument payload={payloadWithQr} />
  ).toBlob();
  const url = URL.createObjectURL(blob);
  const filename = `song-history-${sanitizeFilename(payload.songTitle)}-${payload.certificateId.slice(0, 8)}.pdf`;
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportPdfButton({ payload }: ExportPdfButtonProps) {
  const handleExport = useCallback(async () => {
    if (!payload) return;
    await exportCertificatePdf(payload);
  }, [payload]);

  return (
    <div className="no-print">
      <button
        type="button"
        onClick={handleExport}
        disabled={!payload}
        className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-border/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Download className="h-4 w-4 shrink-0" aria-hidden />
        <span>Export PDF</span>
      </button>
    </div>
  );
}
