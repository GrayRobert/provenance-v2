/** Shared metering helpers for the Track Lab footer meters. */

/** Peak 0-1 from an AnalyserNode.getByteTimeDomainData buffer (128 = silence). */
export function peakFromByteTimeDomain(data: Uint8Array): number {
  let max = 0;
  for (let i = 0; i < data.length; i++) {
    const val = Math.abs(data[i] - 128) / 128;
    if (val > max) max = val;
  }
  return max;
}

/** Peak 0-1 from an AnalyserNode.getFloatTimeDomainData buffer (0 = silence). Finer than byte data near the noise floor. */
export function peakFromFloatTimeDomain(data: Float32Array): number {
  let max = 0;
  for (let i = 0; i < data.length; i++) {
    const val = Math.abs(data[i]);
    if (val > max) max = val;
  }
  return max;
}

/** Meter floor: levels at or below this dBFS light no segments. */
export const METER_FLOOR_DB = -60;

/**
 * dB-scaled meter position 0-1 for a linear peak level. Maps floorDb..0 dB across
 * the bar so normal recording levels (about -20 to -12 dB) read clearly; a linear
 * scale would leave them on the first couple of segments. Display only: the dB
 * label still comes from the raw level, so readings stay truthful.
 */
export function levelToMeterScale(level: number, floorDb: number = METER_FLOOR_DB): number {
  if (level <= 0) return 0;
  const db = 20 * Math.log10(level);
  if (db <= floorDb) return 0;
  return Math.min(1, (db - floorDb) / -floorDb);
}

/** dB label for the master meter: 0dB at full scale, -inf when silent. */
export function levelToDbText(level: number): string {
  return level > 0.0005 ? `${Math.round(20 * Math.log10(level))}dB` : '-inf';
}

/**
 * Peak ballistics for a meter: instant attack, time-based linear decay, so a
 * sampled peak stays visible briefly instead of vanishing between samples.
 * sample(peak, nowMs) returns the value to display.
 */
export function createPeakBallistics(decayPerSecond = 1) {
  let displayed = 0;
  let lastMs: number | null = null;
  return {
    sample(peak: number, nowMs: number): number {
      const dt = lastMs === null ? 0 : Math.max(0, (nowMs - lastMs) / 1000);
      lastMs = nowMs;
      const decayed = Math.max(0, displayed - decayPerSecond * dt);
      displayed = Math.max(peak, decayed);
      return displayed;
    },
    reset(): void {
      displayed = 0;
      lastMs = null;
    },
  };
}
