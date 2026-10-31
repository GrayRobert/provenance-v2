'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Check, Minus, Circle } from 'lucide-react';
import { EvidenceCoverage as CoverageType } from '@/lib/types';
import { getCoverageLabel, getCoverageDescription } from '@/lib/evidenceAnalysis';
import HelpText from '../shared/HelpText';

interface EvidenceCoverageProps {
  coverage: CoverageType;
}

/** Typed input row: green = all typed, orange = some pasted, orange O = some imported, grey = none. */
function getTypedInputState(coverage: CoverageType): 'typed' | 'pasted' | 'imported' | 'none' {
  if (coverage.importedInput) return 'imported';
  if (coverage.pastedInput) return 'pasted';
  if (coverage.typedInput) return 'typed';
  return 'none';
}

export default function EvidenceCoverage({ coverage }: EvidenceCoverageProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const coverageItems: Array<keyof CoverageType> = [
    'lyrics',
    'structure',
    'chords',
    'iterations',
    'typedInput',
    'audioOrDemo',
  ];

  // Count recorded: typed input counts as recorded if typed, pasted, or imported
  const recordedCount = coverageItems.filter((key) => {
    if (key === 'typedInput') return coverage.typedInput || coverage.pastedInput || coverage.importedInput;
    return Boolean(coverage[key]);
  }).length;

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsExpanded(!isExpanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded((prev) => !prev);
          }
        }}
        className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted" />
          )}
          <span className="text-sm font-semibold text-foreground">Evidence Coverage</span>
          <div onClick={(e) => e.stopPropagation()}>
            <HelpText trigger="icon">
              Coverage shows which parts of your song&apos;s history are currently documented.
              You can add more evidence at any time. This helps establish the completeness
              of your creative record for copyright purposes.
            </HelpText>
          </div>
        </div>
        <span className="text-xs text-muted">
          {recordedCount} of {coverageItems.length} recorded
        </span>
      </div>

      {isExpanded && (
        <div className="flex flex-col gap-0 border-t border-border">
          {coverageItems.map((key) => {
            const isTypedInputRow = key === 'typedInput';
            const typedState = isTypedInputRow ? getTypedInputState(coverage) : null;
            const isRecorded = isTypedInputRow
              ? typedState === 'typed' || typedState === 'pasted' || typedState === 'imported'
              : Boolean(coverage[key]);
            const isPasted = isTypedInputRow && typedState === 'pasted';
            const isImported = isTypedInputRow && typedState === 'imported';

            return (
              <div
                key={key}
                className="flex items-center justify-between border-b border-border px-4 py-3 last:border-b-0"
              >
                <div className="flex items-start gap-3">
                  {isRecorded ? (
                    isPasted ? (
                      <Circle className="mt-0.5 h-4 w-4 shrink-0 fill-[#f6992c]/20 stroke-[#f6992c] text-[#b35a0a] dark:text-[#f6992c]" />
                    ) : isImported ? (
                      <Circle className="mt-0.5 h-4 w-4 shrink-0 fill-[#f6992c]/20 stroke-[#f6992c] text-[#b35a0a] dark:text-[#f6992c]" aria-label="Some imported" />
                    ) : (
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                    )
                  ) : (
                    <Minus className="mt-0.5 h-4 w-4 shrink-0 text-muted/40" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {getCoverageLabel(key)}
                    </p>
                    <p className="text-xs text-muted">{getCoverageDescription(key)}</p>
                  </div>
                </div>
                {isRecorded ? (
                  isPasted ? (
                    <span className="shrink-0 rounded-md bg-[#f6992c]/15 px-2.5 py-1 text-[10px] font-semibold text-[#b35a0a] dark:text-[#f6992c]">
                      Some pasted
                    </span>
                  ) : isImported ? (
                    <span className="shrink-0 rounded-md bg-[#f6992c]/15 px-2.5 py-1 text-[10px] font-semibold text-[#b35a0a] dark:text-[#f6992c]">
                      Some imported
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-md bg-green-500/15 px-2.5 py-1 text-[10px] font-semibold text-green-600 dark:text-green-400">
                      Recorded
                    </span>
                  )
                ) : (
                  <span className="shrink-0 rounded-md border border-border bg-surface px-2.5 py-1 text-[10px] font-semibold text-muted">
                    Not yet captured
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

