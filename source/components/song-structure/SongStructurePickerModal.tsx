'use client';

import { useCallback, useEffect, useState } from 'react';
import { pluginSettingsApi } from '@/lib/api';
import { isAuthenticated } from '@/lib/auth';
import {
  parseSongStructureTheme,
  resolveSongStructureDark,
} from '@/lib/resolveSongStructureTheme';
import {
  clearLocalCustomSongStructures,
  parseCustomSongStructuresFromUnknown,
  readLocalCustomSongStructures,
  writeLocalCustomSongStructures,
  type CustomSongStructure,
} from '@/lib/songStructureCustomStructures';
import { SongStructurePicker } from '@/components/song-structure/SongStructurePicker';
import type { SongStructureOutput } from '@/lib/songStructureContract';

export interface SongStructurePickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the user picks a structure or “No Scaffold” (`null`). Not called when they dismiss with ✕. */
  onComplete: (structure: SongStructureOutput | null) => void;
}

type Bootstrap = {
  isDark: boolean;
  initialCustomStructures: CustomSongStructure[];
};

export function SongStructurePickerModal({
  open,
  onOpenChange,
  onComplete,
}: SongStructurePickerModalProps) {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);

  const persistCustomStructures = useCallback(async (structures: CustomSongStructure[]) => {
    if (!isAuthenticated()) {
      writeLocalCustomSongStructures(structures);
      return;
    }
    await pluginSettingsApi.setPluginSetting(
      'song-structure',
      'custom_song_structures',
      structures
    );
  }, []);

  useEffect(() => {
    if (!open) {
      setBootstrap(null);
      return;
    }

    if (!isAuthenticated()) {
      setBootstrap({
        isDark: resolveSongStructureDark(parseSongStructureTheme(undefined)),
        initialCustomStructures: readLocalCustomSongStructures(),
      });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const settings = await pluginSettingsApi.getPluginSettings('song-structure');
        if (cancelled) return;
        const t = parseSongStructureTheme(settings.theme);
        let custom = parseCustomSongStructuresFromUnknown(settings.custom_song_structures);
        if (custom.length === 0) {
          const legacy = readLocalCustomSongStructures();
          if (legacy.length > 0) {
            await pluginSettingsApi.setPluginSetting(
              'song-structure',
              'custom_song_structures',
              legacy
            );
            clearLocalCustomSongStructures();
            custom = legacy;
          }
        }
        setBootstrap({
          isDark: resolveSongStructureDark(t ?? 'system'),
          initialCustomStructures: custom,
        });
      } catch {
        if (!cancelled) {
          setBootstrap({
            isDark: resolveSongStructureDark('system'),
            initialCustomStructures: readLocalCustomSongStructures(),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  if (bootstrap === null) {
    return (
      <div
        className="song-structure-plugin-root fixed inset-0 z-[200] flex flex-col items-center justify-center bg-background text-foreground"
        role="dialog"
        aria-modal="true"
        aria-label="Loading Song Structure"
      >
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <SongStructurePicker
      isOpen={open}
      isDark={bootstrap.isDark}
      initialCustomStructures={bootstrap.initialCustomStructures}
      persistCustomStructures={persistCustomStructures}
      onClose={() => {
        onOpenChange(false);
      }}
      onSelect={(structure) => {
        onComplete(structure);
        onOpenChange(false);
      }}
    />
  );
}
