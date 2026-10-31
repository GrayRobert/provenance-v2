/**
 * Audio Engine
 * Handles Tone.js setup with multiple instrument support
 */

import * as Tone from 'tone';
import type { Chord } from './harmonizer';

// ===========================
// INSTRUMENT TYPES
// ===========================

export type InstrumentId = 
  | 'grand-piano'
  | 'electric-piano'
  | 'felted-piano'
  | 'acoustic-guitar';

export interface InstrumentConfig {
  id: InstrumentId;
  name: string;
  icon: string;
  type: 'sampler' | 'synth';
}

export const INSTRUMENTS: InstrumentConfig[] = [
  { id: 'grand-piano', name: 'Grand Piano', icon: '🎹', type: 'sampler' },
  { id: 'felted-piano', name: 'Upright Piano', icon: '🎹', type: 'sampler' },
  { id: 'electric-piano', name: 'Rhodes EP', icon: '🎸', type: 'sampler' },
  { id: 'acoustic-guitar', name: 'Acoustic Guitar', icon: '🎸', type: 'sampler' },
];

// ===========================
// AUDIO ENGINE STATE
// ===========================

let isInitialized = false;
let currentInstrumentId: InstrumentId = 'grand-piano';
let instrument: Tone.Sampler | Tone.PolySynth | null = null;
let reverb: Tone.Reverb | null = null;
let compressor: Tone.Compressor | null = null;
let currentNotes: string[] = [];
let isLoading = false;
let humaniseEnabled = true;  // Strum-like timing variation between notes

/** Master gain and meter so all output (instrument + metronome) can be metered. */
let masterGain: Tone.Gain | null = null;
let outputMeter: Tone.Meter | null = null;

// Promise that resolves when initialization completes
let initPromise: Promise<void> | null = null;

// Callback for loading state changes
let onLoadingChange: ((loading: boolean) => void) | null = null;

// ===========================
// MIDI TO NOTE NAME
// ===========================

function midiToNoteName(midi: number): string {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midi / 12) - 1;
  const note = noteNames[midi % 12];
  return `${note}${octave}`;
}

