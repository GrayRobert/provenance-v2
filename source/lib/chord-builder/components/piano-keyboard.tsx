'use client';

import { useCallback, useRef, useEffect, useState } from 'react';
import { playPianoNote } from '@/lib/chord-builder/audio-engine';
import { Note } from '@tonaljs/tonal';
import { analyzeChordTones, INTERVAL_COLORS } from '@/lib/chord-builder/chord-utils';

interface PianoKeyboardProps {
  activeNotes: Set<string>;
  onToggleNote: (note: string) => void;
}

function generate88Keys(): { note: string; isBlack: boolean }[] {
  const keys: { note: string; isBlack: boolean }[] = [];
  const startNotes = [
    { n: 'A', b: false },
    { n: 'Bb', b: true },
    { n: 'B', b: false },
  ];
  for (const sn of startNotes) {
    keys.push({ note: `${sn.n}0`, isBlack: sn.b });
  }
  for (let oct = 1; oct <= 7; oct++) {
    const chromatic = [
      { n: 'C', b: false },
      { n: 'Db', b: true },
      { n: 'D', b: false },
      { n: 'Eb', b: true },
      { n: 'E', b: false },
      { n: 'F', b: false },
      { n: 'Gb', b: true },
      { n: 'G', b: false },
      { n: 'Ab', b: true },
      { n: 'A', b: false },
      { n: 'Bb', b: true },
      { n: 'B', b: false },
    ];
    for (const c of chromatic) {
      keys.push({ note: `${c.n}${oct}`, isBlack: c.b });
    }
  }
  keys.push({ note: 'C8', isBlack: false });
  return keys;
}

const ALL_KEYS = generate88Keys();
const WHITE_KEYS = ALL_KEYS.filter((k) => !k.isBlack);
const BLACK_KEYS = ALL_KEYS.filter((k) => k.isBlack);

function getBlackKeyPosition(blackNote: string): number {
  const pc = Note.pitchClass(blackNote);
  const oct = Note.octave(blackNote) ?? 0;
  const leftWhiteMap: Record<string, string> = {
    Db: 'C',
    Eb: 'D',
    Gb: 'F',
    Ab: 'G',
    Bb: 'A',
    'C#': 'C',
    'D#': 'D',
    'F#': 'F',
    'G#': 'G',
    'A#': 'A',
  };
  const leftPC = leftWhiteMap[pc || ''] || 'C';
  const leftNote = `${leftPC}${oct}`;
  const idx = WHITE_KEYS.findIndex((k) => k.note === leftNote);
  return idx;
}

function getActiveColor(note: string, activeNotes: Set<string>): string | null {
  if (!activeNotes.has(note)) return null;
  const allActive = Array.from(activeNotes);
  const analysis = analyzeChordTones(allActive);
  if (!analysis) return 'var(--accent)';
  const pc = Note.pitchClass(note);
  const tone = analysis.tones.find(
    (t) => Note.chroma(t.note) === Note.chroma(pc || '')
  );
  if (tone && INTERVAL_COLORS[tone.degree]) {
    return INTERVAL_COLORS[tone.degree];
  }
  return 'var(--accent)';
}

