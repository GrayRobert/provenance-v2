/**
 * Chord Explorer - Main Entry Point
 * Wires together all modules and handles UI state
 */

import { 
  ALL_SCALES, 
  NOTE_NAMES, 
  NOTE_NAMES_FLAT, 
  type Scale,
  isEmotionalScale,
  getEmotionalBucketName,
  getScaleById,
  getScalesForEmotionalBucket,
  createEmotionalBucketScale,
  EMOTIONAL_BUCKET_IDS,
  isScaleInEmotionalBucket
} from './scales';
import { 
  harmonizeScale, 
  harmonizeEmotionalBucket,
  type HarmonizedScale, 
  type Chord 
} from './harmonizer';
import { 
  initAudio, 
  releaseAll,
  setVolume, 
  setReverbWet, 
  setInstrument, 
  setLoadingCallback,
  setHumanise,
  INSTRUMENTS,
  type InstrumentId 
} from './audioEngine';
import { 
  renderChordPalette, 
  setupKeyboardHandlers, 
  collapseAll,
  setChordPlayCallback,
  setChordReleaseCallback,
  setAlwaysSustain,
  setKeepRootBass,
  seedBorrowedSuggestions,
  setOctaveShiftCallback,
  setOctaveShift,
  getOctaveShift,
  setInversionCallback,
  getInversion,
  setInversion,
  triggerInversionCycle,
  findAndActivateChordButton
} from './chordPalette';
import { renderPianoKeyboard, highlightNotes, clearHighlights } from './pianoKeyboard';
import { generateAllBorrowedChords } from './modalInterchange';
import { addCustomChord, chordSymbolToInternalChord, validateChordSymbol, loadCustomChords, saveCustomChords, setOnCustomChordsChange } from './customChords';
import type { ChordExplorerProps, SongKey } from './types/chordExplorer';
import type { ChordDTO } from './types/chordDto';
import { chordDtoToInternalChord, chordToChordDto } from './utils/chordDtoAdapters';
import {
  getAllStyles,
  getStyleById,
  isStyleCompatibleWithMeter,
  getMeterConstraintSuffix,
} from './styles';
import { setPlaybackStyle, setMetronomeReverbWet } from './chordProgressionEngine';
import { hasChords, replaceAllUserProgressions, setOnAfterSaveProgression, setOnAfterDeleteProgression } from './userProgressions';
import { getSemitonesBetweenRoots, transposeSections } from './transpose';
import type { ProgressionSection } from './types/chordProgression';

// ===========================
// STATE
// ===========================

type MinorScaleType = 'natural' | 'harmonic' | 'melodic';

const MINOR_SCALE_TYPE_TO_ID: Record<MinorScaleType, string> = {
  natural: 'aeolian',
  harmonic: 'harmonic_minor',
  melodic: 'melodic_minor',
};

interface AppState {
  selectedRoot: string;
  selectedScale: Scale;
  selectedInstrument: InstrumentId;
  selectedStyle: string;
  harmonization: HarmonizedScale | null;
  audioInitialized: boolean;
  /** When scale is minor emotional bucket, which minor scale to show. */
  minorScaleType: MinorScaleType;
}

const state: AppState = {
  selectedRoot: 'C',
  selectedScale: createEmotionalBucketScale(EMOTIONAL_BUCKET_IDS.MAJOR), // Default to Major emotional bucket
  selectedInstrument: 'grand-piano',
  selectedStyle: 'block', // Default to Block Chords
  harmonization: null,
  audioInitialized: false,
  minorScaleType: 'natural',
};

/** Guard: only one "add chord" modal at a time (avoids stacked modals from duplicate applyProps). */
let addChordModalOpen = false;

