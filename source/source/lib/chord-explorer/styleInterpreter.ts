/**
 * Style Pattern Interpreter
 *
 * Compiles style definitions into note events for playback. Meter-aware:
 * - Steps: use pattern.stepsByMeter['4/4'|'3/4'|'6/8'] when present so 3/4 and 6/8
 *   have correct grids (e.g. 3 beats, 6 pulses) instead of 4/4-centric offsets.
 * - Groove/swing: 4/4 and 3/4 use eighth-note swing; 6/8 does not (avoids corrupting
 *   the pulse). Optional triplet feel for 6/8.
 * - Accents: meter-specific velocity multipliers (waltz strong-medium-weak, 6/8 pulse 0 & 3).
 * - Humanisation and push (feel) supported via style.feel.
 */

import type { Chord } from './harmonizer';
import { CHORD_TYPES, noteToMidi } from './harmonizer';
import type { TimeSignature } from './types/chordProgression';
import {
  getSecondsPerBar,
  getSecondsPerBeat,
  getTimingBeatsPerBar,
  getMeterKey,
  getPulsesPerBar,
  roundBarFraction,
} from './types/chordProgression';
import type {
  Style,
  StyleOverrides,
  Layer,
  Choice,
  Action,
  VoicingPolicy,
  Articulation,
  NoteEvent,
  Feel,
  PlaybackContext
} from './types/playbackStyle';
import { getNoteAtInterval, shouldPreferFlats } from './scales';
import type { Scale } from './scales';

/**
 * Compile a style into note events for a given chord
 *
 * @param context - Optional playback context (keyRoot, scale, nextChord) for scaleNote and passing.
 */
export function compileStyle(
  chord: Chord,
  style: Style,
  barIndex: number,
  sliceStart: number,
  sliceDuration: number,
  timeSignature: TimeSignature,
  bpm: number,
  context?: PlaybackContext
): NoteEvent[] {
  const noteEvents: NoteEvent[] = [];
  const secondsPerBar = getSecondsPerBar(timeSignature, bpm);
  const secondsPerBeat = getSecondsPerBeat(timeSignature, bpm);
  const barStartTime = barIndex * secondsPerBar;

  for (const layer of style.layers) {
    const layerEvents = compileLayer(
      chord,
      layer,
      barIndex,
      sliceStart,
      sliceDuration,
      timeSignature,
      bpm,
      barStartTime,
      style.feel,
      context,
      style.overrides
    );
    noteEvents.push(...layerEvents);
  }

  // Apply swing/groove (meter-aware: 6/8 uses triplet feel, not eighth-note swing)
  if (style.feel?.swing != null || style.feel?.groove) {
    applyGroove(
      noteEvents,
      timeSignature,
      secondsPerBar,
      secondsPerBeat,
      style.feel.swing ?? 0,
      style.feel.swingMode ?? 'eighth',
      style.feel.groove ?? 'swing'
    );
  }

  // Sort by time to ensure correct playback order
  noteEvents.sort((a, b) => a.time - b.time);

  // Meter-specific velocity accents (multiply, don't replace)
  applyMeterAccents(noteEvents, timeSignature, secondsPerBar, style.feel);

  // Humanisation: small timing and velocity variation
  if (style.feel?.humanise) {
    applyHumanisation(
      noteEvents,
      style.feel.humaniseAmount ?? 0.15
    );
  }

  // Optional push (laid-back vs pushed) - shift timing slightly
  if (style.feel?.push != null && style.feel.push !== 0) {
    applyPush(noteEvents, style.feel.push, secondsPerBeat);
  }

  // Re-sort after timing changes (humanisation, push)
  if (style.feel?.humanise || (style.feel?.push != null && style.feel.push !== 0)) {
    noteEvents.sort((a, b) => a.time - b.time);
  }

  return noteEvents;
}

/**
 * Compile a single layer into note events
 */
