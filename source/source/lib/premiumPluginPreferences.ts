import { pluginSettingsApi } from '@/lib/api';
import { parsePluginBooleanSetting } from '@/lib/pluginSettingsBooleans';

export const PLUGIN_ENABLED_SETTING_KEY = 'plugin_enabled';

export const PREMIUM_PLUGIN_GATE_IDS = [
  'chord_explorer',
  'chord_voicing_selection',
  'track_lab',
  'song_structure',
  'audio_player',
] as const;

export type PremiumPluginGateId = (typeof PREMIUM_PLUGIN_GATE_IDS)[number];

export const GATE_ID_TO_API_PLUGIN_ID: Record<PremiumPluginGateId, string> = {
  chord_explorer: 'chord-explorer',
  chord_voicing_selection: 'chord-voicing-selection',
  track_lab: 'track-lab',
  song_structure: 'song-structure',
  audio_player: 'audio-player',
};

const API_PLUGIN_IDS: string[] = [...new Set(Object.values(GATE_ID_TO_API_PLUGIN_ID))];

/**
 * Effective on/off: missing value defaults to on when the user may use premium plugins,
 * and off when they are on a free plan and the grace period has ended.
 */
export function effectivePluginEnabled(
  settings: Record<string, unknown>,
  canUsePremium: boolean
): boolean {
  return parsePluginBooleanSetting(settings[PLUGIN_ENABLED_SETTING_KEY], canUsePremium);
}

export function premiumPluginDisplayName(pluginId: string): string {
  switch (pluginId) {
    case 'chord_explorer':
      return 'Chord Explorer';
    case 'chord_voicing_selection':
      return 'Chord Builder';
    case 'track_lab':
      return 'Track Lab';
    case 'song_structure':
      return 'Song Structure';
    case 'audio_player':
      return 'Audio Player';
    default:
      return pluginId;
  }
}

export async function fetchPremiumPluginEnabledMap(
  canUsePremium: boolean
): Promise<Record<PremiumPluginGateId, boolean>> {
  const results = await Promise.all(
    API_PLUGIN_IDS.map((id) => pluginSettingsApi.getPluginSettings(id))
  );
  const byApiId: Record<string, Record<string, unknown>> = {};
  API_PLUGIN_IDS.forEach((id, i) => {
    byApiId[id] = results[i] ?? {};
  });
  const map = {} as Record<PremiumPluginGateId, boolean>;
  for (const gate of PREMIUM_PLUGIN_GATE_IDS) {
    const apiId = GATE_ID_TO_API_PLUGIN_ID[gate];
    map[gate] = effectivePluginEnabled(byApiId[apiId] ?? {}, canUsePremium);
  }
  return map;
}
