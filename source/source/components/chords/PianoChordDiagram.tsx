'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Note as TonalNote } from '@tonaljs/tonal';
import { PianoVoicing } from '@/lib/types';

const MIN_WHITE_KEY_PX = 10;
const MIN_WHITE_KEY_WIDTH = 16;
const MAX_OCTAVES = 4;
/** Max width when fillWidth – prevents stretching on large screens; keeps natural key proportions */
const MAX_FLUID_WIDTH = 420;

interface Props {
  voicing: PianoVoicing;
  chordName?: string;
  size?: 'small' | 'medium' | 'large';
  startOctave?: number;
  /** When true, diagram fills container width and shows as many octaves as fit (2–4). */
  fillWidth?: boolean;
  /** When false, voicing name is not rendered inside the SVG (e.g. when the card shows it below). */
  showVoicingName?: boolean;
}

// White key indices in an octave (C, D, E, F, G, A, B)
const WHITE_KEY_SEMITONES = [0, 2, 4, 5, 7, 9, 11];

// Black key positions (relative to white key)
const BLACK_KEY_SEMITONES = [1, 3, 6, 8, 10];
const BLACK_KEY_POSITIONS = [0, 1, 3, 4, 5]; // After which white key (0=C, 1=D, 3=F, 4=G, 5=A)

