'use client';

import { Note } from '@tonaljs/tonal';
import { analyzeChordTones, INTERVAL_COLORS } from '@/lib/chord-builder/chord-utils';

interface ChordDisplayProps {
  chordName: string;
  notes: string[];
}

const PALETTE_KEYS = Object.keys(INTERVAL_COLORS);

function getColor(degree: string): string {
  return INTERVAL_COLORS[degree] || 'hsl(240, 4%, 55%)';
}

/** Color for notes when chord analysis fails – cycle through palette by index */
function getColorByIndex(index: number): string {
  return INTERVAL_COLORS[PALETTE_KEYS[index % PALETTE_KEYS.length]] ?? 'hsl(240, 4%, 55%)';
}

export default function ChordDisplay({ chordName, notes }: ChordDisplayProps) {
  const uniquePCs = [
    ...new Set(notes.map((n) => Note.pitchClass(n)).filter(Boolean)),
  ];

  const analysis = analyzeChordTones(notes);
  const hasNotes = notes.length > 0;

  return (
    <div className="min-h-[100px] flex flex-row flex-wrap items-center justify-center gap-6 py-3">
      <div className="flex items-center justify-center shrink-0">
        {hasNotes ? (
          <span className="text-4xl sm:text-5xl font-bold text-foreground tracking-tight font-mono text-balance leading-none">
            {chordName || uniquePCs.join(' ')}
          </span>
        ) : (
          <span className="text-lg text-muted">
            Place notes to build a chord
          </span>
        )}
      </div>

      {hasNotes && (
        <div className="flex items-center justify-center shrink-0">
          {analysis ? (
            <div className="flex items-center gap-3 flex-wrap justify-center">
              {analysis.tones.map((tone, i) => (
                <div key={i} className="flex flex-col items-center gap-0.5">
                  <span
                    className="text-[11px] font-bold h-[14px] leading-[14px]"
                    style={{ color: getColor(tone.degree) }}
                  >
                    {tone.degree}
                  </span>
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{
                      background: getColor(tone.degree),
                      color: '#fff',
                    }}
                  >
                    {tone.note}
                  </div>
                  <span className="text-[10px] text-muted leading-[14px] h-[14px]">
                    {tone.intervalName}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 flex-wrap justify-center">
              {uniquePCs.map((pc, i) => {
                const color = getColorByIndex(i);
                return (
                  <div key={i} className="flex flex-col items-center gap-0.5">
                    <span
                      className="text-[11px] font-bold h-[14px] leading-[14px]"
                      style={{ color }}
                    >
                      {i + 1}
                    </span>
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{
                        background: color,
                        color: '#fff',
                      }}
                    >
                      {pc}
                    </div>
                    <span className="text-[10px] text-muted leading-[14px] h-[14px]">
                      —
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
