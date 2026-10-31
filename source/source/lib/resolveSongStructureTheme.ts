export type SongStructureThemeSetting = 'light' | 'dark' | 'system';

export function parseSongStructureTheme(
  raw: unknown
): SongStructureThemeSetting | null {
  if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  return null;
}

/** Effective dark mode for the Song Structure modal (matches Chord Explorer host behavior). */
export function resolveSongStructureDark(theme: SongStructureThemeSetting | null): boolean {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  if (typeof document !== 'undefined') {
    const appTheme = document.documentElement.getAttribute('data-theme');
    if (appTheme === 'dark') return true;
    if (appTheme === 'light') return false;
  }
  if (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  ) {
    return true;
  }
  return false;
}