const CHORD_EXPLORER_MARKUP = `
  <div class="app">
    <header class="app-header">
      <div class="brand">
        <span class="brand-icon">♫</span>
        <div class="brand-name-wrap">
          <span class="brand-name">Chord Explorer</span>
          <span class="brand-version">v1.02</span>
        </div>
      </div>
      
      <div class="controls">
        <div class="control-group primary-controls">
          <div class="select-wrapper" data-tour="root-tonality">
            <label for="root-select">Root</label>
            <select id="root-select"></select>
          </div>
          
          <div class="select-wrapper scale-select" data-tour="root-tonality">
            <label for="scale-select">Tonality</label>
            <select id="scale-select"></select>
          </div>
          
          <div class="select-wrapper instrument-select" data-tour="instrument">
            <label for="instrument-select">Instrument</label>
            <select id="instrument-select"></select>
          </div>
          
          <div class="select-wrapper style-select" data-tour="style">
            <label for="style-select">Style</label>
            <select id="style-select"></select>
          </div>
          
          <div class="player-controls-group" data-tour="time-tempo">
            <div class="setting-group">
              <label for="time-signature">Time</label>
              <button type="button" id="time-signature" class="time-signature-button">4/4</button>
            </div>
            
            <div class="setting-group tempo-setting-group">
              <label for="tempo-controls">Tempo</label>
              <div class="tempo-controls-wrapper">
                <div class="tempo-controls" id="tempo-controls">
                  <button type="button" class="tempo-btn tempo-minus-btn" aria-label="Decrease tempo">−</button>
                  <span class="tempo-display" id="tempo-display">110</span>
                  <button type="button" class="tempo-btn tempo-plus-btn" aria-label="Increase tempo">+</button>
                </div>
                <span class="tempo-label">BPM</span>
              </div>
            </div>
            
            <div class="setting-group metronome-menu-group" data-tour="metronome">
              <label for="metronome-toggle">Metronome</label>
              <button type="button" id="metronome-toggle" class="metronome-toggle" aria-label="Metronome settings" aria-expanded="false" title="Metronome settings">
                <svg xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision" text-rendering="geometricPrecision" image-rendering="optimizeQuality" fill-rule="evenodd" clip-rule="evenodd" viewBox="0 0 512 512.001" class="metronome-icon">
                  <path fill-rule="nonzero" d="M151.667 0h208.666c41.724 0 79.647 17.059 107.128 44.539C494.94 72.02 512 109.943 512 151.666v208.667c0 41.725-17.06 79.647-44.539 107.128-27.481 27.48-65.404 44.54-107.128 44.54H151.667c-41.724 0-79.647-17.06-107.128-44.54C17.06 439.98 0 402.058 0 360.333V151.666C0 109.943 17.06 72.02 44.539 44.539 72.02 17.059 109.943 0 151.667 0zm.616 255.587c-6.5 0-11.771-5.271-11.771-11.771 0-6.501 5.271-11.772 11.771-11.772h124.416c6.5 0 11.771 5.271 11.771 11.772 0 6.5-5.271 11.771-11.771 11.771H152.283zm162.658 21.911v-88.021c0-15.479 9.394-25.017 27.637-25.017h24.189c7.675 0 13.897 6.222 13.897 13.896 0 7.675-9.17 11.277-16.844 11.277h-21.085v120.995c0 2.537.02 4.659-.154 6.422-1.1 20.632-18.184 37.031-39.089 37.031-21.59 0-39.146-17.574-39.146-39.146 0-21.568 17.578-39.146 39.146-39.146 3.982 0 7.826.599 11.449 1.709zm-162.658 39.871c-6.5 0-11.771-5.27-11.771-11.771 0-6.5 5.271-11.771 11.771-11.771h75.397c6.5 0 11.771 5.271 11.771 11.771 0 6.501-5.271 11.771-11.771 11.771h-75.397zm0-124.905c-6.5 0-11.771-5.271-11.771-11.772 0-6.5 5.271-11.771 11.771-11.771h124.416c6.5 0 11.771 5.271 11.771 11.771 0 6.501-5.271 11.772-11.771 11.772H152.283zm208.05-163.037H151.667c-33.601 0-64.159 13.757-86.321 35.918-22.161 22.162-35.918 52.721-35.918 86.321v208.667c0 33.602 13.757 64.16 35.918 86.322 22.162 22.161 52.72 35.918 86.321 35.918h208.666c33.601 0 64.159-13.757 86.321-35.918 22.161-22.162 35.918-52.72 35.918-86.322V151.666c0-33.6-13.757-64.159-35.918-86.321-22.162-22.161-52.72-35.918-86.321-35.918z"/>
                </svg>
              </button>
              <div class="metronome-menu" id="metronome-menu" style="display: none;">
                <div class="settings-menu-row">
                  <span class="settings-label">Type</span>
                  <select id="metronome-type" class="metronome-type-select" aria-label="Metronome type">
                    <option value="sub-kick">Sub-kick</option>
                    <option value="thump" selected>Thump</option>
                    <option value="wood-1">Wood</option>
                    <option value="finger-snap-2">Finger snap</option>
                  </select>
                </div>
                <div class="settings-menu-row metronome-volume-row">
                  <span class="settings-label">Volume</span>
                  <div class="metronome-volume-control">
                    <input type="range" id="metronome-volume" class="metronome-volume-slider" min="-40" max="15" step="1" value="0">
                    <span class="metronome-volume-value" id="metronome-volume-value">0 dB</span>
                  </div>
                </div>
                <button type="button" class="metronome-mute-button" aria-label="Mute metronome">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mute-icon">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                    <line x1="23" y1="9" x2="17" y2="15"></line>
                    <line x1="17" y1="9" x2="23" y2="15"></line>
                  </svg>
                  <span>Mute</span>
                </button>
              </div>
            </div>
            
            <div class="setting-group keyboard-settings-menu-group" data-tour="keyboard-settings">
              <label for="keyboard-settings-toggle">Keyboard</label>
              <div class="keyboard-mobile-settings">
                <button type="button" id="keyboard-settings-toggle" class="keyboard-settings-toggle metronome-toggle" aria-label="Keyboard settings" aria-expanded="false" title="Keyboard settings">
                  <svg xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision" text-rendering="geometricPrecision" image-rendering="optimizeQuality" fill-rule="evenodd" clip-rule="evenodd" viewBox="0 0 512 512.001" class="settings-icon">
                    <path fill-rule="nonzero" d="M151.667 0h208.666c41.724 0 79.647 17.06 107.128 44.539C494.94 72.02 512 109.943 512 151.667v208.666c0 41.725-17.06 79.648-44.539 107.129-27.481 27.479-65.404 44.539-107.128 44.539H151.667c-41.724 0-79.647-17.06-107.128-44.539C17.06 439.981 0 402.058 0 360.333V151.667C0 109.943 17.06 72.02 44.539 44.539 72.02 17.06 109.943 0 151.667 0zm8.137 154.613h23.08a3.852 3.852 0 013.838 3.837v96.892h15.548c2.113 0 3.838 1.749 3.838 3.838v21.161c0 2.098-1.74 3.837-3.838 3.837h-15.548v69.374c0 2.103-1.735 3.838-3.838 3.838h-23.08a3.853 3.853 0 01-3.839-3.838v-69.374h-15.549c-2.098 0-3.838-1.724-3.838-3.837V259.18a3.848 3.848 0 013.838-3.838h15.549V158.45a3.846 3.846 0 013.839-3.837zM375.422 291.45v21.159c0 2.099-1.74 3.839-3.838 3.839h-15.549v37.104c0 2.103-1.735 3.838-3.839 3.838h-23.08a3.853 3.853 0 01-3.838-3.838v-37.104H309.73c-2.098 0-3.838-1.726-3.838-3.839V291.45a3.847 3.847 0 013.838-3.839h15.548V158.45a3.846 3.846 0 013.838-3.837h23.08a3.852 3.852 0 013.839 3.837v129.161h15.549c2.112 0 3.838 1.75 3.838 3.839zm-84.657-84.659v21.159c0 2.099-1.74 3.839-3.839 3.839h-15.547v121.763c0 2.103-1.736 3.838-3.839 3.838h-23.08a3.854 3.854 0 01-3.839-3.838V231.789h-15.547c-2.099 0-3.839-1.725-3.839-3.839v-21.159a3.847 3.847 0 013.839-3.839h15.547V158.45a3.846 3.846 0 013.839-3.837h23.08a3.852 3.852 0 013.839 3.837v44.502h15.547c2.114 0 3.839 1.75 3.839 3.839zm69.568-177.363H151.667c-33.601 0-64.159 13.757-86.321 35.918-22.161 22.162-35.918 52.72-35.918 86.321v208.666c0 33.602 13.757 64.16 35.918 86.322 22.162 22.161 52.72 35.918 86.321 35.918h208.666c33.601 0 64.159-13.757 86.321-35.918 22.161-22.162 35.918-52.72 35.918-86.322V151.667c0-33.601-13.757-64.159-35.918-86.321-22.162-22.161-52.72-35.918-86.321-35.918z"/>
                  </svg>
                </button>
                <div id="keyboard-settings-menu" class="keyboard-settings-menu metronome-menu" style="display: none;">
                  <div class="settings-menu-row">
                    <span class="settings-label">Octave</span>
                    <div class="settings-octave-controls">
                      <button id="mobile-octave-down" class="settings-octave-btn" aria-label="Octave down">−</button>
                      <span id="mobile-octave-display" class="settings-octave-display">0</span>
                      <button id="mobile-octave-up" class="settings-octave-btn" aria-label="Octave up">+</button>
                    </div>
                  </div>
                  <div class="settings-menu-row">
                    <span class="settings-label">Sustain</span>
                    <button id="mobile-sustain-toggle" class="toggle-button" aria-pressed="true">
                      <span class="toggle-track"><span class="toggle-thumb"></span></span>
                    </button>
                  </div>
                  <div class="settings-menu-row">
                    <span class="settings-label">Root Bass</span>
                    <button id="mobile-root-bass-toggle" class="toggle-button" aria-pressed="true">
                      <span class="toggle-track"><span class="toggle-thumb"></span></span>
                    </button>
                  </div>
                  <div class="settings-menu-row">
                    <span class="settings-label">Humanise</span>
                    <button id="mobile-humanise-toggle" class="toggle-button" aria-pressed="true">
                      <span class="toggle-track"><span class="toggle-thumb"></span></span>
                    </button>
                  </div>
                  <div class="settings-menu-row">
                    <span class="settings-label">Inversion</span>
                    <button id="mobile-inversion-button" class="inversion-button" data-inversion="1" aria-label="Cycle inversion">
                      <span id="mobile-inversion-display" class="inversion-number">1</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="control-group audio-controls" data-tour="audio-controls">
          <div class="slider-wrapper">
            <label for="volume-slider">Vol</label>
            <input type="range" id="volume-slider" min="-30" max="0" value="-8">
          </div>
          
          <div class="slider-wrapper">
            <label for="reverb-slider">Verb</label>
            <input type="range" id="reverb-slider" min="0" max="100" value="25">
          </div>
        </div>
      </div>
    </header>

    <div id="piano-keyboard-container" class="piano-keyboard-container" data-tour="piano-keyboard">
      <div class="keyboard-side-controls keyboard-left-controls">
        <div class="octave-controls">
          <button id="octave-up" class="octave-button" aria-label="Octave up">
            <span class="octave-icon">+</span>
            <span class="octave-label">Oct</span>
          </button>
          <span id="octave-display" class="octave-display">0</span>
          <button id="octave-down" class="octave-button" aria-label="Octave down">
            <span class="octave-icon">−</span>
            <span class="octave-label">Oct</span>
          </button>
        </div>
      </div>
      <div id="piano-keyboard-visual" class="piano-keyboard-visual"></div>
      <div class="keyboard-side-controls keyboard-right-controls">
        <div class="controls-grid">
          <div class="toggle-control">
            <span class="control-label">Sus</span>
            <button id="sustain-toggle" class="toggle-button" aria-pressed="true">
              <span class="toggle-track"><span class="toggle-thumb"></span></span>
            </button>
          </div>
          <div class="toggle-control">
            <span class="control-label">Root</span>
            <button id="root-bass-toggle" class="toggle-button" aria-pressed="true">
              <span class="toggle-track"><span class="toggle-thumb"></span></span>
            </button>
          </div>
          <div class="toggle-control">
            <span class="control-label">Humanise</span>
            <button id="humanise-toggle" class="toggle-button" aria-pressed="true">
              <span class="toggle-track"><span class="toggle-thumb"></span></span>
            </button>
          </div>
          <div class="inversion-control">
            <span class="control-label">Inversion</span>
            <button id="inversion-button" class="inversion-button" data-inversion="1" aria-label="Cycle inversion">
              <span id="inversion-display" class="inversion-number">1</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="keyboard-hints" id="keyboard-hints">
      <span class="hint"><kbd>1</kbd>-<kbd>7</kbd> primary</span>
      <span class="hint"><kbd>8</kbd>-<kbd>]</kbd> primary +1 oct</span>
      <span class="hint"><kbd>Q</kbd>-<kbd>U</kbd> row 1</span>
      <span class="hint"><kbd>P</kbd>-<kbd>,</kbd> row 1 +1 oct</span>
      <span class="hint"><kbd>A</kbd>-<kbd>J</kbd> row 2</span>
      <span class="hint"><kbd>Z</kbd>-<kbd>M</kbd> row 3</span>
      <span class="hint"><kbd>I</kbd> inversion</span>
      <span class="hint"><kbd>+</kbd>/<kbd>−</kbd> octave</span>
      <span class="hint"><kbd>Space</kbd> play/stop</span>
    </div>

    <div id="minor-scale-toggle-wrapper" class="minor-scale-toggle-wrapper" style="display: none;" aria-hidden="true">
      <div class="minor-scale-toggle" role="group" aria-label="Minor scale type">
        <button type="button" id="minor-scale-natural" class="minor-scale-btn" aria-pressed="true" data-minor-scale="natural">Natural</button>
        <button type="button" id="minor-scale-harmonic" class="minor-scale-btn" aria-pressed="false" data-minor-scale="harmonic">Harmonic</button>
        <button type="button" id="minor-scale-melodic" class="minor-scale-btn" aria-pressed="false" data-minor-scale="melodic">Melodic</button>
      </div>
    </div>

    <main id="chord-palette" class="chord-palette" data-tour="chord-palette"></main>
  </div>
`;

