/** Parse persisted plugin boolean (API may return string or boolean). */
export function parsePluginBooleanSetting(
  value: unknown,
  defaultWhenUnset: boolean
): boolean {
  if (value === undefined || value === null) return defaultWhenUnset;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase();
    if (s === 'false' || s === '0') return false;
    if (s === 'true' || s === '1') return true;
  }
  return defaultWhenUnset;
}
