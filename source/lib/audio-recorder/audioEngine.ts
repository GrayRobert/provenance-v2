/**
 * Vanilla audio engine for the recorder: tracks, MediaRecorder, AudioContext,
 * record/play/stop, waveform. No React; state updates via subscribe(cb).
 */

import type { AudioEngineState, AudioRegion, ExportRecordingItem, InputMonitoringMode, TrackState, WaveformPyramid } from './types';
import { peakFromByteTimeDomain } from './meterUtils';

const TRACK_COLORS = ['#f6992c', '#22c55e', '#3b82f6', '#a855f7']; /* orange, green, blue, purple */

/** Fader 0–100: 80 = 0 dB (unity), 0–80 = -60 to 0 dB, 80–100 = 0 to +20 dB. */
function faderToGain(value: number): number {
  const v = Math.max(0, Math.min(100, value));
  const dB = v <= 80 ? -60 + (v / 80) * 60 : (v - 80);
  return Math.pow(10, dB / 20);
}

function createDefaultTrack(id: number): TrackState {
  return {
    id,
    name: `Track ${id + 1}`,
    armed: id === 0,
    solo: false,
    muted: false,
    volume: 80,
    pan: 0,
    reverb: 0,
    delay: 0,
    compressor: 0,
    inputMonitoring: 'off',
    regions: [],
    isRecording: false,
    color: TRACK_COLORS[id % TRACK_COLORS.length],
  };
}

/** Max end time of all regions on a track (0 if no regions). */
function getTrackDuration(track: TrackState): number {
  if (track.regions.length === 0) return 0;
  return Math.max(...track.regions.map((r) => r.startTime + r.duration));
}

/** Global duration = max of all track region end times. */
function computeDuration(tracks: TrackState[]): number {
  const perTrack = tracks.map(getTrackDuration);
  return perTrack.length > 0 ? Math.max(...perTrack) : 0;
}

/** Find start time for a new region of given duration so it does not overlap existing regions. Places at currentTime if it fits, else first gap or end. */
function placeRegionNoOverlap(regions: AudioRegion[], currentTime: number, duration: number): number {
  const sorted = [...regions].sort((a, b) => a.startTime - b.startTime);
  const end = currentTime + duration;
  for (const r of sorted) {
    const rEnd = r.startTime + r.duration;
    if (end <= r.startTime) return currentTime;
    if (currentTime < rEnd) currentTime = rEnd;
  }
  return currentTime;
}

/** Extract waveform envelope for display. Uses peak (max abs) per bucket for a crisp DAW-style shape. */
function extractWaveform(buffer: AudioBuffer, width: number = 2048): number[] {
  const channelData = buffer.getChannelData(0);
  const samplesPerPixel = Math.max(1, Math.floor(channelData.length / width));
  const waveform: number[] = [];
  for (let i = 0; i < width; i++) {
    let peak = 0;
    const start = i * samplesPerPixel;
    for (let j = start; j < start + samplesPerPixel && j < channelData.length; j++) {
      const v = Math.abs(channelData[j]);
      if (v > peak) peak = v;
    }
    waveform.push(peak);
  }
  const max = Math.max(...waveform, 1e-10);
  for (let i = 0; i < waveform.length; i++) {
    waveform[i] /= max;
  }
  return waveform;
}

/**
 * Extract waveform envelope for a time range at display resolution.
 * Uses peak (max abs) per bucket so the waveform stays crisp at any zoom.
 * Use this when drawing the visible window to avoid rasterization.
 */
export function extractWaveformRange(
  buffer: AudioBuffer,
  startTime: number,
  endTime: number,
  numSamples: number
): number[] {
  const channelData = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const length = channelData.length;
  const startSample = Math.max(0, Math.floor(startTime * sampleRate));
  const endSample = Math.min(length, Math.ceil(endTime * sampleRate));
  const rangeLength = Math.max(0, endSample - startSample);
  if (rangeLength === 0 || numSamples <= 0) {
    return [];
  }
  const samplesPerBucket = Math.max(1, rangeLength / numSamples);
  const waveform: number[] = [];
  for (let i = 0; i < numSamples; i++) {
    let peak = 0;
    const bucketStart = startSample + i * samplesPerBucket;
    const bucketEnd = Math.min(length, startSample + (i + 1) * samplesPerBucket);
    for (let j = Math.floor(bucketStart); j < bucketEnd && j < length; j++) {
      const v = Math.abs(channelData[j]);
      if (v > peak) peak = v;
    }
    waveform.push(peak);
  }
  const max = Math.max(...waveform, 1e-10);
  for (let i = 0; i < waveform.length; i++) {
    waveform[i] /= max;
  }
  return waveform;
}

const PYRAMID_BUCKET_SIZES = [16, 64, 256, 1024, 4096];

/**
 * Build a multi-resolution peak pyramid from an AudioBuffer (channel 0).
 * Each level stores interleaved [min, max] pairs so the renderer can
 * pick the best resolution for the current zoom without re-scanning raw PCM.
 */
export function buildWaveformPyramid(buffer: AudioBuffer): WaveformPyramid {
  const channelData = buffer.getChannelData(0);
  const totalSamples = channelData.length;
  const sampleRate = buffer.sampleRate;
  const levels: Float32Array[] = [];
  const samplesPerBucket: number[] = [];

  for (const spb of PYRAMID_BUCKET_SIZES) {
    const numBuckets = Math.ceil(totalSamples / spb);
    const data = new Float32Array(numBuckets * 2);
    for (let b = 0; b < numBuckets; b++) {
      const start = b * spb;
      const end = Math.min(start + spb, totalSamples);
      let mn = channelData[start];
      let mx = channelData[start];
      for (let j = start + 1; j < end; j++) {
        const v = channelData[j];
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      data[b * 2] = mn;
      data[b * 2 + 1] = mx;
    }
    levels.push(data);
    samplesPerBucket.push(spb);
  }

  return { sampleRate, totalSamples, samplesPerBucket, levels };
}

/**
 * Query min/max peaks from the pyramid for a sample range.
 * Returns { min, max } in raw sample amplitude (not normalized).
 */
export function getPyramidPeaks(
  pyramid: WaveformPyramid,
  startSample: number,
  endSample: number
): { min: number; max: number } {
  const samplesInRange = endSample - startSample;
  if (samplesInRange <= 0) return { min: 0, max: 0 };

  let bestLevel = pyramid.levels.length - 1;
  for (let i = 0; i < pyramid.levels.length; i++) {
    if (pyramid.samplesPerBucket[i] <= samplesInRange) {
      bestLevel = i;
    }
  }

  const spb = pyramid.samplesPerBucket[bestLevel];
  const data = pyramid.levels[bestLevel];
  const b0 = Math.floor(startSample / spb);
  const b1 = Math.min(Math.ceil(endSample / spb), data.length / 2);

  let mn = Infinity;
  let mx = -Infinity;
  for (let b = b0; b < b1; b++) {
    const bMin = data[b * 2];
    const bMax = data[b * 2 + 1];
    if (bMin < mn) mn = bMin;
    if (bMax > mx) mx = bMax;
  }

  if (!isFinite(mn)) mn = 0;
  if (!isFinite(mx)) mx = 0;
  return { min: mn, max: mx };
}

/** Trim the first trimSeconds from the buffer (input alignment / latency compensation). */
function trimAudioBufferStart(buffer: AudioBuffer, trimSeconds: number, ctx: AudioContext): AudioBuffer {
  const trimSamples = Math.floor(trimSeconds * buffer.sampleRate);
  if (trimSamples <= 0 || trimSamples >= buffer.length) return buffer;
  const newLength = buffer.length - trimSamples;
  const newBuffer = ctx.createBuffer(buffer.numberOfChannels, newLength, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = newBuffer.getChannelData(ch);
    for (let i = 0; i < newLength; i++) dst[i] = src[trimSamples + i];
  }
  return newBuffer;
}

/** Slice an AudioBuffer from startTime to endTime (in seconds). */
function sliceAudioBuffer(
  buffer: AudioBuffer,
  startTime: number,
  endTime: number,
  ctx: AudioContext
): AudioBuffer {
  const sr = buffer.sampleRate;
  const startSample = Math.max(0, Math.floor(startTime * sr));
  const endSample = Math.min(buffer.length, Math.ceil(endTime * sr));
  const length = Math.max(0, endSample - startSample);
  if (length === 0) return ctx.createBuffer(buffer.numberOfChannels, 0, sr);
  const newBuffer = ctx.createBuffer(buffer.numberOfChannels, length, sr);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = newBuffer.getChannelData(ch);
    for (let i = 0; i < length; i++) dst[i] = src[startSample + i];
  }
  return newBuffer;
}

export type StateListener = (state: AudioEngineState) => void;
export type MetronomeTickListener = (beatIndex: number) => void;

