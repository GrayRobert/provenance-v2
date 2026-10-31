/**
 * Chord Progression Playback Engine
 * Uses Tone.js Transport for clock-based timing and scheduling
 */

import * as Tone from 'tone';
import type { TimelineBar, TimelineChord, TimeSignature } from './types/chordProgression';
import { getTimingBeatsPerBar, getSecondsPerBar, getSecondsPerBeat, roundBarFraction } from './types/chordProgression';
import type { Chord } from './harmonizer';
import { playChord, playNote, getMasterInput, resumeAudio } from './audioEngine';
import { compileStyle } from './styleInterpreter';
import { getStyleById } from './styles';
import { getAlwaysSustain } from './chordPalette';
import type { PlaybackContext } from './types/playbackStyle';
import { getScaleById } from './scales';
import type { Scale } from './scales';

// ===========================
// METRONOME TYPES
// ===========================

/** Metronome type id: sub-kick (synth) or sample slug. 0 dB on slider is benchmark; compensation adjusts per type. */
export type MetronomeTypeId = 'sub-kick' | 'thump' | 'wood-1' | 'finger-snap-2';

export interface MetronomeType {
  id: MetronomeTypeId;
  name: string;
  /** Sample URL for one-shot; null = sub-kick synth. */
  sample: string | null;
  /** dB offset from slider (0 dB benchmark): sub-kick +10, thump -5, wood-1 -10, finger-snap-2 -15. */
  compensationDb: number;
}

/** All metronome types. Slider 0 dB is benchmark; compensationDb keeps relative levels correct. */
export const METRONOME_TYPES: MetronomeType[] = [
  { id: 'sub-kick', name: 'Sub-kick', sample: null, compensationDb: 10 },
  { id: 'thump', name: 'Thump', sample: '/metronome/thump.mp3', compensationDb: -5 },
  { id: 'wood-1', name: 'Wood', sample: '/metronome/wood-1.mp3', compensationDb: -10 },
  { id: 'finger-snap-2', name: 'Finger snap', sample: '/metronome/finger-snap-2.mp3', compensationDb: -15 },
];

// ===========================
// STATE
// ===========================

let isInitialized = false;
let isPlaying = false;
let currentBars: TimelineBar[] = [];
let currentBPM = 100;
let currentTimeSignature: TimeSignature = [4, 4];
let metronomeEnabled = true;
/** User's metronome volume in dB (-40 to +15). 0 dB is benchmark; compensation applied per type. */
let metronomeVolumeDb = 0;
/** Current metronome sound type; default = thump. */
let currentMetronomeType: MetronomeTypeId = 'thump';
let currentStyleId = 'block'; // Default to Block Chords
/** Key + scale for scaleNote/passing; nextChord is added per slot when scheduling. */
let playbackContext: { keyRoot: string; scale: Scale } | null = null;

// Scheduled events (for cleanup)
let chordSchedules: number[] = [];
let metronomeSchedule: number | null = null;
let beatCallbackSchedule: number | null = null;
let endScheduleId: number | null = null;

// Callbacks
let onBeatCallback: ((beat: number, bar: number) => void) | null = null;
let onBarChangeCallback: ((bar: number) => void) | null = null;
let onEndCallback: (() => void) | null = null;
let onChordPlayCallback: ((chord: Chord) => void) | null = null;

// Metronome - sub-kick synth
let metronomeSynth: {
  osc: Tone.Oscillator;
  noise: Tone.Noise;
  filter: Tone.Filter;
  envelope: Tone.AmplitudeEnvelope;
  output: Tone.Volume;
  gain: Tone.Gain;
  started: boolean;
} | null = null;

// Metronome - one-shot sample players (cached by type id)
const samplePlayers: Map<MetronomeTypeId, Tone.Player> = new Map();
let sampleVolumeNode: Tone.Volume | null = null;

// Shared metronome reverb (synced to instrument verb slider)
let metronomeReverb: Tone.Reverb | null = null;
let metronomeMergeGain: Tone.Gain | null = null;
/** Stored reverb wet (0–1) for when engine initializes after slider is set. */
let metronomeReverbWet = 0.25;

// ===========================
// INITIALIZATION
// ===========================