function compileLayer(
  chord: Chord,
  layer: Layer,
  _barIndex: number,
  sliceStart: number,
  sliceDuration: number,
  timeSignature: TimeSignature,
  bpm: number,
  barStartTime: number,
  _feel?: Feel,
  context?: PlaybackContext,
  styleOverrides?: StyleOverrides
): NoteEvent[] {
  const noteEvents: NoteEvent[] = [];
  const secondsPerBar = getSecondsPerBar(timeSignature, bpm);
  const secondsPerBeat = getSecondsPerBeat(timeSignature, bpm);

  const pattern = layer.pattern;
  const meterKey = getMeterKey(timeSignature);
  const steps = pattern.stepsByMeter?.[meterKey] ?? pattern.steps;

  const sliceStartTime = barStartTime + sliceStart * secondsPerBar;
  const sliceEndTime = sliceStartTime + sliceDuration * secondsPerBar;
  const sliceDurationSeconds = sliceDuration * secondsPerBar;

  const is68 = timeSignature[0] === 6 && timeSignature[1] === 8;

  for (const step of steps) {
    let stepTime: number;
    let safeOffset = roundBarFraction(step.offset);
    if (is68) {
      safeOffset = Math.round(safeOffset * 6) / 6;
    }

    if (pattern.timingMode === 'absoluteBar') {
      const beatTime = safeOffset * secondsPerBeat;
      stepTime = barStartTime + beatTime;

      if (stepTime < sliceStartTime || stepTime >= sliceEndTime) {
        continue;
      }
    } else {
      stepTime = sliceStartTime + safeOffset * sliceDurationSeconds;

      if (stepTime < sliceStartTime || stepTime >= sliceEndTime) {
        continue;
      }
    }

    const choice = resolveChoice(step.choices);
    if (!choice) continue;

    if (choice.action.type === 'rest') {
      continue;
    }

    const midiNotes = resolveAction(
      chord,
      choice.action,
      layer.voicing,
      layer.role,
      context,
      styleOverrides
    );
    if (midiNotes.length === 0) continue;

    const voicedNotes = applyVoicing(midiNotes, layer.voicing, layer.role);

    for (const midiNote of voicedNotes) {
      const velocity = getVelocity(layer.articulation);
      const duration = getDuration(secondsPerBeat, layer.articulation, timeSignature, secondsPerBar);

      noteEvents.push({
        time: stepTime,
        midiNote,
        velocity,
        duration
      });
    }
  }

  return noteEvents;
}

/**
 * Resolve a weighted choice (deterministic for Phase 1)
 */
function resolveChoice(choices: Choice[]): Choice | null {
  if (choices.length === 0) return null;
  // For Phase 1, just return the first choice
  // Phase 2 will implement weighted random selection
  return choices[0];
}

/** Clamp octave offset to -3..+3 */
const OCTAVE_OFFSET_MIN = -3;
const OCTAVE_OFFSET_MAX = 3;

function clampOctaveOffset(n: number): number {
  return Math.max(OCTAVE_OFFSET_MIN, Math.min(OCTAVE_OFFSET_MAX, n));
}

/**
 * Apply inversion to chord midi notes: rotate chord tones (indices 1+) by inversion steps, keep ascending.
 * chord.midiNotes = [bass, tone1, tone2, ...]. Keeps root in bass.
 */
function applyInversionToMidiNotes(midiNotes: number[], inversion: number): number[] {
  if (midiNotes.length <= 1 || inversion === 0) return [...midiNotes];
  const bass = midiNotes[0];
  const tones = midiNotes.slice(1);
  const n = tones.length;
  const inv = Math.max(0, Math.min(inversion, n - 1));
  const rotated: number[] = [];
  for (let i = 0; i < n; i++) {
    let note = tones[(i + inv) % n];
    while (rotated.length > 0 && note <= rotated[rotated.length - 1]) {
      note += 12;
    }
    rotated.push(note);
  }
  return [bass, ...rotated];
}

/**
 * Apply octave offset to MIDI notes (add 12 * offset to each note).
 */
function applyOctaveOffsetToMidiNotes(midiNotes: number[], octaveOffset: number): number[] {
  if (octaveOffset === 0) return midiNotes;
  const offset = clampOctaveOffset(octaveOffset);
  return midiNotes.map(n => n + 12 * offset);
}

/**
 * Resolve an action to MIDI notes
 */