// ===========================
// DOM ELEMENTS
// ===========================

let rootSelect: HTMLSelectElement;
let scaleSelect: HTMLSelectElement;
let instrumentSelect: HTMLSelectElement;
let instrumentSelectWrapper: HTMLElement;
let styleSelect: HTMLSelectElement;
let keyboardVisualContainer: HTMLElement;
let paletteContainer: HTMLElement;
let volumeSlider: HTMLInputElement;
let reverbSlider: HTMLInputElement;
let sustainToggle: HTMLButtonElement;
let octaveUpButton: HTMLButtonElement;
let octaveDownButton: HTMLButtonElement;
let octaveDisplay: HTMLElement;
let inversionButton: HTMLButtonElement;
let inversionDisplay: HTMLElement;

// Mobile settings elements
let keyboardSettingsToggle: HTMLButtonElement;
let keyboardSettingsMenu: HTMLElement;
let mobileOctaveUp: HTMLButtonElement;
let mobileOctaveDown: HTMLButtonElement;
let mobileOctaveDisplay: HTMLElement;
let mobileSustainToggle: HTMLButtonElement;
let mobileRootBassToggle: HTMLButtonElement;
let mobileHumaniseToggle: HTMLButtonElement;
let mobileInversionButton: HTMLButtonElement;
let mobileInversionDisplay: HTMLElement;

// Selected chord area elements (dynamically created, queried when needed)
let selectedChord: Chord | null = null;

let integrationProps: ChordExplorerProps | null = null;
let cleanupFns: Array<() => void> = [];
let keyboardCleanup: (() => void) | null = null;
let audioInitCleanup: (() => void) | null = null;
let allowDocumentTitleUpdates = false;
let mountedContainer: HTMLElement | null = null;

// ===========================
// INITIALIZATION
// ===========================

function addListener(
  target: EventTarget,
  type: string,
  handler: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions
): void {
  target.addEventListener(type, handler, options);
  cleanupFns.push(() => target.removeEventListener(type, handler, options));
}

function renderChordExplorerMarkup(container: HTMLElement): void {
  container.innerHTML = CHORD_EXPLORER_MARKUP;
}

function normalizeRoot(root: string): string {
  if (NOTE_NAMES.includes(root as any)) return root;
  if (NOTE_NAMES_FLAT.includes(root as any)) return root;
  return 'C';
}

function resolveScale(scaleValue: string | undefined | null): Scale {
  // Handle undefined, null, or empty strings - default to Major
  if (!scaleValue || (typeof scaleValue === 'string' && scaleValue.trim() === '')) {
    return createEmotionalBucketScale(EMOTIONAL_BUCKET_IDS.MAJOR);
  }
  
  const normalized = scaleValue.toLowerCase().replace(/\s+/g, '_');
  
  // Handle emotional buckets
  if (normalized === 'major_emotional' || normalized === EMOTIONAL_BUCKET_IDS.MAJOR) {
    return createEmotionalBucketScale(EMOTIONAL_BUCKET_IDS.MAJOR);
  }
  if (normalized === 'minor_emotional' || normalized === EMOTIONAL_BUCKET_IDS.MINOR) {
    return createEmotionalBucketScale(EMOTIONAL_BUCKET_IDS.MINOR);
  }
  
  // Legacy support: 'minor' maps to minor_emotional
  if (normalized === 'minor') {
    return createEmotionalBucketScale(EMOTIONAL_BUCKET_IDS.MINOR);
  }
  
  // Try to find in ALL_SCALES first
  const direct = ALL_SCALES.find(scale => scale.id === normalized);
  if (direct) return direct;
  
  // Try by name
  const byName = ALL_SCALES.find(scale => scale.name.toLowerCase() === scaleValue.toLowerCase());
  if (byName) return byName;
  
  // Default to Major emotional bucket
  return createEmotionalBucketScale(EMOTIONAL_BUCKET_IDS.MAJOR);
}

function applySongKey(songKey: ChordExplorerProps['songKey']): void {
  state.selectedRoot = normalizeRoot(songKey.root);
  state.selectedScale = resolveScale(songKey.scale);
  if (state.selectedScale.id === EMOTIONAL_BUCKET_IDS.MINOR && songKey.minorScaleType) {
    state.minorScaleType = songKey.minorScaleType;
  }

  if (rootSelect) {
    rootSelect.value = state.selectedRoot;
  }
  if (scaleSelect) {
    // Ensure the scale ID matches one of the emotional bucket IDs
    const scaleId = state.selectedScale.id;
    const isValidEmotionalBucket = scaleId === EMOTIONAL_BUCKET_IDS.MAJOR || scaleId === EMOTIONAL_BUCKET_IDS.MINOR;
    
    if (!isValidEmotionalBucket) {
      // If the scale ID doesn't match, default to Major
      state.selectedScale = createEmotionalBucketScale(EMOTIONAL_BUCKET_IDS.MAJOR);
    }
    
    // Repopulate to ensure options exist, then set value
    populateScaleSelect();
    
    // Force set the value to ensure it's displayed (populateScaleSelect should have set it, but ensure it's correct)
    const targetValue = state.selectedScale.id;
    if (scaleSelect.options.length > 0) {
      scaleSelect.value = targetValue;
    }
  }

  // Update minor-scale toggle UI if present (when scale is minor)
  updateMinorScaleToggleUI();

  if (paletteContainer) {
    updateHarmonization();
  }
}

// Legacy function - no longer needed as buttons are in transport controls
// Keeping stub to avoid breaking any references
function updateModeUI(): void {
  // Functionality moved to transport controls in chordProgressionPlayer.ts
}

function updateMinorScaleToggleUI(): void {
  const wrapper = document.getElementById('minor-scale-toggle-wrapper');
  if (!wrapper) return;
  const isMinor = state.selectedScale.id === EMOTIONAL_BUCKET_IDS.MINOR;
  wrapper.style.display = isMinor ? '' : 'none';
  wrapper.setAttribute('aria-hidden', isMinor ? 'false' : 'true');
  const types: MinorScaleType[] = ['natural', 'harmonic', 'melodic'];
  types.forEach(t => {
    const btn = document.getElementById(`minor-scale-${t}`) as HTMLButtonElement | null;
    if (btn) {
      btn.setAttribute('aria-pressed', state.minorScaleType === t ? 'true' : 'false');
      btn.setAttribute('aria-label', t === state.minorScaleType ? `${t.charAt(0).toUpperCase() + t.slice(1)}, selected` : t.charAt(0).toUpperCase() + t.slice(1));
    }
  });
}

export function showErrorModal(message: string): Promise<void> {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'add-chord-modal-backdrop';
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('role', 'alertdialog');
    backdrop.setAttribute('aria-labelledby', 'error-modal-title');

    const dialog = document.createElement('div');
    dialog.className = 'add-chord-modal-dialog';

    const title = document.createElement('h2');
    title.id = 'error-modal-title';
    title.className = 'add-chord-modal-title';
    title.textContent = 'Error';
    dialog.appendChild(title);

    const messageEl = document.createElement('p');
    messageEl.className = 'add-chord-modal-message';
    messageEl.textContent = message;
    dialog.appendChild(messageEl);

    const actions = document.createElement('div');
    actions.className = 'add-chord-modal-actions';

    let isResolved = false;
    const close = () => {
      if (isResolved) return; // Prevent double-closing
      isResolved = true;
      
      // Remove event listener
      document.removeEventListener('keydown', handleEscape);
      
      // Remove backdrop from DOM
      if (backdrop && backdrop.parentNode) {
        backdrop.parentNode.removeChild(backdrop);
      }
      
      resolve();
    };

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'add-chord-modal-btn add-chord-modal-confirm';
    okBtn.textContent = 'OK';
    okBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      close();
    });

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    });

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', handleEscape);

    actions.appendChild(okBtn);
    dialog.appendChild(actions);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    okBtn.focus();
  });
}