export default function PianoChordDiagram({
  voicing,
  chordName,
  size = 'medium',
  startOctave = 3,
  fillWidth = false,
  showVoicingName = true,
}: Props) {
  // Size configurations (used when fillWidth is false) – ~50% larger for readability
  const sizeConfig = {
    small: { whiteWidth: 21, whiteHeight: 98, blackWidth: 15, blackHeight: 60, fontSize: 12 },
    medium: { whiteWidth: 30, whiteHeight: 143, blackWidth: 21, blackHeight: 87, fontSize: 17 },
    large: { whiteWidth: 42, whiteHeight: 203, blackWidth: 30, blackHeight: 123, fontSize: 21 },
  };

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fluidDimensions, setFluidDimensions] = useState<{
    whiteWidth: number;
    whiteHeight: number;
    blackWidth: number;
    blackHeight: number;
    fontSize: number;
    numOctaves: number;
  } | null>(null);

  useEffect(() => {
    if (!fillWidth || !containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      const { width } = entries[0]?.contentRect ?? { width: 0 };
      if (width <= 0) return;
      const effectiveWidth = Math.min(width, MAX_FLUID_WIDTH);
      const numOctaves = Math.min(
        MAX_OCTAVES,
        Math.max(2, Math.floor(effectiveWidth / (MIN_WHITE_KEY_PX * 7)))
      );
      const numWhiteKeys = 7 * numOctaves;
      const whiteWidth = Math.max(MIN_WHITE_KEY_WIDTH, (effectiveWidth - 2) / numWhiteKeys);
      const whiteHeight = Math.max(82, Math.min(143, whiteWidth * 4.5));
      const blackWidth = Math.max(9, whiteWidth * 0.7);
      const blackHeight = whiteHeight * 0.6;
      const fontSize = Math.max(9, Math.min(15, Math.floor(whiteWidth * 0.6)));
      setFluidDimensions({
        whiteWidth,
        whiteHeight,
        blackWidth,
        blackHeight,
        fontSize,
        numOctaves,
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fillWidth]);

  const baseConfig = sizeConfig[size];
  const useFluid = fillWidth && fluidDimensions;
  const whiteWidth = useFluid ? fluidDimensions!.whiteWidth : baseConfig.whiteWidth;
  const whiteHeight = useFluid ? fluidDimensions!.whiteHeight : baseConfig.whiteHeight;
  const blackWidth = useFluid ? fluidDimensions!.blackWidth : baseConfig.blackWidth;
  const blackHeight = useFluid ? fluidDimensions!.blackHeight : baseConfig.blackHeight;
  const fontSize = useFluid ? fluidDimensions!.fontSize : baseConfig.fontSize;
  const numOctaves = useFluid ? fluidDimensions!.numOctaves : 2;
  const numWhiteKeys = 7 * numOctaves;
  const totalWidth = whiteWidth * numWhiteKeys + 2;
  const totalHeight = whiteHeight + (showVoicingName ? 45 : 6);

  // Center the diagram on C3: show equal octaves below and above so C3 is the middle note
  const effectiveStartOctave = 3 - Math.floor(numOctaves / 2);

  // Convert note names to semitone positions using Tonal
  const activeNotes = voicing.notes.map((noteString) => {
    // Use Tonal to parse the note (handles enharmonics, octaves, etc.)
    const parsed = TonalNote.get(noteString);

    if (parsed.empty) {
      // Fallback: preserve accidental (e.g. Bb), only uppercase the letter
      const match = noteString.match(/^([A-Ga-g])(#|b)?(\d)?$/i);
      if (match) {
        const noteName = match[1].toUpperCase() + (match[2] ?? '');
        const octave = match[3] ? parseInt(match[3]) : startOctave;
        const chroma = TonalNote.get(noteName).chroma ?? 0;
        return { note: noteName, octave, semitone: chroma, fullNote: noteString };
      }
      return { note: noteString, octave: startOctave, semitone: 0, fullNote: noteString };
    }

    // Extract octave from the note string or use default
    const octaveMatch = noteString.match(/(\d+)/);
    const octave = octaveMatch ? parseInt(octaveMatch[1]) : startOctave;

    return {
      note: parsed.name || parsed.pc || noteString,
      octave,
      semitone: parsed.chroma ?? 0,
      fullNote: noteString,
    };
  });

  // Scroll to center the chord when fillWidth and diagram overflows
  useEffect(() => {
    if (!useFluid || !scrollRef.current || activeNotes.length === 0) return;
    const scrollEl = scrollRef.current;
    const scrollWidth = scrollEl.scrollWidth;
    const clientWidth = scrollEl.clientWidth;
    if (scrollWidth <= clientWidth) return;

    const getNoteCenterX = (octave: number, semitone: number): number => {
      const octaveIndex = octave - effectiveStartOctave;
      const whiteIdx = WHITE_KEY_SEMITONES.indexOf(semitone);
      if (whiteIdx >= 0) {
        const keyIndex = octaveIndex * 7 + whiteIdx;
        return 1 + (keyIndex + 0.5) * whiteWidth;
      }
      const blackIdx = BLACK_KEY_SEMITONES.indexOf(semitone);
      if (blackIdx >= 0) {
        const whiteKeyPos = BLACK_KEY_POSITIONS[blackIdx];
        const whiteKeyIndex = octaveIndex * 7 + whiteKeyPos;
        return whiteKeyIndex * whiteWidth + whiteWidth + 1;
      }
      return totalWidth / 2;
    };

    const centers = activeNotes.map((n) => getNoteCenterX(n.octave, n.semitone));
    const sorted = [...centers].sort((a, b) => a - b);
    const midIdx = Math.floor(sorted.length / 2);
    const chordCenterX = sorted.length % 2 ? sorted[midIdx] : (sorted[midIdx - 1] + sorted[midIdx]) / 2;

    const targetScroll = chordCenterX - clientWidth / 2;
    scrollEl.scrollLeft = Math.max(0, Math.min(targetScroll, scrollWidth - clientWidth));
  }, [useFluid, voicing.notes, effectiveStartOctave, whiteWidth, totalWidth, activeNotes]);

  // SVG gradient IDs must be unique and must not contain '#' (e.g. A#m)
  const gradientIdPrefix = voicing.id.replace(/#/g, '_');

  // Check if a key is active
  const isKeyActive = (semitone: number, octave: number): boolean => {
    return activeNotes.some(
      (n) => n.semitone === semitone && n.octave === octave
    );
  };

  // Get the note label (e.g. "A3", "C4") for an active key
  const getActiveNoteLabel = (semitone: number, octave: number): string | null => {
    const note = activeNotes.find((n) => n.semitone === semitone && n.octave === octave);
    return note ? note.fullNote : null;
  };

  // Render white keys
  const renderWhiteKeys = () => {
    const keys: React.ReactElement[] = [];
    let keyIndex = 0;

    for (let octave = effectiveStartOctave; octave < effectiveStartOctave + numOctaves; octave++) {
      for (let i = 0; i < 7; i++) {
        const semitone = WHITE_KEY_SEMITONES[i];
        const active = isKeyActive(semitone, octave);
        const x = 1 + keyIndex * whiteWidth;

        keys.push(
          <rect
            key={`white-${octave}-${i}`}
            x={x}
            y={1}
            width={whiteWidth}
            height={whiteHeight - 2}
            fill={active ? `url(#${gradientIdPrefix}-white-active)` : `url(#${gradientIdPrefix}-white-inactive)`}
            className="transition-colors"
          />
        );

        // Label: every active key shows its note (e.g. A3, C4, E4); inactive C keys show octave (C3, C4)
        const isCKey = i === 0;
        const activeLabel = active ? getActiveNoteLabel(semitone, octave) : null;
        if (activeLabel) {
          keys.push(
            <text
              key={`label-${octave}-${i}`}
              x={x + whiteWidth / 2}
              y={whiteHeight - 8}
              textAnchor="middle"
              fontSize={fontSize - 1}
              fill="white"
              fontWeight="bold"
            >
              {activeLabel}
            </text>
          );
        } else if (isCKey) {
          keys.push(
            <text
              key={`clabel-${octave}-${i}`}
              x={x + whiteWidth / 2}
              y={whiteHeight - 8}
              textAnchor="middle"
              fontSize={fontSize - 2}
              fill="var(--piano-c-label)"
            >
              {`C${octave}`}
            </text>
          );
        }

        keyIndex++;
      }
    }

    return keys;
  };

  // Render black keys
  const renderBlackKeys = () => {
    const keys: React.ReactElement[] = [];
    let whiteKeyIndex = 0;

    for (let octave = effectiveStartOctave; octave < effectiveStartOctave + numOctaves; octave++) {
      for (let i = 0; i < BLACK_KEY_POSITIONS.length; i++) {
        const whiteKeyPos = BLACK_KEY_POSITIONS[i];
        const semitone = BLACK_KEY_SEMITONES[i];
        const active = isKeyActive(semitone, octave);
        const x = (whiteKeyIndex + whiteKeyPos) * whiteWidth + whiteWidth - blackWidth / 2 + 1;
        const activeLabel = active ? getActiveNoteLabel(semitone, octave) : null;

        keys.push(
          <rect
            key={`black-${octave}-${i}`}
            x={x}
            y={1}
            width={blackWidth}
            height={blackHeight}
            fill={active ? `url(#${gradientIdPrefix}-black-active)` : `url(#${gradientIdPrefix}-black-inactive)`}
            className="transition-colors"
          />
        );
        if (activeLabel) {
          const centerX = x + blackWidth / 2;
          const centerY = blackHeight / 2 + 1;
          keys.push(
            <g
              key={`black-label-${octave}-${i}`}
              transform={`rotate(-90, ${centerX}, ${centerY})`}
            >
              <text
                x={centerX}
                y={centerY}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={fontSize - 2}
                fill="white"
                fontWeight="bold"
              >
                {activeLabel}
              </text>
            </g>
          );
        }
      }
      whiteKeyIndex += 7;
    }

    return keys;
  };

  const svgElement = (
    <svg
        width={totalWidth}
        height={totalHeight}
        viewBox={`0 0 ${totalWidth} ${totalHeight}`}
        className="piano-diagram"
      >
        <defs>
          <linearGradient id={`${gradientIdPrefix}-white-inactive`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--piano-white-inactive-0)" />
            <stop offset="10%" stopColor="var(--piano-white-inactive-10)" />
            <stop offset="50%" stopColor="var(--piano-white-inactive-50)" />
            <stop offset="100%" stopColor="var(--piano-white-inactive-100)" />
          </linearGradient>
          <linearGradient id={`${gradientIdPrefix}-white-active`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--piano-white-active-0)" />
            <stop offset="50%" stopColor="var(--piano-white-active-50)" />
            <stop offset="100%" stopColor="var(--piano-white-active-100)" />
          </linearGradient>
          <linearGradient id={`${gradientIdPrefix}-black-inactive`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--piano-black-inactive-0)" />
            <stop offset="100%" stopColor="var(--piano-black-inactive-100)" />
          </linearGradient>
          <linearGradient id={`${gradientIdPrefix}-black-active`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--piano-black-active-0)" />
            <stop offset="100%" stopColor="var(--piano-black-active-100)" />
          </linearGradient>
        </defs>
        {/* Piano body background */}
        <rect
          x={0}
          y={0}
          width={totalWidth}
          height={whiteHeight}
          fill="var(--piano-body)"
          stroke="var(--piano-stroke)"
          strokeWidth={0.5}
        />

        {/* White keys (rendered first, behind black keys) */}
        {renderWhiteKeys()}

        {/* Thin separators between white keys – single lines, no doubling */}
        {Array.from({ length: numWhiteKeys - 1 }, (_, i) => (
          <line
            key={`sep-${i}`}
            x1={1 + (i + 1) * whiteWidth}
            y1={1}
            x2={1 + (i + 1) * whiteWidth}
            y2={whiteHeight - 1}
            stroke="var(--piano-stroke)"
            strokeWidth={0.5}
          />
        ))}

        {/* Black keys (rendered on top) */}
        {renderBlackKeys()}

        {/* Voicing name (optional; card may show it below) */}
        {showVoicingName && voicing.name && (
          <text
            x={totalWidth / 2}
            y={whiteHeight + 27}
            textAnchor="middle"
            fontSize={fontSize - 1}
            fill="var(--piano-voicing-text)"
          >
            {voicing.name}
          </text>
        )}
      </svg>
  );

  const diagramContent = fillWidth ? (
    <div
      ref={scrollRef}
      className="piano-chord-diagram-scroll overflow-x-auto overflow-y-hidden flex justify-center"
    >
      {svgElement}
    </div>
  ) : (
    svgElement
  );

  return (
    <div
      ref={fillWidth ? containerRef : undefined}
      className={`piano-chord-diagram ${fillWidth ? 'w-full min-w-0' : 'inline-flex flex-col items-center'}`}
    >
      {chordName && (
        <div className="text-center font-bold mb-1 piano-chord-name" style={{ fontSize: fontSize + 2 }}>
          {chordName}
        </div>
      )}
      {diagramContent}
    </div>
  );
}