export default function PianoKeyboard({
  activeNotes,
  onToggleNote,
}: PianoKeyboardProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hasScrolled, setHasScrolled] = useState(false);

  useEffect(() => {
    if (scrollRef.current && !hasScrolled) {
      const c4Index = WHITE_KEYS.findIndex((k) => k.note === 'C4');
      if (c4Index >= 0) {
        const scrollTo = c4Index * 36 - scrollRef.current.clientWidth / 2 + 18;
        scrollRef.current.scrollLeft = Math.max(0, scrollTo);
        setHasScrolled(true);
      }
    }
  }, [hasScrolled]);

  const handleKeyClick = useCallback(
    (noteName: string) => {
      const isActive = activeNotes.has(noteName);
      if (!isActive && activeNotes.size >= 10) return;
      if (!isActive) {
        playPianoNote(noteName, 1.5);
      }
      onToggleNote(noteName);
    },
    [activeNotes, onToggleNote]
  );

  const WHITE_KEY_W = 36;
  const WHITE_KEY_H = 148;
  const BLACK_KEY_W = 22;
  const BLACK_KEY_H = 92;
  const svgWidth = WHITE_KEYS.length * WHITE_KEY_W + 2;
  const svgHeight = WHITE_KEY_H + 26;

  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          Click keys to toggle notes (max 10).
          <span className="hidden sm:inline"> Scroll to reach all 88 keys.</span>
        </p>
        <p className="text-xs text-muted font-mono tabular-nums">
          {activeNotes.size}/10
        </p>
      </div>
      <div
        ref={scrollRef}
        className="w-full overflow-x-auto pb-2"
        style={{ height: `${svgHeight + 8}px` }}
      >
        <svg
          width={svgWidth}
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="select-none"
          style={{ minWidth: `${svgWidth}px` }}
        >
          {WHITE_KEYS.map((key, i) => {
            const color = getActiveColor(key.note, activeNotes);
            const x = i * WHITE_KEY_W + 1;
            const pc = Note.pitchClass(key.note) || '';
            const oct = Note.octave(key.note);
            return (
              <g
                key={key.note}
                className="cursor-pointer"
                onClick={() => handleKeyClick(key.note)}
              >
                <rect
                  x={x}
                  y={0}
                  width={WHITE_KEY_W - 1}
                  height={WHITE_KEY_H}
                  rx={0}
                  ry={0}
                  fill={color || 'var(--piano-white-inactive-50)'}
                  stroke="var(--piano-stroke)"
                  strokeWidth={0.5}
                />
                <rect
                  x={x}
                  y={WHITE_KEY_H - 4}
                  width={WHITE_KEY_W - 1}
                  height={4}
                  rx={2}
                  fill={color || 'var(--piano-white-inactive-50)'}
                />
                {color && (
                  <circle
                    cx={x + (WHITE_KEY_W - 1) / 2}
                    cy={WHITE_KEY_H - 18}
                    r={10}
                    fill="rgba(0,0,0,0.25)"
                  />
                )}
                {color && (
                  <text
                    x={x + (WHITE_KEY_W - 1) / 2}
                    y={WHITE_KEY_H - 14}
                    textAnchor="middle"
                    fill="#fff"
                    fontSize="9"
                    fontWeight="bold"
                    className="select-none pointer-events-none"
                    style={{ fontFamily: 'var(--font-mono), monospace' }}
                  >
                    {pc}
                  </text>
                )}
                {pc === 'C' && (
                  <text
                    x={x + (WHITE_KEY_W - 1) / 2}
                    y={WHITE_KEY_H + 16}
                    textAnchor="middle"
                    className="text-[10px] select-none"
                    style={{ fontFamily: 'var(--font-mono), monospace', fill: 'var(--piano-c-label)' }}
                  >
                    C{oct}
                  </text>
                )}
              </g>
            );
          })}

          {BLACK_KEYS.map((key) => {
            const whiteIdx = getBlackKeyPosition(key.note);
            if (whiteIdx < 0) return null;
            const color = getActiveColor(key.note, activeNotes);
            const x = whiteIdx * WHITE_KEY_W + WHITE_KEY_W - BLACK_KEY_W / 2 + 1;
            const pc = Note.pitchClass(key.note) || '';
            return (
              <g
                key={key.note}
                className="cursor-pointer"
                onClick={() => handleKeyClick(key.note)}
              >
                <rect
                  x={x}
                  y={0}
                  width={BLACK_KEY_W}
                  height={BLACK_KEY_H}
                  rx={0}
                  fill={color || 'var(--piano-black-inactive-100)'}
                  stroke="var(--piano-stroke)"
                  strokeWidth={0.5}
                  opacity={color ? 1 : 1}
                />
                <rect
                  x={x}
                  y={BLACK_KEY_H - 4}
                  width={BLACK_KEY_W}
                  height={4}
                  rx={2}
                  fill={color || 'var(--piano-black-inactive-100)'}
                  opacity={color ? 1 : 1}
                />
                {color && (
                  <>
                    <circle
                      cx={x + BLACK_KEY_W / 2}
                      cy={BLACK_KEY_H - 16}
                      r={8}
                      fill="rgba(0,0,0,0.3)"
                    />
                    <text
                      x={x + BLACK_KEY_W / 2}
                      y={BLACK_KEY_H - 12}
                      textAnchor="middle"
                      fill="#fff"
                      fontSize="8"
                      fontWeight="bold"
                      className="select-none pointer-events-none"
                      style={{ fontFamily: 'var(--font-mono), monospace' }}
                    >
                      {pc}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
