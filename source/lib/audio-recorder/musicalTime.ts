/**
 * Musical time (PPQN-inspired) for Track Lab.
 * Bar/beat and grid in seconds; no dependency on openDAW.
 */

import type { TimelineTransform } from './timelineTransform';

/** Pulses per quarter note (960 = common DAW resolution). */
export const PPQN = 960;

export type TimeSignature = [number, number];

/** Snap setting for grid and (future) snap-to-grid. */
export type SnapSetting =
  | 'Bar'
  | '1/2'
  | '1/4'
  | '1/8'
  | '1/8T'
  | '1/16'
  | '1/16T'
  | '1/32'
  | '1/32T'
  | '1/64'
  | '1/128'
  | 'Smart'
  | 'Off';

/** Convert seconds to pulses (PPQN-based). */
export function secondsToPulses(seconds: number, bpm: number): number {
  if (bpm <= 0) return 0;
  return (seconds * bpm / 60) * PPQN;
}

/** Convert pulses to seconds. */
export function pulsesToSeconds(pulses: number, bpm: number): number {
  if (bpm <= 0) return 0;
  return (pulses * 60) / (bpm * PPQN);
}

/** Pulses per bar from time signature. Bar = (4/denominator)*numerator quarter notes. */
function pulsesPerBar(timeSignature: TimeSignature): number {
  const [num, den] = timeSignature;
  return (4 / den) * num * PPQN;
}

/** Pulses per beat (one quarter note). */
const PULSES_PER_BEAT = PPQN;

/** Bar and beat 1-based for display; pulseInBeat is 0..PULSES_PER_BEAT-1 within the beat. */
export interface BarBeat {
  bar: number;
  beat: number;
  pulseInBeat: number;
}

/** Convert seconds to bar.beat (1-based). */
export function secondsToBarBeat(
  seconds: number,
  bpm: number,
  timeSignature: TimeSignature
): BarBeat {
  if (bpm <= 0 || timeSignature[0] < 1 || timeSignature[1] < 1) {
    return { bar: 1, beat: 1, pulseInBeat: 0 };
  }
  const pulses = Math.max(0, Math.floor(secondsToPulses(seconds, bpm)));
  const perBar = pulsesPerBar(timeSignature);
  const bar = Math.floor(pulses / perBar) + 1;
  const pulseInBar = pulses % perBar;
  const beatsPerBar = timeSignature[0];
  const pulsePerBeat = perBar / beatsPerBar;
  const beat = Math.floor(pulseInBar / pulsePerBeat) + 1;
  const pulseInBeat = Math.floor(pulseInBar % pulsePerBeat);
  return { bar, beat, pulseInBeat };
}

/** Convert bar.beat (1-based) + pulseInBeat to seconds. */
export function barBeatToSeconds(
  bar: number,
  beat: number,
  pulseInBeat: number,
  bpm: number,
  timeSignature: TimeSignature
): number {
  if (bpm <= 0 || timeSignature[0] < 1 || timeSignature[1] < 1) return 0;
  const perBar = pulsesPerBar(timeSignature);
  const beatsPerBar = timeSignature[0];
  const pulsePerBeat = perBar / beatsPerBar;
  const pulses =
    (bar - 1) * perBar + (beat - 1) * pulsePerBeat + Math.min(pulseInBeat, pulsePerBeat - 1);
  return pulsesToSeconds(Math.max(0, pulses), bpm);
}

/** Format bar.beat for display (e.g. "1.1", "2.3"). */
export function getBarBeatLabel(bar: number, beat: number, _options?: { subBeat?: boolean }): string {
  return `${bar}.${beat}`;
}

export interface RulerTick {
  positionSeconds: number;
  label: string;
  isBar: boolean;
}

/** Visible time range from transform (content space scroll + viewport). */
function visibleTimeRange(tf: TimelineTransform): { start: number; end: number } {
  const start = tf.scrollLeft / tf.pxPerSec;
  const end = (tf.scrollLeft + tf.viewportWidth) / tf.pxPerSec;
  return { start: Math.max(0, start), end: Math.min(tf.duration, end) };
}

/** Get ruler ticks (bar/beat labels) for the visible range. Density from pxPerSec. */
export function getRulerTicks(
  tf: TimelineTransform,
  bpm: number,
  timeSignature: TimeSignature
): RulerTick[] {
  if (bpm <= 0 || timeSignature[0] < 1 || timeSignature[1] < 1) return [];
  const perBar = pulsesPerBar(timeSignature);
  const beatsPerBar = timeSignature[0];
  const pulsePerBeat = perBar / beatsPerBar;
  const range = visibleTimeRange(tf);
  const startPulses = Math.max(0, Math.floor(secondsToPulses(range.start, bpm)));
  /* Extend end so the last bar at the right edge is always included (avoids ruler stopping short) */
  const viewportEndSec = Math.min(tf.duration, range.end + 0.5);
  const endPulses = Math.ceil(secondsToPulses(viewportEndSec, bpm));
  const ticks: RulerTick[] = [];
  const pxPerTick = tf.pxPerSec;
  const showBeats = pxPerTick >= 30;
  const showBeatLabels = pxPerTick >= 60;

  const rangeStart = range.start - 0.001;
  /* Never show ticks past track end so ruler stays in sync with grid at the right edge */
  const rangeEnd = Math.min(tf.duration, range.end + 0.5);
  const maxT = tf.duration + 0.001;
  for (let p = Math.floor(startPulses / perBar) * perBar; p <= endPulses + perBar; p += perBar) {
    const bar = Math.floor(p / perBar) + 1;
    const t = pulsesToSeconds(p, bpm);
    if (t > maxT) break;
    if (t >= rangeStart && t <= rangeEnd) {
      ticks.push({ positionSeconds: t, label: String(bar), isBar: true });
    }
    if (showBeats) {
      for (let b = 1; b < beatsPerBar; b++) {
        const beatP = p + b * pulsePerBeat;
        const beatT = pulsesToSeconds(beatP, bpm);
        if (beatT > maxT) break;
        if (beatT >= rangeStart && beatT <= rangeEnd) {
          ticks.push({
            positionSeconds: beatT,
            label: showBeatLabels ? `${bar}.${b}` : '',
            isBar: false,
          });
        }
      }
    }
  }
  return ticks;
}

