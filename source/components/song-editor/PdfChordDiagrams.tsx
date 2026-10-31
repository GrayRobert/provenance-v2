'use client';

import React from 'react';
import {
  View,
  Text,
  Svg,
  G,
  Path,
  Circle,
  Rect,
  StyleSheet,
} from '@react-pdf/renderer';
import { Note as TonalNote } from '@tonaljs/tonal';

/** Data for one chord diagram in the PDF. Either guitar or piano is set. */
export interface PdfChordChartItem {
  chordSymbol: string;
  instrument: 'guitar' | 'piano';
  /** Guitar: frets per string (6), baseFret (1 = nut), optional barres (fret numbers). */
  guitar?: {
    frets: number[];
    baseFret?: number;
    barres?: number[];
  };
  /** Piano: note names with octave e.g. ['C4', 'E4', 'G4']. */
  piano?: {
    notes: string[];
  };
}

const colors = {
  stroke: '#444',
  fill: '#444',
  whiteKey: '#f5f5f5',
  whiteKeyActive: '#4da3e0',
  blackKey: '#333',
  blackKeyActive: '#4da3e0',
  label: '#333',
};

// —— Guitar (6 strings, 4 frets) ———
const STRINGS = 6;
const FRETS_SHOWN = 4;
const STRING_SPACING = 10;
const FRET_SPACING = 12;
const NUT_Y = 0;
const FRET_1_Y = 6;
const DOT_R = 4;
const GUITAR_WIDTH = (STRINGS - 1) * STRING_SPACING + 8;
const GUITAR_HEIGHT = FRET_SPACING * (FRETS_SHOWN + 0.5) + 4;

/** Map string index (0 = high e) to x. Bass string on right. */
function stringX(stringIndex: number): number {
  return (STRINGS - 1 - stringIndex) * STRING_SPACING + 4;
}

/** Map relative fret 1..4 to y (center of dot). */
function fretY(relativeFret: number): number {
  if (relativeFret < 1) return NUT_Y + 3;
  return FRET_1_Y + (relativeFret - 1) * FRET_SPACING;
}

function PdfGuitarChordDiagram({ item }: { item: PdfChordChartItem }) {
  const { chordSymbol, guitar } = item;
  if (!guitar || !guitar.frets || guitar.frets.length !== 6) {
    return (
      <View style={pdfStyles.chordCard}>
        <Text style={pdfStyles.chordLabel}>{chordSymbol}</Text>
        <Text style={pdfStyles.chordPlaceholder}>—</Text>
      </View>
    );
  }

  const frets = guitar.frets;
  const baseFret = guitar.baseFret ?? 1;
  const barres = guitar.barres ?? [];
  // Convert absolute frets to relative 1..4 for display (minimum fret in chord becomes 1)
  const positiveFrets = frets.filter((f) => f > 0);
  const minFret = positiveFrets.length > 0 ? Math.min(...positiveFrets) : 1;
  const relativeFrets = frets.map((f) => (f <= 0 ? 0 : f - minFret + 1));
  const displayBaseFret = minFret;

  const pathD = [
    // Horizontal lines (nut + frets)
    ...Array.from({ length: FRETS_SHOWN + 1 }, (_, i) => {
      const y = i === 0 ? NUT_Y : FRET_1_Y + (i - 1) * FRET_SPACING;
      return `M 4 ${y} H ${GUITAR_WIDTH - 4}`;
    }),
    // Vertical lines (strings)
    ...Array.from({ length: STRINGS }, (_, i) => `M ${stringX(i)} 0 V ${GUITAR_HEIGHT - 4}`),
  ].join(' ');

  const dots: { x: number; y: number }[] = [];
  const barreByY = new Map<number, { x: number; width: number }>();

  for (let s = 0; s < STRINGS; s++) {
    const rel = relativeFrets[s];
    if (rel <= 0) continue;
    if (rel > FRETS_SHOWN) continue;
    const x = stringX(s);
    const y = fretY(rel);
    dots.push({ x, y });
    const relBarre = barres.map((b) => (typeof b === 'number' ? b - minFret + 1 : 0)).find((r) => r === rel);
    if (relBarre !== undefined) {
      const sameFretStrings = relativeFrets
        .map((r, i) => (r === rel ? i : -1))
        .filter((i) => i >= 0);
      if (sameFretStrings.length >= 2) {
        const leftS = Math.min(...sameFretStrings);
        const rightS = Math.max(...sameFretStrings);
        const by = Math.round(y - 4);
        const existing = barreByY.get(by);
        const width = stringX(leftS) - stringX(rightS);
        if (!existing || width > existing.width) {
          barreByY.set(by, { x: stringX(rightS), width });
        }
      }
    }
  }

  return (
    <View style={pdfStyles.chordCard}>
      <Text style={pdfStyles.chordLabel}>{chordSymbol}</Text>
      <Svg width={GUITAR_WIDTH} height={GUITAR_HEIGHT} viewBox={`0 0 ${GUITAR_WIDTH} ${GUITAR_HEIGHT}`}>
        <Path d={pathD} stroke={colors.stroke} strokeWidth={0.5} fill="none" />
        {displayBaseFret > 1 && (
          <Text x={2} y={8} style={{ fontSize: 6, fill: colors.label }}>
            {displayBaseFret}fr
          </Text>
        )}
        {Array.from(barreByY.entries()).map(([y, { x, width }]) => (
          <Rect
            key={y}
            x={x}
            y={y}
            width={width}
            height={8}
            fill={colors.fill}
          />
        ))}
        {dots.map((d, i) => (
          <Circle key={i} cx={d.x} cy={d.y} r={DOT_R} fill={colors.fill} stroke={colors.stroke} strokeWidth={0.25} />
        ))}
      </Svg>
    </View>
  );
}