export function showAddCustomChordModal(chordSymbol: string, chord: Chord): Promise<boolean> {
  if (addChordModalOpen) return Promise.resolve(false);
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'add-chord-modal-backdrop';
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-labelledby', 'add-chord-modal-title');

    const dialog = document.createElement('div');
    dialog.className = 'add-chord-modal-dialog';

    const title = document.createElement('h2');
    title.id = 'add-chord-modal-title';
    title.className = 'add-chord-modal-title';
    title.textContent = 'Chord Not Found';
    dialog.appendChild(title);

    const message = document.createElement('p');
    message.className = 'add-chord-modal-message';
    message.textContent = `Could not find chord "${chordSymbol}" in the palette. Would you like to add it to your custom chords?`;
    dialog.appendChild(message);

    const actions = document.createElement('div');
    actions.className = 'add-chord-modal-actions';

    let isResolved = false;
    const close = (result: boolean) => {
      if (isResolved) return; // Prevent double-closing
      isResolved = true;
      addChordModalOpen = false;

      // Remove event listener
      document.removeEventListener('keydown', handleEscape);

      // Remove backdrop from DOM
      if (backdrop && backdrop.parentNode) {
        backdrop.parentNode.removeChild(backdrop);
      }

      resolve(result);
    };

    const noBtn = document.createElement('button');
    noBtn.type = 'button';
    noBtn.className = 'add-chord-modal-btn add-chord-modal-cancel';
    noBtn.textContent = 'No';
    noBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      close(false);
    });

    const yesBtn = document.createElement('button');
    yesBtn.type = 'button';
    yesBtn.className = 'add-chord-modal-btn add-chord-modal-confirm';
    yesBtn.textContent = 'Yes';
    yesBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    });

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        e.preventDefault();
        e.stopPropagation();
        close(false);
      }
    });

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(false);
      }
    };
    document.addEventListener('keydown', handleEscape);

    actions.appendChild(noBtn);
    actions.appendChild(yesBtn);
    dialog.appendChild(actions);
    backdrop.appendChild(dialog);
    addChordModalOpen = true;
    document.body.appendChild(backdrop);

    yesBtn.focus();
  });
}

/**
 * Show modal when user changes root and a chord progression exists.
 * Returns true if user wants to transpose progression to new key, false if cancel (revert root).
 */
export function showTransposeProgressionModal(oldRoot: string, newRoot: string): Promise<boolean> {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'add-chord-modal-backdrop';
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-labelledby', 'transpose-progression-modal-title');

    const dialog = document.createElement('div');
    dialog.className = 'add-chord-modal-dialog';

    const title = document.createElement('h2');
    title.id = 'transpose-progression-modal-title';
    title.className = 'add-chord-modal-title';
    title.textContent = 'Transpose Chord Progression?';
    dialog.appendChild(title);

    const message = document.createElement('p');
    message.className = 'add-chord-modal-message';
    message.textContent = `You have a chord progression in the current key. Would you like to transpose it to ${newRoot}? If you cancel, the key will revert to ${oldRoot}.`;
    dialog.appendChild(message);

    const actions = document.createElement('div');
    actions.className = 'add-chord-modal-actions';

    let isResolved = false;
    const close = (result: boolean) => {
      if (isResolved) return;
      isResolved = true;
      document.removeEventListener('keydown', handleEscape);
      if (backdrop?.parentNode) backdrop.parentNode.removeChild(backdrop);
      resolve(result);
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'add-chord-modal-btn add-chord-modal-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      close(false);
    });

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'add-chord-modal-btn add-chord-modal-confirm';
    okBtn.textContent = 'OK';
    okBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    });

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        e.preventDefault();
        e.stopPropagation();
        close(false);
      }
    });

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(false);
      }
    };
    document.addEventListener('keydown', handleEscape);

    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);
    dialog.appendChild(actions);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    okBtn.focus();
  });
}

async function applyCurrentChord(dto?: ChordDTO, options?: { play?: boolean }): Promise<void> {
  if (!dto) return;
  const play = options?.play !== false;
  const chord = chordDtoToInternalChord(dto);
  selectedChord = chord;
  setInversion(dto.inversion ?? 0);
  updateSelectedChord(chord);
  highlightNotes(chord.midiNotes);
  
  // Try to find and activate the matching chord button in the palette
  // This highlights the chord visually so the user can see where it is
  // Use setTimeout to ensure the palette is fully rendered (after updateHarmonization completes)
  setTimeout(async () => {
    const found = findAndActivateChordButton(chord, { play });
    
    // If chord not found in palette, add it to custom chords automatically (e.g. chord came from Chord Builder)
    if (!found && play) {
      const validationError = validateChordSymbol(chord.symbol);
      if (validationError) {
        await showErrorModal(`Cannot add chord: ${validationError}`);
        return;
      }
      const parsedChord = chordSymbolToInternalChord(chord.symbol);
      if (!parsedChord) {
        await showErrorModal('Invalid chord symbol. Cannot add to custom chords.');
        return;
      }
      const added = addCustomChord(parsedChord);
      if (added) {
        updateHarmonization();
        setTimeout(() => {
          findAndActivateChordButton(parsedChord);
        }, 100);
      }
    }
  }, 100);
  
  // Dispatch chordSelected only when we are actually playing (user/app selected a chord).
  // Skip when syncing palette during playback minor-scale switch to avoid double-play.
  if (play) {
    document.dispatchEvent(new CustomEvent('chordSelected', {
      detail: { chord, octaveShift: getOctaveShift(), inversion: getInversion() },
      bubbles: true,
    }));
  }
}

function seedSuggestionsFromChord(dto?: ChordDTO, previousDto?: ChordDTO): void {
  if (!dto) return;
  const chord = chordDtoToInternalChord(dto);
  
  // Check if previousChord is borrowed
  let previousChord: Chord | null = null;
  if (previousDto) {
    previousChord = chordDtoToInternalChord(previousDto);
    // Mark as borrowed if the DTO indicates it
    if (!previousDto.context.isDiatonic || previousDto.context.borrowedFrom) {
      (previousChord as any).isBorrowed = true;
    }
  }
  
  seedBorrowedSuggestions(chord, previousChord);
}

// Legacy function - no longer needed as buttons are in transport controls
// Keeping stub to avoid breaking any references
function wireIntegrationActions(): void {
  // Functionality moved to transport controls in chordProgressionPlayer.ts
  // Insert/Update/Remove buttons are now handled by chordProgressionPlayer.ts
}

function initDOM(): void {
  rootSelect = document.getElementById('root-select') as HTMLSelectElement;
  scaleSelect = document.getElementById('scale-select') as HTMLSelectElement;
  instrumentSelect = document.getElementById('instrument-select') as HTMLSelectElement;
  instrumentSelectWrapper = instrumentSelect.closest('.select-wrapper') as HTMLElement;
  styleSelect = document.getElementById('style-select') as HTMLSelectElement;
  keyboardVisualContainer = document.getElementById('piano-keyboard-visual') as HTMLElement;
  paletteContainer = document.getElementById('chord-palette') as HTMLElement;
  volumeSlider = document.getElementById('volume-slider') as HTMLInputElement;
  reverbSlider = document.getElementById('reverb-slider') as HTMLInputElement;
  sustainToggle = document.getElementById('sustain-toggle') as HTMLButtonElement;
  octaveUpButton = document.getElementById('octave-up') as HTMLButtonElement;
  octaveDownButton = document.getElementById('octave-down') as HTMLButtonElement;
  octaveDisplay = document.getElementById('octave-display') as HTMLElement;
  inversionButton = document.getElementById('inversion-button') as HTMLButtonElement;
  inversionDisplay = document.getElementById('inversion-display') as HTMLElement;
  
  // Mobile settings elements
  keyboardSettingsToggle = document.getElementById('keyboard-settings-toggle') as HTMLButtonElement;
  keyboardSettingsMenu = document.getElementById('keyboard-settings-menu') as HTMLElement;
  mobileOctaveUp = document.getElementById('mobile-octave-up') as HTMLButtonElement;
  mobileOctaveDown = document.getElementById('mobile-octave-down') as HTMLButtonElement;
  mobileOctaveDisplay = document.getElementById('mobile-octave-display') as HTMLElement;
  mobileSustainToggle = document.getElementById('mobile-sustain-toggle') as HTMLButtonElement;
  mobileRootBassToggle = document.getElementById('mobile-root-bass-toggle') as HTMLButtonElement;
  mobileHumaniseToggle = document.getElementById('mobile-humanise-toggle') as HTMLButtonElement;
  mobileInversionButton = document.getElementById('mobile-inversion-button') as HTMLButtonElement;
  mobileInversionDisplay = document.getElementById('mobile-inversion-display') as HTMLElement;
  
  // Populate dropdowns
  populateRootSelect();
  populateScaleSelect();
  populateInstrumentSelect();
  populateStyleSelect(4); // default 4/4
  
  // Initialize style in engine and apply overrides
  setPlaybackStyle(state.selectedStyle);
  applyStyleOverrides(state.selectedStyle).catch(err => {
    console.warn('Error applying initial style overrides:', err);
  });
  
  // Render the piano keyboard visualization
  renderPianoKeyboard(keyboardVisualContainer);
  
  // Setup chord play/release callbacks to update keyboard and selected chord area
  setChordPlayCallback((chord, _octaveShift, _inversion) => {
    selectedChord = chord;
    highlightNotes(chord.midiNotes);
    updateSelectedChord(chord);
  });
  
  setChordReleaseCallback(() => {
    clearHighlights();
  });
  
  // Setup octave shift callback to update UI
  setOctaveShiftCallback((shift) => {
    updateOctaveDisplay(shift);
  });
  
  // Setup inversion callback to update UI
  setInversionCallback((inversion, maxInversion) => {
    updateInversionDisplay(inversion, maxInversion);
  });
  
  // Setup loading callback for instrument changes
  setLoadingCallback((loading) => {
    if (loading) {
      instrumentSelectWrapper.classList.add('loading');
    } else {
      instrumentSelectWrapper.classList.remove('loading');
    }
  });
  
  // Setup event listeners
  setupEventListeners();
  wireIntegrationActions();
  
  // Setup keyboard handlers
  keyboardCleanup = setupKeyboardHandlers();
  if (keyboardCleanup) {
    cleanupFns.push(keyboardCleanup);
  }
  
  // Initialize default toggle states (matching HTML defaults)
  setAlwaysSustain(true);
  setKeepRootBass(true);
  setHumanise(true);
  
  // Default inversion preference: 1st inversion
  setInversion(1);
  
  // Initial render
  updateHarmonization();
  updateMinorScaleToggleUI();

  // Initialize audio on first user interaction (browsers require this)
  audioInitCleanup = setupAudioInitOnInteraction();
  if (audioInitCleanup) {
    cleanupFns.push(audioInitCleanup);
  }
}