function getCompensationDb(typeId: MetronomeTypeId): number {
  const t = METRONOME_TYPES.find((x) => x.id === typeId);
  return t?.compensationDb ?? 0;
}

/**
 * Initialize the progression engine
 */
export async function initProgressionEngine(): Promise<void> {
  if (isInitialized) return;

  // Ensure audio context is started
  await Tone.start();

  // Shared reverb for all metronome sounds (wet synced to instrument verb slider)
  metronomeMergeGain = new Tone.Gain(1);
  metronomeReverb = new Tone.Reverb({
    decay: 2.5,
    wet: metronomeReverbWet,
  });
  await metronomeReverb.generate();
  metronomeMergeGain.connect(metronomeReverb);
  metronomeReverb.connect(getMasterInput());

  const effectiveDb = metronomeVolumeDb + getCompensationDb(currentMetronomeType);

  // Sub-kick synth: osc + noise -> filter -> envelope -> gain -> volume -> merge (into shared reverb)
  const osc = new Tone.Oscillator({
    type: 'sine',
    frequency: 60,
  });
  const noise = new Tone.Noise({
    type: 'brown',
    volume: -24,
  });
  const filter = new Tone.Filter({
    type: 'lowpass',
    frequency: 150,
    Q: 0.5,
  });
  const envelope = new Tone.AmplitudeEnvelope({
    attack: 0.012,
    decay: 0.12,
    sustain: 0.0,
    release: 0.08,
  });
  const gain = new Tone.Gain(0.3);
  const volume = new Tone.Volume(effectiveDb);
  osc.connect(filter);
  noise.connect(filter);
  filter.connect(envelope);
  envelope.connect(gain);
  gain.connect(volume);
  volume.connect(metronomeMergeGain);

  metronomeSynth = {
    osc,
    noise,
    filter,
    envelope,
    gain,
    output: volume,
    started: false,
  };

  isInitialized = true;
}

/**
 * Ensure engine is initialized
 */
async function ensureInitialized(): Promise<void> {
  if (!isInitialized) {
    await initProgressionEngine();
  }
}

// ===========================
// METRONOME
// ===========================

function applyMetronomeVolume(): void {
  const db = metronomeVolumeDb + getCompensationDb(currentMetronomeType);
  if (metronomeSynth) metronomeSynth.output.volume.value = db;
  if (sampleVolumeNode) sampleVolumeNode.volume.value = db;
}

function ensureSampleVolumeNode(): Tone.Volume {
  if (sampleVolumeNode) return sampleVolumeNode;
  const db = metronomeVolumeDb + getCompensationDb(currentMetronomeType);
  sampleVolumeNode = new Tone.Volume(db);
  sampleVolumeNode.connect(metronomeMergeGain!);
  return sampleVolumeNode;
}

async function getOrCreateSamplePlayer(typeId: MetronomeTypeId): Promise<Tone.Player | null> {
  const existing = samplePlayers.get(typeId);
  if (existing) return existing;
  const type = METRONOME_TYPES.find((t) => t.id === typeId);
  if (!type?.sample) return null;
  const volumeNode = ensureSampleVolumeNode();
  const player = new Tone.Player({
    url: type.sample,
    volume: 0,
  }).connect(volumeNode);
  try {
    await player.load(type.sample);
    samplePlayers.set(typeId, player);
    return player;
  } catch (err) {
    console.warn(`Metronome sample load failed (${typeId}):`, err);
    player.dispose();
    return null;
  }
}

/** Play sub-kick synth only. */
function playSubKick(beat: number, startTime?: number): void {
  if (!metronomeSynth) return;
  try {
    if (!metronomeSynth.started) {
      metronomeSynth.osc.start();
      metronomeSynth.noise.start();
      metronomeSynth.started = true;
    }
    const isBeatOne = beat === 0;
    metronomeSynth.osc.frequency.value = isBeatOne ? 70 : 60;
    if (startTime !== undefined) {
      metronomeSynth.envelope.triggerAttackRelease(0.08, startTime);
    } else {
      metronomeSynth.envelope.triggerAttackRelease(0.08);
    }
  } catch (err) {
    console.warn('Metronome click error:', err);
  }
}

