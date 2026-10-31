'use client';

import { useCallback, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Download, Link2, Printer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { exportCertificatePdf } from '@/components/timeline/ExportPdfButton';
import type { CertificatePdfPayload } from '@/lib/certificatePdf';
import type { UserProfileResponse } from '@/lib/api';
import {
  getAccountGraceDaysRemaining,
  markGraceModalShown,
  shouldShowGraceModal,
  usePluginAccess,
} from '@/lib/usePluginAccess';
import { PluginGraceModal } from '@/components/shared/PluginGraceModal';

export interface TimelineBottomBarProps {
  /** Certificate data for PDF export. When null, Export PDF is disabled. */
  pdfPayload: CertificatePdfPayload | null;
  onValidate: () => Promise<unknown>;
  /** When true, Validate button shows loading state. */
  validating: boolean;
  /** When true, chain is verified and the center button is green; otherwise orange. */
  verified: boolean | null;
  /** User profile for certificate_export access and grace period. */
  profile?: UserProfileResponse | null;
}

const PLUGIN_ID_EXPORT_PDF = 'certificate_export';

export function TimelineBottomBar({
  pdfPayload,
  onValidate,
  validating,
  verified,
  profile = null,
}: TimelineBottomBarProps) {
  const [exporting, setExporting] = useState(false);
  const [graceModalOpen, setGraceModalOpen] = useState(false);
  const pendingAfterGraceRef = useRef<(() => void) | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const pluginAccess = usePluginAccess(profile, 'certificate_export');

  const handleExportPdf = useCallback(async () => {
    if (!pdfPayload) return;
    setExporting(true);
    try {
      await exportCertificatePdf(pdfPayload);
    } finally {
      setExporting(false);
    }
  }, [pdfPayload]);

  const onExportPdfClick = useCallback(() => {
    if (!pdfPayload) return;
    if (!pluginAccess.canUse) {
      const from = pathname ? encodeURIComponent(pathname) : '';
      router.push(from ? `/pricing?from=${from}` : '/pricing');
      return;
    }
    if (pluginAccess.showGraceModal && shouldShowGraceModal(pluginAccess, PLUGIN_ID_EXPORT_PDF)) {
      pendingAfterGraceRef.current = () => {
        markGraceModalShown(PLUGIN_ID_EXPORT_PDF);
        void handleExportPdf();
      };
      setGraceModalOpen(true);
      return;
    }
    void handleExportPdf();
  }, [pdfPayload, pluginAccess, pathname, router, handleExportPdf]);

  const handleGraceModalClose = useCallback(() => {
    pendingAfterGraceRef.current?.();
    pendingAfterGraceRef.current = null;
    setGraceModalOpen(false);
  }, []);

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <PluginGraceModal
        open={graceModalOpen}
        onClose={handleGraceModalClose}
        pluginName="Export PDF"
        graceDaysRemaining={getAccountGraceDaysRemaining(profile)}
      />
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border nav-bottom-bar backdrop-blur no-print"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Timeline tools"
      >
        <div className="mx-auto flex h-16 max-w-screen-xl items-center justify-around px-2 sm:px-4 md:px-8">
          {/* Left: Export PDF (gated by certificate_export) */}
          <BarButton
            icon={<Download className="size-5" />}
            label="Export PDF"
            onClick={onExportPdfClick}
            disabled={!pdfPayload || exporting}
          />

        {/* Center: Validate Chain (green when verified, orange otherwise) */}
        <div className="relative flex flex-col items-center">
          <button
            type="button"
            onClick={() => onValidate()}
            disabled={validating}
            className={cn(
              'relative -mt-6 flex size-14 items-center justify-center rounded-full border-2 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100',
              verified === true
                ? 'border-green-500/30 bg-green-500 text-white shadow-[0_2px_12px_rgba(34,197,94,0.4),inset_0_1px_0_rgba(255,255,255,0.2)] hover:shadow-[0_4px_20px_rgba(34,197,94,0.45),inset_0_1px_0_rgba(255,255,255,0.25)]'
                : 'border-accent/30 bg-accent text-white shadow-[0_2px_12px_var(--accent-dim),inset_0_1px_0_rgba(255,255,255,0.15)] hover:shadow-[0_4px_20px_var(--accent-dim),inset_0_1px_0_rgba(255,255,255,0.2)]'
            )}
            aria-label={validating ? 'Revalidating…' : 'Revalidate chain'}
          >
            <Link2 className="size-6" />
          </button>
          <span
            className={cn(
              'mt-0.5 text-[10px] font-semibold uppercase tracking-wide',
              verified === true ? 'text-green-600 dark:text-green-400' : 'text-accent'
            )}
          >
            {validating ? 'Revalidating…' : 'Revalidate'}
          </span>
        </div>

        {/* Right: Print */}
        <BarButton
          icon={<Printer className="size-5" />}
          label="Print"
          onClick={handlePrint}
        />
      </div>
    </nav>
    </>
  );
}

function BarButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center justify-center gap-0.5 px-2 py-1 transition-all disabled:opacity-50 disabled:pointer-events-none"
      aria-label={label}
    >
      <span
        className={cn(
          'flex size-9 items-center justify-center rounded-lg border transition-all',
          'shadow-[0_2px_4px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.06)]',
          'active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] active:translate-y-px',
          !disabled && 'hover:border-muted-foreground/30 hover:text-foreground'
        )}
      >
        {icon}
      </span>
      <span className="text-[10px] font-semibold tracking-wide text-muted-foreground">
        {label}
      </span>
    </button>
  );
}
