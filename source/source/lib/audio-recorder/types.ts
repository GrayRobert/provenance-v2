/** Input monitoring mode: off, low-latency dry, comfort (wet reverb only), comfortFx (wet reverb + delay only), or full FX (DAW path; may add latency). */
export type InputMonitoringMode = 'off' | 'lowLatency' | 'comfort' | 'comfortFx' | 'fullFx';
/** Legacy mode names from older saved projects; normalize to InputMonitoringMode when loading. */
export type InputMonitoringModeOrLegacy = InputMonitoringMode | 'direct' | 'withEffects';

/**
 * Multi-resolution waveform peak pyramid.
 * Each level stores interleaved [min, max] pairs per bucket so we can
 * render crisp DAW-style spikes at any zoom level without re-scanning raw samples.
 */
export interface WaveformPyramid {
  /** Sample rate of the source AudioBuffer. */
  sampleRate: number;
  /** Total number of raw samples (mono, channel 0). */
  totalSamples: number;
  /** Samples-per-bucket for each level (ascending). Level 0 is the finest. */
  samplesPerBucket: number[];
  /** Peak data for each level. Each Float32Array has length = 2 * ceil(totalSamples / spb). Interleaved [min0, max0, min1, max1, ...]. */
  levels: Float32Array[];
}

/** Single non-overlapping region on a track (position + duration + its own buffer). Trim is non-destructive: we play a window [sourceOffset, sourceOffset + duration] of the buffer. */
export interface AudioRegion {
  id: string;
  startTime: number;
  duration: number;
  /** Start time within the buffer for playback (0 = start of buffer). Enables non-destructive trim: drag left edge back to reveal more. */
  sourceOffset: number;
  audioBuffer: AudioBuffer;
  waveformPyramid: WaveformPyramid | null;
  recordedBlob: Blob | null;
  muted: boolean;
  fadeInSeconds: number;
  fadeOutSeconds: number;
}

/** Single track state (vanilla core). */
export interface TrackState {
  id: number;
  name: string;
  armed: boolean;
  solo: boolean;
  muted: boolean;
  volume: number;
  pan: number;
  /** Send to reverb bus 0–100. */
  reverb: number;
  /** Send to delay bus 0–100. */
  delay: number;
  /** Send to compressor bus 0–100. */
  compressor: number;
  /** Input monitoring: off, lowLatency (dry fast path), comfort (dry + light FX), or fullFx (DAW path; may add latency). Only armed track's mode is used. */
  inputMonitoring: InputMonitoringMode;
  /** Non-overlapping regions sorted by startTime. */
  regions: AudioRegion[];
  isRecording: boolean;
  color: string;
}

/** Full engine state for UI. */
export interface AudioEngineState {
  tracks: TrackState[];
  isPlaying: boolean;
  isRecording: boolean;
  currentTime: number;
  startPosition: number;
  duration: number;
  tempo: number;
  metronomeEnabled: boolean;
  countInEnabled: boolean;
  countInBeats: number;
  isCountingIn: boolean;
  currentCountInBeat: number;
  inputLevel: number;
  /** Selected audio input device ID (null = default). */
  inputDeviceId: string | null;
  /** Index into device's audio tracks (channel) when device exposes multiple inputs. */
  inputChannelIndex: number;
  /** Input gain 0–100 (applied before recording/analyser). */
  inputGain: number;
  /** Selected audio output device ID (null = default). Uses AudioContext.setSinkId when supported. */
  outputDeviceId: string | null;
  /** Delay metronome on playback by this many ms so it aligns with recorded audio (capture latency). */
  latencyCompensationMs: number;
  timeSignature: [number, number];
  /** Master bus level 0–100 (final output). */
  masterLevel: number;
  /** Aux (reverb return) level 0–100. */
  auxLevel: number;
  /** Master bus muted. */
  masterMuted: boolean;
  /** Aux (reverb return) muted. */
  auxMuted: boolean;
  /** Dattorro reverb: pre-delay in ms (0–500). */
  reverbPreDelayMs: number;
  /** Dattorro reverb: bandwidth 0–1. */
  reverbBandwidth: number;
  /** Dattorro reverb: input diffusion 1 (0–1). */
  reverbInputDiffusion1: number;
  /** Dattorro reverb: input diffusion 2 (0–1). */
  reverbInputDiffusion2: number;
  /** Dattorro reverb: decay 0–1. */
  reverbDecay: number;
  /** Dattorro reverb: decay diffusion 1 (0–1). */
  reverbDecayDiffusion1: number;
  /** Dattorro reverb: decay diffusion 2 (0–1). */
  reverbDecayDiffusion2: number;
  /** Dattorro reverb: damping 0–1. */
  reverbDamping: number;
  /** Dattorro reverb: excursion rate 0–2. */
  reverbExcursionRate: number;
  /** Dattorro reverb: excursion depth 0–2. */
  reverbExcursionDepth: number;
  /** Dattorro reverb: wet 0–1. */
  reverbWet: number;
  /** Dattorro reverb: dry 0–1. */
  reverbDry: number;
  /** Delay return level 0–100. */
  delayLevel: number;
  /** Delay return muted. */
  delayMuted: boolean;
  /** Delay time in ms. */
  delayTimeMs: number;
  /** Delay feedback 0–100. */
  delayFeedback: number;
  /** Delay wet 0–100. */
  delayWet: number;
  /** Compressor return level 0–100. */
  compressorLevel: number;
  /** Compressor return muted. */
  compressorMuted: boolean;
  /** Compressor threshold in dB (-100 to 0). */
  compressorThreshold: number;
  /** Compressor knee in dB (0–40). */
  compressorKnee: number;
  /** Compressor ratio (1–20). */
  compressorRatio: number;
  /** Compressor attack in seconds (0–1). */
  compressorAttack: number;
  /** Compressor release in seconds (0–1). */
  compressorRelease: number;
  /** Compressor bypass (true = disabled). */
  compressorEnabled: boolean;
}

