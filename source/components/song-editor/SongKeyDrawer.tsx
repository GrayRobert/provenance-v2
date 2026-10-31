'use client';

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp } from 'lucide-react';

/** Root options: value = sharp for storage, label for display (matches chord-explorer) */
const ROOT_OPTIONS: { value: string; label: string }[] = [
  { value: 'C', label: 'C' },
  { value: 'C#', label: 'C#/Db' },
  { value: 'D', label: 'D' },
  { value: 'D#', label: 'D#/Eb' },
  { value: 'E', label: 'E' },
  { value: 'F', label: 'F' },
  { value: 'F#', label: 'F#/Gb' },
  { value: 'G', label: 'G' },
  { value: 'G#', label: 'G#/Ab' },
  { value: 'A', label: 'A' },
  { value: 'A#', label: 'A#/Bb' },
  { value: 'B', label: 'B' },
];

const TONALITIES = [
  { value: 'major', label: 'Major (Happy / Bright)' },
  { value: 'minor', label: 'Minor (Moody / Dark)' },
] as const;

const CHORD_CHART_OPTIONS = [
  { value: 'guitar', label: 'Guitar' },
  { value: 'piano', label: 'Piano' },
] as const;

const SIG_MIN = 1;
const SIG_MAX = 12;

function cycleSigPart(v: number): number {
  return v >= SIG_MAX ? SIG_MIN : v + 1;
}

const BPM_MIN = 40;
const BPM_MAX = 240;

export interface SongKeyDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  root: string;
  tonality: string;
  chordChartInstrument: 'guitar' | 'piano';
  onRootChange: (root: string) => void;
  onTonalityChange: (tonality: string) => void;
  onChordChartChange: (instrument: 'guitar' | 'piano') => void;
  /** [numerator, denominator], each 1–12. */
  timeSignature: [number, number];
  bpm: number;
  onTimeSignatureChange: (sig: [number, number]) => void;
  onBpmChange: (bpm: number) => void;
}

export function SongKeyDrawer({
  open,
  onOpenChange,
  root,
  tonality,
  chordChartInstrument,
  onRootChange,
  onTonalityChange,
  onChordChartChange,
  timeSignature,
  bpm,
  onTimeSignatureChange,
  onBpmChange,
}: SongKeyDrawerProps) {
  const [num, den] = timeSignature;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="bottom">
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Song Key & Settings</DrawerTitle>
        </DrawerHeader>

        <div className="flex flex-col gap-5 px-4 pb-8">
          {/* Root Note */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-muted-foreground">
              Root Note
            </label>
            <div className="grid grid-cols-6 gap-2">
              {ROOT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onRootChange(opt.value)}
                  className={cn(
                    'flex h-10 items-center justify-center rounded-md border text-sm font-medium transition-colors',
                    root === opt.value
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border bg-surface text-foreground hover:border-accent/50'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* Tonality */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-muted-foreground">
              Tonality
            </label>
            <div className="flex flex-col gap-1">
              {TONALITIES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => onTonalityChange(t.value)}
                  className={cn(
                    'flex h-10 items-center justify-center rounded-md border text-sm font-medium transition-colors',
                    tonality === t.value
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border bg-surface text-foreground hover:border-accent/50'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-px bg-border" />

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:items-start sm:gap-8">
            {/* Time signature — tap each box to cycle 1–12 */}
            <div className="flex min-w-0 items-center">
              <div className="flex items-center gap-2 font-mono text-base text-foreground">
                <span className="w-8 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Sig
                </span>
                <button
                  type="button"
                  onClick={() => onTimeSignatureChange([cycleSigPart(num), den])}
                  className="flex h-11 min-w-[2.75rem] items-center justify-center rounded-md border border-border bg-background px-3 text-lg tabular-nums hover:border-accent/60 hover:bg-accent/5 touch-manipulation"
                  aria-label={`Beats per bar ${num}, click to change`}
                >
                  {num}
                </button>
                <span className="text-lg font-medium" aria-hidden>
                  /
                </span>
                <button
                  type="button"
                  onClick={() => onTimeSignatureChange([num, cycleSigPart(den)])}
                  className="flex h-11 min-w-[2.75rem] items-center justify-center rounded-md border border-border bg-background px-3 text-lg tabular-nums hover:border-accent/60 hover:bg-accent/5 touch-manipulation"
                  aria-label={`Beat unit ${den}, click to change`}
                >
                  {den}
                </button>
              </div>
            </div>

            {/* BPM */}
            <div className="flex min-w-0 items-center">
              <div className="flex items-center gap-3">
                <span className="w-8 shrink-0 font-mono text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  BPM
                </span>
                <div className="flex min-h-[3rem] min-w-0 flex-1 max-w-[220px] items-stretch overflow-hidden rounded-lg border-2 border-accent bg-background sm:max-w-none">
                  <div className="flex flex-1 items-center justify-center px-3 font-mono text-2xl font-semibold tabular-nums text-foreground">
                    {bpm}
                  </div>
                  <div className="w-px shrink-0 bg-border" aria-hidden />
                  <div className="flex w-11 shrink-0 flex-col border-l border-border">
                    <button
                      type="button"
                      onClick={() => onBpmChange(Math.min(BPM_MAX, bpm + 1))}
                      disabled={bpm >= BPM_MAX}
                      className="flex flex-1 items-center justify-center text-muted-foreground hover:bg-accent/10 hover:text-foreground disabled:opacity-40 touch-manipulation"
                      aria-label="Increase tempo by one BPM"
                    >
                      <ChevronUp className="size-5" />
                    </button>
                    <div className="h-px bg-border" aria-hidden />
                    <button
                      type="button"
                      onClick={() => onBpmChange(Math.max(BPM_MIN, bpm - 1))}
                      disabled={bpm <= BPM_MIN}
                      className="flex flex-1 items-center justify-center text-muted-foreground hover:bg-accent/10 hover:text-foreground disabled:opacity-40 touch-manipulation"
                      aria-label="Decrease tempo by one BPM"
                    >
                      <ChevronDown className="size-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* Chord Chart */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-muted-foreground">
              Chord Chart
            </label>
            <div className="grid grid-cols-2 gap-2">
              {CHORD_CHART_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onChordChartChange(opt.value)}
                  className={cn(
                    'flex h-10 items-center justify-center rounded-md border text-sm font-medium transition-colors',
                    chordChartInstrument === opt.value
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border bg-surface text-foreground hover:border-accent/50'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
