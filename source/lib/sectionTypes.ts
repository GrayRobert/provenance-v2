/**
 * Canonical song section types (stored as sectionType on sections / events).
 * Single source for Add Section menu, section edit dropdown, and display labels.
 */

export const SONG_SECTION_TYPES = [
  'GUITAR_TAB',
  'INTRO',
  'VERSE',
  'PRE_CHORUS',
  'CHORUS',
  'POST_CHORUS',
  'HOOK',
  'DROP',
  'BUILD',
  'RIFF',
  'BRIDGE',
  'BREAKDOWN',
  'SOLO',
  'INSTRUMENTAL',
  'INTERLUDE',
  'OUTRO',
  'NOTES_META',
] as const;

export type SongSectionType = (typeof SONG_SECTION_TYPES)[number];

export const SECTION_TYPE_LABELS: Record<SongSectionType, string> = {
  GUITAR_TAB: 'Guitar Tab',
  INTRO: 'Intro',
  VERSE: 'Verse',
  PRE_CHORUS: 'Pre-Chorus',
  CHORUS: 'Chorus',
  POST_CHORUS: 'Post-Chorus',
  HOOK: 'Hook',
  DROP: 'Drop',
  BUILD: 'Build',
  RIFF: 'Riff',
  BRIDGE: 'Bridge',
  BREAKDOWN: 'Breakdown',
  SOLO: 'Solo',
  INSTRUMENTAL: 'Instrumental',
  INTERLUDE: 'Interlude',
  OUTRO: 'Outro',
  NOTES_META: 'Notes/Meta',
};

/**
 * Section types that are commonly instrumental (or tab-first): ASCII tab staff + chord rail,
 * no default empty lyric line; users add tab / measure rows from section actions.
 * Includes hook/drop/build/riff/breakdown/solo and other instrumental-leaning types.
 */
const TAB_STAFF_SECTION_TYPES = new Set<SongSectionType>([
  'GUITAR_TAB',
  'INSTRUMENTAL',
  'INTRO',
  'INTERLUDE',
  'OUTRO',
  'HOOK',
  'DROP',
  'BUILD',
  'RIFF',
  'BREAKDOWN',
  'SOLO',
]);

export function isTabStaffSectionType(type: string): boolean {
  return TAB_STAFF_SECTION_TYPES.has(type as SongSectionType);
}

/**
 * Add Section menu: two columns (9 + 8). Guitar Tab is first (top-left).
 * All canonical types appear exactly once.
 */
export const ADD_SECTION_MENU_COLUMNS: [SongSectionType[], SongSectionType[]] = [
  ['GUITAR_TAB', 'INTRO', 'VERSE', 'PRE_CHORUS', 'CHORUS', 'POST_CHORUS', 'HOOK', 'DROP', 'BUILD'],
  ['RIFF', 'BRIDGE', 'BREAKDOWN', 'SOLO', 'INSTRUMENTAL', 'INTERLUDE', 'OUTRO', 'NOTES_META'],
];

/** Flat order matching the add menu (for section-type &lt;select&gt; options). */
export const SECTION_TYPES_IN_MENU_ORDER: SongSectionType[] =
  ADD_SECTION_MENU_COLUMNS[0].concat(ADD_SECTION_MENU_COLUMNS[1]);

export function sectionTypeDisplay(type: string): string {
  return SECTION_TYPE_LABELS[type as SongSectionType] ?? type;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Prefixes to strip from section recording labels (longest / most specific first).
 * Includes display labels and common import/legacy spellings.
 */
const SECTION_LABEL_PREFIX_PATTERNS: string[] = [
  'Post-Chorus',
  'POST_CHORUS',
  'POST-CHORUS',
  'POST CHORUS',
  'POSTCHORUS',
  'Pre-Chorus',
  'PRE_CHORUS',
  'PRE-CHORUS',
  'PRE CHORUS',
  'Guitar Tab',
  'GUITAR_TAB',
  'GUITAR TAB',
  'Notes/Meta',
  'NOTES_META',
  'NOTES META',
  'Instrumental',
  'INSTRUMENTAL',
  'Interlude',
  'INTERLUDE',
  'Breakdown',
  'BREAKDOWN',
  'Chorus',
  'CHORUS',
  'Bridge',
  'BRIDGE',
  'Intro',
  'INTRO',
  'Outro',
  'OUTRO',
  'Verse',
  'VERSE',
  'Hook',
  'HOOK',
  'Solo',
  'SOLO',
  'Drop',
  'DROP',
  'Build',
  'BUILD',
  'Riff',
  'RIFF',
];

/** Strips leading section-type phrase from recording labels before formatting version suffix. */
const SECTION_PREFIX_INNER = SECTION_LABEL_PREFIX_PATTERNS.map(escapeRegex).join('|');
export const SECTION_TYPE_PREFIX_REGEX = new RegExp(`^(?:${SECTION_PREFIX_INNER})\\s+`, 'i');
