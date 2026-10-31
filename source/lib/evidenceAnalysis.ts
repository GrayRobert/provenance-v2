import { Event, EvidenceCoverage } from './types';

/** Derive the set of line IDs that currently exist (not archived) by replaying events in order. */
function getCurrentLineIds(events: Event[]): Set<string> {
  const lineIds = new Set<string>();
  for (const event of events) {
    try {
      const p = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
      const lineId = p?.lineId ?? p?.line_id;
      if (lineId == null) continue;
      const id = String(lineId);
      if (event.eventType === 'LineAddedEvent') {
        lineIds.add(id);
      } else if (event.eventType === 'LineArchivedEvent') {
        lineIds.delete(id);
      }
    } catch {
      // ignore parse errors
    }
  }
  return lineIds;
}

/**
 * Analyzes events to determine what evidence has been captured.
 * Paste is only flagged if the pasted line still exists (not archived).
 */
export function analyzeEvidenceCoverage(events: Event[]): EvidenceCoverage {
  const coverage: EvidenceCoverage = {
    lyrics: false,
    structure: false,
    chords: false,
    iterations: false,
    typedInput: false,
    pastedInput: false,
    importedInput: false,
    audioOrDemo: false,
  };

  const currentLineIds = getCurrentLineIds(events);

  for (const event of events) {
    // Check for lyrics (any line added that still exists)
    if (event.eventType === 'LineAddedEvent') {
      try {
        const p = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
        const lineId = p?.lineId ?? p?.line_id;
        if (lineId != null && currentLineIds.has(String(lineId))) coverage.lyrics = true;
      } catch {
        coverage.lyrics = true; // fallback if we can't parse
      }
    }

    // Check for structure (sections created)
    if (event.eventType === 'SectionAddedEvent') {
      coverage.structure = true;
    }

    // Check for chords
    if (event.eventType === 'ChordAddedEvent') {
      coverage.chords = true;
    }

    // Check for iterations (edit events for lines that still exist)
    if (event.eventType === 'LineEditedEvent') {
      try {
        const p = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
        const lineId = p?.lineId ?? p?.line_id;
        if (lineId == null || currentLineIds.has(String(lineId))) coverage.iterations = true;
      } catch {
        coverage.iterations = true;
      }
    }

    if (event.eventType === 'TabEditedEvent') {
      try {
        const p = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
        const rows = p?.lines;
        if (!Array.isArray(rows) || rows.length === 0) {
          coverage.iterations = true;
        } else {
          const anyCurrent = rows.some(
            (row: { lineId?: string; line_id?: string }) =>
              currentLineIds.has(String(row?.lineId ?? row?.line_id ?? ''))
          );
          if (anyCurrent) coverage.iterations = true;
        }
      } catch {
        coverage.iterations = true;
      }
    }

    // Check for typed input (direct keyboard)
    if (event.source === 'typed') {
      coverage.typedInput = true;
    }

    // Check for pasted input only when the pasted line still exists (not archived)
    if (
      event.source === 'paste' &&
      (event.eventType === 'LineAddedEvent' ||
        event.eventType === 'LineEditedEvent' ||
        event.eventType === 'TabAddedEvent' ||
        event.eventType === 'TabEditedEvent')
    ) {
      try {
        const p = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
        if (event.eventType === 'TabAddedEvent' || event.eventType === 'TabEditedEvent') {
          const rows = p?.lines;
          if (Array.isArray(rows)) {
            const anyCurrent = rows.some(
              (row: { lineId?: string; line_id?: string }) =>
                currentLineIds.has(String(row?.lineId ?? row?.line_id ?? ''))
            );
            if (anyCurrent) coverage.pastedInput = true;
          }
        } else {
          const lineId = p?.lineId ?? p?.line_id;
          if (lineId != null && currentLineIds.has(String(lineId))) coverage.pastedInput = true;
        }
      } catch {
        coverage.pastedInput = true;
      }
    }

    // Check for imported input (lyrics from file) when the line still exists
    if (
      event.source === 'import' &&
      (event.eventType === 'LineAddedEvent' ||
        event.eventType === 'LineEditedEvent' ||
        event.eventType === 'TabAddedEvent' ||
        event.eventType === 'TabEditedEvent')
    ) {
      try {
        const p = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
        if (event.eventType === 'TabAddedEvent' || event.eventType === 'TabEditedEvent') {
          const rows = p?.lines;
          if (Array.isArray(rows)) {
            const anyCurrent = rows.some(
              (row: { lineId?: string; line_id?: string }) =>
                currentLineIds.has(String(row?.lineId ?? row?.line_id ?? ''))
            );
            if (anyCurrent) coverage.importedInput = true;
          }
        } else {
          const lineId = p?.lineId ?? p?.line_id;
          if (lineId != null && currentLineIds.has(String(lineId))) coverage.importedInput = true;
        }
      } catch {
        coverage.importedInput = true;
      }
    }

    // Check for audio/demo: at least one recording (demo or section) has been added
    if (event.eventType === 'RecordingAddedEvent') {
      coverage.audioOrDemo = true;
    }
  }

  return coverage;
}