function resolveAction(
  chord: Chord,
  action: Action,
  _voicingPolicy?: VoicingPolicy,
  _role?: 'chord' | 'bass',
  context?: PlaybackContext,
  styleOverrides?: StyleOverrides
): number[] {
  switch (action.type) {
    case 'chord': {
      let notes: number[];
      const inversion = action.inversion ?? styleOverrides?.inversion?.value ?? 0;
      const octaveOffset = action.octaveOffset ?? styleOverrides?.octaveOffset?.value ?? 0;
      if (action.degrees) {
        notes = resolveChordDegrees(chord, action.degrees);
      } else {
        notes = [...chord.midiNotes];
        if (inversion !== 0) {
          notes = applyInversionToMidiNotes(notes, inversion);
        }
      }
      notes = applyOctaveOffsetToMidiNotes(notes, octaveOffset);
      return notes;
    }

    case 'note':
      return resolveChordDegrees(chord, [action.degree]);

    case 'arpeggio':
      return resolveChordDegrees(chord, action.degrees);

    case 'rest':
      return [];

    case 'scaleNote':
      if (!context?.keyRoot || !context?.scale) return [];
      return resolveScaleDegree(
        context.keyRoot,
        context.scale,
        action.degree,
        2
      );

    case 'passing':
      if (!context?.nextChord) return [];
      return resolvePassing(context.nextChord, action.direction, 2);

    default:
      return [];
  }
}

const BASS_OCTAVE = 2;

/**
 * Resolve scale degree (1–7) to MIDI note in bass octave.
 * Used for walking bass when key/scale context is provided.
 */
function resolveScaleDegree(
  keyRoot: string,
  scale: Scale,
  degree: number,
  octaveBass: number = BASS_OCTAVE
): number[] {
  if (degree < 1 || degree > 7) return [];
  const intervals = scale.intervals;
  const idx = (degree - 1) % intervals.length;
  const semitones = intervals[idx];
  const preferFlats = shouldPreferFlats(keyRoot, scale);
  const noteName = getNoteAtInterval(keyRoot, semitones, preferFlats);
  const midi = noteToMidi(noteName, octaveBass);
  return [midi];
}

/**
 * Resolve passing tone: chromatic approach to next chord root.
 * direction 'below' => one semitone below next root; 'above' => one above.
 */
function resolvePassing(
  nextChord: Chord,
  direction: 'below' | 'above',
  octaveBass: number = BASS_OCTAVE
): number[] {
  const rootName = nextChord.root;
  const rootMidi = noteToMidi(rootName, octaveBass);
  const passing = direction === 'below' ? rootMidi - 1 : rootMidi + 1;
  return [passing];
}

/**
 * Resolve chord degrees to MIDI notes
 * 
 * Degrees map to chord intervals:
 * - Degree 1 = root (interval 0)
 * - Degree 3 = third (interval 1)
 * - Degree 5 = fifth (interval 2)
 * - Degree 7 = seventh (interval 3)
 * - Degree 9 = ninth (interval 4, if present)
 */
function resolveChordDegrees(chord: Chord, degrees: number[]): number[] {
  const chordType = CHORD_TYPES[chord.quality];
  if (!chordType) return [];

  const intervals = chordType.intervals;
  const midiNotes: number[] = [];

  for (const degree of degrees) {
    // Map degree to interval index
    // Degree 1 -> index 0, Degree 3 -> index 1, Degree 5 -> index 2, etc.
    let intervalIndex: number;
    if (degree === 1) intervalIndex = 0;
    else if (degree === 3) intervalIndex = 1;
    else if (degree === 5) intervalIndex = 2;
    else if (degree === 7) intervalIndex = 3;
    else if (degree === 9) intervalIndex = 4;
    else if (degree === 11) intervalIndex = 5;
    else if (degree === 13) intervalIndex = 6;
    else {
      // For other degrees, try to find closest match
      intervalIndex = Math.min(degree - 1, intervals.length - 1);
    }

    // Get the MIDI note at this interval index
    // Note: chord.midiNotes[0] is the bass, chord tones start at index 1
    // So we need to add 1 to the intervalIndex to skip the bass
    const midiIndex = intervalIndex + 1;
    if (midiIndex >= 1 && midiIndex < chord.midiNotes.length) {
      midiNotes.push(chord.midiNotes[midiIndex]);
    }
  }

  return midiNotes;
}

/**
 * Apply voicing policy to MIDI notes
 */
