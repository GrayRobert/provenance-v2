import React from 'react';
import { Chord, Line, SongDetail } from '@/lib/types';
import { guitarTabStaffDisplayBlockLineCount } from '@/lib/guitar-tab-bar';
import { instrumentalMeasureBlockLineCount } from '@/lib/instrumental-measure-row';
import type { Instrument } from '@/lib/types';
import { getVoicingsForChord } from '@/lib/chordVoicings';

/** Time signature + tempo appended after the chord chart block in text/HTML export. */
export interface SongRhythmForExport {
  timeSignature: [number, number];
  bpm: number;
}

const DEFAULT_EXPORT_RHYTHM: SongRhythmForExport = {
  timeSignature: [4, 4],
  bpm: 120,
};

function clampSigPart(n: number): number {
  if (!Number.isFinite(n)) return 4;
  return Math.max(1, Math.min(12, Math.floor(n)));
}

function clampExportBpm(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_EXPORT_RHYTHM.bpm;
  return Math.max(40, Math.min(240, Math.round(n)));
}

/** Read per-song rhythm from localStorage (same keys as Song Key drawer). Client-only safe. */
export function getStoredSongRhythmForExport(songId: string): SongRhythmForExport {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_EXPORT_RHYTHM };
  }
  const tsRaw = window.localStorage.getItem(`song_time_signature_${songId}`);
  const bpmRaw = window.localStorage.getItem(`song_bpm_${songId}`);
  let timeSignature: [number, number] = [...DEFAULT_EXPORT_RHYTHM.timeSignature];
  if (tsRaw) {
    const m = /^(\d{1,2})\/(\d{1,2})$/.exec(tsRaw.trim());
    if (m) {
      timeSignature = [clampSigPart(parseInt(m[1], 10)), clampSigPart(parseInt(m[2], 10))];
    }
  }
  const parsedBpm = parseInt(bpmRaw ?? '', 10);
  const bpm = bpmRaw != null && bpmRaw !== '' ? clampExportBpm(parsedBpm) : DEFAULT_EXPORT_RHYTHM.bpm;
  return { timeSignature, bpm };
}

function appendRhythmText(output: string, rhythm: SongRhythmForExport): string {
  const [n, d] = rhythm.timeSignature;
  return `${output}${n}/${d}\n${rhythm.bpm} BPM\n\n`;
}

function rhythmHtmlBlock(rhythm: SongRhythmForExport): string {
  const [n, d] = rhythm.timeSignature;
  return `  <div class="song-rhythm" style="margin-bottom: 28px; font-family: 'Courier New', monospace; white-space: pre;">
    <div>Time: ${n}/${d}</div>
    <div>Tempo: ${rhythm.bpm} BPM</div>
  </div>\n`;
}

/** Calculate the absolute position of a chord in the line text. Exported for PDF export. */
export function getChordAbsolutePosition(chord: Chord, line: Line): number {
  if (chord.tokenId && line.tokens) {
    const token = line.tokens.find(t => t.tokenId === chord.tokenId);
    if (token) {
      return token.startOffset + chord.charOffset;
    }
  }
  return chord.charOffset;
}

export function exportAsText(song: SongDetail, rhythm?: SongRhythmForExport | null): string {
  let output = '';

  // Title
  output += `${song.title || 'Untitled Song'}\n`;
  output += '='.repeat((song.title || 'Untitled Song').length) + '\n\n';

  // Chords (tab-style, same as Word/HTML)
  const chordLines = getChordTabLines(song);
  if (chordLines.length > 0) {
    output += 'Chords\n';
    chordLines.forEach((line) => {
      output += line + '\n';
    });
    output += '\n';
  }

  if (rhythm) {
    output = appendRhythmText(output, rhythm);
  }

  // Sections
  song.sections.forEach((section) => {
    output += `[${section.label}]\n`;
    section.lines.forEach((line) => {
      // Chords above line if any
      if (line.chords.length > 0) {
        const chordLine = ' '.repeat(Math.max(line.text.length, 100));
        const chordArray = chordLine.split('');
        const chordsByPosition = [...line.chords].sort(
          (a, b) => getChordAbsolutePosition(a, line) - getChordAbsolutePosition(b, line)
        );
        chordsByPosition.forEach((chord) => {
          const symbol = chord.chordSymbol;
          const absolutePosition = getChordAbsolutePosition(chord, line);
          for (let i = 0; i < symbol.length; i++) {
            if (absolutePosition + i < chordArray.length) {
              chordArray[absolutePosition + i] = symbol[i];
            }
          }
        });
        output += chordArray.join('').trimEnd() + '\n';
      }
      output += line.text + '\n';
    });
    output += '\n';
  });
  
  return output;
}