/**
 * Play metronome click - sub-kick synth or one-shot sample.
 * @param startTime - Optional Web Audio time to trigger; when omitted, uses "now"
 */
function playMetronomeClick(beat: number, beatsPerBar: number, startTime?: number): void {
  if (!metronomeEnabled) return;
  const time = startTime ?? Tone.now();
  if (currentMetronomeType === 'sub-kick') {
    playSubKick(beat, startTime);
    return;
  }
  getOrCreateSamplePlayer(currentMetronomeType).then((player) => {
    if (player) player.start(time);
  });
}

export function setMetronomeType(typeId: MetronomeTypeId): void {
  currentMetronomeType = typeId;
  applyMetronomeVolume();
}

export function getMetronomeType(): MetronomeTypeId {
  return currentMetronomeType;
}

// ===========================
// PLAYBACK
// ===========================

/**
 * Calculate the absolute time for a chord trigger.
 * position is 0–1 (fraction of bar). 6/8 uses 2 timing beats per bar.
 * Rounds position to avoid floating-point drift when looping.
 */
function calculateChordTime(
  barIndex: number,
  position: number,
  bpm: number,
  timeSignature: TimeSignature
): number {
  const secondsPerBar = getSecondsPerBar(timeSignature, bpm);
  const safePosition = roundBarFraction(position);
  return barIndex * secondsPerBar + safePosition * secondsPerBar;
}

/**
 * Schedule a chord to play at a specific time using the current style
 * @param nextChordStartTime - Absolute time (s) when the next chord starts; used for legato/sustain when sustain is on
 * @param context - Optional context (keyRoot, scale, nextChord) for scaleNote and passing tones
 */
function scheduleChord(
  chord: Chord,
  barIndex: number,
  position: number,
  duration: number,
  bpm: number,
  timeSignature: TimeSignature,
  nextChordStartTime: number,
  context?: PlaybackContext
): void {
  const style = getStyleById(currentStyleId);
  if (!style) {
    const chordTime = calculateChordTime(barIndex, position, bpm, timeSignature);
    const scheduleId = Tone.Transport.schedule((time) => {
      playChord(chord, 0.8, time);
      if (onChordPlayCallback) {
        onChordPlayCallback(chord);
      }
    }, chordTime);
    chordSchedules.push(scheduleId);
    return;
  }

  const noteEvents = compileStyle(
    chord,
    style,
    barIndex,
    position,
    duration,
    timeSignature,
    bpm,
    context
  );

  const sustain = getAlwaysSustain();

  // Schedule each note event
  for (const event of noteEvents) {
    const scheduleId = Tone.Transport.schedule((time) => {
      // When sustain is on and style says legato (undefined duration), hold until next chord
      let noteDuration: number;
      if (sustain && event.duration === undefined) {
        noteDuration = Math.max(0.01, nextChordStartTime - event.time);
      } else {
        noteDuration = event.duration ?? 0.5;
      }
      playNote(event.midiNote, event.velocity, noteDuration, time);

      // Notify callback on first note of chord (for piano roll highlighting)
      if (event === noteEvents[0] && onChordPlayCallback) {
        onChordPlayCallback(chord);
      }
    }, event.time);

    chordSchedules.push(scheduleId);
  }
}

/**
 * Start playback of the progression
 * @param playbackContextOpt - Optional { keyRoot, scaleId } for scaleNote/passing (e.g. from songKey)
 * @param startTime - Optional start time in seconds (e.g. from selected chord); Transport starts at this position
 */