function applyVoicing(
  midiNotes: number[],
  voicingPolicy?: VoicingPolicy,
  role?: 'chord' | 'bass'
): number[] {
  if (!voicingPolicy && !role) {
    return midiNotes;
  }

  let result = [...midiNotes];

  // Apply range constraint
  if (voicingPolicy?.range) {
    const [minOctave, maxOctave] = voicingPolicy.range;
    const minMidi = (minOctave + 1) * 12;
    const maxMidi = (maxOctave + 1) * 12 + 11;

    result = result.map(note => {
      // Find the octave that fits in range
      let adjustedNote = note;
      while (adjustedNote < minMidi) adjustedNote += 12;
      while (adjustedNote > maxMidi) adjustedNote -= 12;
      return adjustedNote;
    });
  }

  // Apply voicing mode
  if (voicingPolicy?.mode) {
    switch (voicingPolicy.mode) {
      case 'shell':
        // Shell voicing: keep only 3rd and 7th (or closest equivalents)
        if (result.length >= 2) {
          // Keep root and highest note, or 3rd and 7th if specified
          result = [result[0], result[result.length - 1]];
        }
        break;

      case 'power':
        // Power chord: keep only root and fifth
        // For power chords, we expect root (index 0) and fifth (index 2 in full chord, but index 1 if only 2 notes)
        if (result.length >= 2) {
          // Keep first (root) and try to get fifth (3rd element) or fall back to 2nd
          const fifth = result.length >= 3 ? result[2] : result[1];
          result = [result[0], fifth];
        }
        break;

      case 'close':
        // Close voicing: keep as is (already close)
        break;

      case 'open':
        // Open voicing: spread notes (simplified - just keep all)
        break;
    }
  }

  // Apply maxNotes constraint
  if (voicingPolicy?.maxNotes && result.length > voicingPolicy.maxNotes) {
    result = result.slice(0, voicingPolicy.maxNotes);
  }

  // For bass role, ensure notes are in lower octave
  if (role === 'bass') {
    result = result.map(note => {
      // Ensure bass notes are below C3 (MIDI 48)
      while (note >= 48) note -= 12;
      return note;
    });
  }

  return result;
}

/**
 * Get velocity from articulation
 */
function getVelocity(articulation?: Articulation): number {
  if (!articulation?.velocity) {
    return 0.8; // Default velocity
  }

  if (typeof articulation.velocity === 'number') {
    return articulation.velocity / 127; // Convert 0-127 to 0-1
  }

  // Velocity range [min, max] - use midpoint for Phase 1
  // Phase 2 will add random variation
  const [min, max] = articulation.velocity;
  return ((min + max) / 2) / 127;
}

/**
 * Get note duration from articulation.
 * For 6/8 when not legato, returns ~0.9 of a triplet (slight gap before next pulse).
 */
function getDuration(
  secondsPerBeat: number,
  articulation?: Articulation,
  timeSignature?: TimeSignature,
  secondsPerBar?: number
): number | undefined {
  const is68 = timeSignature != null && timeSignature[0] === 6 && timeSignature[1] === 8;
  if (is68 && secondsPerBar != null && articulation?.length !== 'legato') {
    return 0.9 * (secondsPerBar / 6);
  }

  if (!articulation) {
    return undefined; // Legato (sustain)
  }

  switch (articulation.length) {
    case 'staccato':
      return secondsPerBeat * 0.25; // Short duration
    case 'tenuto':
      return secondsPerBeat * 0.75; // Medium duration
    case 'legato':
    default:
      return undefined; // Full sustain
  }
}

/**
 * Apply groove (swing / triplet) to note events. Meter-aware:
 * - 4/4 and 3/4: eighth-note swing (delay offbeat eighths) when groove is swing.
 * - 6/8: no eighth-note swing (would corrupt pulse); optional triplet feel within each dotted-quarter.
 */