/** Escape `}` and `\` for ChordPro directive values ({title: ...}). */
export function escapeChordProDirectiveValue(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\}/g, '\\}');
}

/**
 * One lyric line as ChordPro: inline [Sym] at character positions (aligned with plain import).
 * Chord diagram grids are not included (use HTML/Word export).
 */
export function exportChordProLine(line: Line): string {
  const text = line.text ?? '';
  const sorted = [...line.chords].sort(
    (a, b) => getChordAbsolutePosition(a, line) - getChordAbsolutePosition(b, line)
  );
  let out = '';
  let ci = 0;
  for (let i = 0; i <= text.length; i++) {
    while (ci < sorted.length && getChordAbsolutePosition(sorted[ci], line) === i) {
      const sym = sorted[ci].chordSymbol?.trim();
      if (sym) out += `[${sym}]`;
      ci++;
    }
    if (i < text.length) {
      const c = text[i];
      if (c === '\\') out += '\\\\';
      else if (c === '[') out += '\\[';
      else if (c === ']') out += '\\]';
      else out += c;
    }
  }
  return out;
}

/**
 * Segment section lines into measure blocks, tab blocks, and plain lyric lines for Provenance backup.
 */
export function exportChordProSectionLines(lines: Line[]): string {
  const list = lines ?? [];
  let out = '';
  let i = 0;
  while (i < list.length) {
    const meas = instrumentalMeasureBlockLineCount(list, i);
    if (meas > 0) {
      out += '{provenance_measures}\n';
      for (let j = 0; j < meas; j++) {
        out += `${exportChordProLine(list[i + j])}\n`;
      }
      out += '{end_provenance_measures}\n';
      i += meas;
      continue;
    }
    const tabSpan = guitarTabStaffDisplayBlockLineCount(list, i);
    if (tabSpan > 0) {
      out += '{start_of_tab}\n';
      for (let j = 0; j < tabSpan; j++) {
        out += `${exportChordProLine(list[i + j])}\n`;
      }
      out += '{end_of_tab}\n';
      i += tabSpan;
      continue;
    }
    out += `${exportChordProLine(list[i])}\n`;
    i++;
  }
  return out;
}

/**
 * ChordPro (.cho): {title}, optional {time}/{tempo}, then [Section] lines and inline chords.
 */
export function exportAsChordPro(song: SongDetail, rhythm?: SongRhythmForExport | null): string {
  let output = `{title: ${escapeChordProDirectiveValue(song.title || 'Untitled Song')}}\n`;
  output +=
    '{comment: Provenance export — ChordPro syntax; tab/measures intended for backup in Provenance. Other apps: best-effort display.}\n';
  if (rhythm) {
    const [n, d] = rhythm.timeSignature;
    output += `{time: ${n}/${d}}\n`;
    output += `{tempo: ${rhythm.bpm}}\n`;
  }
  output += '\n';
  for (const section of song.sections ?? []) {
    const st = (section.sectionType ?? 'VERSE').trim();
    output += `{provenance_section_type: ${escapeChordProDirectiveValue(st)}}\n`;
    const safeLabel = (section.label ?? 'Section').replace(/\]/g, '');
    output += `[${safeLabel}]\n`;
    output += exportChordProSectionLines(section.lines ?? []);
    output += '\n';
  }
  return output;
}

/** Convert guitar positions (low E to high E, -1 = mute) to tab string e.g. "x32010". */
function positionsToTab(positions: number[]): string {
  return positions
    .map((p) => (p < 0 ? 'x' : String(p)))
    .join('');
}

/** Get first guitar voicing for symbol and return tab string, or null if none. */
function getTabNotationForChord(symbol: string): string | null {
  const voicings = getVoicingsForChord(symbol);
  const first = voicings[0];
  if (!first || !first.positions?.length) return null;
  return positionsToTab(first.positions);
}

