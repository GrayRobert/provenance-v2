import type { SectionType, SongSection } from '@/lib/songStructureContract';

/** Browser-only fallback when not signed in (same key as legacy picker). */
export const SONG_STRUCTURE_CUSTOM_STORAGE_KEY = 'song-structure-custom-structures';

export interface CustomSongStructure {
  id: string;
  name: string;
  description: string;
  sections: SongSection[];
}

const SECTION_TYPES = new Set<string>([
  'intro',
  'verse',
  'pre-chorus',
  'chorus',
  'post-chorus',
  'hook',
  'bridge',
  'breakdown',
  'drop',
  'build',
  'outro',
  'solo',
  'riff',
  'interlude',
]);

function isSectionType(s: string): s is SectionType {
  return SECTION_TYPES.has(s);
}

function parseSection(raw: unknown): SongSection | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const type = typeof o.type === 'string' ? o.type : '';
  const label = typeof o.label === 'string' ? o.label : '';
  if (!isSectionType(type)) return null;
  return { type, label };
}

/**
 * Normalizes API / localStorage JSON into custom structures. Drops invalid entries.
 */
export function parseCustomSongStructuresFromUnknown(value: unknown): CustomSongStructure[] {
  if (!Array.isArray(value)) return [];
  const out: CustomSongStructure[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id : '';
    const name = typeof o.name === 'string' ? o.name : '';
    const description = typeof o.description === 'string' ? o.description : '';
    if (!id || !name) continue;
    const sectionsRaw = o.sections;
    if (!Array.isArray(sectionsRaw) || sectionsRaw.length === 0) continue;
    const sections: SongSection[] = [];
    for (const s of sectionsRaw) {
      const sec = parseSection(s);
      if (sec) sections.push(sec);
    }
    if (sections.length === 0) continue;
    out.push({ id, name, description, sections });
  }
  return out;
}

export function readLocalCustomSongStructures(): CustomSongStructure[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = window.localStorage.getItem(SONG_STRUCTURE_CUSTOM_STORAGE_KEY);
    if (!stored) return [];
    return parseCustomSongStructuresFromUnknown(JSON.parse(stored));
  } catch {
    return [];
  }
}

export function writeLocalCustomSongStructures(structures: CustomSongStructure[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SONG_STRUCTURE_CUSTOM_STORAGE_KEY, JSON.stringify(structures));
  } catch {
    // ignore quota / private mode
  }
}

export function clearLocalCustomSongStructures(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SONG_STRUCTURE_CUSTOM_STORAGE_KEY);
  } catch {
    // ignore
  }
}
