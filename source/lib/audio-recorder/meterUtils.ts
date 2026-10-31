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

/** dB label for the master meter: 0dB at full scale, -inf when silent. */
export function levelToDbText(level: number): string {
  return level > 0.0005 ? `${Math.round(20 * Math.log10(level))}dB` : '-inf';
}