function populateRootSelect(): void {
  rootSelect.innerHTML = '';
  
  // Combine sharps and flats for comprehensive selection
  const allNotes = [
    'C', 'C#/Db', 'D', 'D#/Eb', 'E', 'F', 
    'F#/Gb', 'G', 'G#/Ab', 'A', 'A#/Bb', 'B'
  ];
  
  allNotes.forEach((note, index) => {
    const option = document.createElement('option');
    // Use sharp version as value
    option.value = NOTE_NAMES[index];
    option.textContent = note;
    if (NOTE_NAMES[index] === state.selectedRoot) {
      option.selected = true;
    }
    rootSelect.appendChild(option);
  });
}

function populateScaleSelect(): void {
  if (!scaleSelect) return;
  
  // Store the current value before clearing
  const currentValue = state.selectedScale.id;
  
  scaleSelect.innerHTML = '';
  
  // Only show emotional buckets
  const emotionalBuckets = [
    { id: EMOTIONAL_BUCKET_IDS.MAJOR, name: getEmotionalBucketName(EMOTIONAL_BUCKET_IDS.MAJOR) },
    { id: EMOTIONAL_BUCKET_IDS.MINOR, name: getEmotionalBucketName(EMOTIONAL_BUCKET_IDS.MINOR) },
  ];
  
  emotionalBuckets.forEach(bucket => {
    const option = document.createElement('option');
    option.value = bucket.id;
    option.textContent = bucket.name;
    scaleSelect.appendChild(option);
  });
  
  // Set the value after all options are added
  // Ensure we're using the current state value
  const targetValue = state.selectedScale.id;
  if (scaleSelect.options.length > 0) {
    // Check if the value exists in the options
    const valueExists = Array.from(scaleSelect.options).some(opt => opt.value === targetValue);
    if (valueExists) {
      scaleSelect.value = targetValue;
    } else {
      // Fallback to Major if value doesn't exist
      scaleSelect.value = EMOTIONAL_BUCKET_IDS.MAJOR;
      state.selectedScale = createEmotionalBucketScale(EMOTIONAL_BUCKET_IDS.MAJOR);
    }
  }
}

function populateInstrumentSelect(): void {
  instrumentSelect.innerHTML = '';
  
  INSTRUMENTS.forEach(instr => {
    const option = document.createElement('option');
    option.value = instr.id;
    option.textContent = instr.name;
    if (instr.id === state.selectedInstrument) {
      option.selected = true;
    }
    instrumentSelect.appendChild(option);
  });
}

function populateStyleSelect(_beatsPerBar?: number): void {
  if (!styleSelect) return;

  styleSelect.innerHTML = '';

  const styles = getAllStyles();
  styles.forEach((style) => {
    const option = document.createElement('option');
    option.value = style.id;
    const suffix = getMeterConstraintSuffix(style);
    option.textContent = suffix ? `${style.name} (${suffix})` : style.name;
    if (style.id === state.selectedStyle) {
      option.selected = true;
    }
    styleSelect.appendChild(option);
  });
}

/**
 * Apply style overrides and lock/unlock controls
 */
async function applyStyleOverrides(styleId: string): Promise<void> {
  const style = getStyleById(styleId);
  if (!style || !style.overrides) {
    // No overrides - unlock all controls
    unlockAllControls();
    return;
  }

  const overrides = style.overrides;
  const progressionPlayerModule = await import('./chordProgressionPlayer');

  // Apply tempo override
  if (overrides.tempo) {
    if (overrides.tempo.value !== undefined) {
      progressionPlayerModule.setProgressionBpm(overrides.tempo.value);
      const tempoDisplay = document.getElementById('tempo-display') as HTMLElement;
      if (tempoDisplay) {
        tempoDisplay.textContent = overrides.tempo.value.toString();
      }
    }
    lockControl('tempo', overrides.tempo.lock || false);
  } else {
    unlockControl('tempo');
  }

  // Apply time signature override (style sets current time sig; user can always change it)
  if (overrides.timeSignature?.value) {
    progressionPlayerModule.setProgressionTimeSignature(overrides.timeSignature.value);
    const timeSigButton = document.getElementById('time-signature') as HTMLElement;
    if (timeSigButton) {
      timeSigButton.textContent = `${overrides.timeSignature.value[0]}/${overrides.timeSignature.value[1]}`;
    }
  }
  unlockControl('timeSignature');

  // Apply sustain override
  if (overrides.sustain) {
    if (overrides.sustain.value !== undefined) {
      setAlwaysSustain(overrides.sustain.value);
      // Update UI toggles
      updateSustainToggle(overrides.sustain.value);
    }
    lockControl('sustain', overrides.sustain.lock || false);
  } else {
    unlockControl('sustain');
  }

  // Apply root bass override
  if (overrides.rootBass) {
    if (overrides.rootBass.value !== undefined) {
      setKeepRootBass(overrides.rootBass.value);
      // Update UI toggles
      updateRootBassToggle(overrides.rootBass.value);
    }
    lockControl('rootBass', overrides.rootBass.lock || false);
  } else {
    unlockControl('rootBass');
  }

  // Apply humanise override
  if (overrides.humanise) {
    if (overrides.humanise.value !== undefined) {
      setHumanise(overrides.humanise.value);
      // Update UI toggles
      updateHumaniseToggle(overrides.humanise.value);
    }
    lockControl('humanise', overrides.humanise.lock || false);
  } else {
    unlockControl('humanise');
  }

  // Apply inversion override
  if (overrides.inversion) {
    if (overrides.inversion.value !== undefined) {
      setInversion(overrides.inversion.value);
      // Update UI displays
      updateInversionDisplayForStyle(overrides.inversion.value);
    }
    lockControl('inversion', overrides.inversion.lock || false);
  } else {
    unlockControl('inversion');
  }

  // Apply octave offset override (-3 to +3)
  if (overrides.octaveOffset) {
    if (overrides.octaveOffset.value !== undefined) {
      const val = Math.max(-3, Math.min(3, overrides.octaveOffset.value));
      setOctaveShift(val);
      updateOctaveDisplay(val);
    }
    lockControl('octave', overrides.octaveOffset.lock || false);
  } else {
    unlockControl('octave');
  }
}

/**
 * Lock or unlock a specific control
 */
function lockControl(controlName: string, lock: boolean): void {
  const elements = getControlElements(controlName);
  elements.forEach(el => {
    if (el) {
      (el as HTMLElement).style.pointerEvents = lock ? 'none' : '';
      (el as HTMLElement).style.opacity = lock ? '0.5' : '';
      (el as HTMLElement).setAttribute('aria-disabled', String(lock));
      if (el instanceof HTMLButtonElement || el instanceof HTMLSelectElement) {
        (el as HTMLButtonElement | HTMLSelectElement).disabled = lock;
      }
    }
  });
}

/**
 * Unlock a specific control
 */
function unlockControl(controlName: string): void {
  lockControl(controlName, false);
}

/**
 * Unlock all controls
 */
function unlockAllControls(): void {
  unlockControl('tempo');
  unlockControl('timeSignature');
  unlockControl('sustain');
  unlockControl('rootBass');
  unlockControl('humanise');
  unlockControl('inversion');
  unlockControl('octave');
}

/**
 * Get control elements for a given control name
 */
