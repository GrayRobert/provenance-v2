import type { BatchCommand } from '@/lib/batch-types';
import { songApi } from '@/lib/api';
import { isTabStaffSectionType } from '@/lib/sectionTypes';
import type { SongStructureOutput } from '@/lib/songStructureContract';

/** Map v0 kebab-case scaffold types to Provenance sectionType. */
export function mapScaffoldTypeToProvenance(kebab: string): string {
  const m: Record<string, string> = {
    intro: 'INTRO',
    verse: 'VERSE',
    'pre-chorus': 'PRE_CHORUS',
    chorus: 'CHORUS',
    'post-chorus': 'POST_CHORUS',
    hook: 'HOOK',
    bridge: 'BRIDGE',
    breakdown: 'BREAKDOWN',
    drop: 'DROP',
    build: 'BUILD',
    outro: 'OUTRO',
    solo: 'SOLO',
    riff: 'RIFF',
    interlude: 'INTERLUDE',
  };
  return m[kebab] ?? 'VERSE';
}

/**
 * After `createSong`, append scaffold sections/lines + RecordSongScaffold in one batch.
 * `expectedAfterSequence` should be the song's current last sequence (0 right after SongCreated).
 */
export async function applySongScaffold(
  songId: string,
  output: SongStructureOutput | null,
  expectedAfterSequence = 0
): Promise<void> {
  if (!output || output.sections.length === 0) return;

  const commands: BatchCommand[] = [];

  for (const sec of output.sections) {
    const sectionType = mapScaffoldTypeToProvenance(sec.type);
    const label = sec.label?.trim() ? sec.label : sectionType;
    const sectionId = crypto.randomUUID();

    commands.push({
      type: 'AddSection',
      payload: { sectionType, label },
      clientGeneratedId: sectionId,
    });

    if (!isTabStaffSectionType(sectionType)) {
      const lineId = crypto.randomUUID();
      commands.push({
        type: 'AddLine',
        payload: { sectionId, text: '', source: 'typed' },
        clientGeneratedId: lineId,
      });
    }
  }

  const source = output.genreId === 'custom' ? 'custom' : 'preset';
  commands.push({
    type: 'RecordSongScaffold',
    payload: {
      genreId: output.genreId,
      genreName: output.genreName,
      structureId: output.structureId,
      structureName: output.structureName,
      source,
    },
  });

  await songApi.submitBatch(songId, {
    commands,
    expectedAfterSequence,
  });
}
