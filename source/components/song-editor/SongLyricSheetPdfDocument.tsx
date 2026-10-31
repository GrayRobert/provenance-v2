'use client';

import React from 'react';
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from '@react-pdf/renderer';
import type { Line, SongDetail } from '@/lib/types';
import { getChordAbsolutePosition } from '@/lib/export';
import { PdfChordDiagram, type PdfChordChartItem } from './PdfChordDiagrams';

/** Non-breaking space so react-pdf does not strip leading spaces and misalign chords. */
const NBSP = '\u00A0';

function buildChordLine(line: Line): string {
  if (!line.chords?.length) return '';
  // Match lyric line length exactly so chord positions align character-for-character
  const len = line.text.length;
  const arr = NBSP.repeat(len).split('');
  // Sort by position so order is deterministic and left-to-right (matches HTML/text export)
  const chordsByPosition = [...line.chords].sort(
    (a, b) => getChordAbsolutePosition(a, line) - getChordAbsolutePosition(b, line)
  );
  chordsByPosition.forEach((chord) => {
    const symbol = chord.chordSymbol;
    const pos = getChordAbsolutePosition(chord, line);
    for (let i = 0; i < symbol.length; i++) {
      if (pos + i >= 0 && pos + i < arr.length) arr[pos + i] = symbol[i];
    }
  });
  return arr.join('');
}

const colors = {
  foreground: '#1a1a1a',
  muted: '#333',
  chords: '#0066cc',
  border: '#ddd',
  surface: '#f9f9f9',
};

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: colors.foreground,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 24,
  },
  chordChartsSection: {
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  chordChartsHeading: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 8,
    color: colors.muted,
  },
  chordChartsImage: {
    width: '100%',
    maxHeight: 320,
    objectFit: 'contain',
  },
  chordChartsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 6,
    color: colors.muted,
  },
  lineContainer: {
    marginBottom: 4,
  },
  chordLine: {
    fontSize: 10,
    color: colors.chords,
    fontFamily: 'Courier',
    marginBottom: 0,
    whiteSpace: 'pre',
  },
  lyricLine: {
    fontSize: 10,
    fontFamily: 'Courier',
    marginTop: 0,
    whiteSpace: 'pre',
  },
});

export interface SongLyricSheetPdfDocumentProps {
  song: SongDetail;
  /** Optional vector chord charts (preferred over image when provided). */
  chordChartsData?: PdfChordChartItem[];
  /** Fallback: data URL of chord charts image (from html2canvas). Used when chordChartsData is empty. */
  chordChartsImageDataUrl?: string;
}

export function SongLyricSheetPdfDocument({
  song,
  chordChartsData,
  chordChartsImageDataUrl,
}: SongLyricSheetPdfDocumentProps) {
  const sections = [...(song.sections ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
  const useSvgCharts = chordChartsData && chordChartsData.length > 0;
  const useImageCharts = !useSvgCharts && chordChartsImageDataUrl;

  return (
    <Document
      title={song.title || 'Untitled Song'}
      author="Provenance"
    >
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{song.title || 'Untitled Song'}</Text>

        {(useSvgCharts || useImageCharts) && (
          <View style={styles.chordChartsSection}>
            <Text style={styles.chordChartsHeading}>Chords</Text>
            {useSvgCharts ? (
              <View style={styles.chordChartsGrid}>
                {chordChartsData!.map((item, i) => (
                  <PdfChordDiagram key={`${item.chordSymbol}-${i}`} item={item} />
                ))}
              </View>
            ) : (
              <Image src={chordChartsImageDataUrl!} style={styles.chordChartsImage} />
            )}
          </View>
        )}

        {sections.map((section) => {
          const lines = [...(section.lines ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
          return (
            <View key={section.sectionId} style={styles.section} wrap={false}>
              <Text style={styles.sectionTitle}>[{section.label}]</Text>
              {lines.map((line) => {
                const chordStr = buildChordLine(line);
                return (
                  <View key={line.lineId} style={styles.lineContainer}>
                    {chordStr ? (
                      <Text style={styles.chordLine}>{chordStr}</Text>
                    ) : null}
                    <Text style={styles.lyricLine}>{line.text}</Text>
                  </View>
                );
              })}
            </View>
          );
        })}
      </Page>
    </Document>
  );
}