/**
 * Gets a human-readable label for a coverage area
 */
export function getCoverageLabel(key: keyof EvidenceCoverage): string {
  const labels: Record<keyof EvidenceCoverage, string> = {
    lyrics: 'Lyrics',
    structure: 'Structure',
    chords: 'Chords',
    iterations: 'Iterations',
    typedInput: 'Typed input',
    pastedInput: 'Pasted input',
    importedInput: 'Imported input',
    audioOrDemo: 'Audio / demo',
  };
  return labels[key];
}

/**
 * Gets a description for what each coverage area means
 */
export function getCoverageDescription(key: keyof EvidenceCoverage): string {
  const descriptions: Record<keyof EvidenceCoverage, string> = {
    lyrics: 'Lyric lines have been written and recorded',
    structure: 'Song structure (sections) has been defined',
    chords: 'Chord annotations have been added to lyrics',
    iterations: 'Edits and revisions have been captured',
    typedInput: 'Direct typing events show authorship evidence',
    pastedInput: 'Content pasted from clipboard has been recorded',
    importedInput: 'Some lyrics were imported from a file',
    audioOrDemo: 'A demo or section recording has been uploaded',
  };
  return descriptions[key];
}

/**
 * Calculates the percentage of coverage areas that are present
 */
export function getCoveragePercentage(coverage: EvidenceCoverage): number {
  const total = Object.keys(coverage).length;
  const present = Object.values(coverage).filter(Boolean).length;
  return Math.round((present / total) * 100);
}

export interface EvidenceSummary {
  /** Reliable evidence: lyrics, structure, chords, iterations, typed input (when no paste). */
  covered: string[];
  /** Questionable or caveats: e.g. pasted content (authorship not attested by typing). */
  questionable: string[];
}

/**
 * Builds an evidence summary for display (e.g. on certificate PDF): what is covered vs questionable.
 * Pasted content is listed under questionable, not as "covered".
 */
export function getEvidenceSummary(coverage: EvidenceCoverage): EvidenceSummary {
  const covered: string[] = [];
  const questionable: string[] = [];

  if (coverage.lyrics) covered.push(getCoverageLabel('lyrics'));
  if (coverage.structure) covered.push(getCoverageLabel('structure'));
  if (coverage.chords) covered.push(getCoverageLabel('chords'));
  if (coverage.iterations) covered.push(getCoverageLabel('iterations'));
  // Typed input is "covered" only when there is typed input and no pasted/imported content in current lines
  if (coverage.typedInput && !coverage.pastedInput && !coverage.importedInput) covered.push(getCoverageLabel('typedInput'));
  if (coverage.audioOrDemo) covered.push(getCoverageLabel('audioOrDemo'));

  if (coverage.pastedInput) {
    questionable.push(
      'Some content was pasted; authorship of pasted content is not attested by direct typing.'
    );
  }
  if (coverage.importedInput) {
    questionable.push(
      'Some lyrics were imported from a file; authorship of imported content is not attested by direct typing.'
    );
  }

  return { covered, questionable };
}