function getControlElements(controlName: string): (HTMLElement | null)[] {
  switch (controlName) {
    case 'tempo':
      return [
        document.querySelector('.tempo-minus-btn') as HTMLButtonElement,
        document.querySelector('.tempo-plus-btn') as HTMLButtonElement
      ];
    case 'timeSignature':
      return [
        document.getElementById('time-signature') as HTMLButtonElement
      ];
    case 'sustain':
      return [
        document.getElementById('sustain-toggle') as HTMLButtonElement,
        document.getElementById('mobile-sustain-toggle') as HTMLButtonElement
      ];
    case 'rootBass':
      return [
        document.getElementById('root-bass-toggle') as HTMLButtonElement,
        document.getElementById('mobile-root-bass-toggle') as HTMLButtonElement
      ];
    case 'humanise':
      return [
        document.getElementById('humanise-toggle') as HTMLButtonElement,
        document.getElementById('mobile-humanise-toggle') as HTMLButtonElement
      ];
    case 'inversion':
      return [
        document.getElementById('inversion-button') as HTMLButtonElement,
        document.getElementById('mobile-inversion-button') as HTMLButtonElement
      ];
    case 'octave':
      return [
        document.getElementById('octave-up') as HTMLButtonElement,
        document.getElementById('octave-down') as HTMLButtonElement,
        document.getElementById('mobile-octave-up') as HTMLButtonElement,
        document.getElementById('mobile-octave-down') as HTMLButtonElement
      ];
    default:
      return [];
  }
}

/**
 * Update sustain toggle UI
 */
function updateSustainToggle(enabled: boolean): void {
  const toggles = [
    document.getElementById('sustain-toggle') as HTMLButtonElement,
    document.getElementById('mobile-sustain-toggle') as HTMLButtonElement
  ];
  toggles.forEach(toggle => {
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(enabled));
      toggle.classList.toggle('active', enabled);
    }
  });
}

/**
 * Update root bass toggle UI
 */
function updateRootBassToggle(enabled: boolean): void {
  const toggles = [
    document.getElementById('root-bass-toggle') as HTMLButtonElement,
    document.getElementById('mobile-root-bass-toggle') as HTMLButtonElement
  ];
  toggles.forEach(toggle => {
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(enabled));
      toggle.classList.toggle('active', enabled);
    }
  });
}

/**
 * Update humanise toggle UI
 */
function updateHumaniseToggle(enabled: boolean): void {
  const toggles = [
    document.getElementById('humanise-toggle') as HTMLButtonElement,
    document.getElementById('mobile-humanise-toggle') as HTMLButtonElement
  ];
  toggles.forEach(toggle => {
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(enabled));
      toggle.classList.toggle('active', enabled);
    }
  });
}

/**
 * Update inversion display UI for style overrides
 */
function updateInversionDisplayForStyle(inversion: number): void {
  const displays = [
    document.getElementById('inversion-display') as HTMLElement,
    document.getElementById('mobile-inversion-display') as HTMLElement
  ];
  const buttons = [
    document.getElementById('inversion-button') as HTMLButtonElement,
    document.getElementById('mobile-inversion-button') as HTMLButtonElement
  ];
  displays.forEach(display => {
    if (display) {
      display.textContent = (inversion + 1).toString();
    }
  });
  buttons.forEach(button => {
    if (button) {
      button.setAttribute('data-inversion', inversion.toString());
    }
  });
}

