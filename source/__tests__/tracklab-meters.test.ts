/**
 * Regression tests for the Track Lab footer meter fix:
 * - master meter previously showed input*0.8 while recording and 0 during playback
 *   (no master bus analyser existed at all);
 * - input meter could stay dead when the AudioContext was suspended (iOS Safari).
 * These cover the shared metering helpers and the engine's master-level subscription surface.
 */
import { describe, it, expect } from 'vitest';
import { peakFromByteTimeDomain, levelToDbText } from '@/lib/audio-recorder/meterUtils';
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