export function createAudioEngine() {
  let audioContext: AudioContext | null = null;
  let metronomeContext: AudioContext | null = null;
  let mediaStream: MediaStream | null = null;
  let noArmedTrackListener: (() => void) | null = null;

  function setNoArmedTrackListener(cb: (() => void) | null): void {
    noArmedTrackListener = cb;
  }
  let analyser: AnalyserNode | null = null;
  let inputGainNode: GainNode | null = null;
  let sustainedInputSource: MediaStreamAudioSourceNode | null = null;
  /** Per-region: key = `${trackIndex}-${regionId}` */
  const sourceNodes = new Map<string, AudioBufferSourceNode>();
  const regionFadeGainNodes = new Map<string, GainNode>();
  const gainNodes = new Map<number, GainNode>();
  const panNodes = new Map<number, StereoPannerNode>();
  const reverbSendGainNodes = new Map<number, GainNode>();
  const delaySendGainNodes = new Map<number, GainNode>();
  const compressorSendGainNodes = new Map<number, GainNode>();
  let convolverNode: ConvolverNode | null = null;
  let reverbBuffer: AudioBuffer | null = null;
  let dattorroWorkletLoaded = false;
  let dattorroReverbNode: AudioWorkletNode | null = null;
  let reverbMergerNode: ChannelMergerNode | null = null;
  /** Pre-master sum: dry + reverb + delay go here, then through compensation delay to master. Aligns with compressor return to avoid phasing. */
  let preMasterGainNode: GainNode | null = null;
  let compensationDelayNode: DelayNode | null = null;
  /** ~6 ms to match DynamicsCompressorNode look-ahead so compressor return lines up with dry/reverb/delay. */
  const COMPENSATION_DELAY_S = 0.006;
  let masterGainNode: GainNode | null = null;
  /** Post-fader master bus tap for the footer master meter. Audio passes through unchanged. */
  let masterAnalyser: AnalyserNode | null = null;
  let auxGainNode: GainNode | null = null;
  let delayInputGainNode: GainNode | null = null;
  let delayNode: DelayNode | null = null;
  let delayFeedbackGainNode: GainNode | null = null;
  let delayWetGainNode: GainNode | null = null;
  let delayReturnGainNode: GainNode | null = null;
  const MAX_DELAY_TIME = 4;
  let compressorInputGainNode: GainNode | null = null;
  let compressorPathGainNode: GainNode | null = null;
  let compressorNode: DynamicsCompressorNode | null = null;
  let compressorBypassGainNode: GainNode | null = null;
  let compressorReturnGainNode: GainNode | null = null;
  let recorder: MediaRecorder | null = null;
  /** Dedicated low-latency monitor path: gain node connected only to ctx.destination. Used for Off/Low Latency/Comfort; never touches pre-master or 6 ms delay. */
  let monitorGainNode: GainNode | null = null;
  /** Comfort monitor: lightweight reverb (wet-only for input monitoring). Not connected to main DAW reverb. */
  let comfortSendGainNode: GainNode | null = null;
  let comfortConvolverNode: ConvolverNode | null = null;
  let comfortReverbBuffer: AudioBuffer | null = null;
  let comfortCompressorNode: DynamicsCompressorNode | null = null;
  let comfortReturnGainNode: GainNode | null = null;
  /** Comfort mode: wet-only. Compressor + gain so wet is loud enough to balance dry voice in head (e.g. one earpiece). */
  const COMFORT_REVERB_WET_ONLY_LEVEL = 1.35;
  /** Comfort FX: full FX path but input dry removed. Input feeds only main reverb, delay, compressor buses (wet only). */
  let comfortFxInputGainNode: GainNode | null = null;
  let comfortFxReverbSendGainNode: GainNode | null = null;
  let comfortFxDelaySendGainNode: GainNode | null = null;
  let comfortFxCompressorSendGainNode: GainNode | null = null;
  const COMFORT_FX_SEND_LEVEL = 0.85;
  /** When set, inputGainNode is connected here for monitoring (low-latency path or DAW path). Disconnect from this before reconnecting elsewhere. */
  let inputMonitoringTarget: AudioNode | null = null;
  /** Single in-flight promise for starting the sustained stream so concurrent calls don't double-create. */
  let sustainedInputStreamStartPromise: Promise<void> | null = null;
  /** Timeouts used to re-apply input monitoring after stream may have become ready (user enabled monitoring before stream was up). */
  let inputMonitoringRetryTimeouts: ReturnType<typeof setTimeout>[] = [];
  const chunks: Blob[] = [];
  let animFrameId = 0;
  let timeUpdateRafId = 0;
  let startTime = 0;
  /** Timeline position (seconds) when the current recording started; used when creating the region so it stays at the record start, not at stop time. */
  let recordingStartTimelinePosition = 0;
  /** Throttle input level setState to ~10fps to avoid 60fps subscription → updateUI → forced reflow storm when Track Lab is open. */
  let lastInputLevelUpdateMs = 0;
  let lastMasterLevelUpdateMs = 0;
  const INPUT_LEVEL_THROTTLE_MS = 100;
  let metronomeInterval: ReturnType<typeof setInterval> | null = null;
  let countInInterval: ReturnType<typeof setInterval> | null = null;
  let playbackStart = 0;
  let isPlaying = false;
  const listeners: StateListener[] = [];
  const inputLevelListeners: ((level: number) => void)[] = [];
  const masterLevelListeners: ((level: number) => void)[] = [];
  const metronomeTickListeners: MetronomeTickListener[] = [];

  let state: AudioEngineState = {
    tracks: [0, 1, 2, 3].map(createDefaultTrack),
    isPlaying: false,
    isRecording: false,
    currentTime: 0,
    startPosition: 0,
    duration: 0,
    tempo: 120,
    metronomeEnabled: false,
    countInEnabled: true,
    countInBeats: 4,
    isCountingIn: false,
    currentCountInBeat: 0,
    inputLevel: 0,
    masterOutputLevel: 0,
    inputDeviceId: null,
    inputChannelIndex: 0,
    inputGain: 100,
    outputDeviceId: null,
    latencyCompensationMs: 0,
    timeSignature: [4, 4],
    masterLevel: 80,
    auxLevel: 80,
    masterMuted: false,
    auxMuted: false,
    reverbPreDelayMs: 25,
    reverbBandwidth: 1,
    reverbInputDiffusion1: 0.75,
    reverbInputDiffusion2: 0.63,
    reverbDecay: 0.5,
    reverbDecayDiffusion1: 0.7,
    reverbDecayDiffusion2: 0.5,
    reverbDamping: 0.005,
    reverbExcursionRate: 0.5,
    reverbExcursionDepth: 0.7,
    reverbWet: 1,
    reverbDry: 0,
    delayLevel: 80,
    delayMuted: false,
    delayTimeMs: 300,
    delayFeedback: 30,
    delayWet: 50,
    compressorLevel: 80,
    compressorMuted: false,
    compressorThreshold: -24,
    compressorKnee: 30,
    compressorRatio: 12,
    compressorAttack: 0.003,
    compressorRelease: 0.25,
    compressorEnabled: true,
  };

  /** Round-trip latency estimate (output + input) from Web Audio API; used for auto compensation. */
  function getEstimatedLatencyMs(ctx: AudioContext): number {
    const base = (ctx as AudioContext & { baseLatency?: number }).baseLatency ?? 0;
    const output = (ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0;
    const outputMs = (base + output) * 1000;
    return Math.round(Math.max(0, outputMs * 2));
  }

  function getAudioContext(): AudioContext {
    if (!audioContext) {
      audioContext = new AudioContext({ latencyHint: 'interactive' });
      applyOutputDevice();
      if (state.latencyCompensationMs === 0) {
        const autoMs = getEstimatedLatencyMs(audioContext);
        if (autoMs > 0) setState({ latencyCompensationMs: autoMs });
      }
      // Load Dattorro reverb worklet so we can use it when reverb is first used
      audioContext.audioWorklet
        .addModule('/provenance-v2/audio/dattorroReverb.js')
        .then(() => {
          dattorroWorkletLoaded = true;
        })
        .catch((err) => console.warn('Dattorro reverb worklet failed to load', err));
    }
    if (audioContext.state === 'suspended') audioContext.resume();
    return audioContext;
  }

  /** Await before first sound (e.g. count-in) so context is running and the first click doesn't glitch. */
  async function ensureContextRunning(): Promise<AudioContext> {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') await ctx.resume();
    return ctx;
  }

  async function applyOutputDevice() {
    const sinkId = state.outputDeviceId || 'default';
    const setSink = (ctx: AudioContext | null) => {
      if (!ctx || typeof (ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> }).setSinkId !== 'function') return;
      (ctx as AudioContext & { setSinkId: (id: string) => Promise<void> }).setSinkId(sinkId).catch((e) => console.warn('setSinkId failed', e));
    };
    setSink(audioContext);
    setSink(metronomeContext);
  }

  function getMetronomeContext(): AudioContext {
    if (!metronomeContext) {
      metronomeContext = new AudioContext({ latencyHint: 'interactive' });
      applyOutputDevice();
    }
    if (metronomeContext.state === 'suspended') metronomeContext.resume();
    return metronomeContext;
  }

  function createReverbImpulse(ctx: AudioContext, duration = 2.5, decay = 2): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * duration;
    const impulse = ctx.createBuffer(2, length, sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return impulse;
  }

  /** Master bus: all dry tracks and the aux (reverb) sum here, then to destination. */
  function applyMasterGain() {
    if (masterGainNode)
      masterGainNode.gain.value = state.masterMuted ? 0 : faderToGain(state.masterLevel);
  }

  function applyAuxGain() {
    if (auxGainNode) auxGainNode.gain.value = state.auxMuted ? 0 : faderToGain(state.auxLevel);
  }

  function applyDelayReturnGain() {
    if (delayReturnGainNode)
      delayReturnGainNode.gain.value = state.delayMuted ? 0 : faderToGain(state.delayLevel);
  }

  function applyCompressorReturnGain() {
    if (compressorReturnGainNode)
      compressorReturnGainNode.gain.value = state.compressorMuted ? 0 : faderToGain(state.compressorLevel);
  }

  /** Pre-master sum: dry, reverb return, delay return connect here; output is delayed to align with compressor return (fixes phasing). */
  function getPreMasterNode(ctx: AudioContext): GainNode {
    if (!preMasterGainNode) {
      preMasterGainNode = ctx.createGain();
      preMasterGainNode.gain.value = 1;
      compensationDelayNode = ctx.createDelay(0.05);
      compensationDelayNode.delayTime.value = COMPENSATION_DELAY_S;
      preMasterGainNode.connect(compensationDelayNode);
      compensationDelayNode.connect(getMasterNode(ctx));
    }
    return preMasterGainNode;
  }

  function getMasterNode(ctx: AudioContext): GainNode {
    if (!masterGainNode) {
      masterGainNode = ctx.createGain();
      /* Meter tap: master gain -> analyser -> destination. AnalyserNode passes audio through unchanged. */
      masterAnalyser = ctx.createAnalyser();
      masterAnalyser.fftSize = 2048;
      masterGainNode.connect(masterAnalyser);
      masterAnalyser.connect(ctx.destination);
      applyMasterGain();
    }
    return masterGainNode;
  }

  /** Dedicated low-latency monitor path: single gain node straight to destination. No pre-master, no 6 ms delay, no DAW buses. */
  function getMonitorOutputNode(ctx: AudioContext): GainNode {
    if (!monitorGainNode) {
      monitorGainNode = ctx.createGain();
      monitorGainNode.gain.value = 1;
      monitorGainNode.connect(ctx.destination);
    }
    return monitorGainNode;
  }

  /** Comfort reverb: input monitoring wet-only (no dry). Reverb → light compressor → gain → destination. Loud enough to balance dry voice in head (one earpiece). */
  function getComfortReverbInputNode(ctx: AudioContext): GainNode {
    if (!comfortSendGainNode) {
      comfortSendGainNode = ctx.createGain();
      comfortSendGainNode.gain.value = 1;
      comfortConvolverNode = ctx.createConvolver();
      if (!comfortReverbBuffer)
        comfortReverbBuffer = createReverbImpulse(ctx, 0.2, 1.2);
      comfortConvolverNode.buffer = comfortReverbBuffer;
      comfortCompressorNode = ctx.createDynamicsCompressor();
      comfortCompressorNode.threshold.value = -20;
      comfortCompressorNode.knee.value = 15;
      comfortCompressorNode.ratio.value = 3;
      comfortCompressorNode.attack.value = 0.003;
      comfortCompressorNode.release.value = 0.15;
      comfortReturnGainNode = ctx.createGain();
      comfortReturnGainNode.gain.value = COMFORT_REVERB_WET_ONLY_LEVEL;
      comfortSendGainNode.connect(comfortConvolverNode);
      comfortConvolverNode.connect(comfortCompressorNode);
      comfortCompressorNode.connect(comfortReturnGainNode);
      comfortReturnGainNode.connect(ctx.destination);
    }
    return comfortSendGainNode;
  }

  /** Comfort FX: full FX wet only (no dry). Input feeds main reverb, delay, compressor buses only; returns go through pre-master/master as usual. */
  function getComfortFxInputNode(ctx: AudioContext): GainNode {
    if (!comfortFxInputGainNode) {
      comfortFxInputGainNode = ctx.createGain();
      comfortFxInputGainNode.gain.value = 1;
      comfortFxReverbSendGainNode = ctx.createGain();
      comfortFxReverbSendGainNode.gain.value = COMFORT_FX_SEND_LEVEL;
      comfortFxDelaySendGainNode = ctx.createGain();
      comfortFxDelaySendGainNode.gain.value = COMFORT_FX_SEND_LEVEL;
      comfortFxCompressorSendGainNode = ctx.createGain();
      comfortFxCompressorSendGainNode.gain.value = COMFORT_FX_SEND_LEVEL;
      comfortFxInputGainNode.connect(comfortFxReverbSendGainNode);
      comfortFxInputGainNode.connect(comfortFxDelaySendGainNode);
      comfortFxInputGainNode.connect(comfortFxCompressorSendGainNode);
      comfortFxReverbSendGainNode.connect(getReverbInputNode(ctx));
      comfortFxDelaySendGainNode.connect(getDelayInputNode(ctx));
      comfortFxCompressorSendGainNode.connect(getCompressorInputNode(ctx));
    }
    return comfortFxInputGainNode;
  }

  /** Aux bus: reverb effect return; receives from convolver, outputs to pre-master (so reverb is latency-compensated with compressor). */
  function getAuxNode(ctx: AudioContext): GainNode {
    if (!auxGainNode) {
      auxGainNode = ctx.createGain();
      auxGainNode.connect(getPreMasterNode(ctx));
      applyAuxGain();
    }
    return auxGainNode;
  }

  /** Reverb (Dattorro worklet if loaded, else convolver) on the aux bus; all track reverb sends feed this, then aux → master. */
  function getReverbInputNode(ctx: AudioContext): ConvolverNode | AudioWorkletNode {
    if (dattorroWorkletLoaded && !dattorroReverbNode) {
      try {
        dattorroReverbNode = new AudioWorkletNode(ctx, 'DattorroReverb', {
          numberOfInputs: 1,
          numberOfOutputs: 2,
        });
        reverbMergerNode = ctx.createChannelMerger(2);
        dattorroReverbNode.connect(reverbMergerNode, 0, 0);
        dattorroReverbNode.connect(reverbMergerNode, 1, 1);
        reverbMergerNode.connect(getAuxNode(ctx));
        applyReverbParams();
      } catch (e) {
        console.warn('Dattorro reverb node creation failed', e);
        dattorroWorkletLoaded = false;
      }
    }
    if (dattorroReverbNode) return dattorroReverbNode;
    if (!convolverNode) {
      convolverNode = ctx.createConvolver();
      if (!reverbBuffer) reverbBuffer = createReverbImpulse(ctx);
      convolverNode.buffer = reverbBuffer;
      convolverNode.connect(getAuxNode(ctx));
    }
    return convolverNode;
  }

  function applyReverbParams() {
    if (!dattorroReverbNode) return;
    const ctx = dattorroReverbNode.context;
    const preDelaySamples = Math.min(
      ctx.sampleRate - 1,
      Math.max(0, (state.reverbPreDelayMs / 1000) * ctx.sampleRate)
    );
    dattorroReverbNode.parameters.get('preDelay')!.value = preDelaySamples;
    dattorroReverbNode.parameters.get('bandwidth')!.value = state.reverbBandwidth;
    dattorroReverbNode.parameters.get('inputDiffusion1')!.value = state.reverbInputDiffusion1;
    dattorroReverbNode.parameters.get('inputDiffusion2')!.value = state.reverbInputDiffusion2;
    dattorroReverbNode.parameters.get('decay')!.value = state.reverbDecay;
    dattorroReverbNode.parameters.get('decayDiffusion1')!.value = state.reverbDecayDiffusion1;
    dattorroReverbNode.parameters.get('decayDiffusion2')!.value = state.reverbDecayDiffusion2;
    dattorroReverbNode.parameters.get('damping')!.value = state.reverbDamping;
    dattorroReverbNode.parameters.get('excursionRate')!.value = state.reverbExcursionRate;
    dattorroReverbNode.parameters.get('excursionDepth')!.value = state.reverbExcursionDepth;
    dattorroReverbNode.parameters.get('wet')!.value = state.reverbWet;
    dattorroReverbNode.parameters.get('dry')!.value = state.reverbDry;
  }

  /** Delay bus input: sum of track delay sends. */
  function getDelayInputNode(ctx: AudioContext): GainNode {
    if (!delayInputGainNode) {
      delayInputGainNode = ctx.createGain();
      delayInputGainNode.gain.value = 1;
      delayNode = ctx.createDelay(MAX_DELAY_TIME);
      delayNode.delayTime.value = state.delayTimeMs / 1000;
      delayFeedbackGainNode = ctx.createGain();
      delayFeedbackGainNode.gain.value = state.delayFeedback / 100;
      delayWetGainNode = ctx.createGain();
      delayWetGainNode.gain.value = state.delayWet / 100;
      delayReturnGainNode = ctx.createGain();
      applyDelayReturnGain();
      delayInputGainNode.connect(delayNode);
      delayNode.connect(delayFeedbackGainNode);
      delayFeedbackGainNode.connect(delayNode);
      delayNode.connect(delayWetGainNode);
      delayWetGainNode.connect(delayReturnGainNode);
      delayReturnGainNode.connect(getPreMasterNode(ctx));
    }
    return delayInputGainNode;
  }

  function applyCompressorBypass() {
    if (compressorPathGainNode)
      compressorPathGainNode.gain.value = state.compressorEnabled ? 1 : 0;
    if (compressorBypassGainNode)
      compressorBypassGainNode.gain.value = state.compressorEnabled ? 0 : 1;
  }

  /** Compressor bus input: sum of track compressor sends. */
  function getCompressorInputNode(ctx: AudioContext): GainNode {
    if (!compressorInputGainNode) {
      compressorInputGainNode = ctx.createGain();
      compressorInputGainNode.gain.value = 1;
      compressorPathGainNode = ctx.createGain();
      compressorPathGainNode.gain.value = state.compressorEnabled ? 1 : 0;
      compressorNode = ctx.createDynamicsCompressor();
      compressorNode.threshold.value = state.compressorThreshold;
      compressorNode.knee.value = state.compressorKnee;
      compressorNode.ratio.value = state.compressorRatio;
      compressorNode.attack.value = state.compressorAttack;
      compressorNode.release.value = state.compressorRelease;
      compressorBypassGainNode = ctx.createGain();
      compressorBypassGainNode.gain.value = state.compressorEnabled ? 0 : 1;
      compressorReturnGainNode = ctx.createGain();
      applyCompressorReturnGain();
      compressorInputGainNode.connect(compressorPathGainNode);
      compressorPathGainNode.connect(compressorNode);
      compressorNode.connect(compressorReturnGainNode);
      compressorInputGainNode.connect(compressorBypassGainNode);
      compressorBypassGainNode.connect(compressorReturnGainNode);
      compressorReturnGainNode.connect(getMasterNode(ctx));
    }
    return compressorInputGainNode;
  }

  function notify() {
    const s = { ...state, tracks: state.tracks.map((t) => ({ ...t })) };
    listeners.forEach((cb) => cb(s));
  }

  function setState(update: Partial<AudioEngineState> | ((prev: AudioEngineState) => AudioEngineState)) {
    if (typeof update === 'function') {
      state = update(state);
      notify();
      return;
    }
    const keys = Object.keys(update) as (keyof AudioEngineState)[];
    if (keys.length === 1 && keys[0] === 'inputLevel') {
      state = { ...state, inputLevel: (update as { inputLevel: number }).inputLevel };
      inputLevelListeners.forEach((cb) => cb(state.inputLevel));
      return;
    }
    if (keys.length === 1 && keys[0] === 'masterOutputLevel') {
      state = { ...state, masterOutputLevel: (update as { masterOutputLevel: number }).masterOutputLevel };
      masterLevelListeners.forEach((cb) => cb(state.masterOutputLevel));
      return;
    }
    state = { ...state, ...update };
    notify();
  }

  /** Deep-clone state for undo/redo history. Copies AudioBuffers and pyramid data. */
  function cloneState(ctx: AudioContext, s: AudioEngineState): AudioEngineState {
    const tracks = s.tracks.map((t) => ({
      ...t,
      regions: t.regions.map((r) => {
        const newBuf = ctx.createBuffer(
          r.audioBuffer.numberOfChannels,
          r.audioBuffer.length,
          r.audioBuffer.sampleRate
        );
        for (let ch = 0; ch < r.audioBuffer.numberOfChannels; ch++) {
          newBuf.getChannelData(ch).set(r.audioBuffer.getChannelData(ch));
        }
        const newPyramid: WaveformPyramid | null = r.waveformPyramid
          ? {
              ...r.waveformPyramid,
              levels: r.waveformPyramid.levels.map((arr) => new Float32Array(arr)),
            }
          : null;
        return {
          ...r,
          audioBuffer: newBuf,
          waveformPyramid: newPyramid,
          recordedBlob: null,
        };
      }),
    }));
    return { ...s, tracks };
  }

  const MAX_HISTORY = 50;
  const undoStack: AudioEngineState[] = [];
  const redoStack: AudioEngineState[] = [];
  let applyingUndoRedo = false;
  let inUndoableBatch = false;
  let batchDirty = false;

  function doPushUndo(): void {
    try {
      const ctx = getAudioContext();
      undoStack.push(cloneState(ctx, state));
      if (undoStack.length > MAX_HISTORY) undoStack.shift();
      redoStack.length = 0;
    } catch {
      // ignore clone/context errors
    }
  }

  function pushUndo(): void {
    if (applyingUndoRedo || inUndoableBatch) return;
    doPushUndo();
  }

  function startUndoableBatch(): void {
    doPushUndo();
    inUndoableBatch = true;
    batchDirty = false;
  }

  function endUndoableBatch(): void {
    if (!batchDirty && undoStack.length > 0) undoStack.pop();
    inUndoableBatch = false;
  }

  function applyState(s: AudioEngineState): void {
    applyingUndoRedo = true;
    state = s;
    sourceNodes.forEach((node) => {
      try {
        node.stop();
      } catch {}
    });
    sourceNodes.clear();
    regionFadeGainNodes.clear();
    s.tracks.forEach((track) => {
      const g = gainNodes.get(track.id);
      if (g) g.gain.value = faderToGain(track.volume);
      const p = panNodes.get(track.id);
      if (p) p.pan.value = track.pan / 100;
      const r = reverbSendGainNodes.get(track.id);
      if (r) r.gain.value = track.reverb / 100;
      const d = delaySendGainNodes.get(track.id);
      if (d) d.gain.value = track.delay / 100;
      const c = compressorSendGainNodes.get(track.id);
      if (c) c.gain.value = track.compressor / 100;
    });
    applyMasterGain();
    applyAuxGain();
    applyDelayReturnGain();
    applyCompressorReturnGain();
    applyCompressorBypass();
    if (delayNode) delayNode.delayTime.value = s.delayTimeMs / 1000;
    if (delayFeedbackGainNode) delayFeedbackGainNode.gain.value = s.delayFeedback / 100;
    if (delayWetGainNode) delayWetGainNode.gain.value = s.delayWet / 100;
    if (compressorNode) {
      compressorNode.threshold.value = s.compressorThreshold;
      compressorNode.knee.value = s.compressorKnee;
      compressorNode.ratio.value = s.compressorRatio;
      compressorNode.attack.value = s.compressorAttack;
      compressorNode.release.value = s.compressorRelease;
    }
    applyReverbParams();
    applyInputMonitoring();
    notify();
    applyingUndoRedo = false;
  }

  function undo(): void {
    if (undoStack.length === 0) return;
    try {
      const ctx = getAudioContext();
      redoStack.push(cloneState(ctx, state));
      const prev = undoStack.pop();
      if (prev) applyState(prev);
    } catch {
      // ignore
    }
  }

  function redo(): void {
    if (redoStack.length === 0) return;
    try {
      const ctx = getAudioContext();
      undoStack.push(cloneState(ctx, state));
      const next = redoStack.pop();
      if (next) applyState(next);
    } catch {
      // ignore
    }
  }

  /** Metronome uses a separate AudioContext so it can never be routed into the recording path. */
  function playMetronomeClick(isAccent = false) {
    const ctx = getMetronomeContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = isAccent ? 1500 : 1000;
    const t0 = ctx.currentTime;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.25, t0 + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);
    osc.start(t0);
    osc.stop(t0 + 0.05);
  }

  function startMetronome() {
    if (metronomeInterval) clearInterval(metronomeInterval);
    const intervalMs = (60 / state.tempo) * 1000;
    let beat = 0;
    playMetronomeClick(true);
    metronomeTickListeners.forEach((cb) => cb(0));
    metronomeInterval = setInterval(() => {
      beat = (beat + 1) % state.timeSignature[0];
      playMetronomeClick(beat === 0);
      metronomeTickListeners.forEach((cb) => cb(beat));
    }, intervalMs);
  }

  function stopMetronome() {
    if (metronomeInterval) {
      clearInterval(metronomeInterval);
      metronomeInterval = null;
    }
  }

  function updateInputLevel() {
    /* Dedup: cancel any pending frame so a second start (sustained stream vs recording) never spawns parallel loops sharing animFrameId. */
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = 0;
    }
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(data);
    const max = peakFromByteTimeDomain(data);
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - lastInputLevelUpdateMs >= INPUT_LEVEL_THROTTLE_MS) {
      lastInputLevelUpdateMs = now;
      setState({ inputLevel: max });
    }
    animFrameId = requestAnimationFrame(updateInputLevel);
  }

  /** Sample the master bus peak into state.masterOutputLevel (throttled like the input meter). Called from the transport rAF loops so the footer master meter reflects the real playback/monitoring signal. */
  function sampleMasterOutputLevel() {
    if (!masterAnalyser) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - lastMasterLevelUpdateMs < INPUT_LEVEL_THROTTLE_MS) return;
    lastMasterLevelUpdateMs = now;
    const data = new Uint8Array(masterAnalyser.frequencyBinCount);
    masterAnalyser.getByteTimeDomainData(data);
    setState({ masterOutputLevel: peakFromByteTimeDomain(data) });
  }

  /** iOS Safari can refuse AudioContext.resume() outside a user gesture (e.g. after awaiting getUserMedia). Retry on the user's next tap so recording/metering actually gets signal. */
  function resumeContextOnNextGesture(ctx: AudioContext) {
    if (typeof document === 'undefined') return;
    const tryResume = () => {
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
      if (ctx.state === 'running') {
        document.removeEventListener('pointerdown', tryResume);
        document.removeEventListener('touchend', tryResume);
      }
    };
    document.addEventListener('pointerdown', tryResume);
    document.addEventListener('touchend', tryResume);
  }

  /** Fetch mic stream (for pre-fetch during count-in so recording starts instantly). */
  async function getStreamForRecording(): Promise<{ streamForSource: MediaStream; fullStream: MediaStream }> {
    const audioConstraints: MediaTrackConstraints = {
      ...(state.inputDeviceId ? { deviceId: { exact: state.inputDeviceId } } : {}),
      autoGainControl: false,
      echoCancellation: false,
      noiseSuppression: false,
    };
    const fullStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
    const tracks = fullStream.getAudioTracks();
    const channelIndex = Math.min(Math.max(0, state.inputChannelIndex), tracks.length - 1);
    const selectedTrack = tracks[channelIndex];
    const streamForSource = selectedTrack ? new MediaStream([selectedTrack]) : fullStream;
    return { streamForSource, fullStream };
  }

  /** Wire stream into graph and start recorder; call after getStreamForRecording(). Returns ctx.currentTime when recorder started. */
  async function startRecordingWithStream(streamForSource: MediaStream, fullStream: MediaStream): Promise<number> {
    /* Ensure the context is actually running before wiring the graph: on iOS Safari a suspended context means a silent analyser (dead input meter) and a silent recording. */
    const ctx = await ensureContextRunning();
    if (ctx.state !== 'running') resumeContextOnNextGesture(ctx);
    mediaStream = fullStream;
    const source = ctx.createMediaStreamSource(streamForSource);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    inputGainNode = ctx.createGain();
    inputGainNode.gain.value = state.inputGain / 100;
    source.connect(inputGainNode);
    inputGainNode.connect(analyser);
    const recordDest = ctx.createMediaStreamDestination();
    inputGainNode.connect(recordDest);
    applyInputMonitoring();
    setTimeout(() => applyInputMonitoring(), 0);
    chunks.length = 0;
    const rec = new MediaRecorder(recordDest.stream);
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = async () => {
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      const arrayBuffer = await blob.arrayBuffer();
      try {
        let audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        const trimSeconds = state.latencyCompensationMs / 1000;
        if (trimSeconds > 0 && audioBuffer.duration > trimSeconds) {
          audioBuffer = trimAudioBufferStart(audioBuffer, trimSeconds, ctx);
        }
        const pyramid = buildWaveformPyramid(audioBuffer);
        const regionDuration = audioBuffer.duration;
        pushUndo();
        setState((prev) => {
          const armedIdx = prev.tracks.findIndex((t) => t.armed);
          if (armedIdx === -1) return prev;
          const track = prev.tracks[armedIdx];
          const preferredStart = recordingStartTimelinePosition;
          const startTime = placeRegionNoOverlap(track.regions, preferredStart, regionDuration);
          const newRegion: AudioRegion = {
            id: crypto.randomUUID(),
            startTime,
            duration: regionDuration,
            sourceOffset: 0,
            audioBuffer,
            waveformPyramid: pyramid,
            recordedBlob: blob,
            muted: false,
            fadeInSeconds: 0,
            fadeOutSeconds: 0,
          };
          const newRegions = [...track.regions, newRegion].sort((a, b) => a.startTime - b.startTime);
          const newTracks = prev.tracks.map((t, i) =>
            i === armedIdx ? { ...t, regions: newRegions, isRecording: false } : { ...t }
          );
          const maxDuration = computeDuration(newTracks);
          return { ...prev, tracks: newTracks, duration: maxDuration, isRecording: false };
        });
      } catch {
        setState({ isRecording: false });
      }
      startSustainedInputStream().catch(() => {});
      // Recalculate latency in background when recording stops (context is warm)
      (async () => {
        try {
          const values: number[] = [];
          for (let i = 0; i < 5; i++) {
            const ms = await getLatencyEstimateMs();
            values.push(ms);
          }
          if (values.length > 0) {
            const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
            setState({ latencyCompensationMs: avg });
          }
        } catch {
          /* ignore */
        }
      })();
    };
    recorder = rec;
    recorder.start();
    startTime = ctx.currentTime;
    setState((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => ({ ...t, isRecording: t.armed })),
      isRecording: true,
    }));
    updateInputLevel();
    return ctx.currentTime;
  }

  async function startRecording(): Promise<number> {
    stopSustainedInputStream();
    const { streamForSource, fullStream } = await getStreamForRecording();
    return startRecordingWithStream(streamForSource, fullStream);
  }

  function stopRecording() {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
    if (animFrameId) cancelAnimationFrame(animFrameId);
    stopMetronome();
  }

  async function startSustainedInputStream(): Promise<void> {
    if (sustainedInputSource) {
      applyInputMonitoring();
      return;
    }
    if (sustainedInputStreamStartPromise) {
      await sustainedInputStreamStartPromise;
      applyInputMonitoring();
      return;
    }
    sustainedInputStreamStartPromise = (async () => {
      try {
        const ctx = await ensureContextRunning();
        if (state.outputDeviceId) await applyOutputDevice();
        const { streamForSource, fullStream } = await getStreamForRecording();
        mediaStream = fullStream;
        sustainedInputSource = ctx.createMediaStreamSource(streamForSource);
        inputGainNode = ctx.createGain();
        inputGainNode.gain.value = state.inputGain / 100;
        analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        sustainedInputSource.connect(inputGainNode);
        inputGainNode.connect(analyser);
        updateInputLevel();
        applyInputMonitoring();
      } finally {
        sustainedInputStreamStartPromise = null;
      }
    })();
    await sustainedInputStreamStartPromise;
  }

  function stopSustainedInputStream(): void {
    sustainedInputStreamStartPromise = null;
    inputMonitoringRetryTimeouts.forEach((t) => clearTimeout(t));
    inputMonitoringRetryTimeouts = [];
    if (sustainedInputSource) {
      sustainedInputSource.disconnect();
      sustainedInputSource = null;
    }
    if (inputGainNode) {
      inputGainNode.disconnect();
      inputGainNode = null;
    }
    inputMonitoringTarget = null;
    if (analyser) {
      analyser.disconnect();
      analyser = null;
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
  }

  /** Returns the current mic stream if the sustained input is active (e.g. after calibration). Caller must not stop the tracks. */
  function getActiveInputStream(): MediaStream | null {
    return mediaStream;
  }

  async function playWhiteNoiseBurst(durationMs: number): Promise<void> {
    const ctx = await ensureContextRunning();
    const durationSec = durationMs / 1000;
    const numSamples = Math.ceil(ctx.sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, numSamples, ctx.sampleRate);
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < numSamples; i++) ch[i] = (Math.random() * 2 - 1) * 0.1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
    source.stop(durationSec);
    await new Promise((r) => setTimeout(r, durationMs + 50));
  }

  /** Get or create track output chain (volume gain -> pan -> destination, pan -> reverb/delay/compressor sends). Returns the track gain node so region fade gains can connect to it. */
  function getOrCreateTrackChain(trackIndex: number, ctx: AudioContext, destination: AudioNode): GainNode {
    let gainNode = gainNodes.get(trackIndex);
    if (gainNode) return gainNode;
    const track = state.tracks[trackIndex];
    gainNode = ctx.createGain();
    gainNode.gain.value = faderToGain(track.volume);
    const panNode = ctx.createStereoPanner();
    panNode.pan.value = track.pan / 100;
    gainNode.connect(panNode);
    panNode.connect(destination);
    const reverbSendGain = ctx.createGain();
    reverbSendGain.gain.value = track.reverb / 100;
    panNode.connect(reverbSendGain);
    reverbSendGain.connect(getReverbInputNode(ctx));
    const delaySendGain = ctx.createGain();
    delaySendGain.gain.value = track.delay / 100;
    panNode.connect(delaySendGain);
    delaySendGain.connect(getDelayInputNode(ctx));
    const compressorSendGain = ctx.createGain();
    compressorSendGain.gain.value = track.compressor / 100;
    panNode.connect(compressorSendGain);
    compressorSendGain.connect(getCompressorInputNode(ctx));
    gainNodes.set(trackIndex, gainNode);
    panNodes.set(trackIndex, panNode);
    reverbSendGainNodes.set(trackIndex, reverbSendGain);
    delaySendGainNodes.set(trackIndex, delaySendGain);
    compressorSendGainNodes.set(trackIndex, compressorSendGain);
    return gainNode;
  }

  /** Apply input monitoring: route mic based on armed track's mode only. Comfort/Comfort FX = wet only (no dry to destination). */
  function applyInputMonitoring(): void {
    if (!inputGainNode) return;
    try {
      if (inputMonitoringTarget) {
        inputGainNode.disconnect(inputMonitoringTarget);
        inputMonitoringTarget = null;
      }
      const ctx = getAudioContext();
      const armedIdx = state.tracks.findIndex((t) => t.armed);
      const armedMode: InputMonitoringMode | undefined =
        armedIdx >= 0 ? state.tracks[armedIdx].inputMonitoring : undefined;
      if (armedMode === 'fullFx') {
        const trackGain = getOrCreateTrackChain(armedIdx!, ctx, getPreMasterNode(ctx));
        inputMonitoringTarget = trackGain;
        inputGainNode.connect(trackGain);
      } else if (armedMode === 'comfortFx') {
        inputMonitoringTarget = getComfortFxInputNode(ctx);
        inputGainNode.connect(inputMonitoringTarget);
      } else if (armedMode === 'comfort') {
        inputMonitoringTarget = getComfortReverbInputNode(ctx);
        inputGainNode.connect(inputMonitoringTarget);
      } else if (armedMode === 'lowLatency') {
        inputMonitoringTarget = getMonitorOutputNode(ctx);
        inputGainNode.connect(inputMonitoringTarget);
      }
    } catch {
      inputMonitoringTarget = null;
    }
  }

  /** Start playback for all regions that overlap the given timeline offset. skipArmed: when true (e.g. during record), do not play armed tracks. */
  function playRegions(offset: number, skipArmed = false) {
    const ctx = getAudioContext();
    const destination = getPreMasterNode(ctx);
    const hasSolo = state.tracks.some((t) => t.solo);
    const when = ctx.currentTime;

    state.tracks.forEach((track, trackIndex) => {
      if (skipArmed && track.armed) return;
      if (track.muted || (hasSolo && !track.solo)) return;
      if (track.regions.length === 0) return;
      const trackGain = getOrCreateTrackChain(trackIndex, ctx, destination);

      for (const region of track.regions) {
        if (region.muted) continue;
        const regionEnd = region.startTime + region.duration;
        if (offset >= regionEnd || offset < region.startTime) continue;
        const bufferOffset = offset - region.startTime;
        const playDuration = regionEnd - offset;

        const source = ctx.createBufferSource();
        source.buffer = region.audioBuffer;
        const fadeGain = ctx.createGain();
        source.connect(fadeGain);
        fadeGain.connect(trackGain);

        const key = `${trackIndex}-${region.id}`;
        sourceNodes.set(key, source);
        regionFadeGainNodes.set(key, fadeGain);

        const bufOffsetSec = bufferOffset;
        let initialGain = 1;
        if (region.fadeInSeconds > 0 && bufOffsetSec < region.fadeInSeconds) {
          initialGain = bufOffsetSec / region.fadeInSeconds;
        } else if (region.fadeOutSeconds > 0 && bufOffsetSec > region.duration - region.fadeOutSeconds) {
          initialGain = (region.duration - bufOffsetSec) / region.fadeOutSeconds;
        }
        fadeGain.gain.setValueAtTime(initialGain, when);
        if (region.fadeInSeconds > 0 && bufOffsetSec < region.fadeInSeconds) {
          fadeGain.gain.linearRampToValueAtTime(1, when + (region.fadeInSeconds - bufOffsetSec));
        }
        const fadeOutStart = playDuration - region.fadeOutSeconds;
        if (region.fadeOutSeconds > 0 && fadeOutStart > 0) {
          fadeGain.gain.setValueAtTime(1, when + fadeOutStart);
          fadeGain.gain.linearRampToValueAtTime(0, when + playDuration);
        } else if (region.fadeOutSeconds > 0 && bufOffsetSec >= region.duration - region.fadeOutSeconds) {
          fadeGain.gain.linearRampToValueAtTime(0, when + playDuration);
        }

        const bufStart = region.sourceOffset + bufferOffset;
        source.start(when, bufStart, playDuration);
        source.onended = () => {
          sourceNodes.delete(key);
          regionFadeGainNodes.delete(key);
        };
      }
    });
  }

  /** Small delay so the audio context is fully running before first click (reduces glitches). */
  function nextTick(): Promise<void> {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }

  async function doCountIn(
    streamPromise: Promise<{ streamForSource: MediaStream; fullStream: MediaStream }>,
    callback: (stream: { streamForSource: MediaStream; fullStream: MediaStream }) => void | Promise<void>
  ) {
    await ensureContextRunning();
    const metroCtx = getMetronomeContext();
    if (metroCtx.state === 'suspended') await metroCtx.resume();
    await nextTick();
    const intervalMs = (60 / state.tempo) * 1000;
    let beat = 0;
    setState({ isCountingIn: true, currentCountInBeat: 1 });
    if (state.metronomeEnabled) playMetronomeClick(true);
    countInInterval = setInterval(() => {
      beat++;
      if (beat >= state.countInBeats) {
        if (countInInterval) {
          clearInterval(countInInterval);
          countInInterval = null;
        }
        setState({ isCountingIn: false, currentCountInBeat: 0 });
        streamPromise
          .then((stream) => Promise.resolve(callback(stream)))
          .catch((e) => console.error('Failed to get stream for recording', e));
      } else {
        setState({ currentCountInBeat: beat + 1 });
        if (state.metronomeEnabled) playMetronomeClick(false);
      }
    }, intervalMs);
  }

  function record() {
    if (state.isRecording) {
      if (timeUpdateRafId) cancelAnimationFrame(timeUpdateRafId);
      timeUpdateRafId = 0;
      sourceNodes.forEach((s) => {
        try {
          s.stop();
        } catch {}
      });
      sourceNodes.clear();
      regionFadeGainNodes.clear();
      stopRecording();
      isPlaying = false;
      setState({ isPlaying: false, isRecording: false, masterOutputLevel: 0 });
      return;
    }
    if (state.isCountingIn) {
      if (countInInterval) clearInterval(countInInterval);
      countInInterval = null;
      setState({ isCountingIn: false, currentCountInBeat: 0 });
      return;
    }
    if (!state.tracks.some((t) => t.armed)) {
      if (noArmedTrackListener) noArmedTrackListener();
      return;
    }
    const doRecord = async (
      stream?: { streamForSource: MediaStream; fullStream: MediaStream }
    ): Promise<void> => {
      const offset = state.startPosition;
      recordingStartTimelinePosition = offset;
      let recordingStartTime: number;
      try {
        if (stream) {
          recordingStartTime = await startRecordingWithStream(stream.streamForSource, stream.fullStream);
        } else {
          recordingStartTime = await startRecording();
        }
      } catch (e) {
        console.error('Failed to start recording', e);
        return;
      }
      const ctx = getAudioContext();
      playRegions(offset, true);
      if (state.metronomeEnabled) startMetronome();
      isPlaying = true;
      setState({ isPlaying: true, currentTime: offset });
      const updateTime = () => {
        if (!isPlaying) return;
        const elapsed = ctx.currentTime - recordingStartTime;
        const currentTime = offset + elapsed;
        setState((prev) => {
          if (!prev.isRecording && !prev.isPlaying) return prev;
          return { ...prev, currentTime };
        });
        sampleMasterOutputLevel();
        timeUpdateRafId = requestAnimationFrame(updateTime);
      };
      timeUpdateRafId = requestAnimationFrame(updateTime);
    };
    if (state.countInEnabled) {
      const streamPromise = getStreamForRecording();
      doCountIn(streamPromise, (stream) => doRecord(stream));
    } else {
      doRecord();
    }
  }

  function play() {
    if (state.isPlaying) {
      if (timeUpdateRafId) cancelAnimationFrame(timeUpdateRafId);
      timeUpdateRafId = 0;
      sourceNodes.forEach((s) => {
        try {
          s.stop();
        } catch {}
      });
      sourceNodes.clear();
      regionFadeGainNodes.clear();
      stopMetronome();
      isPlaying = false;
      setState({ isPlaying: false, masterOutputLevel: 0 });
      return;
    }
    const ctx = getAudioContext();
    if (ctx.state !== 'running') resumeContextOnNextGesture(ctx);
    const dur = state.duration;
    const offset = state.startPosition;
    playbackStart = ctx.currentTime;
    playRegions(offset);
    if (state.metronomeEnabled) startMetronome();
    isPlaying = true;
    setState({ isPlaying: true, currentTime: offset });
    const updateTime = () => {
      if (!isPlaying) return;
      const elapsed = offset + (ctx.currentTime - playbackStart);
      if (elapsed >= dur && dur > 0) {
        if (timeUpdateRafId) cancelAnimationFrame(timeUpdateRafId);
        timeUpdateRafId = 0;
        sourceNodes.forEach((s) => {
          try {
            s.stop();
          } catch {}
        });
        sourceNodes.clear();
        regionFadeGainNodes.clear();
        stopMetronome();
        isPlaying = false;
        setState({ isPlaying: false, currentTime: 0, startPosition: 0, masterOutputLevel: 0 });
        return;
      }
      setState({ currentTime: elapsed });
      sampleMasterOutputLevel();
      timeUpdateRafId = requestAnimationFrame(updateTime);
    };
    timeUpdateRafId = requestAnimationFrame(updateTime);
  }

  function stop() {
    isPlaying = false;
    if (timeUpdateRafId) {
      cancelAnimationFrame(timeUpdateRafId);
      timeUpdateRafId = 0;
    }
    sourceNodes.forEach((s) => {
      try {
        s.stop();
      } catch {}
    });
    sourceNodes.clear();
    regionFadeGainNodes.clear();
    stopRecording();
    stopMetronome();
    if (countInInterval) {
      clearInterval(countInInterval);
      countInInterval = null;
    }
    setState({
      isPlaying: false,
      isRecording: false,
      isCountingIn: false,
      currentCountInBeat: 0,
      currentTime: 0,
      startPosition: 0,
      masterOutputLevel: 0,
    });
  }

  /** Pause playback at the current position (does not reset to 0; Play will resume from here). */
  function pause() {
    if (!state.isPlaying) return;
    isPlaying = false;
    if (timeUpdateRafId) {
      cancelAnimationFrame(timeUpdateRafId);
      timeUpdateRafId = 0;
    }
    sourceNodes.forEach((s) => {
      try {
        s.stop();
      } catch {}
    });
    sourceNodes.clear();
    regionFadeGainNodes.clear();
    stopMetronome();
    const now = state.currentTime;
    setState({
      isPlaying: false,
      currentTime: now,
      startPosition: now,
      masterOutputLevel: 0,
    });
  }

  function toggleArm(trackId: number) {
    const id = Number(trackId);
    if (Number.isNaN(id)) return;
    pushUndo();
    setState((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => ({
        ...t,
        armed: t.id === id ? !t.armed : false,
      })),
    }));
    applyInputMonitoring();
  }
  function toggleSolo(trackId: number) {
    pushUndo();
    setState((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, solo: !t.solo } : t)),
    }));
  }
  function toggleMute(trackId: number) {
    pushUndo();
    setState((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, muted: !t.muted } : t)),
    }));
  }
  function setMuted(trackId: number, muted: boolean) {
    pushUndo();
    setState((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, muted } : t)),
    }));
  }
  function setSolo(trackId: number, solo: boolean) {
    pushUndo();
    setState((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, solo } : t)),
    }));
  }
  function setVolume(trackId: number, volume: number) {
    pushUndo();
    setState((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, volume } : t)),
    }));
    const g = gainNodes.get(trackId);
    if (g) g.gain.value = faderToGain(volume);
  }
  function setPan(trackId: number, pan: number) {
    pushUndo();
    setState((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, pan } : t)),
    }));
    const p = panNodes.get(trackId);
    if (p) p.pan.value = pan / 100;
  }
  /** Normalize legacy mode names from saved projects. */
  function normalizeInputMonitoringMode(
    mode: InputMonitoringMode | 'direct' | 'withEffects'
  ): InputMonitoringMode {
    if (mode === 'direct') return 'lowLatency';
    if (mode === 'withEffects') return 'fullFx';
    return mode;
  }

  function setInputMonitoring(
    trackId: number,
    mode: InputMonitoringMode | 'direct' | 'withEffects'
  ) {
    const normalized = normalizeInputMonitoringMode(mode);
    inputMonitoringRetryTimeouts.forEach((t) => clearTimeout(t));
    inputMonitoringRetryTimeouts = [];
    setState((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, inputMonitoring: normalized } : t)),
    }));
    applyInputMonitoring();
    if (normalized === 'lowLatency' || normalized === 'comfort' || normalized === 'comfortFx' || normalized === 'fullFx') {
      startSustainedInputStream().catch(() => {});
      [50, 150, 400].forEach((ms) => {
        inputMonitoringRetryTimeouts.push(
          setTimeout(() => {
            applyInputMonitoring();
          }, ms)
        );
      });
    }
  }

  function setReverb(trackId: number, reverb: number) {
    pushUndo();
    setState((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, reverb } : t)),
    }));
    const r = reverbSendGainNodes.get(trackId);
    if (r) r.gain.value = reverb / 100;
  }

  function setDelay(trackId: number, delay: number) {
    pushUndo();
    setState((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, delay } : t)),
    }));
    const d = delaySendGainNodes.get(trackId);
    if (d) d.gain.value = delay / 100;
  }

  function setCompressor(trackId: number, compressor: number) {
    pushUndo();
    setState((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, compressor } : t)),
    }));
    const c = compressorSendGainNodes.get(trackId);
    if (c) c.gain.value = compressor / 100;
  }
  function seekTo(time: number) {
    if (state.isPlaying || state.isRecording) return;
    const clamped = Math.max(0, Math.min(time, state.duration));
    setState({ currentTime: clamped, startPosition: clamped });
  }

  /** Return to start (time 0). */
  function skipBack() {
    if (state.isPlaying || state.isRecording) return;
    setState({ currentTime: 0, startPosition: 0 });
  }
  function setTempo(tempo: number) {
    pushUndo();
    setState({ tempo });
  }
  function setTimeSignature(numerator: number, denominator: number) {
    pushUndo();
    setState({ timeSignature: [numerator, denominator] });
  }
  function toggleMetronome() {
    pushUndo();
    setState((prev) => {
      const next = !prev.metronomeEnabled;
      if (!next) stopMetronome();
      return { ...prev, metronomeEnabled: next };
    });
  }
  function toggleCountIn() {
    pushUndo();
    setState((prev) => ({ ...prev, countInEnabled: !prev.countInEnabled }));
  }
  function setTrackName(trackId: number, name: string) {
    pushUndo();
    setState((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, name } : t)),
    }));
  }
  function clearTrack(trackId: number) {
    pushUndo();
    setState((prev) => {
      const newTracks = prev.tracks.map((t) => (t.id === trackId ? { ...t, regions: [] } : t));
      const maxDuration = computeDuration(newTracks);
      return { ...prev, tracks: newTracks, duration: maxDuration };
    });
    sourceNodes.forEach((_, key) => {
      if (key.startsWith(`${trackId}-`)) {
        const s = sourceNodes.get(key);
        if (s) {
          try {
            s.stop();
          } catch {}
          sourceNodes.delete(key);
          regionFadeGainNodes.delete(key);
        }
      }
    });
  }

  /** Load a recording from an ArrayBuffer (e.g. fetched from playbackUrl) into a track. Adds a single region at startTime 0. */
  async function loadRecordingFromArrayBuffer(
    trackIndex: number,
    arrayBuffer: ArrayBuffer,
    label?: string | null
  ): Promise<void> {
    const ctx = getAudioContext();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const pyramid = buildWaveformPyramid(audioBuffer);
    pushUndo();
    setState((prev) => {
      const trackId = Math.min(trackIndex, prev.tracks.length - 1);
      const track = prev.tracks[trackId];
      const newRegion: AudioRegion = {
        id: crypto.randomUUID(),
        startTime: 0,
        duration: audioBuffer.duration,
        sourceOffset: 0,
        audioBuffer,
        waveformPyramid: pyramid,
        recordedBlob: null,
        muted: false,
        fadeInSeconds: 0,
        fadeOutSeconds: 0,
      };
      const newRegions = [...track.regions, newRegion].sort((a, b) => a.startTime - b.startTime);
      const newTracks = prev.tracks.map((t, i) =>
        i === trackId ? { ...t, regions: newRegions, name: label ?? t.name } : { ...t }
      );
      const maxDuration = computeDuration(newTracks);
      return { ...prev, tracks: newTracks, duration: maxDuration };
    });
  }

  /** Render one track's regions (with fades) to a single stereo buffer. */
  async function renderTrackToBuffer(track: TrackState): Promise<AudioBuffer> {
    const duration = getTrackDuration(track);
    if (duration <= 0 || track.regions.length === 0)
      return getAudioContext().createBuffer(2, 0, 44100);
    const sampleRate = track.regions[0].audioBuffer.sampleRate;
    const ctx = new OfflineAudioContext(2, Math.ceil(sampleRate * duration), sampleRate);
    const when = 0;
    for (const region of track.regions) {
      if (region.muted) continue;
      const source = ctx.createBufferSource();
      source.buffer = region.audioBuffer;
      const fadeGain = ctx.createGain();
      source.connect(fadeGain);
      fadeGain.connect(ctx.destination);
      source.start(when + region.startTime, region.sourceOffset, region.duration);
      const t0 = when + region.startTime;
      const tEnd = t0 + region.duration;
      const fadeIn = region.fadeInSeconds;
      const fadeOut = region.fadeOutSeconds;
      fadeGain.gain.setValueAtTime(0, t0);
      if (fadeIn > 0) fadeGain.gain.linearRampToValueAtTime(1, t0 + fadeIn);
      if (fadeOut > 0) {
        fadeGain.gain.setValueAtTime(1, tEnd - fadeOut);
        fadeGain.gain.linearRampToValueAtTime(0, tEnd);
      } else if (fadeIn <= 0) fadeGain.gain.setValueAtTime(1, t0);
    }
    return ctx.startRendering();
  }

  async function exportRecordings(): Promise<ExportRecordingItem[]> {
    const items: ExportRecordingItem[] = [];
    for (const t of state.tracks) {
      if (t.regions.length === 0) continue;
      const durationSeconds = getTrackDuration(t) || null;
      if (t.regions.length === 1 && t.regions[0].recordedBlob) {
        items.push({
          trackIndex: t.id,
          label: t.name || null,
          durationSeconds,
          blob: t.regions[0].recordedBlob,
          mimeType: t.regions[0].recordedBlob.type || 'audio/webm',
        });
      } else {
        const buffer = await renderTrackToBuffer(t);
        const blob = audioBufferToWav(buffer);
        items.push({
          trackIndex: t.id,
          label: t.name || null,
          durationSeconds,
          blob,
          mimeType: 'audio/wav',
        });
      }
    }
    return items;
  }

  /** Render all tracks into a stereo WAV blob (offline mix down). Each track's regions are rendered with fades and summed. */
  async function mixDown(): Promise<{ blob: Blob; durationSeconds: number } | null> {
    const maxDuration = state.duration;
    if (maxDuration <= 0) return null;
    const tracksWithAudio = state.tracks.filter((t) => t.regions.length > 0);
    if (tracksWithAudio.length === 0) return null;
    const sampleRate = tracksWithAudio[0].regions[0].audioBuffer.sampleRate;
    const offlineCtx = new OfflineAudioContext(2, Math.ceil(sampleRate * maxDuration), sampleRate);
    const when = 0;

    const master = offlineCtx.createGain();
    master.gain.value = state.masterMuted ? 0 : faderToGain(state.masterLevel);
    master.connect(offlineCtx.destination);

    const hasSolo = state.tracks.some((t) => t.solo);
    for (const track of state.tracks) {
      if (track.regions.length === 0 || track.muted || (hasSolo && !track.solo)) continue;
      const trackGain = offlineCtx.createGain();
      trackGain.gain.value = faderToGain(track.volume);
      const pan = offlineCtx.createStereoPanner();
      pan.pan.value = track.pan / 100;
      trackGain.connect(pan);
      pan.connect(master);

      for (const region of track.regions) {
        if (region.muted) continue;
        const source = offlineCtx.createBufferSource();
        source.buffer = region.audioBuffer;
        const fadeGain = offlineCtx.createGain();
        source.connect(fadeGain);
        fadeGain.connect(trackGain);
        source.start(when + region.startTime, region.sourceOffset, region.duration);

        const fadeIn = region.fadeInSeconds;
        const fadeOut = region.fadeOutSeconds;
        const t0 = when + region.startTime;
        const tEnd = t0 + region.duration;
        fadeGain.gain.setValueAtTime(0, t0);
        if (fadeIn > 0) fadeGain.gain.linearRampToValueAtTime(1, t0 + fadeIn);
        if (fadeOut > 0) {
          fadeGain.gain.setValueAtTime(1, tEnd - fadeOut);
          fadeGain.gain.linearRampToValueAtTime(0, tEnd);
        } else if (fadeIn <= 0) {
          fadeGain.gain.setValueAtTime(1, t0);
        }
      }
    }

    const rendered = await offlineCtx.startRendering();
    const wavBlob = audioBufferToWav(rendered);
    return { blob: wavBlob, durationSeconds: rendered.duration };
  }

  /** Encode an AudioBuffer as a WAV Blob. */
  function audioBufferToWav(buffer: AudioBuffer): Blob {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length;
    const bytesPerSample = 2;
    const dataSize = length * numChannels * bytesPerSample;
    const headerSize = 44;
    const arrayBuffer = new ArrayBuffer(headerSize + dataSize);
    const view = new DataView(arrayBuffer);

    function writeString(offset: number, s: string) {
      for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
    }

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
    view.setUint16(32, numChannels * bytesPerSample, true);
    view.setUint16(34, bytesPerSample * 8, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    const channels: Float32Array[] = [];
    for (let ch = 0; ch < numChannels; ch++) channels.push(buffer.getChannelData(ch));

    let offset = headerSize;
    for (let i = 0; i < length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, channels[ch][i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += bytesPerSample;
      }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  function getState(): AudioEngineState & { canUndo: boolean; canRedo: boolean } {
    return {
      ...state,
      tracks: state.tracks.map((t) => ({ ...t })),
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
    };
  }

  /** Classify monitoring suitability from round-trip latency (e.g. latencyCompensationMs). For UI health indicator. */
  function getMonitoringQuality(): 'good' | 'borderline' | 'notRecommended' {
    const ms = state.latencyCompensationMs;
    if (ms <= 0) return 'borderline';
    if (ms <= 28) return 'good';
    if (ms <= 56) return 'borderline';
    return 'notRecommended';
  }

  function subscribe(listener: StateListener): () => void {
    listeners.push(listener);
    return () => {
      const i = listeners.indexOf(listener);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  function subscribeInputLevel(listener: (level: number) => void): () => void {
    inputLevelListeners.push(listener);
    return () => {
      const i = inputLevelListeners.indexOf(listener);
      if (i >= 0) inputLevelListeners.splice(i, 1);
    };
  }

  function subscribeMasterLevel(listener: (level: number) => void): () => void {
    masterLevelListeners.push(listener);
    return () => {
      const i = masterLevelListeners.indexOf(listener);
      if (i >= 0) masterLevelListeners.splice(i, 1);
    };
  }

  function subscribeMetronomeTick(listener: MetronomeTickListener): () => void {
    metronomeTickListeners.push(listener);
    return () => {
      const i = metronomeTickListeners.indexOf(listener);
      if (i >= 0) metronomeTickListeners.splice(i, 1);
    };
  }

  function setInputDevice(deviceId: string | null) {
    setState({ inputDeviceId: deviceId, inputChannelIndex: 0 });
  }

  function setInputChannelIndex(index: number) {
    setState({ inputChannelIndex: Math.max(0, index) });
  }

  function setInputGain(gain: number) {
    const clamped = Math.max(0, Math.min(100, gain));
    setState({ inputGain: clamped });
    if (inputGainNode) inputGainNode.gain.value = clamped / 100;
  }

  async function setOutputDevice(deviceId: string | null) {
    setState({ outputDeviceId: deviceId });
    if (audioContext) await applyOutputDevice();
  }

  function setLatencyCompensationMs(ms: number) {
    setState({ latencyCompensationMs: Math.max(0, Math.min(500, ms)) });
  }

  function setMasterLevel(level: number) {
    const clamped = Math.max(0, Math.min(100, level));
    setState({ masterLevel: clamped });
    applyMasterGain();
  }

  function setAuxLevel(level: number) {
    const clamped = Math.max(0, Math.min(100, level));
    setState({ auxLevel: clamped });
    applyAuxGain();
  }

  function setMasterMuted(muted: boolean) {
    setState({ masterMuted: muted });
    applyMasterGain();
  }

  function setAuxMuted(muted: boolean) {
    setState({ auxMuted: muted });
    applyAuxGain();
  }

  function setReverbPreDelayMs(ms: number) {
    setState({ reverbPreDelayMs: Math.max(0, Math.min(500, ms)) });
    applyReverbParams();
  }
  function setReverbBandwidth(v: number) {
    setState({ reverbBandwidth: Math.max(0, Math.min(1, v)) });
    applyReverbParams();
  }
  function setReverbInputDiffusion1(v: number) {
    setState({ reverbInputDiffusion1: Math.max(0, Math.min(1, v)) });
    applyReverbParams();
  }
  function setReverbInputDiffusion2(v: number) {
    setState({ reverbInputDiffusion2: Math.max(0, Math.min(1, v)) });
    applyReverbParams();
  }
  function setReverbDecay(v: number) {
    setState({ reverbDecay: Math.max(0, Math.min(1, v)) });
    applyReverbParams();
  }
  function setReverbDecayDiffusion1(v: number) {
    setState({ reverbDecayDiffusion1: Math.max(0, Math.min(1, v)) });
    applyReverbParams();
  }
  function setReverbDecayDiffusion2(v: number) {
    setState({ reverbDecayDiffusion2: Math.max(0, Math.min(1, v)) });
    applyReverbParams();
  }
  function setReverbDamping(v: number) {
    setState({ reverbDamping: Math.max(0, Math.min(1, v)) });
    applyReverbParams();
  }
  function setReverbExcursionRate(v: number) {
    setState({ reverbExcursionRate: Math.max(0, Math.min(2, v)) });
    applyReverbParams();
  }
  function setReverbExcursionDepth(v: number) {
    setState({ reverbExcursionDepth: Math.max(0, Math.min(2, v)) });
    applyReverbParams();
  }
  function setReverbWet(v: number) {
    setState({ reverbWet: Math.max(0, Math.min(1, v)) });
    applyReverbParams();
  }
  function setReverbDry(v: number) {
    setState({ reverbDry: Math.max(0, Math.min(1, v)) });
    applyReverbParams();
  }

  function setDelayLevel(level: number) {
    const clamped = Math.max(0, Math.min(100, level));
    setState({ delayLevel: clamped });
    applyDelayReturnGain();
  }

  function setDelayMuted(muted: boolean) {
    setState({ delayMuted: muted });
    applyDelayReturnGain();
  }

  function setDelayTimeMs(ms: number) {
    const clamped = Math.max(1, Math.min(4000, ms));
    setState({ delayTimeMs: clamped });
    if (delayNode) delayNode.delayTime.value = clamped / 1000;
  }

  function setDelayFeedback(value: number) {
    const clamped = Math.max(0, Math.min(100, value));
    setState({ delayFeedback: clamped });
    if (delayFeedbackGainNode) delayFeedbackGainNode.gain.value = clamped / 100;
  }

  function setDelayWet(value: number) {
    const clamped = Math.max(0, Math.min(100, value));
    setState({ delayWet: clamped });
    if (delayWetGainNode) delayWetGainNode.gain.value = clamped / 100;
  }

  function setCompressorLevel(level: number) {
    const clamped = Math.max(0, Math.min(100, level));
    setState({ compressorLevel: clamped });
    applyCompressorReturnGain();
  }

  function setCompressorMuted(muted: boolean) {
    setState({ compressorMuted: muted });
    applyCompressorReturnGain();
  }

  function setCompressorThreshold(dB: number) {
    const clamped = Math.max(-100, Math.min(0, dB));
    setState({ compressorThreshold: clamped });
    if (compressorNode) compressorNode.threshold.value = clamped;
  }

  function setCompressorKnee(dB: number) {
    const clamped = Math.max(0, Math.min(40, dB));
    setState({ compressorKnee: clamped });
    if (compressorNode) compressorNode.knee.value = clamped;
  }

  function setCompressorRatio(ratio: number) {
    const clamped = Math.max(1, Math.min(20, ratio));
    setState({ compressorRatio: clamped });
    if (compressorNode) compressorNode.ratio.value = clamped;
  }

  function setCompressorAttack(seconds: number) {
    const clamped = Math.max(0, Math.min(1, seconds));
    setState({ compressorAttack: clamped });
    if (compressorNode) compressorNode.attack.value = clamped;
  }

  function setCompressorRelease(seconds: number) {
    const clamped = Math.max(0, Math.min(1, seconds));
    setState({ compressorRelease: clamped });
    if (compressorNode) compressorNode.release.value = clamped;
  }

  function setCompressorEnabled(enabled: boolean) {
    setState({ compressorEnabled: enabled });
    applyCompressorBypass();
  }

  /**
   * Get a round-trip latency estimate from the audio device (no mic needed).
   * Uses the Web Audio API's baseLatency + outputLatency, doubled. Use this when recording
   * with headphones so the mic cannot hear the speaker.
   * No warm-up here; calibration UI runs a visible real recording warm-up before calling this.
   */
  async function getLatencyEstimateMs(): Promise<number> {
    const ctx = await ensureContextRunning();
    if (state.outputDeviceId) await applyOutputDevice();
    const warmSamples = Math.ceil(ctx.sampleRate * 0.05);
    const silentBuffer = ctx.createBuffer(1, warmSamples, ctx.sampleRate);
    const bufSource = ctx.createBufferSource();
    bufSource.buffer = silentBuffer;
    bufSource.connect(ctx.destination);
    bufSource.start(0);
    bufSource.stop(0.05);
    await new Promise((r) => setTimeout(r, 150));
    return getEstimatedLatencyMs(ctx);
  }

  /**
   * Ping test: play a short pip through the output, capture from the current input device,
   * and measure round-trip latency (play → mic → buffer). Only works when the mic can
   * hear the speaker (e.g. room monitoring). For headphones, use getLatencyEstimateMs() instead.
   */
  async function runPingTest(): Promise<{ roundTripMs: number } | { error: string }> {
    const WARMUP_MS = 80;
    const CAPTURE_MS = 500;
    const PIP_DURATION = 0.05;
    const PIP_FREQ = 1000;
    const RMS_WINDOW = 256;
    const RMS_THRESHOLD = 0.02;

    let fullStream: MediaStream | null = null;
    let captureCtx: AudioContext | null = null;
    let playbackCtx: AudioContext | null = null;

    try {
      const { streamForSource, fullStream: fs } = await getStreamForRecording();
      fullStream = fs;

      captureCtx = new AudioContext({ latencyHint: 'interactive' });
      const source = captureCtx.createMediaStreamSource(streamForSource);
      const dest = captureCtx.createMediaStreamDestination();
      source.connect(dest);

      const chunks: Blob[] = [];
      const rec = new MediaRecorder(dest.stream);
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      rec.start();
      const tRecStart = performance.now();

      await new Promise((r) => setTimeout(r, WARMUP_MS));

      playbackCtx = new AudioContext({ latencyHint: 'interactive' });
      const sinkId = state.outputDeviceId || 'default';
      const setSink = playbackCtx as AudioContext & { setSinkId?(id: string): Promise<void> };
      if (typeof setSink.setSinkId === 'function') {
        await setSink.setSinkId(sinkId).catch(() => {});
      }

      const osc = playbackCtx.createOscillator();
      const gain = playbackCtx.createGain();
      osc.connect(gain);
      gain.connect(playbackCtx.destination);
      osc.frequency.value = PIP_FREQ;
      const t0 = playbackCtx.currentTime;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.3, t0 + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + PIP_DURATION);
      osc.start(t0);
      osc.stop(t0 + PIP_DURATION);

      const tPlay = performance.now();

      await new Promise((r) => setTimeout(r, CAPTURE_MS));
      await new Promise<void>((resolve, reject) => {
        rec.onstop = () => resolve();
        rec.onerror = () => reject(new Error('MediaRecorder failed'));
        rec.stop();
      });
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await captureCtx.decodeAudioData(arrayBuffer.slice(0));
      const ch = audioBuffer.getChannelData(0);
      const sr = audioBuffer.sampleRate;
      const len = ch.length;

      let firstAbove = -1;
      for (let i = 0; i <= len - RMS_WINDOW; i++) {
        let sumSq = 0;
        for (let j = 0; j < RMS_WINDOW; j++) sumSq += ch[i + j] * ch[i + j];
        const rms = Math.sqrt(sumSq / RMS_WINDOW);
        if (rms > RMS_THRESHOLD) {
          firstAbove = i;
          break;
        }
      }

      if (firstAbove < 0) {
        return { error: 'No pip detected. Ensure mic can hear the speaker and try again.' };
      }

      const pipTimeMs = (firstAbove / sr) * 1000;
      const rtl = tRecStart + pipTimeMs - tPlay;
      const roundTripMs = Math.max(0, Math.round(rtl));

      return { roundTripMs };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { error: message };
    } finally {
      if (fullStream) fullStream.getTracks().forEach((t) => t.stop());
      if (captureCtx && captureCtx.state !== 'closed') captureCtx.close();
      if (playbackCtx && playbackCtx.state !== 'closed') playbackCtx.close();
    }
  }

  function splitRegionAtPlayhead(trackId: number, regionId: string): boolean {
    const playhead = state.currentTime;
    const track = state.tracks.find((t) => t.id === trackId);
    if (!track) return false;
    const region = track.regions.find((r) => r.id === regionId);
    if (!region) return false;
    if (playhead <= region.startTime || playhead >= region.startTime + region.duration) return false;
    const ctx = getAudioContext();
    const splitOffset = playhead - region.startTime;
    const bufStart = region.sourceOffset;
    const bufEnd = region.sourceOffset + region.duration;
    const bufA = sliceAudioBuffer(region.audioBuffer, bufStart, bufStart + splitOffset, ctx);
    const bufB = sliceAudioBuffer(region.audioBuffer, bufStart + splitOffset, bufEnd, ctx);
    const pyramidA = buildWaveformPyramid(bufA);
    const pyramidB = buildWaveformPyramid(bufB);
    const regionA: AudioRegion = {
      id: crypto.randomUUID(),
      startTime: region.startTime,
      duration: splitOffset,
      sourceOffset: 0,
      audioBuffer: bufA,
      waveformPyramid: pyramidA,
      recordedBlob: null,
      muted: region.muted,
      fadeInSeconds: region.fadeInSeconds,
      fadeOutSeconds: 0,
    };
    const regionB: AudioRegion = {
      id: crypto.randomUUID(),
      startTime: playhead,
      duration: region.duration - splitOffset,
      sourceOffset: 0,
      audioBuffer: bufB,
      waveformPyramid: pyramidB,
      recordedBlob: null,
      muted: region.muted,
      fadeInSeconds: 0,
      fadeOutSeconds: region.fadeOutSeconds,
    };
    pushUndo();
    setState((prev) => {
      const newTracks = prev.tracks.map((t) => {
        if (t.id !== trackId) return t;
        const newRegions = t.regions.filter((r) => r.id !== regionId);
        newRegions.push(regionA, regionB);
        newRegions.sort((a, b) => a.startTime - b.startTime);
        return { ...t, regions: newRegions };
      });
      return { ...prev, tracks: newTracks, duration: computeDuration(newTracks) };
    });
    return true;
  }

  function deleteRegion(trackId: number, regionId: string): void {
    pushUndo();
    setState((prev) => {
      const newTracks = prev.tracks.map((t) => {
        if (t.id !== trackId) return t;
        const newRegions = t.regions.filter((r) => r.id !== regionId);
        return { ...t, regions: newRegions };
      });
      return { ...prev, tracks: newTracks, duration: computeDuration(newTracks) };
    });
    const key = `${trackId}-${regionId}`;
    const s = sourceNodes.get(key);
    if (s) {
      try {
        s.stop();
      } catch {}
      sourceNodes.delete(key);
      regionFadeGainNodes.delete(key);
    }
  }

  function duplicateRegion(trackId: number, regionId: string): void {
    const track = state.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const region = track.regions.find((r) => r.id === regionId);
    if (!region) return;
    const ctx = getAudioContext();
    const newBuffer = sliceAudioBuffer(
      region.audioBuffer,
      region.sourceOffset,
      region.sourceOffset + region.duration,
      ctx
    );
    const newPyramid = buildWaveformPyramid(newBuffer);
    const newStart = region.startTime + region.duration;
    const newRegion: AudioRegion = {
      id: crypto.randomUUID(),
      startTime: newStart,
      duration: region.duration,
      sourceOffset: 0,
      audioBuffer: newBuffer,
      waveformPyramid: newPyramid,
      recordedBlob: null,
      muted: false,
      fadeInSeconds: region.fadeInSeconds,
      fadeOutSeconds: region.fadeOutSeconds,
    };
    pushUndo();
    setState((prev) => {
      const newTracks = prev.tracks.map((t) => {
        if (t.id !== trackId) return t;
        const newRegions = [...t.regions, newRegion].sort((a, b) => a.startTime - b.startTime);
        return { ...t, regions: newRegions };
      });
      return { ...prev, tracks: newTracks, duration: computeDuration(newTracks) };
    });
  }

  function toggleRegionMute(trackId: number, regionId: string): void {
    pushUndo();
    setState((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) =>
        t.id === trackId
          ? {
              ...t,
              regions: t.regions.map((r) => (r.id === regionId ? { ...r, muted: !r.muted } : r)),
            }
          : t
      ),
    }));
  }

  function setRegionFadeIn(trackId: number, regionId: string, seconds: number): void {
    if (inUndoableBatch) batchDirty = true;
    const maxFade = state.tracks.find((t) => t.id === trackId)?.regions.find((r) => r.id === regionId)?.duration ?? 0;
    const clamped = Math.max(0, Math.min(seconds, maxFade / 2));
    pushUndo();
    setState((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) =>
        t.id === trackId
          ? { ...t, regions: t.regions.map((r) => (r.id === regionId ? { ...r, fadeInSeconds: clamped } : r)) }
          : t
      ),
    }));
  }

  function setRegionFadeOut(trackId: number, regionId: string, seconds: number): void {
    if (inUndoableBatch) batchDirty = true;
    const maxFade = state.tracks.find((t) => t.id === trackId)?.regions.find((r) => r.id === regionId)?.duration ?? 0;
    const clamped = Math.max(0, Math.min(seconds, maxFade / 2));
    pushUndo();
    setState((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) =>
        t.id === trackId
          ? { ...t, regions: t.regions.map((r) => (r.id === regionId ? { ...r, fadeOutSeconds: clamped } : r)) }
          : t
      ),
    }));
  }

  const MIN_REGION_DURATION_SEC = 0.1;

  function moveRegion(trackId: number, regionId: string, newStartTime: number): void {
    if (inUndoableBatch) batchDirty = true;
    const track = state.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const region = track.regions.find((r) => r.id === regionId);
    if (!region) return;
    newStartTime = Math.max(0, newStartTime);
    const newEnd = newStartTime + region.duration;
    const others = track.regions.filter((r) => r.id !== regionId);
    for (const r of others) {
      const rEnd = r.startTime + r.duration;
      if (newEnd > r.startTime && newStartTime < rEnd) return;
    }
    pushUndo();
    setState((prev) => {
      const newTracks = prev.tracks.map((t) => {
        if (t.id !== trackId) return t;
        const newRegions = t.regions.map((r) => (r.id === regionId ? { ...r, startTime: newStartTime } : r));
        newRegions.sort((a, b) => a.startTime - b.startTime);
        return { ...t, regions: newRegions };
      });
      return { ...prev, tracks: newTracks, duration: computeDuration(newTracks) };
    });
  }

  function trimRegionLeft(trackId: number, regionId: string, newStartTime: number): void {
    if (inUndoableBatch) batchDirty = true;
    const track = state.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const region = track.regions.find((r) => r.id === regionId);
    if (!region) return;
    const bufDur = region.audioBuffer.duration;
    const minStart = Math.max(0, region.startTime - region.sourceOffset);
    const maxStart = region.startTime + region.duration - MIN_REGION_DURATION_SEC;
    const clampedStart = Math.max(minStart, Math.min(newStartTime, maxStart));
    const delta = clampedStart - region.startTime;
    const newSourceOffset = region.sourceOffset + delta;
    const newDuration = region.duration - delta;
    if (newDuration < MIN_REGION_DURATION_SEC || newSourceOffset < 0 || newSourceOffset + newDuration > bufDur)
      return;
    const maxFade = newDuration / 2;
    const fadeIn = Math.min(region.fadeInSeconds, maxFade);
    const fadeOut = Math.min(region.fadeOutSeconds, maxFade);
    pushUndo();
    setState((prev) => {
      const newTracks = prev.tracks.map((t) => {
        if (t.id !== trackId) return t;
        const newRegions = t.regions.map((r) =>
          r.id === regionId
            ? {
                ...r,
                startTime: clampedStart,
                duration: newDuration,
                sourceOffset: newSourceOffset,
                fadeInSeconds: fadeIn,
                fadeOutSeconds: fadeOut,
              }
            : r
        );
        newRegions.sort((a, b) => a.startTime - b.startTime);
        return { ...t, regions: newRegions };
      });
      return { ...prev, tracks: newTracks, duration: computeDuration(newTracks) };
    });
  }

  function trimRegionRight(trackId: number, regionId: string, newEndTime: number): void {
    if (inUndoableBatch) batchDirty = true;
    const track = state.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const region = track.regions.find((r) => r.id === regionId);
    if (!region) return;
    const bufDur = region.audioBuffer.duration;
    const minEnd = region.startTime + MIN_REGION_DURATION_SEC;
    const maxEnd = region.startTime + (bufDur - region.sourceOffset);
    const clampedEnd = Math.max(minEnd, Math.min(newEndTime, maxEnd));
    const newDuration = clampedEnd - region.startTime;
    if (newDuration < MIN_REGION_DURATION_SEC || region.sourceOffset + newDuration > bufDur) return;
    const maxFade = newDuration / 2;
    const fadeIn = Math.min(region.fadeInSeconds, maxFade);
    const fadeOut = Math.min(region.fadeOutSeconds, maxFade);
    pushUndo();
    setState((prev) => {
      const newTracks = prev.tracks.map((t) => {
        if (t.id !== trackId) return t;
        const newRegions = t.regions.map((r) =>
          r.id === regionId
            ? {
                ...r,
                duration: newDuration,
                fadeInSeconds: fadeIn,
                fadeOutSeconds: fadeOut,
              }
            : r
        );
        newRegions.sort((a, b) => a.startTime - b.startTime);
        return { ...t, regions: newRegions };
      });
      return { ...prev, tracks: newTracks, duration: computeDuration(newTracks) };
    });
  }

  return {
    getState,
    subscribe,
    setNoArmedTrackListener,
    subscribeInputLevel,
    subscribeMasterLevel,
    subscribeMetronomeTick,
    record,
    play,
    pause,
    stop,
    setInputDevice,
    setInputChannelIndex,
    setInputGain,
    setOutputDevice,
    setLatencyCompensationMs,
    setMasterLevel,
    setAuxLevel,
    setMasterMuted,
    setAuxMuted,
    setReverbPreDelayMs,
    setReverbBandwidth,
    setReverbInputDiffusion1,
    setReverbInputDiffusion2,
    setReverbDecay,
    setReverbDecayDiffusion1,
    setReverbDecayDiffusion2,
    setReverbDamping,
    setReverbExcursionRate,
    setReverbExcursionDepth,
    setReverbWet,
    setReverbDry,
    setDelayLevel,
    setDelayMuted,
    setDelayTimeMs,
    setDelayFeedback,
    setDelayWet,
    setCompressorLevel,
    setCompressorMuted,
    setCompressorThreshold,
    setCompressorKnee,
    setCompressorRatio,
    setCompressorAttack,
    setCompressorRelease,
    setCompressorEnabled,
    getLatencyEstimateMs,
    getMonitoringQuality,
    getActiveInputStream,
    startSustainedInputStream,
    stopSustainedInputStream,
    playWhiteNoiseBurst,
    runPingTest,
    toggleArm,
    toggleSolo,
    toggleMute,
    setMuted,
    setSolo,
    setVolume,
    setPan,
    setReverb,
    setInputMonitoring,
    setDelay,
    setCompressor,
    seekTo,
    skipBack,
    setTempo,
    setTimeSignature,
    toggleMetronome,
    toggleCountIn,
    setTrackName,
    clearTrack,
    loadRecordingFromArrayBuffer,
    exportRecordings,
    mixDown,
    splitRegionAtPlayhead,
    deleteRegion,
    duplicateRegion,
    toggleRegionMute,
    setRegionFadeIn,
    setRegionFadeOut,
    moveRegion,
    trimRegionLeft,
    trimRegionRight,
    undo,
    redo,
    startUndoableBatch,
    endUndoableBatch,
  };
}

export type AudioEngine = ReturnType<typeof createAudioEngine>;