export interface GridLine {
  positionSeconds: number;
  isBar: boolean;
}

/** Resolve Smart snap to a concrete step in pulses based on zoom. Keeps grid aligned with ruler bar/beat ticks. */
function smartSnapPulseStep(
  tf: TimelineTransform,
  bpm: number,
  timeSignature: TimeSignature
): number {
  const perBar = pulsesPerBar(timeSignature);
  const barDurationSec = pulsesToSeconds(perBar, bpm);
  const pxPerBar = barDurationSec * tf.pxPerSec;
  /* Use beat (1/4) step over a wider zoom range so grid lines align with ruler beat ticks */
  if (pxPerBar <= 25) return Math.max(1, Math.floor(PPQN / 16)); // 1/16 when very zoomed in
  if (pxPerBar <= 80) return Math.max(1, Math.floor(PPQN / 8));  // 1/8
  if (pxPerBar <= 200) return Math.max(1, Math.floor(PPQN / 4)); // 1/4 (beat) – matches ruler
  if (pxPerBar <= 400) return Math.max(1, Math.floor(PPQN / 2)); // 1/2
  return perBar; // bar when zoomed out
}

/** Pulse step for a given snap setting (for grid). */
function snapToPulseStep(
  snap: SnapSetting,
  tf: TimelineTransform,
  bpm: number,
  timeSignature: TimeSignature
): number | null {
  const perBar = pulsesPerBar(timeSignature);
  switch (snap) {
    case 'Off':
      return null; // bar-only grid handled separately
    case 'Bar':
      return perBar;
    case '1/2':
      return 2 * PPQN;
    case '1/4':
      return PPQN;
    case '1/8':
      return Math.floor(PPQN / 2);
    case '1/8T':
      return Math.floor(PPQN / 3);
    case '1/16':
      return Math.floor(PPQN / 4);
    case '1/16T':
      return Math.floor(PPQN / 6);
    case '1/32':
      return Math.floor(PPQN / 8);
    case '1/32T':
      return Math.floor(PPQN / 12);
    case '1/64':
      return Math.floor(PPQN / 16);
    case '1/128':
      return Math.floor(PPQN / 32);
    case 'Smart':
      return smartSnapPulseStep(tf, bpm, timeSignature);
    default:
      return perBar;
  }
}

/** Get vertical grid line positions (seconds) for the waveform. Density from snap setting.
 * Never extends past tf.duration so grid stays in sync with ruler at the right edge. */
export function getGridLines(
  tf: TimelineTransform,
  bpm: number,
  timeSignature: TimeSignature,
  snapSetting: SnapSetting
): GridLine[] {
  if (bpm <= 0 || timeSignature[0] < 1 || timeSignature[1] < 1) return [];
  const perBar = pulsesPerBar(timeSignature);
  const { start, end } = visibleTimeRange(tf);
  const maxT = tf.duration + 0.001;

  const lines: GridLine[] = [];
  const step = snapToPulseStep(snapSetting, tf, bpm, timeSignature);

  if (snapSetting === 'Off') {
    // Bar lines only
    let t = 0;
    const barDurationSec = pulsesToSeconds(perBar, bpm);
    while (t <= Math.min(end + barDurationSec, maxT)) {
      if (t >= start - 0.001 && t <= maxT) lines.push({ positionSeconds: t, isBar: true });
      t += barDurationSec;
    }
    return lines;
  }

  if (step === null || step < 1) return lines;

  const startPulses = Math.floor(secondsToPulses(start, bpm));
  const alignedStart = Math.floor(startPulses / step) * step;
  let pulses = alignedStart;
  const endPulses = Math.ceil(secondsToPulses(Math.min(end, tf.duration), bpm));

  while (pulses <= endPulses + step) {
    const t = pulsesToSeconds(pulses, bpm);
    if (t > maxT) break;
    if (t >= start - 0.001 && t <= end + 0.001) {
      const isBar = pulses % perBar === 0;
      lines.push({ positionSeconds: t, isBar });
    }
    pulses += step;
  }
  return lines;
}

/** Snap a time (seconds) to the grid. When snap is Off, returns time unchanged. Used for move, trim, and fade. tf required for Smart. */
export function snapTimeToGrid(
  timeSec: number,
  bpm: number,
  timeSignature: TimeSignature,
  snapSetting: SnapSetting,
  tf: TimelineTransform
): number {
  if (bpm <= 0 || timeSignature[0] < 1 || timeSignature[1] < 1) return timeSec;
  if (snapSetting === 'Off') return timeSec;

  const perBar = pulsesPerBar(timeSignature);
  const step = snapToPulseStep(snapSetting, tf, bpm, timeSignature);
  if (step === null || step < 1) {
    const pulses = secondsToPulses(timeSec, bpm);
    const aligned = Math.round(pulses / perBar) * perBar;
    return Math.max(0, pulsesToSeconds(aligned, bpm));
  }

  const pulses = secondsToPulses(timeSec, bpm);
  const aligned = Math.round(pulses / step) * step;
  return Math.max(0, pulsesToSeconds(aligned, bpm));
}