export async function startPlayback(
  bars: TimelineBar[],
  bpm: number,
  timeSignature: TimeSignature,
  enableMetronome: boolean,
  loop = true,
  playbackContextOpt?: { keyRoot: string; scaleId: string },
  startTime?: number
): Promise<void> {
  await ensureInitialized();

  if (isPlaying) {
    stopPlayback();
  }

  if (bars.length === 0) {
    return;
  }

  currentBars = bars;
  currentBPM = bpm;
  currentTimeSignature = timeSignature;
  metronomeEnabled = enableMetronome;

  // Preload current metronome sample so first beat plays on time
  if (metronomeEnabled && currentMetronomeType !== 'sub-kick') {
    await getOrCreateSamplePlayer(currentMetronomeType);
  }

  if (playbackContextOpt) {
    const scale = getScaleById(playbackContextOpt.scaleId);
    playbackContext = scale
      ? { keyRoot: playbackContextOpt.keyRoot, scale }
      : null;
  }
  // Else leave playbackContext unchanged (e.g. restart on style change reuses key/scale)

  const timingBeatsPerBar = getTimingBeatsPerBar(timeSignature);
  const secondsPerBeat = getSecondsPerBeat(timeSignature, bpm);
  const secondsPerBar = getSecondsPerBar(timeSignature, bpm);
  const totalDuration = bars.length * secondsPerBar;

  Tone.Transport.bpm.value = bpm;

  chordSchedules = [];

  const slots: { chord: Chord; barIndex: number; position: number; duration: number; startTime: number }[] = [];
  bars.forEach((bar, barIndex) => {
    bar.chords.forEach((tc) => {
      const startTime = calculateChordTime(barIndex, tc.position, bpm, timeSignature);
      slots.push({
        chord: tc.chord,
        barIndex,
        position: tc.position,
        duration: tc.duration,
        startTime,
      });
    });
  });

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const nextChordStartTime = i + 1 < slots.length ? slots[i + 1].startTime : totalDuration;
    const context: PlaybackContext | undefined = playbackContext
      ? { ...playbackContext, nextChord: slots[i + 1]?.chord ?? null }
      : undefined;
    scheduleChord(
      slot.chord,
      slot.barIndex,
      slot.position,
      slot.duration,
      bpm,
      timeSignature,
      nextChordStartTime,
      context
    );
  }

  // Schedule metronome and beat callbacks
  if (metronomeEnabled) {
    metronomeSchedule = Tone.Transport.scheduleRepeat(
      (time) => {
        const transportTime = Tone.Transport.seconds;
        const beatInProgression = Math.floor(transportTime / secondsPerBeat);
        const beatInBar = beatInProgression % timingBeatsPerBar;
        const barIndex = Math.floor(beatInProgression / timingBeatsPerBar) % bars.length;

        playMetronomeClick(beatInBar, timingBeatsPerBar, time);

        // Trigger beat callback
        if (onBeatCallback) {
          onBeatCallback(beatInBar, barIndex);
        }
      },
      secondsPerBeat,
      0,
      totalDuration
    );
  } else {
    // Schedule beat callbacks without metronome
    beatCallbackSchedule = Tone.Transport.scheduleRepeat(
      (time) => {
        const transportTime = Tone.Transport.seconds;
        const beatInProgression = Math.floor(transportTime / secondsPerBeat);
        const beatInBar = beatInProgression % timingBeatsPerBar;
        const barIndex = Math.floor(beatInProgression / timingBeatsPerBar) % bars.length;

        if (onBeatCallback) {
          onBeatCallback(beatInBar, barIndex);
        }
      },
      secondsPerBeat,
      0,
      totalDuration
    );
  }

  Tone.Transport.loopStart = 0;
  Tone.Transport.loopEnd = totalDuration;
  Tone.Transport.loop = loop;

  if (!loop && onEndCallback) {
    endScheduleId = Tone.Transport.scheduleOnce(
      () => {
        endScheduleId = null;
        Tone.Transport.stop();
        Tone.Transport.cancel();
        chordSchedules.forEach(id => Tone.Transport.clear(id));
        chordSchedules = [];
        if (metronomeSchedule !== null) {
          Tone.Transport.clear(metronomeSchedule);
          metronomeSchedule = null;
        }
        if (beatCallbackSchedule !== null) {
          Tone.Transport.clear(beatCallbackSchedule);
          beatCallbackSchedule = null;
        }
        isPlaying = false;
        onEndCallback?.();
      },
      totalDuration
    );
  }

  await resumeAudio();
  await Tone.start();
  // Start from selected chord/section: use Transport.start(when, offset) so the clock's tick counter begins at offset.
  if (startTime != null && startTime > 0) {
    Tone.Transport.start(undefined, startTime);
  } else {
    Tone.Transport.start();
  }

  isPlaying = true;
}

/**
 * Stop playback
 */