/** One exported track for upload (used by adapter). */
export interface ExportRecordingItem {
  trackIndex: number;
  label: string | null;
  durationSeconds: number | null;
  blob: Blob;
  mimeType: string;
}

/** Project data saved with a Track Lab project. */
export interface TrackLabProjectData {
  tempo: number;
  timeSignature: [number, number];
  tracks: Array<{
    trackIndex: number;
    name: string;
    volume: number;
    pan: number;
    reverb: number;
    delay?: number;
    compressor?: number;
    inputMonitoring?: InputMonitoringModeOrLegacy;
    muted: boolean;
    solo: boolean;
  }>;
  /** Master effect return levels and params (for restore). */
  masterEffects?: {
    reverbLevel: number;
    reverbMuted: boolean;
    reverbPreDelayMs?: number;
    reverbBandwidth?: number;
    reverbInputDiffusion1?: number;
    reverbInputDiffusion2?: number;
    reverbDecay?: number;
    reverbDecayDiffusion1?: number;
    reverbDecayDiffusion2?: number;
    reverbDamping?: number;
    reverbExcursionRate?: number;
    reverbExcursionDepth?: number;
    reverbWet?: number;
    reverbDry?: number;
    delayLevel: number;
    delayMuted: boolean;
    delayTimeMs: number;
    delayFeedback: number;
    delayWet: number;
    compressorLevel: number;
    compressorMuted: boolean;
    compressorThreshold: number;
    compressorKnee: number;
    compressorRatio: number;
    compressorAttack: number;
    compressorRelease: number;
    compressorEnabled: boolean;
  };
}

/** Props passed into mountAudioRecorder. */
export interface AudioRecorderProps {
  songId: string;
  /** Plugin theme for overlays (Settings, Latency calibration) – must match modal data-theme. */
  theme?: 'light' | 'dark';
  onSaveRecordings?: (recordings: ExportRecordingItem[]) => void;
  /** Save multitrack project (recordings + settings). projectName is used when creating a new project. */
  onSaveProject?: (recordings: ExportRecordingItem[], projectData: TrackLabProjectData, projectName: string) => void;
  /** Mix down all tracks to stereo and save. */
  onMixDown?: (blob: Blob, durationSeconds: number) => void;
  onClose?: () => void;
  /** Loaded from API for playback; adapter maps backend Recording to this shape. */
  initialRecordings?: Array<{
    id: string;
    recordingId: string;
    trackIndex: number;
    label: string | null;
    durationSeconds: number | null;
    playbackUrl: string;
    mimeType: string;
  }>;
  /** When loading a saved project, apply these settings (tempo, timeSignature, track levels). */
  initialProjectData?: TrackLabProjectData;
  /** Initial project name (for new projects or when editing existing). */
  initialProjectName?: string;
  /** When editing an existing project, its ID (for persisting name changes via API). */
  projectId?: string | null;
  /** Called when user commits project name (Enter or blur). For existing projects, persists via API. */
  onProjectNameChange?: (name: string) => void | Promise<void>;
  /** Get a plugin setting (e.g. for input monitoring tips acknowledged). Used by Track Lab. */
  getPluginSetting?: (key: string) => Promise<unknown>;
  /** Set a plugin setting. Used to persist that user acknowledged input monitoring tips. */
  setPluginSetting?: (key: string, value: unknown) => Promise<void>;
}

/** Instance returned by mountAudioRecorder. */
export interface AudioRecorderInstance {
  updateProps: (props: AudioRecorderProps) => void;
  destroy: () => void;
  getState: () => AudioEngineState;
  /** Tracks that have recorded audio (blob + metadata) for upload. Mixes regions per track when needed. */
  exportRecordings: () => Promise<ExportRecordingItem[]>;
  /** Render all tracks into a stereo WAV blob (offline mix down). */
  mixDown: () => Promise<{ blob: Blob; durationSeconds: number } | null>;
}