function applyGroove(
  noteEvents: NoteEvent[],
  timeSignature: TimeSignature,
  secondsPerBar: number,
  secondsPerBeat: number,
  swingAmount: number,
  swingMode: 'beat' | 'eighth',
  groove: string
): void {
  const beatsPerBar = getTimingBeatsPerBar(timeSignature);
  const is68 = timeSignature[0] === 6 && timeSignature[1] === 8;

  if (swingMode === 'beat') {
    const swingDelay = swingAmount * (secondsPerBeat / 3);
    for (const event of noteEvents) {
      const timeInBar = event.time % secondsPerBar;
      const beatNumber = Math.floor(timeInBar / secondsPerBeat) + 1;
      if (beatNumber % 2 === 0) event.time += swingDelay;
    }
    return;
  }

  // 6/8: do not apply eighth-note swing (4 "eighths" per bar would be wrong).
  // Optionally apply triplet feel: delay 2nd and 5th pulse of each half-bar (within dotted-quarter).
  if (is68) {
    if (groove === 'triplet' && swingAmount > 0) {
      const tripletDelay = swingAmount * (secondsPerBar / 18); // slight delay on pulse 1,2,4,5
      for (const event of noteEvents) {
        const timeInBar = event.time % secondsPerBar;
        const offsetInBar = timeInBar / secondsPerBar;
        const pulseIndex = Math.round(offsetInBar * 6) % 6;
        if (pulseIndex === 1 || pulseIndex === 2 || pulseIndex === 4 || pulseIndex === 5) {
          event.time += tripletDelay * 0.5;
        }
      }
    }
    return;
  }

  // 4/4 and 3/4: eighth-note swing (delay offbeat eighths)
  const pulsesPerBar = getPulsesPerBar(timeSignature);
  const swingDelay = swingAmount * (secondsPerBeat / 6);
  for (const event of noteEvents) {
    const timeInBar = event.time % secondsPerBar;
    const offsetInBar = timeInBar / secondsPerBar;
    const eighthIndex = Math.floor(offsetInBar * pulsesPerBar) % pulsesPerBar;
    if (eighthIndex % 2 === 1) event.time += swingDelay;
  }
}

/**
 * Apply meter-specific velocity accents (multiply base velocity, don't replace).
 * 6/8: pulse 0 = 1.0, pulse 3 = 0.85, others = 0.7.
 * 3/4 waltz: strong-medium-weak [1, 0.75, 0.65] when feel.accentPattern not provided.
 * 4/4: no change unless feel.accentPattern provided.
 */
function applyMeterAccents(
  noteEvents: NoteEvent[],
  timeSignature: TimeSignature,
  secondsPerBar: number,
  feel?: { accentPattern?: number[]; accentWeighting?: number }
): void {
  const beatsPerBar = getTimingBeatsPerBar(timeSignature);
  const weighting = feel?.accentWeighting ?? 1;

  if (feel?.accentPattern && feel.accentPattern.length >= beatsPerBar) {
    for (const event of noteEvents) {
      const timeInBar = event.time % secondsPerBar;
      const beatIndex = Math.min(
        Math.floor((timeInBar / secondsPerBar) * beatsPerBar),
        beatsPerBar - 1
      );
      const mult = feel.accentPattern[beatIndex] ?? 1;
      event.velocity *= weighting * mult + (1 - weighting) * 1;
    }
    return;
  }

  const is68 = timeSignature[0] === 6 && timeSignature[1] === 8;
  const is34 = timeSignature[0] === 3 && timeSignature[1] === 4;

  if (is68) {
    for (const event of noteEvents) {
      const timeInBar = event.time % secondsPerBar;
      const offsetInBar = timeInBar / secondsPerBar;
      const pulseIndex = Math.round(offsetInBar * 6) % 6;
      const accent = pulseIndex === 0 ? 1.0 : pulseIndex === 3 ? 0.85 : 0.7;
      event.velocity *= weighting * accent + (1 - weighting) * 1;
    }
    return;
  }

  if (is34) {
    // Waltz: strong (1) - medium (0.75) - weak (0.65)
    const waltzAccent = [1, 0.75, 0.65];
    for (const event of noteEvents) {
      const timeInBar = event.time % secondsPerBar;
      const beatIndex = Math.min(
        Math.floor((timeInBar / secondsPerBar) * beatsPerBar),
        beatsPerBar - 1
      );
      const mult = waltzAccent[beatIndex] ?? 1;
      event.velocity *= weighting * mult + (1 - weighting) * 1;
    }
  }
}

/**
 * Humanisation: small random timing (±ms) and velocity variation.
 */
function applyHumanisation(noteEvents: NoteEvent[], amount: number): void {
  const timingMs = amount * 20; // ±20ms at full amount
  const velRange = amount * 0.12; // ±6% velocity at full amount
  for (const event of noteEvents) {
    event.time += (Math.random() * 2 - 1) * timingMs / 1000;
    event.velocity = Math.max(0.01, Math.min(1, event.velocity + (Math.random() * 2 - 1) * velRange));
  }
}

/**
 * Push (laid-back vs pushed): shift all events slightly in time.
 * push > 0 = ahead of beat, push < 0 = behind.
 */
function applyPush(noteEvents: NoteEvent[], push: number, secondsPerBeat: number): void {
  const shift = push * secondsPerBeat * 0.02; // ±2% of beat at full push
  for (const event of noteEvents) {
    event.time += shift;
  }
}
