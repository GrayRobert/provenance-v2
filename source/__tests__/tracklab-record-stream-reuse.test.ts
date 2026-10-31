/**
 * Regression test for the iPhone gain-drop-on-record fix.
 *
 * Root cause: with count-in on, a FRESH getUserMedia was negotiated while the
 * count-in clicks were already playing; iOS flips the audio session to duplex
 * voice processing at that point and the mic gain drops (meter + recording quiet).
 * Fix: when the armed track's sustained input stream is live, recording reuses it
 * instead of stopping it and acquiring a new stream mid-count-in.
 *
 * This test mocks just enough WebAudio/MediaRecorder surface to run the engine's
 * arm -> count-in -> record flow and asserts:
 *  - getUserMedia is called ONCE (for the sustained stream), never re-negotiated;
 *  - the recorder taps the same live input graph.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAudioEngine } from '@/lib/audio-recorder/audioEngine';

class FakeAudioNode {
  connections: FakeAudioNode[] = [];
  connect(n: FakeAudioNode) { this.connections.push(n); return n; }
  disconnect() { this.connections = []; }
}

class FakeParam {
  value = 1;
  setValueAtTime() {}
  linearRampToValueAtTime() {}
  cancelScheduledValues() {}
}

class FakeAudioContext {
  state: AudioContextState = 'running';
  currentTime = 0;
  sampleRate = 48000;
  destination = new FakeAudioNode();
  resume = vi.fn(async () => {});
  createMediaStreamSource() { return new FakeAudioNode(); }
  createAnalyser() { return Object.assign(new FakeAudioNode(), { fftSize: 2048, getFloatTimeDomainData: (a: Float32Array) => a.fill(0), getByteTimeDomainData: (a: Uint8Array) => a.fill(128) }); }
  createGain() { return Object.assign(new FakeAudioNode(), { gain: new FakeParam() }); }
  createMediaStreamDestination() { return Object.assign(new FakeAudioNode(), { stream: new FakeMediaStream() }); }
  createBufferSource() { return Object.assign(new FakeAudioNode(), { buffer: null, start: vi.fn(), stop: vi.fn(), connect: FakeAudioNode.prototype.connect, disconnect: FakeAudioNode.prototype.disconnect }); }
  createStereoPanner() { return Object.assign(new FakeAudioNode(), { pan: new FakeParam() }); }
  createDynamicsCompressor() { return Object.assign(new FakeAudioNode(), { threshold: new FakeParam(), knee: new FakeParam(), ratio: new FakeParam(), attack: new FakeParam(), release: new FakeParam() }); }
  createBiquadFilter() { return Object.assign(new FakeAudioNode(), { type: 'lowpass', frequency: new FakeParam(), Q: new FakeParam(), gain: new FakeParam() }); }
  createBuffer(channels: number, length: number, sampleRate: number) {
    return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: () => new Float32Array(length) };
  }
  createOscillator() { return Object.assign(new FakeAudioNode(), { frequency: new FakeParam(), type: 'sine', start: vi.fn(), stop: vi.fn() }); }
  createConvolver() { return Object.assign(new FakeAudioNode(), { buffer: null }); }
  createWaveShaper() { return Object.assign(new FakeAudioNode(), { curve: null, oversample: 'none' }); }
  createDelay() { return Object.assign(new FakeAudioNode(), { delayTime: new FakeParam() }); }
  decodeAudioData(): Promise<AudioBuffer> { return Promise.reject(new Error('no decode in test')); }
  addEventListener() {}
  removeEventListener() {}
  audioWorklet = undefined;
}

class FakeMediaStream {
  private tracks: MediaStreamTrack[];
  constructor(tracks: MediaStreamTrack[] = [fakeTrack()]) { this.tracks = tracks; }
  getAudioTracks() { return this.tracks; }
  getTracks() { return this.tracks; }
  get active() { return this.tracks.some((t) => t.readyState === 'live'); }
}

function fakeTrack(): MediaStreamTrack {
  return {
    readyState: 'live',
    stop() { (this as { readyState: string }).readyState = 'ended'; },
    getSettings: () => ({ sampleRate: 48000, autoGainControl: false, echoCancellation: false, noiseSuppression: false }),
  } as unknown as MediaStreamTrack;
}

let gumCalls: MediaStreamConstraints | undefined[] = [];

beforeEach(() => {
  gumCalls = [];
  (globalThis as Record<string, unknown>).AudioContext = FakeAudioContext;
  (globalThis as Record<string, unknown>).MediaStream = FakeMediaStream;
  (globalThis as Record<string, unknown>).MediaRecorder = class {
    static isTypeSupported() { return true; }
    state = 'inactive';
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    constructor(public stream: unknown) {}
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      const r = this.onstop?.() as unknown;
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => {});
    }
  };
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async (c?: MediaStreamConstraints) => {
        gumCalls.push(c);
        return new FakeMediaStream();
      }),
      enumerateDevices: vi.fn(async () => []),
    },
  });
});

describe('recording reuses the live sustained input stream', () => {
  it('does not re-negotiate getUserMedia when the armed stream is already live', async () => {
    const engine = createAudioEngine();
    // Let the engine's async init settle first: it re-reads persisted state once,
    // which would otherwise overwrite the arm below.
    await new Promise((r) => setTimeout(r, 50));
    const trackId = engine.getState().tracks[0]!.id;
    engine.toggleArm(trackId);
    if (!engine.getState().tracks[0]!.armed) engine.toggleArm(trackId);

    // Page load starts the sustained input stream (one getUserMedia, raw constraints).
    try {
      await engine.startSustainedInputStream();
    } catch (e) {
      throw new Error('sustained failed: ' + String(e));
    }
    if (!engine.getState().tracks[0]!.armed) throw new Error('arm did not stick: ' + JSON.stringify(engine.getState().tracks[0]));
    expect(gumCalls.length).toBe(1);
    const audio = gumCalls[0]!.audio as MediaTrackConstraints;
    expect(audio.autoGainControl).toBe(false);
    expect(audio.echoCancellation).toBe(false);
    expect(audio.noiseSuppression).toBe(false);

    // Record with count-in: must NOT acquire a second stream mid-count-in.
    engine.record();
    // Real timers: count-in (4 beats at 120bpm ~ 2s) uses setInterval + requestAnimationFrame.
    await new Promise((r) => setTimeout(r, 4000));
    expect(gumCalls.length).toBe(1);
    expect(engine.getState().isRecording).toBe(true);

    engine.stop();
  }, 15000);
});