/** Collect unique chord symbols from the song and return "symbol tab" lines (guitar). */
function getChordTabLines(song: SongDetail): string[] {
  const symbols = new Set<string>();
  song.sections?.forEach((sec) =>
    sec.lines?.forEach((line) =>
      line.chords?.forEach((c) => {
        if (c.chordSymbol?.trim()) symbols.add(c.chordSymbol.trim());
      })
    )
  );
  const lines: string[] = [];
  symbols.forEach((symbol) => {
    const tab = getTabNotationForChord(symbol);
    if (tab != null) lines.push(`${symbol} ${tab}`);
  });
  return lines;
}

/**
 * Build chord charts section as tab-style text (e.g. "C" / "x32010") for Word/plain export.
 * Guitar only; for piano returns empty (or we could show note names later).
 */
export function buildChordChartsTabHtml(song: SongDetail, instrument: Instrument): string {
  if (instrument !== 'guitar') return '';
  const entries = getChordTabLines(song);
  if (entries.length === 0) return '';
  return entries
    .map((line) => `  <div class="chord-tab-line">${escapeHtml(line)}</div>`)
    .join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function exportAsHTML(
  song: SongDetail,
  chordChartsHtml?: string,
  rhythm?: SongRhythmForExport | null
): string {
  let html = `<!DOCTYPE html>
<html>
<head>
  <title>${song.title || 'Untitled Song'}</title>
  <style>
    body {
      font-family: 'Courier New', monospace;
      max-width: 800px;
      margin: 40px auto;
      padding: 20px;
      line-height: 1.6;
    }
    h1 {
      text-align: center;
      margin-bottom: 40px;
    }
    .chord-charts {
      margin-bottom: 40px;
      padding: 16px 0;
      border-bottom: 1px solid #ddd;
    }
    .chord-charts h2 {
      font-size: 1rem;
      font-weight: bold;
      margin-bottom: 12px;
      color: #333;
    }
    /* Grid: up to 8 chord diagrams per row on A4 (half size) */
    .chord-charts > div {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: flex-start;
    }
    .chord-charts > div > div {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: calc(12.5% - 5px);
      max-width: 80px;
      min-width: 60px;
      padding: 3px;
      border: 1px solid #ddd;
      border-radius: 4px;
      background: #f9f9f9;
      box-sizing: border-box;
    }
    .chord-charts svg {
      max-width: 100%;
      width: 100%;
      height: auto;
    }
    .chord-charts .chord-label, .chord-charts span.text-xs {
      font-size: 0.65rem;
    }
    .chord-tab-line {
      margin-bottom: 5px;
    }
    @media print {
      .chord-charts > div > div {
        max-width: 11%;
        min-width: 0;
      }
    }
    .section {
      margin-bottom: 30px;
    }
    .section-title {
      font-weight: bold;
      margin-bottom: 10px;
      color: #333;
    }
    .line-container {
      margin-bottom: 5px;
    }
    .chords {
      color: #0066cc;
      font-weight: bold;
      white-space: pre;
    }
    .lyrics {
      white-space: pre;
    }
    @media print {
      body { margin: 20px; }
    }
  </style>
</head>
<body>
  <h1>${song.title || 'Untitled Song'}</h1>
`;

  if (chordChartsHtml && chordChartsHtml.trim()) {
    html += `  <div class="chord-charts">\n    <h2>Chords</h2>\n${chordChartsHtml}\n  </div>\n`;
  }

  if (rhythm) {
    html += rhythmHtmlBlock(rhythm);
  }

  song.sections.forEach((section) => {
    html += `  <div class="section">\n`;
    html += `    <div class="section-title">[${section.label}]</div>\n`;
    
    section.lines.forEach((line) => {
      html += `    <div class="line-container">\n`;
      
      // Chords (match lyric line length exactly so positions align)
      if (line.chords.length > 0) {
        const len = line.text.length;
        const chordArray = ' '.repeat(len).split('');
        const chordsByPosition = [...line.chords].sort(
          (a, b) => getChordAbsolutePosition(a, line) - getChordAbsolutePosition(b, line)
        );
        chordsByPosition.forEach((chord) => {
          const symbol = chord.chordSymbol;
          const absolutePosition = getChordAbsolutePosition(chord, line);
          for (let i = 0; i < symbol.length; i++) {
            if (absolutePosition + i >= 0 && absolutePosition + i < chordArray.length) {
              chordArray[absolutePosition + i] = symbol[i];
            }
          }
        });
        html += `      <div class="chords">${chordArray.join('')}</div>\n`;
      }
      
      html += `      <div class="lyrics">${line.text}</div>\n`;
      html += `    </div>\n`;
    });
    
    html += `  </div>\n`;
  });

  html += `</body>
</html>`;

  return html;
}

/**
 * Open the song as HTML in a new window and trigger the browser print dialog.
 * Use "Save as PDF" / "Print to PDF" in the dialog to get a PDF that matches the HTML export
 * (chord alignment, chord diagrams, and layout).
 */
export function openSongPrintView(
  song: SongDetail,
  chordChartsHtml: string,
  rhythm?: SongRhythmForExport | null
): void {
  let html = exportAsHTML(song, chordChartsHtml, rhythm);
  const printScript =
    '<script>window.onload=function(){setTimeout(function(){window.print();},300);};<\/script>';
  html = html.replace('</body>', printScript + '\n</body>');
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank', 'noopener,noreferrer');
  if (w) {
    w.focus();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } else {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}

/**
 * Replace every <svg> in the HTML with an <img> whose src is a data URL of that SVG.
 * Word does not render inline SVG in MHTML; it shows text content only. Using
 * data:image/svg+xml (or PNG) makes chord diagrams appear as images.
 * Runs only in browser (uses DOMParser/XMLSerializer).
 */
export function replaceSvgWithInlineImages(html: string): string {
  if (typeof document === 'undefined' || typeof DOMParser === 'undefined') return html;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const serializer = new XMLSerializer();
  doc.querySelectorAll('svg').forEach((svg) => {
    const svgString = serializer.serializeToString(svg);
    const base64 = typeof btoa !== 'undefined'
      ? btoa(unescape(encodeURIComponent(svgString)))
      : '';
    if (!base64) return;
    const img = doc.createElement('img');
    img.setAttribute('src', `data:image/svg+xml;base64,${base64}`);
    const w = svg.getAttribute('width') || svg.getAttribute('viewBox')?.split(/\s+/)[2] || '120';
    const h = svg.getAttribute('height') || svg.getAttribute('viewBox')?.split(/\s+/)[3] || '120';
    img.setAttribute('width', w.replace(/px$/, ''));
    img.setAttribute('height', h.replace(/px$/, ''));
    img.setAttribute('alt', 'Chord diagram');
    svg.parentNode?.replaceChild(img, svg);
  });
  return '<!DOCTYPE html>\n<html>' + (doc.documentElement?.innerHTML ?? '') + '</html>';
}

/**
 * Wrap HTML as MHTML (single-file web archive). Word and other editors can open
 * this when saved with a .doc extension (Confluence-style "export to Word").
 * Our HTML is self-contained (no external resources), so the MHTML has one part.
 */
export function htmlToMht(html: string): string {
  const boundary = '----=_NextPart_000_0000_' + Math.random().toString(36).slice(2, 12);
  const crlf = '\r\n';
  const parts: string[] = [
    'MIME-Version: 1.0' + crlf,
    `Content-Type: multipart/related; boundary="${boundary}"; type="text/html"` + crlf,
    crlf,
    `--${boundary}` + crlf,
    'Content-Type: text/html; charset=utf-8' + crlf,
    'Content-Transfer-Encoding: 8bit' + crlf,
    'Content-Location: song.html' + crlf,
    crlf,
    html,
    crlf,
    `--${boundary}--` + crlf,
  ];
  return parts.join('');
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function sanitizeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 80) || 'song';
}

/** Chord chart item for PDF (vector Svg). See PdfChordDiagrams.tsx. */
export type { PdfChordChartItem } from '@/components/song-editor/PdfChordDiagrams';

/** Export song as PDF (lyric sheet with optional chord charts). Prefers vector chordChartsData over image. */
export async function exportSongPdf(
  song: SongDetail,
  chordChartsImageDataUrl?: string,
  chordChartsData?: import('@/components/song-editor/PdfChordDiagrams').PdfChordChartItem[]
): Promise<void> {
  const { pdf } = await import('@react-pdf/renderer');
  const { SongLyricSheetPdfDocument } = await import(
    '@/components/song-editor/SongLyricSheetPdfDocument'
  );
  const doc = React.createElement(SongLyricSheetPdfDocument, {
    song,
    chordChartsData: chordChartsData ?? undefined,
    chordChartsImageDataUrl: chordChartsImageDataUrl ?? undefined,
  });
  // @react-pdf/renderer pdf() expects DocumentProps; our custom document is compatible at runtime
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = await pdf(doc as any).toBlob();
  const url = URL.createObjectURL(blob);
  const filename = `${sanitizeFilename(song.title || 'song')}.pdf`;
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}






