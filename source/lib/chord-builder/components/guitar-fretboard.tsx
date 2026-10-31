'use client';

import { useCallback, useRef, useState } from 'react';
import {
  GuitarChord,
  StringState,
  getNoteAtFret,
  FINGER_COLORS,
  FINGER_LABELS,
} from '@/lib/chord-builder/chord-utils';
import { playNote } from '@/lib/chord-builder/audio-engine';

interface GuitarFretboardProps {
  chord: GuitarChord;
  onChange: (chord: GuitarChord) => void;
  selectedFinger: number;
}

const VISIBLE_FRETS = 5;
const STRING_SPACING = 40;
const FRET_HEIGHT = 60;
const TOP_PADDING = 44;
const LEFT_PADDING = 40;
const DOT_RADIUS = 15;
const NUT_HEIGHT = 6;
const BOTTOM_PADDING = 28;

const LONG_PRESS_MS = 400;

export default function GuitarFretboard({
  chord,
  onChange,
  selectedFinger,
}: GuitarFretboardProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  const [dragState, setDragState] = useState<{
    stringIndex: number;
    originalFret: number;
  } | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);

  const [barreState, setBarreState] = useState<{
    fret: number;
    fromString: number;
    finger: number;
  } | null>(null);
  const [barreToString, setBarreToString] = useState<number | null>(null);

  const [hoverCell, setHoverCell] = useState<{
    stringIndex: number;
    fret: number;
  } | null>(null);

  const lastClickRef = useRef<{ si: number; fret: number; time: number } | null>(null);

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const pointerStartPos = useRef<{ x: number; y: number } | null>(null);

  const numStrings = chord.strings.length;
  const svgWidth = LEFT_PADDING + (numStrings - 1) * STRING_SPACING + 40;
  const svgHeight = TOP_PADDING + VISIBLE_FRETS * FRET_HEIGHT + BOTTOM_PADDING;

  const stringX = (i: number) => LEFT_PADDING + i * STRING_SPACING;
  const fretY = (f: number) => TOP_PADDING + f * FRET_HEIGHT;

  const getSVGPoint = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      return {
        x: ((clientX - rect.left) / rect.width) * svgWidth,
        y: ((clientY - rect.top) / rect.height) * svgHeight,
      };
    },
    [svgWidth, svgHeight]
  );

  const cellFromPoint = useCallback(
    (x: number, y: number) => {
      const si = Math.round((x - LEFT_PADDING) / STRING_SPACING);
      const fretFloat = (y - TOP_PADDING) / FRET_HEIGHT;
      const fret = Math.round(fretFloat);
      return {
        stringIndex: Math.max(0, Math.min(numStrings - 1, si)),
        fret: Math.max(1, Math.min(VISIBLE_FRETS, fret)),
      };
    },
    [numStrings]
  );

  const stringFromX = useCallback(
    (x: number) => {
      const si = Math.round((x - LEFT_PADDING) / STRING_SPACING);
      return Math.max(0, Math.min(numStrings - 1, si));
    },
    [numStrings]
  );

  const getStringNote = (stringIndex: number, state: StringState): string => {
    if (state.fret === -1) return '';
    const actualFret = state.fret === 0 ? 0 : state.fret + chord.baseFret - 1;
    const fullNote = getNoteAtFret(chord.tuning[stringIndex], actualFret);
    return fullNote.replace(/\d+$/, '');
  };

  const getActualNote = (stringIndex: number, relativeFret: number): string => {
    const actualFret = relativeFret + chord.baseFret - 1;
    return getNoteAtFret(chord.tuning[stringIndex], actualFret);
  };

  const handleStringTopClick = (stringIndex: number) => {
    const newStrings = [...chord.strings];
    const current = newStrings[stringIndex];

    if (current.fret === -1) {
      newStrings[stringIndex] = { fret: 0, finger: 0 };
      const note = getNoteAtFret(chord.tuning[stringIndex], 0);
      playNote(note);
    } else if (current.fret === 0) {
      newStrings[stringIndex] = { fret: -1, finger: 0 };
    } else {
      newStrings[stringIndex] = { fret: -1, finger: 0 };
    }

    const newBarres = chord.barres.filter((b) =>
      newStrings.some((s) => s.fret === b && s.fret > 0)
    );
    onChange({ ...chord, strings: newStrings, barres: newBarres });
  };

  const handleEmptyCellClick = (stringIndex: number, fret: number) => {
    const newStrings = [...chord.strings];
    newStrings[stringIndex] = { fret, finger: selectedFinger };
    const note = getActualNote(stringIndex, fret);
    playNote(note);
    onChange({ ...chord, strings: newStrings });
  };

  const handleDotClick = (stringIndex: number, fret: number) => {
    const now = Date.now();
    const last = lastClickRef.current;

    if (
      last &&
      last.si === stringIndex &&
      last.fret === fret &&
      now - last.time < 350
    ) {
      const newStrings = [...chord.strings];
      newStrings[stringIndex] = { fret: -1, finger: 0 };
      const newBarres = chord.barres.filter((b) =>
        newStrings.some((s) => s.fret === b && s.fret > 0)
      );
      onChange({ ...chord, strings: newStrings, barres: newBarres });
      lastClickRef.current = null;
      return;
    }

    lastClickRef.current = { si: stringIndex, fret, time: now };
    const newStrings = [...chord.strings];
    const current = newStrings[stringIndex];

    if (current.finger >= 4) {
      newStrings[stringIndex] = { fret: -1, finger: 0 };
      const newBarres = chord.barres.filter((b) =>
        newStrings.some((s) => s.fret === b && s.fret > 0)
      );
      onChange({ ...chord, strings: newStrings, barres: newBarres });
    } else {
      const nextFinger = (current.finger || 0) + 1;
      newStrings[stringIndex] = { fret, finger: nextFinger };
      onChange({ ...chord, strings: newStrings });
    }
  };

  const handleDotPointerDown = (
    e: React.PointerEvent,
    si: number,
    fret: number
  ) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);

    getSVGPoint(e.clientX, e.clientY);
    pointerStartPos.current = { x: e.clientX, y: e.clientY };
    longPressTriggered.current = false;

    if (e.shiftKey) {
      const finger = chord.strings[si].finger || selectedFinger;
      setBarreState({ fret, fromString: si, finger });
      setBarreToString(si);
      return;
    }

    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      const finger = chord.strings[si].finger || selectedFinger;
      setBarreState({ fret, fromString: si, finger });
      setBarreToString(si);
      setDragState(null);
      setDragPos(null);
    }, LONG_PRESS_MS);

    setDragState({ stringIndex: si, originalFret: fret });
    setDragPos(getSVGPoint(e.clientX, e.clientY));
  };

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const pt = getSVGPoint(e.clientX, e.clientY);

      if (pointerStartPos.current && longPressTimer.current) {
        const dx = e.clientX - pointerStartPos.current.x;
        const dy = e.clientY - pointerStartPos.current.y;
        if (Math.sqrt(dx * dx + dy * dy) > 10) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
      }

      if (barreState) {
        const si = stringFromX(pt.x);
        setBarreToString(si);
        return;
      }

      if (dragState) {
        setDragPos(pt);
        const cell = cellFromPoint(pt.x, pt.y);
        setHoverCell(cell);
      }
    },
    [barreState, dragState, getSVGPoint, cellFromPoint, stringFromX]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }

      if (barreState && barreToString !== null) {
        const fromSi = barreState.fromString;
        const toSi = barreToString;

        if (fromSi !== toSi) {
          const minSi = Math.min(fromSi, toSi);
          const maxSi = Math.max(fromSi, toSi);
          const fret = barreState.fret;
          const finger = barreState.finger;

          const newStrings = [...chord.strings];
          for (let i = minSi; i <= maxSi; i++) {
            const current = newStrings[i];
            if (current.fret <= 0 || current.fret === fret) {
              newStrings[i] = { fret, finger };
            }
          }

          const newBarres = chord.barres.includes(fret)
            ? chord.barres
            : [...chord.barres, fret];

          onChange({ ...chord, strings: newStrings, barres: newBarres });
        }

        setBarreState(null);
        setBarreToString(null);
        pointerStartPos.current = null;
        return;
      }

      if (longPressTriggered.current) {
        setBarreState(null);
        setBarreToString(null);
        setDragState(null);
        setDragPos(null);
        setHoverCell(null);
        longPressTriggered.current = false;
        pointerStartPos.current = null;
        return;
      }

      if (dragState) {
        const pt = getSVGPoint(e.clientX, e.clientY);
        const startPt = pointerStartPos.current;
        const dx = startPt ? e.clientX - startPt.x : 0;
        const dy = startPt ? e.clientY - startPt.y : 0;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 6) {
          handleDotClick(dragState.stringIndex, dragState.originalFret);
          setDragState(null);
          setDragPos(null);
          setHoverCell(null);
          pointerStartPos.current = null;
          return;
        }

        const isOff =
          pt.x < LEFT_PADDING - 30 ||
          pt.x > LEFT_PADDING + (numStrings - 1) * STRING_SPACING + 30 ||
          pt.y < TOP_PADDING - 30 ||
          pt.y > TOP_PADDING + VISIBLE_FRETS * FRET_HEIGHT + 30;

        const newStrings = [...chord.strings];
        const draggedFinger = newStrings[dragState.stringIndex].finger;

        if (isOff) {
          newStrings[dragState.stringIndex] = { fret: -1, finger: 0 };
        } else {
          const cell = cellFromPoint(pt.x, pt.y);
          if (
            cell.stringIndex !== dragState.stringIndex ||
            cell.fret !== dragState.originalFret
          ) {
            newStrings[dragState.stringIndex] = { fret: -1, finger: 0 };
            newStrings[cell.stringIndex] = {
              fret: cell.fret,
              finger: draggedFinger || selectedFinger,
            };
            const note = getActualNote(cell.stringIndex, cell.fret);
            playNote(note);
          }
        }

        const newBarres = chord.barres.filter((b) =>
          newStrings.some((s) => s.fret === b && s.fret > 0)
        );
        onChange({ ...chord, strings: newStrings, barres: newBarres });
      }

      setDragState(null);
      setDragPos(null);
      setHoverCell(null);
      setBarreState(null);
      setBarreToString(null);
      pointerStartPos.current = null;
    },
    [
      barreState,
      barreToString,
      dragState,
      chord,
      onChange,
      selectedFinger,
      getSVGPoint,
      cellFromPoint,
      numStrings,
    ]
  );

  const lastTouchString = useRef<number>(-1);
  const handleTouchStrum = useCallback(
    (e: React.TouchEvent) => {
      if (dragState || barreState) return;
      const touch = e.touches[0];
      const svg = svgRef.current;
      if (!svg || !touch) return;

      const pt = getSVGPoint(touch.clientX, touch.clientY);
      const si = Math.round((pt.x - LEFT_PADDING) / STRING_SPACING);

      if (si >= 0 && si < numStrings && si !== lastTouchString.current) {
        lastTouchString.current = si;
        const s = chord.strings[si];
        if (s.fret >= 0) {
          const actualFret = s.fret === 0 ? 0 : s.fret + chord.baseFret - 1;
          const note = getNoteAtFret(chord.tuning[si], actualFret);
          playNote(note);
        }
      }
    },
    [chord, numStrings, getSVGPoint, dragState, barreState]
  );

  const dotFrets = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
  const doubleDotFrets = [12, 24];

  const getVisibleDotFrets = () => {
    const results: { fret: number; isDouble: boolean }[] = [];
    for (let f = 1; f <= VISIBLE_FRETS; f++) {
      const actual = f + chord.baseFret - 1;
      if (dotFrets.includes(actual)) {
        results.push({ fret: f, isDouble: doubleDotFrets.includes(actual) });
      }
    }
    return results;
  };

  const inlays = getVisibleDotFrets();

  const barrePreview =
    barreState && barreToString !== null
      ? {
          fret: barreState.fret,
          minSi: Math.min(barreState.fromString, barreToString),
          maxSi: Math.max(barreState.fromString, barreToString),
          finger: barreState.finger,
        }
      : null;

  return (
    <div className="flex flex-col items-center w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-full select-none"
        style={{ maxWidth: `${svgWidth}px`, touchAction: 'none' }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onTouchMove={handleTouchStrum}
        onTouchStart={() => {
          lastTouchString.current = -1;
        }}
      >
        <rect
          x={LEFT_PADDING - 10}
          y={TOP_PADDING}
          width={(numStrings - 1) * STRING_SPACING + 20}
          height={VISIBLE_FRETS * FRET_HEIGHT}
          rx="4"
          className="fill-[var(--surface)]"
        />

        {inlays.map(({ fret, isDouble }) => {
          const cy = fretY(fret) - FRET_HEIGHT / 2;
          const cx = LEFT_PADDING + ((numStrings - 1) * STRING_SPACING) / 2;
          if (isDouble) {
            return (
              <g key={`inlay-${fret}`}>
                <circle cx={cx - STRING_SPACING * 0.8} cy={cy} r={5} className="fill-[var(--muted)]" />
                <circle cx={cx + STRING_SPACING * 0.8} cy={cy} r={5} className="fill-[var(--muted)]" />
              </g>
            );
          }
          return <circle key={`inlay-${fret}`} cx={cx} cy={cy} r={5} className="fill-[var(--muted)]" />;
        })}

        {chord.baseFret === 1 && (
          <rect
            x={LEFT_PADDING - 4}
            y={TOP_PADDING - NUT_HEIGHT / 2}
            width={(numStrings - 1) * STRING_SPACING + 8}
            height={NUT_HEIGHT}
            rx="2"
            className="fill-[var(--border)]"
          />
        )}

        {Array.from({ length: VISIBLE_FRETS + 1 }, (_, i) => (
          <line
            key={`fret-${i}`}
            x1={LEFT_PADDING - 4}
            y1={fretY(i)}
            x2={LEFT_PADDING + (numStrings - 1) * STRING_SPACING + 4}
            y2={fretY(i)}
            stroke="var(--border)"
            strokeWidth={i === 0 && chord.baseFret > 1 ? 2 : 1}
          />
        ))}

        {chord.strings.map((_, i) => {
          const x = stringX(i);
          const thickness = 2.5 - i * 0.3;
          return (
            <line
              key={`string-${i}`}
              x1={x}
              y1={TOP_PADDING}
              x2={x}
              y2={TOP_PADDING + VISIBLE_FRETS * FRET_HEIGHT}
              stroke="var(--foreground)"
              strokeWidth={Math.max(0.8, thickness)}
              opacity={0.6}
            />
          );
        })}

        {Array.from({ length: VISIBLE_FRETS }, (_, i) => {
          const fretNum = i + 1;
          const actualFret = fretNum + chord.baseFret - 1;
          const hasBarre = chord.barres.includes(fretNum);
          return (
            <text
              key={`fretnum-${fretNum}`}
              x={LEFT_PADDING - 24}
              y={fretY(fretNum) - FRET_HEIGHT / 2 + 5}
              textAnchor="middle"
              className="text-xs select-none fill-[var(--accent)]"
              fontWeight={hasBarre ? 700 : 400}
              fontSize="12"
              style={{ fontFamily: 'var(--font-mono), monospace' }}
            >
              {actualFret}
            </text>
          );
        })}

        {chord.barres.map((barreFret) => {
          const stringsAtFret: number[] = [];
          chord.strings.forEach((s, i) => {
            if (s.fret === barreFret) stringsAtFret.push(i);
          });
          if (stringsAtFret.length < 2) return null;
          const minSi = Math.min(...stringsAtFret);
          const maxSi = Math.max(...stringsAtFret);
          const y = fretY(barreFret) - FRET_HEIGHT / 2;
          const finger = chord.strings[minSi]?.finger || 1;

          return (
            <rect
              key={`barre-${barreFret}`}
              x={stringX(minSi) - DOT_RADIUS + 2}
              y={y - 7}
              width={stringX(maxSi) - stringX(minSi) + DOT_RADIUS * 2 - 4}
              height={14}
              rx="7"
              fill={FINGER_COLORS[finger] || FINGER_COLORS[1]}
              opacity={0.4}
              className="pointer-events-none"
            />
          );
        })}

        {barrePreview && barrePreview.minSi !== barrePreview.maxSi && (
          <rect
            x={stringX(barrePreview.minSi) - DOT_RADIUS + 2}
            y={fretY(barrePreview.fret) - FRET_HEIGHT / 2 - 7}
            width={
              stringX(barrePreview.maxSi) -
              stringX(barrePreview.minSi) +
              DOT_RADIUS * 2 -
              4
            }
            height={14}
            rx="7"
            fill={FINGER_COLORS[barrePreview.finger] || FINGER_COLORS[1]}
            opacity={0.25}
            strokeDasharray="4 3"
            stroke="var(--accent)"
            strokeWidth={1}
            className="pointer-events-none"
          />
        )}

        {Array.from({ length: VISIBLE_FRETS }, (_, fi) => {
          const fretNum = fi + 1;
          return chord.strings.map((s, si) => {
            if (s.fret === fretNum) return null;
            return (
              <rect
                key={`cell-${si}-${fretNum}`}
                x={stringX(si) - STRING_SPACING / 2}
                y={fretY(fretNum - 1)}
                width={STRING_SPACING}
                height={FRET_HEIGHT}
                fill="transparent"
                className="cursor-pointer"
                onClick={() => handleEmptyCellClick(si, fretNum)}
                onMouseEnter={() => setHoverCell({ stringIndex: si, fret: fretNum })}
                onMouseLeave={() => setHoverCell(null)}
              />
            );
          });
        })}

        {hoverCell &&
          !dragState &&
          !barreState &&
          chord.strings[hoverCell.stringIndex].fret !== hoverCell.fret && (
            <circle
              cx={stringX(hoverCell.stringIndex)}
              cy={fretY(hoverCell.fret) - FRET_HEIGHT / 2}
              r={DOT_RADIUS}
              className="fill-[var(--accent)] opacity-20 pointer-events-none"
            />
          )}

        {chord.strings.map((s, si) => {
          if (s.fret <= 0) return null;
          const cx = stringX(si);
          const cy = fretY(s.fret) - FRET_HEIGHT / 2;
          const isDragging =
            dragState?.stringIndex === si &&
            dragState?.originalFret === s.fret &&
            !barreState;
          const displayX = isDragging && dragPos ? dragPos.x : cx;
          const displayY = isDragging && dragPos ? dragPos.y : cy;

          return (
            <g
              key={`dot-${si}`}
              className="cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => handleDotPointerDown(e, si, s.fret)}
            >
              <circle
                cx={displayX}
                cy={displayY + 2}
                r={DOT_RADIUS}
                fill="rgba(0,0,0,0.4)"
                className="pointer-events-none"
              />
              <circle
                cx={displayX}
                cy={displayY}
                r={DOT_RADIUS}
                fill={FINGER_COLORS[s.finger] || 'var(--accent)'}
                stroke={isDragging ? '#fff' : 'none'}
                strokeWidth={isDragging ? 2 : 0}
              />
              <text
                x={displayX}
                y={displayY + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#fff"
                fontSize="11"
                fontWeight="700"
                className="pointer-events-none select-none"
                style={{ fontFamily: 'var(--font-sans), system-ui, sans-serif' }}
              >
                {s.finger > 0 ? FINGER_LABELS[s.finger] : getStringNote(si, s)}
              </text>
            </g>
          );
        })}

        {dragState && hoverCell && dragPos && !barreState && (
          <circle
            cx={stringX(hoverCell.stringIndex)}
            cy={fretY(hoverCell.fret) - FRET_HEIGHT / 2}
            r={DOT_RADIUS}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2}
            strokeDasharray="4 3"
            opacity={0.5}
            className="pointer-events-none"
          />
        )}

        {chord.tuning.map((note, i) => (
          <text
            key={`tuning-${i}`}
            x={stringX(i)}
            y={8}
            textAnchor="middle"
            className="fill-[var(--muted)] text-[11px] select-none"
            style={{ fontFamily: 'var(--font-mono), monospace' }}
          >
            {note.replace(/\d+$/, '')}
          </text>
        ))}

        {chord.strings.map((s, i) => {
          const cx = stringX(i);
          const cy = 28;
          return (
            <g
              key={`indicator-${i}`}
              className="cursor-pointer"
              onClick={() => handleStringTopClick(i)}
            >
              <rect x={cx - 12} y={cy - 10} width={24} height={20} fill="transparent" />
              {s.fret === -1 && (
                <text
                  x={cx}
                  y={cy + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-[var(--destructive)] text-sm font-bold select-none"
                >
                  X
                </text>
              )}
              {s.fret === 0 && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={7}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={2}
                />
              )}
            </g>
          );
        })}

        {chord.strings.map((s, i) => {
          const note = getStringNote(i, s);
          return (
            <text
              key={`notelabel-${i}`}
              x={stringX(i)}
              y={TOP_PADDING + VISIBLE_FRETS * FRET_HEIGHT + 18}
              textAnchor="middle"
              className={note ? 'fill-[var(--accent)] font-semibold' : 'fill-[var(--muted)]'}
              fontSize="11"
              style={{ fontFamily: 'var(--font-mono), monospace' }}
            >
              {note || '-'}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