function setupEventListeners(): void {
  // Import progression player dynamically to avoid circular dependency
  let progressionPlayerModule: typeof import('./chordProgressionPlayer') | null = null;
  const getProgressionPlayerModule = async () => {
    if (!progressionPlayerModule) {
      progressionPlayerModule = await import('./chordProgressionPlayer');
    }
    return progressionPlayerModule;
  };

  // Root selection change - show transpose modal if progression has chords
  addListener(rootSelect, 'change', async () => {
    const newRoot = rootSelect.value;
    const oldRoot = state.selectedRoot;
    if (newRoot === oldRoot) return;

    const module = await getProgressionPlayerModule();
    const sections: ProgressionSection[] = module.getProgressionSections();

    if (hasChords(sections)) {
      const transpose = await showTransposeProgressionModal(oldRoot, newRoot);
      if (!transpose) {
        rootSelect.value = oldRoot;
        return;
      }
      const semitones = getSemitonesBetweenRoots(oldRoot, newRoot);
      const transposed = transposeSections(sections, semitones);
      module.setProgressionSections(transposed);
    }

    state.selectedRoot = newRoot;
    updateHarmonization();
    if (integrationProps?.onSongKeyChange) {
      const currentKey = getCurrentSongKey();
      if (currentKey) {
        integrationProps.onSongKeyChange(currentKey);
      }
    }
  });
  
  // Scale selection change
  addListener(scaleSelect, 'change', () => {
    const selectedScaleId = scaleSelect.value;
    // Use resolveScale to handle emotional buckets
    state.selectedScale = resolveScale(selectedScaleId);
    updateMinorScaleToggleUI();
    updateHarmonization();
    // Notify React wrapper of state change
    if (integrationProps?.onSongKeyChange) {
      const currentKey = getCurrentSongKey();
      if (currentKey) {
        integrationProps.onSongKeyChange(currentKey);
      }
    }
  });

  // Minor scale toggle (Natural / Harmonic / Melodic) - only visible when scale is minor
  (['natural', 'harmonic', 'melodic'] as MinorScaleType[]).forEach(type => {
    const btn = document.getElementById(`minor-scale-${type}`);
    if (btn) {
      addListener(btn, 'click', () => {
        if (state.selectedScale.id !== EMOTIONAL_BUCKET_IDS.MINOR) return;
        state.minorScaleType = type;
        updateMinorScaleToggleUI();
        updateHarmonization();
        if (integrationProps?.onSongKeyChange) {
          const currentKey = getCurrentSongKey();
          if (currentKey) integrationProps.onSongKeyChange(currentKey);
        }
      });
    }
  });
  
  // Instrument selection change
  addListener(instrumentSelect, 'change', async () => {
    const selectedInstrumentId = instrumentSelect.value as InstrumentId;
    state.selectedInstrument = selectedInstrumentId;
    await setInstrument(selectedInstrumentId);
  });
  
  // Style selection change
  addListener(styleSelect, 'change', async () => {
    state.selectedStyle = styleSelect.value;
    setPlaybackStyle(styleSelect.value);
    await applyStyleOverrides(styleSelect.value);
  });
  
  // Player settings controls (Time, Tempo, Metronome)
  const timeSignatureButton = document.getElementById('time-signature') as HTMLButtonElement;
  const tempoMinusBtn = document.querySelector('.tempo-minus-btn') as HTMLButtonElement;
  const tempoPlusBtn = document.querySelector('.tempo-plus-btn') as HTMLButtonElement;
  const tempoDisplay = document.getElementById('tempo-display') as HTMLElement;
  const metronomeToggle = document.getElementById('metronome-toggle') as HTMLButtonElement;
  const metronomeVolumeSlider = document.getElementById('metronome-volume') as HTMLInputElement;
  const metronomeMuteButton = document.querySelector('.metronome-mute-button') as HTMLButtonElement;
  
  // Time signature cycle: 4/4 → 3/4 → 6/8 → 4/4 (any style can be used with any time sig)
  if (timeSignatureButton) {
    addListener(timeSignatureButton, 'click', async () => {
      const module = await getProgressionPlayerModule();
      const currentSig = module.getProgressionTimeSignature();
      const newSig: [number, number] =
        currentSig[0] === 4 && currentSig[1] === 4
          ? [3, 4]
          : currentSig[0] === 3 && currentSig[1] === 4
            ? [6, 8]
            : [4, 4];
      module.setProgressionTimeSignature(newSig);
      timeSignatureButton.textContent = `${newSig[0]}/${newSig[1]}`;
    });
  }
  
  // Tempo controls
  if (tempoMinusBtn) {
    addListener(tempoMinusBtn, 'click', async () => {
      const module = await getProgressionPlayerModule();
      const currentBpm = module.getProgressionBpm();
      module.setProgressionBpm(currentBpm - 1);
      if (tempoDisplay) {
        tempoDisplay.textContent = module.getProgressionBpm().toString();
      }
    });
  }
  
  if (tempoPlusBtn) {
    addListener(tempoPlusBtn, 'click', async () => {
      const module = await getProgressionPlayerModule();
      const currentBpm = module.getProgressionBpm();
      module.setProgressionBpm(currentBpm + 1);
      if (tempoDisplay) {
        tempoDisplay.textContent = module.getProgressionBpm().toString();
      }
    });
  }
  
  // Metronome toggle (menu trigger, not a toggle)
  if (metronomeToggle) {
    addListener(metronomeToggle, 'click', async (e) => {
      e.stopPropagation();
      
      // Toggle menu
      const menu = document.getElementById('metronome-menu') as HTMLElement;
      if (menu) {
        const isOpen = menu.style.display !== 'none';
        menu.style.display = isOpen ? 'none' : 'block';
        metronomeToggle.setAttribute('aria-expanded', String(!isOpen));
      }
    });
  }

  const metronomeTypeSelect = document.getElementById('metronome-type') as HTMLSelectElement;
  if (metronomeTypeSelect) {
    addListener(metronomeTypeSelect, 'change', async (e) => {
      const module = await getProgressionPlayerModule();
      const value = (e.target as HTMLSelectElement).value as import('./chordProgressionEngine').MetronomeTypeId;
      module.setProgressionMetronomeType(value);
    });
  }
  
  // Metronome volume slider
  const metronomeVolumeValue = document.getElementById('metronome-volume-value') as HTMLElement;
  if (metronomeVolumeSlider) {
    addListener(metronomeVolumeSlider, 'input', async (e) => {
      const module = await getProgressionPlayerModule();
      const newVolume = parseFloat((e.target as HTMLInputElement).value);
      module.setProgressionMetronomeVolume(newVolume);
      if (metronomeVolumeValue) {
        metronomeVolumeValue.textContent = `${newVolume.toFixed(1)} dB`;
      }
    });
  }
  
  // Metronome mute button
  if (metronomeMuteButton) {
    addListener(metronomeMuteButton, 'click', async () => {
      const module = await getProgressionPlayerModule();
      module.setProgressionMetronomeVolume(-40);
      if (metronomeVolumeSlider) {
        metronomeVolumeSlider.value = '-40';
      }
      if (metronomeVolumeValue) {
        metronomeVolumeValue.textContent = '-40.0 dB';
      }
    });
  }
  
  // Close metronome menu when clicking outside
  addListener(document, 'click', (e) => {
    const menu = document.getElementById('metronome-menu') as HTMLElement;
    if (menu && metronomeToggle && 
        !menu.contains(e.target as Node) && 
        !metronomeToggle.contains(e.target as Node)) {
      menu.style.display = 'none';
      metronomeToggle.setAttribute('aria-expanded', 'false');
    }
  });

  // Refresh palette when custom chords change (e.g. added from progression player)
  addListener(document, 'customChordsChanged', () => {
    updateHarmonization();
  });

  // Volume control
  addListener(volumeSlider, 'input', () => {
    const value = parseInt(volumeSlider.value);
    setVolume(value);
  });
  
  // Reverb control (instrument + metronome)
  setMetronomeReverbWet(parseInt(reverbSlider.value, 10) / 100); // sync initial value
  addListener(reverbSlider, 'input', () => {
    const value = parseInt(reverbSlider.value) / 100;
    setReverbWet(value);
    setMetronomeReverbWet(value);
  });
  
  // Sustain toggle
  addListener(sustainToggle, 'click', () => {
    const isPressed = sustainToggle.getAttribute('aria-pressed') === 'true';
    const newState = !isPressed;
    sustainToggle.setAttribute('aria-pressed', String(newState));
    setAlwaysSustain(newState);
  });
  
  // Root bass toggle - keep root in bass when inverting chords
  const rootBassToggle = document.getElementById('root-bass-toggle') as HTMLButtonElement;
  addListener(rootBassToggle, 'click', () => {
    const isPressed = rootBassToggle.getAttribute('aria-pressed') === 'true';
    const newState = !isPressed;
    rootBassToggle.setAttribute('aria-pressed', String(newState));
    setKeepRootBass(newState);
  });
  
  // Humanise toggle - strum-like timing variation between notes
  const humaniseToggle = document.getElementById('humanise-toggle') as HTMLButtonElement;
  addListener(humaniseToggle, 'click', () => {
    const isPressed = humaniseToggle.getAttribute('aria-pressed') === 'true';
    const newState = !isPressed;
    humaniseToggle.setAttribute('aria-pressed', String(newState));
    setHumanise(newState);
  });
  
  // Octave up button (latching - only while held)
  addListener(octaveUpButton, 'mousedown', () => {
    setOctaveShift(1);
    octaveUpButton.classList.add('active');
  });
  
  addListener(octaveUpButton, 'mouseup', () => {
    setOctaveShift(0);
    octaveUpButton.classList.remove('active');
  });
  
  addListener(octaveUpButton, 'mouseleave', () => {
    if (getOctaveShift() === 1) {
      setOctaveShift(0);
      octaveUpButton.classList.remove('active');
    }
  });
  
  // Octave down button (latching - only while held)
  addListener(octaveDownButton, 'mousedown', () => {
    setOctaveShift(-1);
    octaveDownButton.classList.add('active');
  });
  
  addListener(octaveDownButton, 'mouseup', () => {
    setOctaveShift(0);
    octaveDownButton.classList.remove('active');
  });
  
  addListener(octaveDownButton, 'mouseleave', () => {
    if (getOctaveShift() === -1) {
      setOctaveShift(0);
      octaveDownButton.classList.remove('active');
    }
  });
  
  // Inversion button (cycles through inversions on each click)
  addListener(inversionButton, 'click', () => {
    triggerInversionCycle();
  });
  
  // Mobile settings toggle
  addListener(keyboardSettingsToggle, 'click', (e) => {
    e.stopPropagation();
    const menu = keyboardSettingsMenu;
    if (menu) {
      const isOpen = menu.style.display !== 'none';
      menu.style.display = isOpen ? 'none' : 'flex';
      menu.classList.toggle('open', !isOpen);
      keyboardSettingsToggle.setAttribute('aria-expanded', String(!isOpen));
    }
  });
  
  // Close settings menu when clicking outside
  addListener(document, 'click', (e) => {
    const menu = keyboardSettingsMenu;
    if (menu && keyboardSettingsToggle && 
        !menu.contains(e.target as Node) && 
        !keyboardSettingsToggle.contains(e.target as Node)) {
      menu.style.display = 'none';
      menu.classList.remove('open');
      keyboardSettingsToggle.setAttribute('aria-expanded', 'false');
    }
  });
  
  // Mobile octave controls (step -3 to +3)
  addListener(mobileOctaveUp, 'click', () => {
    const current = getOctaveShift();
    if (current < 3) setOctaveShift(current + 1);
  });
  
  addListener(mobileOctaveDown, 'click', () => {
    const current = getOctaveShift();
    if (current > -3) setOctaveShift(current - 1);
  });
  
  // Mobile sustain toggle (syncs with main toggle)
  addListener(mobileSustainToggle, 'click', () => {
    const isPressed = sustainToggle.getAttribute('aria-pressed') === 'true';
    const newState = !isPressed;
    sustainToggle.setAttribute('aria-pressed', String(newState));
    mobileSustainToggle.setAttribute('aria-pressed', String(newState));
    setAlwaysSustain(newState);
  });
  
  // Sync main sustain toggle click to mobile
  addListener(sustainToggle, 'click', () => {
    const newState = sustainToggle.getAttribute('aria-pressed') === 'true';
    mobileSustainToggle.setAttribute('aria-pressed', String(newState));
  });
  
  // Mobile root bass toggle (syncs with main toggle)
  addListener(mobileRootBassToggle, 'click', () => {
    const rootBassToggle = document.getElementById('root-bass-toggle') as HTMLButtonElement;
    const isPressed = rootBassToggle.getAttribute('aria-pressed') === 'true';
    const newState = !isPressed;
    rootBassToggle.setAttribute('aria-pressed', String(newState));
    mobileRootBassToggle.setAttribute('aria-pressed', String(newState));
    setKeepRootBass(newState);
  });
  
  // Mobile humanise toggle (syncs with main toggle)
  addListener(mobileHumaniseToggle, 'click', () => {
    const humaniseToggle = document.getElementById('humanise-toggle') as HTMLButtonElement;
    const isPressed = humaniseToggle.getAttribute('aria-pressed') === 'true';
    const newState = !isPressed;
    humaniseToggle.setAttribute('aria-pressed', String(newState));
    mobileHumaniseToggle.setAttribute('aria-pressed', String(newState));
    setHumanise(newState);
  });
  
  // Mobile inversion button (syncs with main button)
  addListener(mobileInversionButton, 'click', () => {
    triggerInversionCycle();
  });
}

/**
 * Update the octave display UI
 */
function updateOctaveDisplay(shift: number): void {
  const displayText = shift > 0 ? `+${shift}` : String(shift);
  const className = shift > 0 ? 'shifted-up' : shift < 0 ? 'shifted-down' : '';
  
  // Update main display
  octaveDisplay.textContent = displayText;
  octaveDisplay.className = `octave-display ${className}`.trim();
  
  // Update mobile display
  if (mobileOctaveDisplay) {
    mobileOctaveDisplay.textContent = displayText;
    mobileOctaveDisplay.className = `settings-octave-display ${className}`.trim();
  }
  
  // Update button states
  octaveUpButton.classList.toggle('active', shift > 0);
  octaveDownButton.classList.toggle('active', shift < 0);
}

/**
 * Update the inversion display UI
 */