/** Shift a note name up one octave (e.g. C4 -> C5). Used so samples recorded an octave high play at correct pitch. */
function noteUpOneOctave(note: string): string {
  const match = note.match(/^([A-G]#?)(-?\d+)$/);
  if (!match) return note;
  const octave = parseInt(match[2], 10) + 1;
  return `${match[1]}${octave}`;
}

// ===========================
// SAMPLER CONFIGURATIONS
// ===========================

/** Grand piano: local samples from public/salamander/ (run: node scripts/fetch-salamander-piano.js) */
const SALAMANDER_SAMPLES = {
  baseUrl: '/salamander/',
  urls: {
    'A0': 'A0.mp3', 'C1': 'C1.mp3', 'D#1': 'Ds1.mp3', 'F#1': 'Fs1.mp3',
    'A1': 'A1.mp3', 'C2': 'C2.mp3', 'D#2': 'Ds2.mp3', 'F#2': 'Fs2.mp3',
    'A2': 'A2.mp3', 'C3': 'C3.mp3', 'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3',
    'A3': 'A3.mp3', 'C4': 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3',
    'A4': 'A4.mp3', 'C5': 'C5.mp3', 'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3',
    'A5': 'A5.mp3', 'C6': 'C6.mp3', 'D#6': 'Ds6.mp3', 'F#6': 'Fs6.mp3',
    'A6': 'A6.mp3', 'C7': 'C7.mp3', 'D#7': 'Ds7.mp3', 'F#7': 'Fs7.mp3',
    'A7': 'A7.mp3', 'C8': 'C8.mp3',
  },
};

/**
 * Felted piano: local samples from public/felt-piano/ (run scripts/convert-felt-piano.mjs to generate MP3s).
 * Samples are declared one octave higher so playback matches grand piano pitch (samples were recorded an octave high).
 */
const FELTED_PIANO_SAMPLES = {
  baseUrl: '/felt-piano/',
  urls: (() => {
    const raw: Record<string, string> = {
      'C0': 'C0.mp3', 'G0': 'G0.mp3', 'A1': 'A1.mp3', 'D1': 'D1.mp3',
      'E2': 'E2.mp3', 'B2': 'B2.mp3', 'F#3': 'Fs3.mp3', 'C#4': 'Cs4.mp3',
      'D#5': 'Ds5.mp3', 'A#5': 'As5.mp3', 'F6': 'F6.mp3',
    };
    return Object.fromEntries(
      Object.entries(raw).map(([note, file]) => [noteUpOneOctave(note), file])
    );
  })(),
};

/** Rhodes EP: local samples from public/rhodes/ (run: node scripts/convert-samples.mjs rhodes). */
const RHODES_NOTE_NAMES = [
  'A#0', 'A#1', 'A#2', 'A#3', 'A#4', 'A#5', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5',
  'B0', 'B1', 'B2', 'B3', 'B4', 'B5', 'C#1', 'C#2', 'C#3', 'C#4', 'C#5', 'C#6',
  'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'D#1', 'D#2', 'D#3', 'D#4', 'D#5', 'D#6',
  'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'E0', 'E1', 'E2', 'E3', 'E4', 'E5', 'E6',
  'F#0', 'F#1', 'F#2', 'F#3', 'F#4', 'F#5', 'F0', 'F1', 'F2', 'F3', 'F4', 'F5',
  'G#0', 'G#1', 'G#2', 'G#3', 'G#4', 'G#5', 'G0', 'G1', 'G2', 'G3', 'G4', 'G5',
];
/** Rhodes samples declared one octave higher so playback matches grand piano pitch. */
const RHODES_SAMPLES = {
  baseUrl: '/rhodes/',
  urls: Object.fromEntries(
    RHODES_NOTE_NAMES.map((note) => [
      noteUpOneOctave(note),
      `${note.replace(/#/g, 's')}.mp3`,
    ])
  ),
};

/** Acoustic guitar: local samples from public/acc-guitar/ (run: node scripts/convert-samples.mjs acc-guitar). Uses 102 velocity layer. */
const ACOUSTIC_GUITAR_NOTE_NAMES = [
  'A#1', 'A#2', 'A#3', 'A#4', 'A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4',
  'C#2', 'C#3', 'C#4', 'C2', 'C3', 'C4', 'C5', 'D#2', 'D#3', 'D#4', 'D2', 'D3', 'D4',
  'E1', 'E2', 'E3', 'E4', 'F#1', 'F#2', 'F#3', 'F#4', 'F1', 'F2', 'F3', 'F4',
  'G#1', 'G#2', 'G#3', 'G#4', 'G1', 'G2', 'G3', 'G4',
];
/** Acoustic guitar samples declared one octave higher so playback matches grand piano pitch. */
const ACOUSTIC_GUITAR_SAMPLES = {
  baseUrl: '/acc-guitar/',
  urls: Object.fromEntries(
    ACOUSTIC_GUITAR_NOTE_NAMES.map((note) => [
      noteUpOneOctave(note),
      `${note.replace(/#/g, 's')}.mp3`,
    ])
  ),
};

// ===========================
// INSTRUMENT CREATORS
// ===========================

/**
 * Grand piano: Salamander samples from public/salamander/ (MP3s from fetch-salamander-piano.js).
 */
async function createGrandPiano(): Promise<Tone.Sampler> {
  const sampler = new Tone.Sampler({
    urls: SALAMANDER_SAMPLES.urls,
    baseUrl: SALAMANDER_SAMPLES.baseUrl,
    release: 1.5,
    volume: -6,
  });
  await Tone.loaded();
  return sampler;
}

/**
 * Felted piano: local sampled piano from public/felt-piano/ (MP3s from convert-felt-piano.mjs).
 * -3 dB compensation so it matches perceived level of other instruments.
 */
async function createFeltedPiano(): Promise<Tone.Sampler> {
  const sampler = new Tone.Sampler({
    urls: FELTED_PIANO_SAMPLES.urls,
    baseUrl: FELTED_PIANO_SAMPLES.baseUrl,
    release: 1.8,
    volume: -3,
  });
  await Tone.loaded();
  return sampler;
}

/**
 * Rhodes EP: sampled Rhodes from public/rhodes/ (MP3s from convert-samples.mjs rhodes).
 */
async function createRhodes(): Promise<Tone.Sampler> {
  const sampler = new Tone.Sampler({
    urls: RHODES_SAMPLES.urls,
    baseUrl: RHODES_SAMPLES.baseUrl,
    release: 1.2,
    volume: -3,
  });
  await Tone.loaded();
  return sampler;
}

/**
 * Acoustic guitar: sampled guitar from public/acc-guitar/ (MP3s from convert-samples.mjs acc-guitar).
 * -10 dB compensation so it matches perceived level of other instruments.
 */
async function createAcousticGuitar(): Promise<Tone.Sampler> {
  const sampler = new Tone.Sampler({
    urls: ACOUSTIC_GUITAR_SAMPLES.urls,
    baseUrl: ACOUSTIC_GUITAR_SAMPLES.baseUrl,
    release: 1.5,
    volume: -13,
  });
  await Tone.loaded();
  return sampler;
}

// ===========================
// INITIALIZATION
// ===========================

/**
 * Initialize the audio engine
 * Must be called after a user interaction (click/tap) due to browser audio policies
 */
export async function initAudio(instrumentId: InstrumentId = 'grand-piano'): Promise<void> {
  // Return existing promise if already initializing
  if (initPromise) return initPromise;
  if (isInitialized) return;
  
  // Create and store the init promise
  initPromise = (async () => {
    // Start the audio context
    await Tone.start();
    await applyStoredOutputDevice();

    // Create effects chain
    compressor = new Tone.Compressor({
      threshold: -15,
      ratio: 3,
      attack: 0.01,
      release: 0.2,
    });
    
    reverb = new Tone.Reverb({
      decay: 2.5,
      wet: 0.25,
      preDelay: 0.01,
    });
    await reverb.generate();
    
    // Load the initial instrument
    await loadInstrument(instrumentId);
    
    isInitialized = true;
    console.log(`🎹 Audio engine initialized with ${instrumentId}`);
  })();
  
  return initPromise;
}

/**
 * Wait for audio to be ready (use before first playChord)
 */
export async function ensureAudioReady(): Promise<void> {
  if (initPromise) await initPromise;
}

// ===========================
// MASTER OUTPUT & METER
// ===========================

/**
 * Create master gain and meter so all output (instrument + metronome) can be metered.
 * Master gain feeds both Destination and Meter.
 */
function ensureMasterChain(): Tone.Gain {
  if (masterGain) return masterGain;
  masterGain = new Tone.Gain(1);
  outputMeter = new Tone.Meter({ smoothing: 0.8, channelCount: 2 });
  masterGain.connect(Tone.Destination);
  masterGain.connect(outputMeter);
  return masterGain;
}

/**
 * Get the master input node. All audio (instrument and metronome) should connect here
 * so the output meter sees the combined level.
 */
export function getMasterInput(): Tone.Gain {
  return ensureMasterChain();
}

/**
 * Get current output level in dB for the output meter modal.
 * Returns a single number (max of L/R if stereo), or -100 if no meter.
 */
export function getMeterLevel(): number {
  const [l, r] = getMeterLevelStereo();
  return Math.max(l, r);
}

/**
 * Get current output level in dB per channel for the output meter modal (stereo).
 * Returns [L, R]; each value -100 if no meter. Range for display: -40 to +4 dB.
 */
export function getMeterLevelStereo(): [number, number] {
  if (!outputMeter) return [-100, -100];
  const v = outputMeter.getValue();
  if (Array.isArray(v)) {
    const l = v[0] ?? -100;
    const r = v[1] ?? -100;
    return [l, r];
  }
  return [v, v];
}

/**
 * Load a specific instrument
 */
async function loadInstrument(instrumentId: InstrumentId): Promise<void> {
  setLoading(true);
  
  // Dispose of current instrument if exists
  if (instrument) {
    releaseAll();
    instrument.disconnect();
    instrument.dispose();
    instrument = null;
  }
  
  // Create new instrument based on type
  switch (instrumentId) {
    case 'grand-piano':
      instrument = await createGrandPiano();
      break;
    case 'felted-piano':
      instrument = await createFeltedPiano();
      break;
    case 'electric-piano':
      instrument = await createRhodes();
      break;
    case 'acoustic-guitar':
      instrument = await createAcousticGuitar();
      break;
  }
  
  // Connect to effects chain (through master so output can be metered)
  if (instrument && reverb && compressor) {
    instrument.chain(reverb, compressor, getMasterInput());
  }
  
  currentInstrumentId = instrumentId;
  setLoading(false);
  
  console.log(`🎵 Loaded instrument: ${instrumentId}`);
}

/**
 * Switch to a different instrument
 */
export async function setInstrument(instrumentId: InstrumentId): Promise<void> {
  if (!isInitialized) {
    console.warn('Audio not initialized yet');
    return;
  }
  
  if (instrumentId === currentInstrumentId) return;
  
  await loadInstrument(instrumentId);
}

/**
 * Get current instrument ID
 */
export function getCurrentInstrument(): InstrumentId {
  return currentInstrumentId;
}

/**
 * Check if audio is ready
 */
export function isAudioReady(): boolean {
  return isInitialized && !isLoading;
}

/**
 * Check if currently loading
 */
export function isAudioLoading(): boolean {
  return isLoading;
}

/**
 * Set loading state callback
 */
export function setLoadingCallback(callback: (loading: boolean) => void): void {
  onLoadingChange = callback;
}

/**
 * Enable or disable humanise mode (strum-like timing variation)
 */
export function setHumanise(enabled: boolean): void {
  humaniseEnabled = enabled;
}

/**
 * Get current humanise mode
 */
export function getHumanise(): boolean {
  return humaniseEnabled;
}

function setLoading(loading: boolean): void {
  isLoading = loading;
  if (onLoadingChange) {
    onLoadingChange(loading);
  }
}

// ===========================
// PLAYBACK
// ===========================

/**
 * Play a chord
 * @param startTime - Optional Web Audio time to start; when omitted (e.g. user click), uses Tone.now()
 */
export async function playChord(chord: Chord, velocity = 0.8, startTime?: number): Promise<void> {
  // Resume context if suspended (required on iOS; must run in same user gesture as play)
  await resumeAudio();
  // Wait for audio to be ready if initialization is in progress
  if (initPromise && !isInitialized) {
    await initPromise;
  }

  if (!instrument || !isInitialized || isLoading) {
    console.warn('Audio not ready');
    return;
  }
  
  // Release any currently playing notes
  releaseAll();
  
  // Convert MIDI notes to note names
  const notes = chord.midiNotes.map(midi => midiToNoteName(midi));
  
  const start = startTime ?? Tone.now();
  
  if (humaniseEnabled) {
    // Humanise mode: strum-like progressive delay from bass to treble
    // Creates a natural "rolled chord" feel like a pianist would play
    notes.forEach((note, index) => {
      // Progressive delay: each subsequent note is delayed slightly more
      // Bass note (index 0) plays first, higher notes follow
      // Total spread: ~30-50ms for natural strum feel
      const baseDelay = index * 0.012;  // 12ms between each note
      const randomJitter = Math.random() * 0.008;  // ±8ms random variation
      const humanDelay = baseDelay + randomJitter;
      
      // Slight velocity variation per note (±8%)
      const noteVelocity = velocity * (0.92 + Math.random() * 0.16);
      instrument!.triggerAttack(note, start + humanDelay, noteVelocity);
    });
  } else {
    // Precise mode: all notes play simultaneously
    notes.forEach((note) => {
      instrument!.triggerAttack(note, start, velocity);
    });
  }
  
  currentNotes = notes;
}

/**
 * Play individual notes (for arpeggio or melody)
 * @param startTime - Optional Web Audio time to start; when omitted, uses Tone.now()
 */
export function playNote(midiNote: number, velocity = 0.7, duration = 0.5, startTime?: number): void {
  if (!instrument || !isInitialized || isLoading) return;
  
  const start = startTime ?? Tone.now();
  const noteName = midiToNoteName(midiNote);
  instrument.triggerAttackRelease(noteName, duration, start, velocity);
}

/**
 * Release all currently playing notes
 */
export function releaseAll(): void {
  if (!instrument || currentNotes.length === 0) return;
  
  const now = Tone.now();
  instrument.triggerRelease(currentNotes, now);
  currentNotes = [];
}

/**
 * Release specific chord
 */
export function releaseChord(chord: Chord): void {
  if (!instrument) return;
  
  const notes = chord.midiNotes.map(midi => midiToNoteName(midi));
  const now = Tone.now();
  instrument.triggerRelease(notes, now);
  currentNotes = currentNotes.filter(n => !notes.includes(n));
}

// ===========================
// CONTROLS
// ===========================

/**
 * Set master volume (-60 to 0 dB)
 */
export function setVolume(db: number): void {
  if (!instrument) return;
  instrument.volume.value = Math.max(-40, Math.min(0, db));
}

/**
 * Set reverb amount (0 to 1)
 */
export function setReverbWet(wet: number): void {
  if (!reverb) return;
  reverb.wet.value = Math.max(0, Math.min(1, wet));
}

// ===========================
// CLEANUP
// ===========================

/**
 * Dispose of all audio resources
 */
export function disposeAudio(): void {
  releaseAll();

  if (instrument) {
    instrument.dispose();
    instrument = null;
  }
  if (reverb) {
    reverb.dispose();
    reverb = null;
  }
  if (compressor) {
    compressor.dispose();
    compressor = null;
  }
  if (outputMeter) {
    outputMeter.dispose();
    outputMeter = null;
  }
  if (masterGain) {
    masterGain.dispose();
    masterGain = null;
  }

  isInitialized = false;
}

// ===========================
// UTILITIES
// ===========================

/**
 * Get current audio context state
 */
export function getAudioState(): 'suspended' | 'running' | 'closed' {
  return Tone.context.state as 'suspended' | 'running' | 'closed';
}

/**
 * Resume audio context if suspended
 */
export async function resumeAudio(): Promise<void> {
  if (Tone.context.state === 'suspended') {
    await Tone.context.resume();
  }
}

/**
 * Set the output device for Tone.js (e.g. speaker on iOS).
 * Uses the underlying AudioContext's setSinkId when available.
 */
export async function setOutputDeviceId(deviceId: string | null): Promise<void> {
  const ctx = Tone.context as unknown as AudioContext & { setSinkId?(id: string): Promise<void> };
  if (typeof ctx?.setSinkId !== 'function') return;
  const sinkId = deviceId && deviceId.length > 0 ? deviceId : 'default';
  await ctx.setSinkId(sinkId).catch((e) => console.warn('setSinkId failed', e));
}

/**
 * Apply the app-wide stored output device preference (from plugin settings / localStorage).
 * Call after Tone.start() or when initializing so chord playback uses the chosen device.
 */
export async function applyStoredOutputDevice(): Promise<void> {
  const { getStoredOutputDeviceId } = await import('@/lib/audioOutputDevice');
  const deviceId = await getStoredOutputDeviceId();
  if (deviceId) await setOutputDeviceId(deviceId);
}

/**
 * Wake up the audio context (resume, apply output device, play a short burst).
 * IMPORTANT: This MUST be called directly from a user gesture (click/touchend) on iOS.
 * iOS Safari requires an explicit user interaction to transition an AudioContext
 * from 'suspended' to 'running'.
 *
 * Unlike before, we do NOT request microphone permission here. Chord Explorer only
 * needs playback, not recording. Output device selection may be limited on iOS
 * without mic permission, but we provide an explicit "Turn on device speaker" button instead.
 */
export async function wakeAudioContext(): Promise<void> {
  await resumeAudio();
  await Tone.start();

  await applyStoredOutputDevice();

  // Play a short silent burst to commit iOS to the audio route
  try {
    const ctx = Tone.context as unknown as AudioContext;
    if (typeof ctx.createBuffer !== 'function' || !ctx.destination) return;
    const durationSec = 0.05;
    const numSamples = Math.ceil(ctx.sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, numSamples, ctx.sampleRate);
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < numSamples; i++) ch[i] = (Math.random() * 2 - 1) * 0.05;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
    source.stop(durationSec);
    await new Promise((r) => setTimeout(r, 80));
  } catch {
    /* ignore burst failure; context is still started */
  }
}

/**
 * Attempt to route audio to the device's speaker (instead of earpiece/default).
 * On iOS, this uses setSinkId if available. On devices without speaker selection,
 * this will silently succeed without changing anything.
 */
export async function enableDeviceSpeaker(): Promise<boolean> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const speakerDevice = devices.find(
      (d) => d.kind === 'audiooutput' && d.label.toLowerCase().includes('speaker')
    );
    if (speakerDevice) {
      await setOutputDeviceId(speakerDevice.deviceId);
      const { setStoredOutputDeviceId } = await import('@/lib/audioOutputDevice');
      await setStoredOutputDeviceId(speakerDevice.deviceId);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
