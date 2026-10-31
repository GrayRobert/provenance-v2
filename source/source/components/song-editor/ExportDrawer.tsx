'use client';

import { FileText, Code, FileType, Music, Printer } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  exportAsText,
  exportAsChordPro,
  exportAsHTML,
  htmlToMht,
  replaceSvgWithInlineImages,
  buildChordChartsTabHtml,
  openSongPrintView,
  downloadFile,
  type SongRhythmForExport,
} from '@/lib/export';
import type { Instrument, SongDetail } from '@/lib/types';
import { cn } from '@/lib/utils';

export interface ExportDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  song: SongDetail | null;
  /** Time signature + BPM after chord block in text/HTML/print. */
  rhythm?: SongRhythmForExport | null;
  /** Chord chart instrument (guitar = tab-style in Word export). */
  instrument?: Instrument;
  /** Returns HTML for the chord charts section (used for HTML export and Print). */
  getChordChartsHtml?: () => string;
}

export function ExportDrawer({
  open,
  onOpenChange,
  song,
  rhythm,
  instrument = 'guitar',
  getChordChartsHtml,
}: ExportDrawerProps) {
  const filename = song?.title || 'song';
  const handleExportText = () => {
    if (!song) return;
    const text = exportAsText(song, rhythm ?? undefined);
    downloadFile(text, `${filename}.txt`, 'text/plain');
    onOpenChange(false);
  };
  const handleExportChordPro = () => {
    if (!song) return;
    const text = exportAsChordPro(song, rhythm ?? undefined);
    downloadFile(text, `${filename}.cho`, 'text/plain');
    onOpenChange(false);
  };
  const handleExportHTML = () => {
    if (!song) return;
    const chordChartsHtml = getChordChartsHtml?.() ?? '';
    const html = exportAsHTML(song, chordChartsHtml, rhythm ?? undefined);
    downloadFile(html, `${filename}.html`, 'text/html');
    onOpenChange(false);
  };
  const handleExportWord = () => {
    if (!song) return;
    const chordChartsHtml =
      instrument === 'guitar'
        ? buildChordChartsTabHtml(song, instrument)
        : getChordChartsHtml?.() ?? '';
    let html = exportAsHTML(song, chordChartsHtml, rhythm ?? undefined);
    if (instrument !== 'guitar') html = replaceSvgWithInlineImages(html);
    const mht = htmlToMht(html);
    downloadFile(mht, `${filename}.doc`, 'application/x-mimearchive');
    onOpenChange(false);
  };
  const handlePrint = () => {
    if (!song) return;
    const chordChartsHtml = getChordChartsHtml?.() ?? '';
    openSongPrintView(song, chordChartsHtml, rhythm ?? undefined);
    onOpenChange(false);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="bottom">
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Export Song</DrawerTitle>
        </DrawerHeader>

        <div className="flex flex-col gap-1 px-4 pb-8">
          <ExportOption
            icon={<FileText className="size-5" />}
            label="Export as Text"
            description="Plain text with chord annotations"
            onClick={handleExportText}
            disabled={!song}
          />
          <ExportOption
            icon={<Music className="size-5" />}
            label="Export as ChordPro"
            description="Standard Format for backup and import"
            detail="Full tab/measures round-trip in Provenance; other ChordPro apps may show text only."
            onClick={handleExportChordPro}
            disabled={!song}
          />
          <ExportOption
            icon={<Code className="size-5" />}
            label="Export as HTML"
            description="Formatted web page with styling"
            onClick={handleExportHTML}
            disabled={!song}
          />
          <ExportOption
            icon={<FileType className="size-5" />}
            label="Export as Word"
            description=".doc file (MHTML) — open in Word or other editors"
            onClick={handleExportWord}
            disabled={!song}
          />
          <ExportOption
            icon={<Printer className="size-5" />}
            label="Print"
            description="Opens print dialog — print to paper or save as PDF"
            onClick={handlePrint}
            disabled={!song}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function ExportOption({
  icon,
  label,
  description,
  detail,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  /** Optional second line (smaller). */
  detail?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-4 rounded-lg px-3 py-3.5 text-left transition-colors',
        !disabled && 'hover:bg-accent/10',
        disabled && 'cursor-not-allowed opacity-60'
      )}
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface text-accent">
        {icon}
      </div>
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
        {detail ? <span className="text-[11px] text-muted-foreground/90">{detail}</span> : null}
      </div>
    </button>
  );
}
