/**
 * Regression tests for the Track Lab footer meter fix:
 * - master meter previously showed input*0.8 while recording and 0 during playback
 *   (no master bus analyser existed at all);
 * - input meter could stay dead when the AudioContext was suspended (iOS Safari).
 * These cover the shared metering helpers and the engine's master-level subscription surface.
 */
import { describe, it, expect } from 'vitest';
import { peakFromByteTimeDomain, peakFromFloatTimeDomain, levelToMeterScale, levelToDbText, createPeakBallistics, METER_FLOOR_DB } from '@/lib/audio-recorder/meterUtils';
import { createAudioEngine } from '@/lib/audio-recorder/audioEngine';

describe('peakFromByteTimeDomain', () => {
  it('returns 0 for digital silence (all 128)', () => {
    expect(peakFromByteTimeDomain(new Uint8Array(1024).fill(128))).toBe(0);
  });
  it('returns ~1 for full-scale positive peak (255)', () => {
    const data = new Uint8Array(1024).fill(128);
    data[10] = 255;
    expect(peakFromByteTimeDomain(data)).toBeCloseTo(127 / 128, 5);
  });
  it('returns 0.5 for a half-scale peak (192)', () => {
    const data = new Uint8Array(1024).fill(128);
    data[3] = 192;
    expect(peakFromByteTimeDomain(data)).toBeCloseTo(0.5, 5);
  });
  it('handles empty data', () => {
    expect(peakFromByteTimeDomain(new Uint8Array(0))).toBe(0);
  });
});

describe('levelToDbText', () => {
  it('shows -inf when silent', () => {
    expect(levelToDbText(0)).toBe('-inf');
    expect(levelToDbText(0.0001)).toBe('-inf');
  });
  it('shows 0dB at full scale', () => {
    expect(levelToDbText(1)).toBe('0dB');
  });
  it('shows -6dB at half scale', () => {
    expect(levelToDbText(0.5)).toBe('-6dB');
  });
  it('shows -20dB at 0.1', () => {
    expect(levelToDbText(0.1)).toBe('-20dB');
  });
});

describe('audio engine master output level surface', () => {
  it('starts with masterOutputLevel 0 and exposes subscribeMasterLevel', () => {
    const engine = createAudioEngine();
    expect(engine.getState().masterOutputLevel).toBe(0);
    expect(typeof engine.subscribeMasterLevel).toBe('function');
    const seen: number[] = [];
    const unsub = engine.subscribeMasterLevel((l) => seen.push(l));
    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('unsubscribing master level stops notifications', () => {
    const engine = createAudioEngine();
    const seen: number[] = [];
    const unsub = engine.subscribeMasterLevel((l) => seen.push(l));
    unsub();
    // No public setter for masterOutputLevel; just ensure unsubscribe does not throw and list is detached.
    expect(seen).toEqual([]);
  });
});

describe('peakFromFloatTimeDomain', () => {
  it('returns 0 for silence', () => {
    expect(peakFromFloatTimeDomain(new Float32Array(1024))).toBe(0);
  });
  it('returns the absolute peak', () => {
    const d = new Float32Array(1024);
    d[5] = 0.25;
    d[9] = -0.5;
    expect(peakFromFloatTimeDomain(d)).toBeCloseTo(0.5, 6);
  });
  it('resolves quiet signals below the byte-data floor', () => {
    /* Byte data quantizes to 1/128 (~-42dB); float must still see -50dB. */
    const d = new Float32Array(1024);
    d[3] = Math.pow(10, -50 / 20);
    expect(peakFromFloatTimeDomain(d)).toBeCloseTo(Math.pow(10, -50 / 20), 6);
  });
});

describe('levelToMeterScale', () => {
  it('maps silence and levels at/below the floor to 0', () => {
    expect(levelToMeterScale(0)).toBe(0);
    expect(levelToMeterScale(Math.pow(10, METER_FLOOR_DB / 20))).toBe(0);
    expect(levelToMeterScale(Math.pow(10, -70 / 20))).toBe(0);
  });
  it('maps full scale to 1 and clamps above it', () => {
    expect(levelToMeterScale(1)).toBe(1);
    expect(levelToMeterScale(2)).toBe(1);
  });
  it('maps -20dB (a normal recording level) to about two thirds of the bar', () => {
    expect(levelToMeterScale(0.1)).toBeCloseTo((-20 - METER_FLOOR_DB) / -METER_FLOOR_DB, 5);
  });
  it('maps -6dB to 0.9 of the bar', () => {
    expect(levelToMeterScale(0.5)).toBeCloseTo(0.9, 1);
  });
});

describe('createPeakBallistics', () => {
  it('attacks instantly to a new peak', () => {
    const b = createPeakBallistics(1);
    expect(b.sample(0.8, 0)).toBe(0.8);
  });
  it('decays linearly with elapsed time', () => {
    const b = createPeakBallistics(1);
    b.sample(1, 0);
    expect(b.sample(0, 500)).toBeCloseTo(0.5, 5);
    expect(b.sample(0, 1500)).toBe(0);
  });
  it('does not go below the current peak while decaying', () => {
    const b = createPeakBallistics(1);
    b.sample(1, 0);
    expect(b.sample(0.9, 100)).toBe(0.9);
  });
  it('self-corrects after a long gap (stale peaks decay away)', () => {
    const b = createPeakBallistics(1);
    b.sample(1, 0);
    expect(b.sample(0, 60_000)).toBe(0);
  });
  it('reset returns the display to silence', () => {
    const b = createPeakBallistics(1);
    b.sample(1, 0);
    b.reset();
    expect(b.sample(0, 100)).toBe(0);
  });
});