// —— Piano (2 octaves, fixed size) ———
const WHITE_KEY_SEMITONES = [0, 2, 4, 5, 7, 9, 11];
const BLACK_KEY_SEMITONES = [1, 3, 6, 8, 10];
const BLACK_KEY_POSITIONS = [0, 1, 3, 4, 5];
const PDF_WHITE_WIDTH = 14;
const PDF_WHITE_HEIGHT = 44;
const PDF_BLACK_WIDTH = 10;
const PDF_BLACK_HEIGHT = 28;
const PDF_NUM_OCTAVES = 2;
const PDF_START_OCTAVE = 3;
const PIANO_WIDTH = 7 * PDF_NUM_OCTAVES * PDF_WHITE_WIDTH + 2;
const PIANO_HEIGHT = PDF_WHITE_HEIGHT + 2;

function PdfPianoChordDiagram({ item }: { item: PdfChordChartItem }) {
  const { chordSymbol, piano } = item;
  if (!piano || !piano.notes || piano.notes.length === 0) {
    return (
      <View style={pdfStyles.chordCard}>
        <Text style={pdfStyles.chordLabel}>{chordSymbol}</Text>
        <Text style={pdfStyles.chordPlaceholder}>—</Text>
      </View>
    );
  }

  const activeNotes = piano.notes.map((noteString) => {
    const parsed = TonalNote.get(noteString);
    if (parsed.empty) {
      const match = noteString.match(/^([A-Ga-g])(#|b)?(\d)?$/i);
      const octave = match?.[3] ? parseInt(match[3], 10) : PDF_START_OCTAVE;
      const chroma = match ? TonalNote.get(match[1].toUpperCase() + (match[2] ?? '')).chroma ?? 0 : 0;
      return { semitone: chroma, octave };
    }
    const octaveMatch = noteString.match(/(\d+)/);
    const octave = octaveMatch ? parseInt(octaveMatch[1], 10) : PDF_START_OCTAVE;
    return { semitone: parsed.chroma ?? 0, octave };
  });

  const isKeyActive = (semitone: number, octave: number) =>
    activeNotes.some((n) => n.semitone === semitone && n.octave === octave);

  const effectiveStartOctave = PDF_START_OCTAVE - Math.floor(PDF_NUM_OCTAVES / 2);
  const whiteKeys: React.ReactElement[] = [];
  let whiteKeyIndex = 0;

  for (let octave = effectiveStartOctave; octave < effectiveStartOctave + PDF_NUM_OCTAVES; octave++) {
    for (let i = 0; i < 7; i++) {
      const semitone = WHITE_KEY_SEMITONES[i];
      const active = isKeyActive(semitone, octave);
      const x = whiteKeyIndex * PDF_WHITE_WIDTH + 1;
      whiteKeys.push(
        <Rect
          key={`w-${octave}-${i}`}
          x={x}
          y={1}
          width={PDF_WHITE_WIDTH - 1}
          height={PDF_WHITE_HEIGHT - 2}
          fill={active ? colors.whiteKeyActive : colors.whiteKey}
          stroke={colors.stroke}
          strokeWidth={0.5}
          rx={1}
        />
      );
      whiteKeyIndex++;
    }
  }

  const blackKeys: React.ReactElement[] = [];
  let wkIdx = 0;
  for (let octave = effectiveStartOctave; octave < effectiveStartOctave + PDF_NUM_OCTAVES; octave++) {
    for (let i = 0; i < BLACK_KEY_POSITIONS.length; i++) {
      const semitone = BLACK_KEY_SEMITONES[i];
      const active = isKeyActive(semitone, octave);
      const x = (wkIdx + BLACK_KEY_POSITIONS[i]) * PDF_WHITE_WIDTH + PDF_WHITE_WIDTH - PDF_BLACK_WIDTH / 2 + 1;
      blackKeys.push(
        <Rect
          key={`b-${octave}-${i}`}
          x={x}
          y={1}
          width={PDF_BLACK_WIDTH}
          height={PDF_BLACK_HEIGHT}
          fill={active ? colors.blackKeyActive : colors.blackKey}
          stroke={colors.stroke}
          strokeWidth={0.5}
          rx={1}
        />
      );
    }
    wkIdx += 7;
  }

  return (
    <View style={pdfStyles.chordCard}>
      <Text style={pdfStyles.chordLabel}>{chordSymbol}</Text>
      <Svg width={PIANO_WIDTH} height={PIANO_HEIGHT} viewBox={`0 0 ${PIANO_WIDTH} ${PIANO_HEIGHT}`}>
        <Rect x={0} y={0} width={PIANO_WIDTH} height={PDF_WHITE_HEIGHT} fill="#e8e8e8" stroke={colors.stroke} strokeWidth={0.5} rx={2} />
        <G>{whiteKeys}</G>
        <G>{blackKeys}</G>
      </Svg>
    </View>
  );
}

export function PdfChordDiagram({ item }: { item: PdfChordChartItem }) {
  if (item.instrument === 'guitar') return <PdfGuitarChordDiagram item={item} />;
  return <PdfPianoChordDiagram item={item} />;
}

const pdfStyles = StyleSheet.create({
  chordCard: {
    padding: 8,
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    alignItems: 'center',
    minWidth: 90,
    maxWidth: 140,
  },
  chordLabel: {
    fontSize: 9,
    marginBottom: 4,
    color: colors.label,
  },
  chordPlaceholder: {
    fontSize: 8,
    color: '#999',
  },
});
