/**
 * App-wide audio output device preference (speaker vs default).
 * Used by Chord Explorer and Track Lab. Persisted to chord-explorer plugin settings when
 * logged in, and to localStorage as fallback so the choice is available when not logged in.
 */

const STORAGE_KEY = 'provenance_audio_output_device_id';
const PREFERENCE_SET_KEY = 'provenance_audio_output_preference_set';

export async function getStoredOutputDeviceId(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    const { isAuthenticated } = await import('@/lib/auth');
    if (isAuthenticated()) {
      const { pluginSettingsApi } = await import('@/lib/api');
      const settings = await pluginSettingsApi.getPluginSettings('chord-explorer');
      const value = settings.output_device_id;
      if (typeof value === 'string' && value.length > 0) return value;
      if (value === null || (Array.isArray(value) && value.length === 0)) return null;
    }
  } catch {
    /* fall through to localStorage */
  }
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === '' || stored === null) return null;
  return stored;
}

/**
 * Whether the user has already made an output preference choice (speaker or default).
 * When true, do not show the mobile speaker prompt again.
 */
export async function getHasOutputPreference(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const { isAuthenticated } = await import('@/lib/auth');
    if (isAuthenticated()) {
      const { pluginSettingsApi } = await import('@/lib/api');
      const settings = await pluginSettingsApi.getPluginSettings('chord-explorer');
      if (Object.prototype.hasOwnProperty.call(settings, 'output_device_id')) return true;
    }
  } catch {
    /* fall through */
  }
  return localStorage.getItem(PREFERENCE_SET_KEY) === '1';
}

export async function setStoredOutputDeviceId(deviceId: string | null): Promise<void> {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PREFERENCE_SET_KEY, '1');
  if (deviceId === null || deviceId === '') {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, deviceId);
  }
  try {
    const { isAuthenticated } = await import('@/lib/auth');
    if (isAuthenticated()) {
      const { pluginSettingsApi } = await import('@/lib/api');
      await pluginSettingsApi.setPluginSetting('chord-explorer', 'output_device_id', deviceId);
    }
  } catch {
    /* preference still saved in localStorage */
  }
}