export function stopPlayback(): void {
  if (!isPlaying) return;

  Tone.Transport.stop();
  Tone.Transport.cancel();

  // Clear all schedules
  chordSchedules.forEach(id => Tone.Transport.clear(id));
  chordSchedules = [];

  if (metronomeSchedule !== null) {
    Tone.Transport.clear(metronomeSchedule);
    metronomeSchedule = null;
  }

  if (beatCallbackSchedule !== null) {
    Tone.Transport.clear(beatCallbackSchedule);
    beatCallbackSchedule = null;
  }

  if (endScheduleId !== null) {
    Tone.Transport.clear(endScheduleId);
    endScheduleId = null;
  }

  isPlaying = false;
}

/**
 * Cleanup metronome resources
 */
export function disposeProgressionEngine(): void {
  if (metronomeSynth) {
    metronomeSynth.osc.stop();
    metronomeSynth.osc.dispose();
    metronomeSynth.noise.stop();
    metronomeSynth.noise.dispose();
    metronomeSynth.filter.dispose();
    metronomeSynth.envelope.dispose();
    metronomeSynth.gain.dispose();
    metronomeSynth.output.dispose();
    metronomeSynth = null;
  }
  samplePlayers.forEach((player) => player.dispose());
  samplePlayers.clear();
  if (sampleVolumeNode) {
    sampleVolumeNode.dispose();
    sampleVolumeNode = null;
  }
  if (metronomeReverb) {
    metronomeReverb.dispose();
    metronomeReverb = null;
  }
  if (metronomeMergeGain) {
    metronomeMergeGain.dispose();
    metronomeMergeGain = null;
  }
  stopPlayback();
  isInitialized = false;
}

/**
 * Update tempo during playback
 */
export function updateTempo(bpm: number): void {
  currentBPM = bpm;
  Tone.Transport.bpm.value = bpm;
}

/**
 * Update metronome state
 */
export function setMetronomeEnabled(enabled: boolean): void {
  metronomeEnabled = enabled;
  // If playing, we'd need to reschedule, but for simplicity, 
  // we'll just let it update on next start
}

/**
 * Set metronome volume in dB (-40 to +15). 0 dB is benchmark; compensation per type keeps relative levels.
 */
export function setMetronomeVolume(volumeDb: number): void {
  metronomeVolumeDb = volumeDb;
  applyMetronomeVolume();
}

/**
 * Set metronome reverb wet (0–1), synced to instrument verb slider.
 */
export function setMetronomeReverbWet(wet: number): void {
  metronomeReverbWet = Math.max(0, Math.min(1, wet));
  if (metronomeReverb) {
    metronomeReverb.wet.value = metronomeReverbWet;
  }
}

// ===========================
// CALLBACKS
// ===========================

/**
 * Set callback for beat updates (for playhead animation)
 */
export function onBeat(callback: (beat: number, bar: number) => void): void {
  onBeatCallback = callback;
}

/**
 * Set callback for bar changes
 */
export function onBarChange(callback: (bar: number) => void): void {
  onBarChangeCallback = callback;
}

/**
 * Set callback when playback reaches end (loop disabled only)
 */
export function onEnd(callback: () => void): void {
  onEndCallback = callback;
}

/**
 * Set callback when a chord is played during progression playback
 */
export function onChordPlay(callback: (chord: Chord) => void): void {
  onChordPlayCallback = callback;
}

/**
 * Get current playback state
 */
export function getIsPlaying(): boolean {
  return isPlaying;
}

/**
 * Set the playback style
 */
export function setPlaybackStyle(styleId: string): void {
  const style = getStyleById(styleId);
  if (!style) {
    console.warn(`Style not found: ${styleId}`);
    return;
  }

  currentStyleId = styleId;

  // If currently playing, restart playback with new style
  if (isPlaying) {
    const wasPlaying = isPlaying;
    const bars = currentBars;
    const bpm = currentBPM;
    const timeSig = currentTimeSignature;
    const metronome = metronomeEnabled;
    
    stopPlayback();
    
    // Restart with new style
    setTimeout(() => {
      startPlayback(bars, bpm, timeSig, metronome, true).catch(err => {
        console.error('Error restarting playback with new style:', err);
      });
    }, 50);
  }
}

/**
 * Get current playback style ID
 */
export function getPlaybackStyle(): string {
  return currentStyleId;
}
