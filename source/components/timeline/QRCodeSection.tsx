'use client';

import { useEffect, useRef, useState } from 'react';

/** Base URL for QR links: use env in build, fallback to current origin in browser. */
function getAuthenticateUrl(certificateId: string): string {
  if (typeof window !== 'undefined') {
    const base = (process.env.NEXT_PUBLIC_APP_URL || window.location.origin).replace(/\/$/, '');
    return `${base}/authenticate/${encodeURIComponent(certificateId)}`;
  }
  const base = process.env.NEXT_PUBLIC_APP_URL || '';
  const path = `/authenticate/${encodeURIComponent(certificateId)}`;
  return base ? `${base.replace(/\/$/, '')}${path}` : path;
}

interface QRCodeSectionProps {
  certificateId: string;
}

export function QRCodeSection({ certificateId }: QRCodeSectionProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    if (!certificateId || certificateId === '—') {
      setLoaded(false);
      return;
    }

    async function generate() {
      try {
        const QRCode = await import('qrcode');
        if (cancelled || !canvasRef.current) return;

        const url = getAuthenticateUrl(certificateId);
        const accentColor = getComputedStyle(document.documentElement)
          .getPropertyValue('--accent')
          .trim() || '#f6992c';

        // No version: library picks smallest size for the URL (simpler QR, scans faster).
        const options = {
          errorCorrectionLevel: 'L' as const,
          margin: 2,
          width: 256,
          color: {
            dark: accentColor,
            light: '#00000000',
          },
        };
        await QRCode.toCanvas(canvasRef.current, url, options);
        if (!cancelled) setLoaded(true);
      } catch {
        if (!cancelled) setError(true);
      }
    }

    generate();
    return () => {
      cancelled = true;
    };
  }, [certificateId]);

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-[0.15em] text-muted">
        Verify Hash Chain
      </h2>
      <p className="mb-5 text-xs leading-relaxed text-muted/70">
        Scan this QR code to open the public certificate page and verify the stored
        validation snapshot (root hash, latest hash, event count).
      </p>

      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
        <div className="relative flex shrink-0 items-center justify-center rounded-lg border border-border bg-background p-3">
          <canvas
            ref={canvasRef}
            width={256}
            height={256}
            style={{ width: 170, height: 170 }}
            className={`transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          />
          {!loaded && !error && certificateId !== '—' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            </div>
          )}
          {certificateId === '—' && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted">
              Validate to generate QR
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted">
              Could not generate QR
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
              Link
            </p>
            <p className="break-all text-sm text-foreground">
              {certificateId !== '—' ? getAuthenticateUrl(certificateId) : '—'}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
              Certificate
            </p>
            <p className="font-mono text-sm text-foreground">{certificateId}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