function updateInversionDisplay(inversion: number, _maxInversion: number): void {
  // Update main button
  inversionButton.dataset.inversion = String(inversion);
  inversionDisplay.textContent = String(inversion);
  
  // Update mobile button
  if (mobileInversionButton && mobileInversionDisplay) {
    mobileInversionButton.dataset.inversion = String(inversion);
    mobileInversionDisplay.textContent = String(inversion);
  }
}

/**
 * Update the selected chord area when a chord is played
 */
// Legacy function - selected chord display moved to transport controls
// Keeping stub for compatibility, but functionality is now in chordProgressionPlayer.ts
function updateSelectedChord(chord: { symbol: string; notes: string[]; degreeRoman: string }): void {
  // Selected chord info is now displayed in transport controls via chordProgressionPlayer.ts
  // This function is kept for compatibility but does nothing
}

async function initializeAudio(): Promise<void> {
  if (state.audioInitialized) return;
  
  try {
    await initAudio(state.selectedInstrument);
    state.audioInitialized = true;
    console.log('🎹 Chord Explorer ready!');
  } catch (error) {
    console.error('Failed to initialize audio:', error);
  }
}

/**
 * Initialize audio on first user interaction (required by browsers)
 * Uses capture phase to init audio before chord handlers run.
 * Includes touch events for iOS (Chrome/Safari) where touch is the primary input.
 */
function setupAudioInitOnInteraction(): () => void {
  const initOnInteraction = async () => {
    if (!state.audioInitialized) {
      await initializeAudio();
    }
    // Remove all listeners after first successful init
    document.removeEventListener('mousedown', initOnInteraction, true);
    document.removeEventListener('keydown', initOnInteraction, true);
    document.removeEventListener('touchstart', initOnInteraction, true);
  };

  // Use capture phase (true) so this runs before chord button handlers
  document.addEventListener('mousedown', initOnInteraction, true);
  document.addEventListener('keydown', initOnInteraction, true);
  document.addEventListener('touchstart', initOnInteraction, true);

  return () => {
    document.removeEventListener('mousedown', initOnInteraction, true);
    document.removeEventListener('keydown', initOnInteraction, true);
    document.removeEventListener('touchstart', initOnInteraction, true);
  };
}

// ===========================
// HARMONIZATION
// ===========================

function updateHarmonization(): void {
  // Collapse any expanded degree
  collapseAll();
  
  // Generate new harmonization
  // For minor emotional bucket, use a single scale (Natural / Harmonic / Melodic) so the palette shows one set of diatonic chords
  if (state.selectedScale.id === EMOTIONAL_BUCKET_IDS.MINOR) {
    const scaleId = MINOR_SCALE_TYPE_TO_ID[state.minorScaleType];
    const scale = getScaleById(scaleId);
    if (scale) {
      state.harmonization = harmonizeScale(state.selectedRoot, scale);
    } else {
      state.harmonization = harmonizeScale(state.selectedRoot, getScaleById('aeolian')!);
    }
  } else if (isEmotionalScale(state.selectedScale.id)) {
    state.harmonization = harmonizeEmotionalBucket(
      state.selectedRoot,
      state.selectedScale.id as 'major_emotional' | 'minor_emotional',
      getScalesForEmotionalBucket as (bucketId: string) => Scale[],
      createEmotionalBucketScale as (bucketId: string) => Scale
    );
  } else {
    // Backwards compatibility: use regular harmonization
    state.harmonization = harmonizeScale(state.selectedRoot, state.selectedScale);
  }
  
  // Generate borrowed chords from parallel modes
  const borrowedChords = generateAllBorrowedChords(
    state.selectedRoot,
    state.selectedScale
  );
  
  // Render the palette with diatonic and borrowed chords
  renderChordPalette(paletteContainer, state.harmonization, borrowedChords);
  updateModeUI();
  
  // Update page title
  if (allowDocumentTitleUpdates) {
    document.title = `${state.selectedRoot} ${state.selectedScale.name} — Chord Explorer`;
  }
}

export interface ChordExplorerInstance {
  updateProps(nextProps: ChordExplorerProps): void;
  destroy(): void;
  getCurrentSongKey(): SongKey | null;
}

/**
 * Get the current song key from the main app state
 * This is useful for components that need to know the current key
 */
export function getCurrentSongKey(): SongKey | null {
  if (!state.selectedRoot || !state.selectedScale) {
    return null;
  }
  // For emotional buckets, return 'major'/'minor' so parent apps (e.g. test harness) keep dropdowns in sync
  const scaleValue = state.selectedScale.id === EMOTIONAL_BUCKET_IDS.MAJOR
    ? 'major'
    : state.selectedScale.id === EMOTIONAL_BUCKET_IDS.MINOR
      ? 'minor'
      : isEmotionalScale(state.selectedScale.id)
        ? state.selectedScale.id
        : state.selectedScale.name;
  const key: SongKey = {
    root: state.selectedRoot,
    scale: scaleValue,
  };
  if (state.selectedScale.id === EMOTIONAL_BUCKET_IDS.MINOR) {
    key.minorScaleType = state.minorScaleType;
  }
  return key;
}

async function applyProps(nextProps: ChordExplorerProps): Promise<void> {
  integrationProps = nextProps;

  // Clear persistence callbacks before seeding so we don't trigger redundant PUTs
  setOnCustomChordsChange(null);
  setOnAfterSaveProgression(null);
  setOnAfterDeleteProgression(null);

  // Seed from plugin persistence when parent provides initial data (e.g. from backend)
  if (nextProps.initialCustomChords !== undefined) {
    saveCustomChords(nextProps.initialCustomChords);
    updateHarmonization();
  }
  if (nextProps.initialProgressions !== undefined) {
    replaceAllUserProgressions(nextProps.initialProgressions);
  }

  // Register or clear plugin persistence callbacks
  const persistence = nextProps.pluginPersistence;
  setOnCustomChordsChange(
    persistence
      ? () => {
          persistence.setCustomChords(loadCustomChords()).catch(() => {});
        }
      : null
  );
  setOnAfterSaveProgression(
    persistence
      ? (progression) => {
          persistence.saveProgression(progression).catch(() => {});
        }
      : null
  );
  setOnAfterDeleteProgression(
    persistence
      ? (id) => {
          persistence.deleteProgression(id).catch(() => {});
        }
      : null
  );

  applySongKey(nextProps.songKey);
  updateModeUI();
  // When update is from playback-driven minor-scale switch, update palette so correct scale is shown, then sync chord highlight without playing (avoids double-play)
  if (nextProps.skipPlayOnApplyCurrentChord) {
    updateMinorScaleToggleUI();
    updateHarmonization();
    await applyCurrentChord(nextProps.currentChord, { play: false });
  } else {
    await applyCurrentChord(nextProps.currentChord);
  }

  if (nextProps.previousChord) {
    // If previousChord is borrowed, pass it to seed suggestions so resolution chords are included
    seedSuggestionsFromChord(nextProps.currentChord || nextProps.previousChord, nextProps.previousChord);
  } else if (nextProps.currentChord) {
    seedSuggestionsFromChord(nextProps.currentChord);
  }
}

function resetAppState(): void {
  state.selectedRoot = 'C';
  state.selectedScale = createEmotionalBucketScale(EMOTIONAL_BUCKET_IDS.MAJOR);
  state.selectedInstrument = 'grand-piano';
  state.harmonization = null;
  state.audioInitialized = false;
  state.minorScaleType = 'natural';
  selectedChord = null;
  cleanupFns = [];
  keyboardCleanup = null;
  audioInitCleanup = null;
}

export function mountChordExplorer(
  container: HTMLElement,
  props: ChordExplorerProps
): ChordExplorerInstance {
  if (mountedContainer) {
    cleanupFns.forEach(cleanup => cleanup());
    cleanupFns = [];
    releaseAll();
    mountedContainer.innerHTML = '';
  }
  mountedContainer = container;
  allowDocumentTitleUpdates = false;
  resetAppState();
  renderChordExplorerMarkup(container);
  integrationProps = props;
  
  // Set state first (before initDOM so populateScaleSelect can use it)
  state.selectedRoot = normalizeRoot(props.songKey.root);
  state.selectedScale = resolveScale(props.songKey.scale);
  
  initDOM();
  
  // Now apply song key to set the select values (selects exist after initDOM)
  applySongKey(props.songKey);
  applyProps(props).catch(err => {
    console.error('Error applying props:', err);
  });

  return {
    updateProps(nextProps: ChordExplorerProps) {
      applyProps(nextProps).catch(err => {
        console.error('Error applying props:', err);
      });
    },
    getCurrentSongKey() {
      return getCurrentSongKey();
    },
    destroy() {
      cleanupFns.forEach(cleanup => cleanup());
      cleanupFns = [];
      keyboardCleanup = null;
      audioInitCleanup = null;
      releaseAll();
      if (mountedContainer) {
        mountedContainer.innerHTML = '';
      }
      mountedContainer = null;
      selectedChord = null;
      integrationProps = null;
    },
  };
}
