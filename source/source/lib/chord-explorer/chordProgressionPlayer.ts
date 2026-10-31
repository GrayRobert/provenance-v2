/**
 * Chord Progression Player UI
 * Vanilla TypeScript implementation for performance-critical playback animations
 * 
 * This module follows the same pattern as chordPalette.ts:
 * - Direct DOM manipulation (no React)
 * - State managed in plain objects
 * - requestAnimationFrame for smooth 60fps animations
 */

import * as Tone from 'tone';
import type { TimelineBar, TimelineChord, TimeSignature, ChordDragData, ProgressionSection, SourceMinorScale } from './types/chordProgression';
import { getTimingBeatsPerBar, getSecondsPerBar, getSecondsPerBeat } from './types/chordProgression';
import type { Chord } from './harmonizer';
import type { ChordDTO } from './types/chordDto';
import { chordToChordDto, chordDtoToInternalChord } from './utils/chordDtoAdapters';
import {
  startPlayback,
  stopPlayback,
  updateTempo,
  setMetronomeEnabled,
  setMetronomeVolume,
  setMetronomeType,
  getMetronomeType,
  onBeat,
  onEnd,
  onChordPlay,
  initProgressionEngine,
} from './chordProgressionEngine';
import type { MetronomeTypeId } from './chordProgressionEngine';
import { getMeterLevelStereo } from './audioEngine';
import { highlightNotes, clearHighlights } from './pianoKeyboard';
import { getInversion, highlightChordForPlayback, clearPlaybackHighlight, isChordInPalette } from './chordPalette';
import { getScaleById, ALL_SCALES, isEmotionalScale, EMOTIONAL_BUCKET_IDS, getScalesForEmotionalBucket } from './scales';
import { getProgressionsByTier, getProgressionsByTierAndTonality, getProgressionById, type ChordProgression } from './chordProgressionDictionary';
import { convertProgressionToChords, getMinorScaleTypeForProgressionChord, inferMinorScaleForChord, type TensionLevel } from './utils/progressionConverter';
import { getProgressionCompatibilityStatus, getDesignedForTags, type CompatibilityStatus } from './utils/progressionCompatibility';
import { generateProgressionExample } from './utils/progressionExamples';
import {
  loadUserProgressions,
  saveUserProgression,
  deleteUserProgression,
  generateUserProgressionId,
  getProgressionChordSymbols,
  hasChords,
  type UserProgression,
} from './userProgressions';
import { getSemitonesBetweenRoots, transposeSections } from './transpose';
import { noteToMidi, harmonizeScale } from './harmonizer';
import { showErrorModal } from './main';
import { addCustomChord, chordSymbolToInternalChord, validateChordSymbol } from './customChords';
import './components/ChordProgressionPlayer.css';

/** Normalize scale for comparison (e.g. "Major", "major_emotional" -> "major") */
function normalizeScaleForCompare(scale: string): string {
  return scale.toLowerCase().replace(/\s+/g, '').replace(/_/g, '').replace(/emotional/g, '').trim();
}

/** Return true if both song keys refer to the same key (root + scale family). Roots compared by pitch class so F# and Gb match. */
function sameSongKey(
  a: { root: string; scale: string },
  b: { root: string; scale: string }
): boolean {
  if (!a?.root || !b?.root) return false;
  const aMidi = noteToMidi(a.root, 4);
  const bMidi = noteToMidi(b.root, 4);
  if ((aMidi % 12) !== (bMidi % 12)) return false;
  return normalizeScaleForCompare(a.scale) === normalizeScaleForCompare(b.scale);
}

/** Scale ID for chord DTO context (e.g. melodic_minor when minor + melodic so parent can re-open with same palette). */
function getScaleIdForDto(songKey: { root: string; scale: string; minorScaleType?: PreferredMinorScale }): string {
  const norm = normalizeScaleForCompare(songKey.scale);
  if (norm === 'minor') {
    const t = songKey.minorScaleType ?? 'natural';
    return t === 'harmonic' ? 'harmonic_minor' : t === 'melodic' ? 'melodic_minor' : 'aeolian';
  }
  return songKey.scale;
}

/** Return true if chord is diatonic to the given key. For minor keys, checks natural, harmonic, and melodic minor. */
function isChordDiatonicToKey(
  chord: Chord,
  songKey: { root: string; scale: string } | undefined
): boolean {
  if (!songKey?.root || !songKey?.scale) return false;
  const scaleNorm = normalizeScaleForCompare(songKey.scale);
  const isMinor = scaleNorm === 'minor';
  const isMajor = scaleNorm === 'major';
  if (!isMinor && !isMajor) return false;

  const chordPc = noteToMidi(chord.root, 4) % 12;
  const sameRootAndQuality = (c: Chord) =>
    (noteToMidi(c.root, 4) % 12) === chordPc && c.quality === chord.quality;

  if (isMajor) {
    const majorScale = getScaleById('major') ?? getScalesForEmotionalBucket(EMOTIONAL_BUCKET_IDS.MAJOR)[0];
    if (!majorScale) return false;
    const harm = harmonizeScale(songKey.root, majorScale);
    for (const d of harm.degrees) {
      if (sameRootAndQuality(d.primaryChord)) return true;
      for (const v of d.variations) {
        if (sameRootAndQuality(v)) return true;
      }
    }
    return false;
  }

  const minorScales = getScalesForEmotionalBucket(EMOTIONAL_BUCKET_IDS.MINOR);
  for (const scale of minorScales) {
    if (!scale) continue;
    const harm = harmonizeScale(songKey.root, scale);
    for (const d of harm.degrees) {
      if (sameRootAndQuality(d.primaryChord)) return true;
      for (const v of d.variations) {
        if (sameRootAndQuality(v)) return true;
      }
    }
  }
  return false;
}

// ===========================
// TYPES
// ===========================

export type PreferredMinorScale = 'natural' | 'harmonic' | 'melodic';

export interface ChordProgressionPlayerProps {
  songKey?: { root: string; scale: string; minorScaleType?: PreferredMinorScale };
  mode?: 'insert' | 'edit';
  currentChord?: ChordDTO;
  onInsert?: (chord: ChordDTO) => void;
  onUpdate?: (chord: ChordDTO) => void;
  onRemove?: () => void;
  /** Called when user chooses to change app key to match a loaded progression (e.g. saved in C, "Change key to match chords"). */
  onSongKeyChange?: (songKey: { root: string; scale: string; minorScaleType?: PreferredMinorScale }) => void;
  /** Called when user applies a minor progression so the palette can switch to that minor scale (Natural / Harmonic / Melodic). */
  onMinorScaleTypeChange?: (minorScaleType: PreferredMinorScale) => void;
  /** Visual theme for modals that are portaled to body (e.g. progression selection). 'light' | 'dark'. */
  theme?: 'light' | 'dark';
}

export interface ChordProgressionPlayerInstance {
  updateProps(props: ChordProgressionPlayerProps): void;
  destroy(): void;
}

// ===========================
// STATE
// ===========================

let container: HTMLElement | null = null;
let props: ChordProgressionPlayerProps = {};

// Player state: single section (one horizontal timeline)
let sections: ProgressionSection[] = [];
let isPlaying = false;
const MIN_BPM = 40;
const MAX_BPM = 170;
let bpm = 110;
let timeSignature: TimeSignature = [4, 4];
let metronomeEnabled = true;
let metronomeVolume = 0; // dB (0 = benchmark; compensations applied per type)
/** Metronome sound type; default = thump. */
let metronomeType: MetronomeTypeId = 'thump';
let currentSectionIndex: number | null = null;
let currentBarIndexInSection: number | null = null;
let currentBeat = 0;
let selectedTimelineChord: { sectionIndex: number; barIndex: number; chordIndex: number } | null = null;
let selectedPaletteChord: Chord | null = null;
let currentChordProgress: { sectionIndex: number; barIndex: number; chordIndex: number; progress: number } | null = null;
let completedChords = new Set<string>(); // "sectionIndex-barIndex-chordIndex"
let metronomeMenuOpen = false;
let resizingBorder: { sectionIndex: number; barIndex: number; chordIndex: number } | null = null;
let resizeStartX = 0;
let resizeStartPosition = 0;
let draggingChord: { sectionIndex: number; barIndex: number; chordIndex: number } | null = null;
let dragOverSection: number | null = null;
let dragOverBarInSection: number | null = null; // -1 = empty bar of that section
let dragOverChord: { sectionIndex: number; barIndex: number; chordIndex: number } | null = null;
let isDraggingOutside = false;
let deletingChord: { sectionIndex: number; barIndex: number; chordIndex: number } | null = null;
let nextIdCounter = 0;
let dropHandled = false;

/** Playback: flat bar list built from sections (with repeat counts). Used by engine and progress mapping. */
let playbackBars: TimelineBar[] = [];
/** sectionBoundaries[i] = start flat index of section i in playbackBars. Used to map flatBarIndex -> (sectionIndex, barInSection). */
let sectionBoundaries: number[] = [];
/** Last chord key we switched palette for (so we only call onMinorScaleTypeChange when chord position changes). */
let lastPaletteSwitchChordKey: string | null = null;

// Palette touch-drag (long-press + drag from chord palette on touch devices)
let paletteTouchDragChord: Chord | null = null;
let paletteTouchDragGhost: HTMLElement | null = null;

// DOM references
let rootElement: HTMLElement | null = null;
let timelineContainer: HTMLElement | null = null;
let timelineElement: HTMLElement | null = null;
let animationFrameId: number | null = null;

// ===========================
// ID GENERATION
// ===========================

function generateId(): string {
  return `chord-${Date.now()}-${nextIdCounter++}`;
}

// ===========================
// DOM CREATION
// ===========================

function createTransportBar(): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'player-transport-bar';
  bar.setAttribute('data-tour', 'transport-bar');

  // Transport controls
  const controls = document.createElement('div');
  controls.className = 'transport-controls';

  const playStopButton = document.createElement('button');
  playStopButton.type = 'button';
  playStopButton.className = 'transport-button play-stop-button';
  playStopButton.setAttribute('aria-label', 'Play');
  playStopButton.innerHTML = '<span class="material-symbols-outlined transport-icon" aria-hidden="true">play_arrow</span>';
  playStopButton.addEventListener('click', () => {
    if (isPlaying) {
      handleStop();
    } else {
      handlePlay().catch(err => {
        console.error('Error starting playback:', err);
      });
    }
  });

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'transport-button clear-button';
  clearButton.setAttribute('aria-label', 'Clear progression');
  clearButton.title = 'Clear progression';
  clearButton.innerHTML = '<span class="material-symbols-outlined transport-icon" aria-hidden="true">delete</span>';
  clearButton.addEventListener('click', handleClearClick);

  const saveProgressionBtn = document.createElement('button');
  saveProgressionBtn.type = 'button';
  saveProgressionBtn.className = 'transport-button save-progression-button';
  saveProgressionBtn.setAttribute('aria-label', 'Save progression');
  saveProgressionBtn.title = 'Save progression';
  saveProgressionBtn.innerHTML = '<span class="material-symbols-outlined transport-icon" aria-hidden="true">save</span>';
  saveProgressionBtn.disabled = !hasChords(sections);
  saveProgressionBtn.addEventListener('click', handleSaveProgressionClick);

  const outputMeterBtn = document.createElement('button');
  outputMeterBtn.type = 'button';
  outputMeterBtn.className = 'transport-button output-meter-button';
  outputMeterBtn.setAttribute('aria-label', 'Output level meter');
  outputMeterBtn.title = 'Output level meter';
  outputMeterBtn.innerHTML = '<span class="material-symbols-outlined transport-icon" aria-hidden="true">volume_up</span>';
  outputMeterBtn.addEventListener('click', showOutputMeterModal);

  controls.appendChild(playStopButton);
  controls.appendChild(clearButton);
  controls.appendChild(saveProgressionBtn);
  controls.appendChild(outputMeterBtn);

  // Selected chord info (centered)
  const selectedChordInfo = document.createElement('div');
  selectedChordInfo.className = 'player-selected-chord-info';
  selectedChordInfo.id = 'selected-chord-info';
  selectedChordInfo.setAttribute('data-tour', 'selected-chord-info');

  // Timeline actions (Insert/Remove buttons) - grouped with selected chord info
  const timelineActions = document.createElement('div');
  timelineActions.className = 'player-timeline-actions';
  timelineActions.id = 'timeline-actions';
  // Will be populated by updateTimelineActions()

  bar.appendChild(controls);
  bar.appendChild(selectedChordInfo);
  bar.appendChild(timelineActions); // Place next to selected chord info

  return bar;
}

function createTimelineContainer(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'player-timeline-container';
  container.id = 'timeline-container';
  container.setAttribute('data-tour', 'timeline');
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    const hasJsonData = e.dataTransfer?.types.includes('application/json');
    if (draggingChord) {
      handleTimelineDragOver(e);
      return;
    }
    if (hasJsonData) {
      e.dataTransfer!.dropEffect = 'copy';
      if (dragOverSection !== 0 || dragOverBarInSection !== -1) {
        dragOverSection = 0;
        dragOverBarInSection = -1;
        dragOverChord = null;
        updateDragOverStylesOnly();
      }
    }
  }, false);

  container.addEventListener('drop', (e) => {
    if (draggingChord) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const dataStr = e.dataTransfer?.getData('application/json');
    if (!dataStr) return;
    try {
      const dragData = JSON.parse(dataStr) as ChordDragData & { sectionIndex?: number; barIndex?: number; chordIndex?: number };
      if (dragData.chord && (dragData.source === 'palette' || !dragData.source)) {
        e.preventDefault();
        e.stopPropagation();
        handleDrop(e, 0, -1);
      }
    } catch {
      /* ignore */
    }
  }, false);

  const timeline = document.createElement('div');
  timeline.className = 'player-timeline';
  timeline.id = 'player-timeline';

  container.appendChild(timeline);
  timelineContainer = container;
  timelineElement = timeline;

  return container;
}

function createTimelineBar(bar: TimelineBar, sectionIndex: number, barIndexInSection: number): HTMLElement {
  const barElement = document.createElement('div');
  barElement.className = 'timeline-bar';
  barElement.setAttribute('data-section-index', sectionIndex.toString());
  barElement.setAttribute('data-bar-index', barIndexInSection.toString());

  barElement.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleDragOver(e, sectionIndex, barIndexInSection);
  }, false);

  barElement.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleDrop(e, sectionIndex, barIndexInSection);
  }, false);

  barElement.addEventListener('dragleave', (e) => {
    const rect = barElement.getBoundingClientRect();
    const x = (e as DragEvent).clientX;
    const y = (e as DragEvent).clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      dragOverSection = null;
      dragOverBarInSection = null;
      dragOverChord = null;
      updateDragOverStylesOnly();
    }
  });

  bar.chords.forEach((timelineChord, chordIndex) => {
    if (deletingChord?.sectionIndex === sectionIndex && deletingChord?.barIndex === barIndexInSection && deletingChord?.chordIndex === chordIndex) {
      return;
    }
    const chordElement = createTimelineChord(timelineChord, sectionIndex, barIndexInSection, chordIndex);
    barElement.appendChild(chordElement);
    if (chordIndex < bar.chords.length - 1) {
      const resizeHandle = createResizeHandle(sectionIndex, barIndexInSection, chordIndex, timelineChord);
      barElement.appendChild(resizeHandle);
    }
  });

  return barElement;
}

function createTimelineChord(timelineChord: TimelineChord, sectionIndex: number, barIndex: number, chordIndex: number): HTMLElement {
  const chordElement = document.createElement('div');
  chordElement.className = 'timeline-chord';
  chordElement.setAttribute('data-section-index', sectionIndex.toString());
  chordElement.setAttribute('data-bar-index', barIndex.toString());
  chordElement.setAttribute('data-chord-index', chordIndex.toString());
  chordElement.style.left = `${timelineChord.position * 100}%`;
  chordElement.style.width = `${timelineChord.duration * 100}%`;

  const symbol = document.createElement('span');
  symbol.className = 'chord-symbol';
  symbol.textContent = timelineChord.chord?.symbol ?? timelineChord.chord?.root ?? '';
  chordElement.appendChild(symbol);

  chordElement.addEventListener('click', () => handleChordClick(sectionIndex, barIndex, chordIndex));
  chordElement.draggable = true;
  chordElement.addEventListener('dragstart', (e) => handleChordDragStart(e, sectionIndex, barIndex, chordIndex));
  chordElement.addEventListener('dragend', handleChordDragEnd);
  chordElement.addEventListener('touchstart', (e) => handleChordTouchStart(e, sectionIndex, barIndex, chordIndex), { passive: true });
  chordElement.addEventListener('touchmove', handleChordTouchMove, { passive: true });
  chordElement.addEventListener('touchend', handleChordTouchEnd);

  return chordElement;
}

function createResizeHandle(sectionIndex: number, barIndex: number, chordIndex: number, timelineChord: TimelineChord): HTMLElement {
  const handle = document.createElement('div');
  handle.className = 'timeline-border-resize';
  handle.style.left = `${(timelineChord.position + timelineChord.duration) * 100}%`;
  handle.setAttribute('data-section-index', sectionIndex.toString());
  handle.setAttribute('data-bar-index', barIndex.toString());
  handle.setAttribute('data-chord-index', chordIndex.toString());
  handle.addEventListener('mousedown', (e) => handleBorderMouseDown(e, sectionIndex, barIndex, chordIndex));
  return handle;
}

/** Single add slot at end of timeline: drop zone + button that opens Chord Progressions modal. */
function createAddSlot(): HTMLElement {
  const sectionIndex = 0;
  const emptyBar = document.createElement('div');
  emptyBar.className = 'timeline-bar empty-bar timeline-add-slot';
  emptyBar.setAttribute('data-section-index', sectionIndex.toString());

  emptyBar.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleDragOver(e, sectionIndex, -1);
  }, false);

  emptyBar.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleDrop(e, sectionIndex, -1);
  }, false);

  emptyBar.addEventListener('dragleave', (e) => {
    const rect = emptyBar.getBoundingClientRect();
    const x = (e as DragEvent).clientX;
    const y = (e as DragEvent).clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      dragOverSection = null;
      dragOverBarInSection = null;
      dragOverChord = null;
      updateDragOverStylesOnly();
    }
  });

  const hintContainer = document.createElement('div');
  hintContainer.className = 'empty-bar-hint-container';
  const hint = document.createElement('span');
  hint.className = 'empty-bar-hint';
  hint.textContent = 'Drop chord here';
  hintContainer.appendChild(hint);
  const addProgressionBtn = document.createElement('button');
  addProgressionBtn.type = 'button';
  addProgressionBtn.className = 'add-progression-button';
  addProgressionBtn.setAttribute('data-tour', 'add-progression');
  addProgressionBtn.setAttribute('aria-label', 'Add progression');
  addProgressionBtn.innerHTML = '<span class="material-symbols-outlined add-btn-icon" aria-hidden="true">add</span><span class="add-btn-text">Add</span>';
  addProgressionBtn.addEventListener('click', () => {
    handleAddProgressionClick().catch(err => {
      console.error('Error opening progression modal:', err);
    });
  });
  hintContainer.appendChild(addProgressionBtn);
  emptyBar.appendChild(hintContainer);
  return emptyBar;
}

function createTimelineActions(): HTMLElement {
  const actions = document.createElement('div');
  actions.className = 'player-timeline-actions';
  actions.id = 'timeline-actions';

  const hasSelectedChord = selectedTimelineChord || selectedPaletteChord;
  const isEditMode = props.mode === 'edit';
  // In edit mode, if we have a selected chord (either from timeline or palette), we're editing
  // This covers both cases: editing a chord from the timeline, or editing a chord from the parent app (via currentChord)
  const isEditingExistingChord = isEditMode && hasSelectedChord;

  // Show remove button when in edit mode (editing an existing chord from parent app)
  if (isEditMode && hasSelectedChord) {
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'player-remove-chord-button trash-icon-button';
    removeButton.setAttribute('aria-label', 'Remove chord');
    removeButton.textContent = '🗑';
    removeButton.addEventListener('click', handleRemoveChord);
    actions.appendChild(removeButton);
  }

  // Show Insert/Update button when we have a selected chord
  if (hasSelectedChord) {
    const insertButton = document.createElement('button');
    insertButton.type = 'button';
    insertButton.className = 'player-insert-chord-button';
    const buttonText = isEditingExistingChord ? 'Update' : 'Insert';
    insertButton.setAttribute('aria-label', `${buttonText} chord`);
    const insertIcon = document.createElement('span');
    insertIcon.className = 'insert-icon';
    insertIcon.textContent = '↵';
    const insertText = document.createElement('span');
    insertText.className = 'insert-text';
    insertText.textContent = buttonText;
    insertButton.appendChild(insertIcon);
    insertButton.appendChild(insertText);
    insertButton.addEventListener('click', isEditingExistingChord ? handleUpdateChord : handleInsertChord);
    actions.appendChild(insertButton);
  }

  return actions;
}

// ===========================
// RENDERING
// ===========================

function render(): void {
  if (!container) return;

  container.innerHTML = '';
  rootElement = document.createElement('div');
  rootElement.className = 'chord-progression-player';

  const transportBar = createTransportBar();
  const timelineContainer = createTimelineContainer();

  rootElement.appendChild(transportBar);
  rootElement.appendChild(timelineContainer);

  container.appendChild(rootElement);

  updateTimeline();
  updateSelectedChordInfo();
  updateTransportButtons();
  updateMetronomeMenu();
}

function updateTimeline(): void {
  if (!timelineElement) return;

  if (draggingChord) {
    updateChordStyles();
    const existingBars = timelineElement.querySelectorAll('.timeline-bar:not(.empty-bar)');
    existingBars.forEach((barEl) => {
      const barElement = barEl as HTMLElement;
      const si = parseInt(barElement.getAttribute('data-section-index') ?? '-1', 10);
      const bi = parseInt(barElement.getAttribute('data-bar-index') ?? '-1', 10);
      barElement.classList.remove('active', 'drag-over');
      if (currentSectionIndex === si && currentBarIndexInSection === bi) barElement.classList.add('active');
      if (dragOverSection === si && dragOverBarInSection === bi) barElement.classList.add('drag-over');
    });
    const emptyBars = timelineElement.querySelectorAll('.empty-bar');
    emptyBars.forEach((emptyEl) => {
      const el = emptyEl as HTMLElement;
      const si = parseInt(el.getAttribute('data-section-index') ?? '-1', 10);
      el.classList.toggle('drag-over', dragOverSection === si && dragOverBarInSection === -1);
    });
    return;
  }

  if (!timelineElement) return;
  if (sections.length === 0) {
    sections = [{ id: generateId(), bars: [], repeatTimes: 1 }];
  }
  const timeline = timelineElement;
  timeline.innerHTML = '';
  const section = sections[0];
  if (section) {
    section.bars.forEach((bar, barIndexInSection) => {
      const barEl = createTimelineBar(bar, 0, barIndexInSection);
      timeline.appendChild(barEl);
      const si = 0;
      const bi = barIndexInSection;
      if (currentSectionIndex === si && currentBarIndexInSection === bi) barEl.classList.add('active');
      if (dragOverSection === si && dragOverBarInSection === bi) barEl.classList.add('drag-over');
    });
    const addSlot = createAddSlot();
    timeline.appendChild(addSlot);
    if (dragOverSection === 0 && dragOverBarInSection === -1) addSlot.classList.add('drag-over');
  } else {
    const addSlot = createAddSlot();
    timeline.appendChild(addSlot);
    if (dragOverSection === 0 && dragOverBarInSection === -1) addSlot.classList.add('drag-over');
  }

  const transportBar = rootElement?.querySelector('.player-transport-bar');
  const existingActions = transportBar?.querySelector('.player-timeline-actions') || timeline.querySelector('.player-timeline-actions');
  if (existingActions) existingActions.remove();
  const actions = createTimelineActions();
  if (actions.children.length > 0 && transportBar) {
    const selectedChordInfo = transportBar.querySelector('.player-selected-chord-info');
    if (selectedChordInfo) selectedChordInfo.insertAdjacentElement('afterend', actions);
    else transportBar.appendChild(actions);
  } else if (actions.children.length > 0) {
    timeline.appendChild(actions);
  }
  updateChordStyles();
}

function updateDragOverStylesOnly(): void {
  if (!timelineElement) return;
  const existingBars = timelineElement.querySelectorAll('.timeline-bar:not(.empty-bar)');
  existingBars.forEach((barEl) => {
    const el = barEl as HTMLElement;
    const si = parseInt(el.getAttribute('data-section-index') ?? '-1', 10);
    const bi = parseInt(el.getAttribute('data-bar-index') ?? '-1', 10);
    el.classList.toggle('drag-over', dragOverSection === si && dragOverBarInSection === bi);
  });
  const emptyBars = timelineElement.querySelectorAll('.empty-bar');
  emptyBars.forEach((emptyEl) => {
    const el = emptyEl as HTMLElement;
    const si = parseInt(el.getAttribute('data-section-index') ?? '-1', 10);
    el.classList.toggle('drag-over', dragOverSection === si && dragOverBarInSection === -1);
  });
  updateChordStyles();
}

function updateProgressStylesOnly(): void {
  if (!timelineElement) return;
  const existingBars = timelineElement.querySelectorAll('.timeline-bar:not(.empty-bar)');
  existingBars.forEach((barEl) => {
    const el = barEl as HTMLElement;
    const si = parseInt(el.getAttribute('data-section-index') ?? '-1', 10);
    const bi = parseInt(el.getAttribute('data-bar-index') ?? '-1', 10);
    el.classList.toggle('active', currentSectionIndex === si && currentBarIndexInSection === bi);
  });
  updateChordStyles();
}

function updateChordStyles(): void {
  if (!timelineElement) return;
  const chordElements = timelineElement.querySelectorAll('.timeline-chord');
  chordElements.forEach((element) => {
    const el = element as HTMLElement;
    const sectionIndex = parseInt(el.getAttribute('data-section-index') ?? '-1', 10);
    const barIndex = parseInt(el.getAttribute('data-bar-index') ?? '-1', 10);
    const chordIndex = parseInt(el.getAttribute('data-chord-index') ?? '-1', 10);

    el.classList.remove('selected', 'playing', 'sounding', 'dragging', 'dragging-outside', 'drag-over-chord');

    if (selectedTimelineChord?.sectionIndex === sectionIndex && selectedTimelineChord?.barIndex === barIndex && selectedTimelineChord?.chordIndex === chordIndex) {
      el.classList.add('selected');
    }

    const chordKey = `${sectionIndex}-${barIndex}-${chordIndex}`;
    const isCompleted = completedChords.has(chordKey);
    if (currentChordProgress?.sectionIndex === sectionIndex && currentChordProgress?.barIndex === barIndex && currentChordProgress?.chordIndex === chordIndex) {
      el.classList.add('playing');
      const progress = currentChordProgress.progress;
      const fillPercent = Math.min(100, Math.max(0, progress * 100));
      const gradientString = `linear-gradient(to right, 
        rgba(245, 166, 35, 0.8) 0%, 
        rgba(245, 166, 35, 0.8) ${fillPercent}%, 
        var(--bg-elevated) ${fillPercent}%, 
        var(--bg-elevated) 100%)`;
      el.style.background = gradientString;
      el.style.backgroundImage = gradientString;
    } else if (isCompleted) {
      el.classList.add('playing');
      const gradientString = `linear-gradient(to right, 
        rgba(245, 166, 35, 0.8) 0%, 
        rgba(245, 166, 35, 0.8) 100%, 
        var(--bg-elevated) 100%, 
        var(--bg-elevated) 100%)`;
      el.style.background = gradientString;
      el.style.backgroundImage = gradientString;
    } else {
      el.style.background = '';
      el.style.backgroundImage = '';
    }

    if (currentSectionIndex === sectionIndex && currentBarIndexInSection === barIndex && !el.classList.contains('playing')) {
      el.classList.add('sounding');
    }

    if (draggingChord?.sectionIndex === sectionIndex && draggingChord?.barIndex === barIndex && draggingChord?.chordIndex === chordIndex) {
      el.classList.add('dragging');
      el.style.opacity = '0.5';
      if (isDraggingOutside) el.classList.add('dragging-outside');
    } else {
      el.style.opacity = '1';
    }

    if (dragOverChord?.sectionIndex === sectionIndex && dragOverChord?.barIndex === barIndex && dragOverChord?.chordIndex === chordIndex) {
      el.classList.add('drag-over-chord');
    }
  });
}

function updateSelectedChordInfo(): void {
  const infoElement = document.getElementById('selected-chord-info');
  if (!infoElement) return;

  const selectedChord = selectedTimelineChord
    ? (() => {
        const { sectionIndex, barIndex, chordIndex } = selectedTimelineChord;
        const section = sections[sectionIndex];
        const bar = section?.bars[barIndex];
        return bar?.chords[chordIndex]?.chord;
      })()
    : selectedPaletteChord;

  if (!selectedChord) {
    infoElement.innerHTML = '';
    return;
  }

  const uniqueNotes = [...new Set(selectedChord.notes)];
  const scaleId = props.songKey?.scale === 'minor' ? 'aeolian' : props.songKey?.scale;
  const scale = scaleId ? getScaleById(scaleId) : null;
  const scaleName = scale?.name || props.songKey?.scale || '';

  infoElement.innerHTML = `
    <div class="player-selected-chord-symbol">${selectedChord.symbol}</div>
    <div class="player-selected-chord-notes">${uniqueNotes.join(' ')}</div>
    <div class="player-selected-chord-meta">
      <span class="player-selected-chord-degree">${selectedChord.degreeRoman}</span>
      <span class="player-selected-chord-scale">${props.songKey ? `${props.songKey.root} ${scaleName}` : ''}</span>
    </div>
  `;
}

function updateTransportButtons(): void {
  const playStopButton = rootElement?.querySelector('.play-stop-button') as HTMLButtonElement;
  const hasAnyBars = sections.length > 0 && sections[0].bars.length > 0;
  if (playStopButton) {
    const icon = playStopButton.querySelector('.material-symbols-outlined');
    if (icon) {
      icon.textContent = isPlaying ? 'stop' : 'play_arrow';
    }
    playStopButton.setAttribute('aria-label', isPlaying ? 'Stop' : 'Play');
    if (isPlaying) {
      playStopButton.classList.add('is-playing');
      playStopButton.disabled = false;
    } else {
      playStopButton.classList.remove('is-playing');
      playStopButton.disabled = !hasAnyBars;
    }
  }
  const saveProgressionBtn = rootElement?.querySelector('.save-progression-button') as HTMLButtonElement | null;
  if (saveProgressionBtn) {
    saveProgressionBtn.disabled = !hasChords(sections);
  }
  updateTempoDisplay();
}

function updateTempoDisplay(): void {
  const display = document.getElementById('tempo-display') as HTMLElement | null;
  const minusBtn = document.querySelector('.tempo-minus-btn') as HTMLButtonElement | null;
  const plusBtn = document.querySelector('.tempo-plus-btn') as HTMLButtonElement | null;
  if (display) display.textContent = bpm.toString();
  if (minusBtn) minusBtn.disabled = bpm <= MIN_BPM;
  if (plusBtn) plusBtn.disabled = bpm >= MAX_BPM;
}

function updateMetronomeMenu(): void {
  const toggle = document.getElementById('metronome-toggle') as HTMLElement;
  const menu = document.getElementById('metronome-menu') as HTMLElement;

  if (toggle) {
    // Only update aria-expanded, no enabled class (this is a menu trigger, not a toggle)
    toggle.setAttribute('aria-expanded', metronomeMenuOpen.toString());
  }

  if (menu) {
    menu.style.display = metronomeMenuOpen ? 'block' : 'none';
  }
}

// Sync settings UI when progression player mounts
function syncSettingsUI(): void {
  const timeSigButton = document.getElementById('time-signature') as HTMLElement;
  const tempoDisplay = document.getElementById('tempo-display') as HTMLElement;
  const metronomeVolumeSlider = document.getElementById('metronome-volume') as HTMLInputElement;
  const metronomeVolumeValue = document.getElementById('metronome-volume-value') as HTMLElement;
  const metronomeTypeSelect = document.getElementById('metronome-type') as HTMLSelectElement;
  
  if (timeSigButton) {
    timeSigButton.textContent = `${timeSignature[0]}/${timeSignature[1]}`;
  }
  if (tempoDisplay) {
    tempoDisplay.textContent = bpm.toString();
  }
  if (metronomeVolumeSlider) {
    metronomeVolumeSlider.value = metronomeVolume.toString();
  }
  if (metronomeVolumeValue) {
    metronomeVolumeValue.textContent = `${metronomeVolume.toFixed(1)} dB`;
  }
  if (metronomeTypeSelect) {
    metronomeTypeSelect.value = metronomeType;
  }
  updateTempoDisplay();
}

// ===========================
// EVENT HANDLERS
// ===========================

/**
 * Build playback context (keyRoot, scaleId) from songKey for scaleNote/passing.
 * Uses props.songKey or DOM root/scale select. Maps emotional buckets to concrete scales.
 */
function getPlaybackContextOpt(): { keyRoot: string; scaleId: string } | null {
  let root = '';
  let scaleId = '';

  const sk = props.songKey;
  if (sk?.root && sk?.scale) {
    root = sk.root.trim();
    const s = sk.scale.toLowerCase().replace(/\s+/g, '_');
    if (s === 'minor' || s === 'minor_emotional' || s === EMOTIONAL_BUCKET_IDS.MINOR) {
      scaleId = 'aeolian';
    } else if (s === 'major' || s === 'major_emotional' || s === EMOTIONAL_BUCKET_IDS.MAJOR) {
      scaleId = 'major';
    } else {
      scaleId = s;
    }
  } else {
    const rootEl = document.getElementById('root-select') as HTMLSelectElement | null;
    const scaleEl = document.getElementById('scale-select') as HTMLSelectElement | null;
    if (rootEl?.value && scaleEl?.value) {
      root = rootEl.value.trim();
      scaleId = scaleEl.value.trim();
    }
  }

  if (!root || !scaleId || !getScaleById(scaleId)) return null;
  return { keyRoot: root, scaleId };
}

/** Build playbackBars and sectionBoundaries from the single section. */
function buildPlaybackFromSections(): void {
  playbackBars = [];
  sectionBoundaries = [];
  if (sections.length === 0) return;
  playbackBars = [...sections[0].bars];
  sectionBoundaries = [0];
}

/** Map flat bar index (into playbackBars) to (sectionIndex, barIndexInSection). Single section only. */
function flatBarToSectionBar(flatBarIndex: number): { sectionIndex: number; barIndexInSection: number } | null {
  if (sections.length === 0 || flatBarIndex < 0) return null;
  const len = sections[0].bars.length;
  const barIndexInSection = len === 0 ? 0 : Math.min(flatBarIndex, len - 1);
  return { sectionIndex: 0, barIndexInSection };
}

async function handlePlay(): Promise<void> {
  const hasAnyBars = sections.some(s => s.bars.length > 0);
  if (!hasAnyBars) return;

  try {
    await Tone.start();
    completedChords.clear();
    currentChordProgress = null;
    currentSectionIndex = null;
    currentBarIndexInSection = null;
    currentBeat = 0;

    buildPlaybackFromSections();
    if (playbackBars.length === 0) return;

    const secondsPerBar = getSecondsPerBar(timeSignature, bpm);
    let playbackStartTime: number | undefined;
    if (selectedTimelineChord != null && sectionBoundaries.length > 0) {
      const { sectionIndex: si, barIndex: barInSection, chordIndex } = selectedTimelineChord;
      const section = sections[si];
      const bar = section?.bars[barInSection];
      if (si < sectionBoundaries.length && bar?.chords[chordIndex]) {
        const chordPosition = bar.chords[chordIndex].position;
        const flatBarIndex = sectionBoundaries[si] + barInSection;
        playbackStartTime = (flatBarIndex + chordPosition) * secondsPerBar;
      }
    }

    isPlaying = true;
    updateTransportButtons();
    await initProgressionEngine();
    setMetronomeVolume(metronomeVolume);
    setMetronomeEnabled(metronomeEnabled);
    const contextOpt = getPlaybackContextOpt();
    await startPlayback(
      playbackBars,
      bpm,
      timeSignature,
      metronomeEnabled,
      true,
      contextOpt ?? undefined,
      playbackStartTime
    );
    startProgressAnimation();
  } catch (err) {
    console.warn('Audio context already started or failed:', err);
    isPlaying = false;
    updateTransportButtons();
  }
}

function handleStop(): void {
  stopPlayback();
  isPlaying = false;
  currentSectionIndex = null;
  currentBarIndexInSection = null;
  currentBeat = 0;
  completedChords.clear();
  currentChordProgress = null;
  lastPaletteSwitchChordKey = null;
  clearHighlights();
  clearPlaybackHighlight();
  updateTransportButtons();
  stopProgressAnimation();
  updateTimeline();
}

function showClearConfirmModal(): Promise<boolean> {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'clear-confirm-backdrop chord-explorer-theme-host';
    backdrop.setAttribute('data-theme', props.theme ?? 'dark');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-labelledby', 'clear-confirm-title');

    const dialog = document.createElement('div');
    dialog.className = 'clear-confirm-dialog';

    const message = document.createElement('p');
    message.id = 'clear-confirm-title';
    message.className = 'clear-confirm-message';
    message.textContent = 'Are you sure you want to clear your progression?';

    const actions = document.createElement('div');
    actions.className = 'clear-confirm-actions';

    const close = (result: boolean) => {
      backdrop.remove();
      resolve(result);
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'clear-confirm-btn clear-confirm-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => close(false));

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'clear-confirm-btn clear-confirm-ok';
    okBtn.textContent = 'Ok';
    okBtn.addEventListener('click', () => close(true));

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(false);
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);
    dialog.appendChild(message);
    dialog.appendChild(actions);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    cancelBtn.focus();
  });
}

/** Output meter modal: requestAnimationFrame id so we cancel on close. */
let outputMeterModalFrameId: number | null = null;

/** Output meter: -40 to +4 dB, 1 dB per segment. Green -40 to -11, yellow -10 to -1, red 0 to +4. */
const OUTPUT_METER_MIN_DB = -40;
const OUTPUT_METER_MAX_DB = 4;
const OUTPUT_METER_SEGMENTS = OUTPUT_METER_MAX_DB - OUTPUT_METER_MIN_DB + 1; // 45

function dbToSegmentCount(db: number): number {
  if (db <= OUTPUT_METER_MIN_DB) return 0;
  const n = Math.floor(db - OUTPUT_METER_MIN_DB) + 1;
  return Math.min(OUTPUT_METER_SEGMENTS, Math.max(0, n));
}

function createStereoMeterBars(): { wrap: HTMLElement; segmentsL: HTMLElement[]; segmentsR: HTMLElement[]; labelL: HTMLElement; labelR: HTMLElement } {
  const wrap = document.createElement('div');
  wrap.className = 'output-meter-stereo-wrap';
  const rowL = document.createElement('div');
  rowL.className = 'output-meter-stereo-row';
  const rowR = document.createElement('div');
  rowR.className = 'output-meter-stereo-row';
  const labelL = document.createElement('div');
  labelL.className = 'output-meter-db';
  labelL.textContent = '−∞ dB';
  const labelR = document.createElement('div');
  labelR.className = 'output-meter-db';
  labelR.textContent = '−∞ dB';
  const segmentsL: HTMLElement[] = [];
  const segmentsR: HTMLElement[] = [];
  for (let i = 0; i < OUTPUT_METER_SEGMENTS; i++) {
    const seg = document.createElement('div');
    seg.className = 'output-meter-segment';
    if (i < 30) seg.classList.add('output-meter-segment-green');
    else if (i < 40) seg.classList.add('output-meter-segment-yellow');
    else seg.classList.add('output-meter-segment-red');
    segmentsL.push(seg);
    rowL.appendChild(seg);
  }
  for (let i = 0; i < OUTPUT_METER_SEGMENTS; i++) {
    const seg = document.createElement('div');
    seg.className = 'output-meter-segment';
    if (i < 30) seg.classList.add('output-meter-segment-green');
    else if (i < 40) seg.classList.add('output-meter-segment-yellow');
    else seg.classList.add('output-meter-segment-red');
    segmentsR.push(seg);
    rowR.appendChild(seg);
  }
  const colL = document.createElement('div');
  colL.className = 'output-meter-stereo-col';
  colL.appendChild(rowL);
  colL.appendChild(labelL);
  const colR = document.createElement('div');
  colR.className = 'output-meter-stereo-col';
  colR.appendChild(rowR);
  colR.appendChild(labelR);
  wrap.appendChild(colL);
  wrap.appendChild(colR);
  return { wrap, segmentsL, segmentsR, labelL, labelR };
}

/**
 * Show output level meter modal (DAW-style). Opens from playback area.
 * Two horizontal stereo bars; each segment = 1 dB. Green -40 to -11, yellow -10 to -1, red 0 to +4.
 */
function showOutputMeterModal(): void {
  const backdrop = document.createElement('div');
  backdrop.className = 'output-meter-backdrop chord-explorer-theme-host';
  backdrop.setAttribute('data-theme', props.theme ?? 'dark');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-labelledby', 'output-meter-title');

  const dialog = document.createElement('div');
  dialog.className = 'output-meter-dialog';

  const title = document.createElement('h2');
  title.id = 'output-meter-title';
  title.className = 'output-meter-title';
  title.textContent = 'Output Level';

  const { wrap, segmentsL, segmentsR, labelL, labelR } = createStereoMeterBars();

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'output-meter-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', close);

  function close(): void {
    if (outputMeterModalFrameId != null) {
      cancelAnimationFrame(outputMeterModalFrameId);
      outputMeterModalFrameId = null;
    }
    backdrop.remove();
  }

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  function formatDb(db: number): string {
    return db <= OUTPUT_METER_MIN_DB ? '−∞ dB' : `${Math.min(OUTPUT_METER_MAX_DB, db).toFixed(1)} dB`;
  }

  function updateMeter(): void {
    const [lDb, rDb] = getMeterLevelStereo();
    const countL = dbToSegmentCount(lDb);
    const countR = dbToSegmentCount(rDb);
    segmentsL.forEach((seg, i) => seg.classList.toggle('output-meter-segment-on', i < countL));
    segmentsR.forEach((seg, i) => seg.classList.toggle('output-meter-segment-on', i < countR));
    labelL.textContent = formatDb(lDb);
    labelR.textContent = formatDb(rDb);
    outputMeterModalFrameId = requestAnimationFrame(updateMeter);
  }

  dialog.appendChild(title);
  dialog.appendChild(wrap);
  dialog.appendChild(closeBtn);
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  updateMeter();
  closeBtn.focus();
}

async function handleClearClick(): Promise<void> {
  const ok = await showClearConfirmModal();
  if (ok) handleReset();
}

function getPreferredMinorScaleFromProgression(progression: ChordProgression): PreferredMinorScale {
  const families = progression.compatibleScaleFamilies ?? [];
  if (families.includes('harmonic_minor')) return 'harmonic';
  if (families.includes('melodic_minor')) return 'melodic';
  return 'natural';
}

function getProgressionMinorScaleLabel(progression: ChordProgression): string {
  const scale = getPreferredMinorScaleFromProgression(progression);
  return scale === 'harmonic' ? 'Harmonic minor' : scale === 'melodic' ? 'Melodic minor' : 'Natural minor';
}

interface ProgressionSelectionResult {
  progression: ChordProgression | null;
  userProgression?: UserProgression | null;
  forceApply?: boolean;
  tension?: TensionLevel;
  preferredMinorScale?: PreferredMinorScale;
}

function showProgressionSelectionModal(_forceApply: boolean = false): Promise<ProgressionSelectionResult> {
  return new Promise((resolve) => {
    try {
      // Use props.songKey directly - it's kept up to date by the React wrapper
      // Fall back to DOM only if props.songKey is missing or invalid
      let currentSongKey = props.songKey;
      if (!currentSongKey || !currentSongKey.root || !currentSongKey.scale) {
        // Only read from DOM if props.songKey is not available
        const rootSelect = document.getElementById('root-select') as HTMLSelectElement | null;
        const scaleSelect = document.getElementById('scale-select') as HTMLSelectElement | null;
        
        if (rootSelect && scaleSelect && rootSelect.value && scaleSelect.value) {
          try {
            // Get the scale name from the scale object
            const scaleId = scaleSelect.value.trim();
            const rootValue = rootSelect.value.trim();
            
            // Validate root and scale ID are not empty
            if (scaleId && rootValue && scaleId.length > 0 && rootValue.length > 0) {
              const scale = getScaleById(scaleId);
              if (scale) {
                // Use scale ID for emotional buckets to ensure proper normalization
                // For other scales, use the name
                const scaleValue = isEmotionalScale(scaleId) ? scaleId : scale.name;
                currentSongKey = {
                  root: rootValue,
                  scale: scaleValue
                };
              }
            }
          } catch (err) {
            console.warn('Failed to read key from DOM:', err);
          }
        }
      }
      
      if (!currentSongKey || !currentSongKey.root || !currentSongKey.scale) {
        console.warn('No valid songKey available for progression selection');
        resolve({ progression: null });
        return;
      }

    let currentTension: TensionLevel = 'low';

    // Get current scale for compatibility checking
    // Normalize scale string (handle display names like "Major (Happy / Bright)" -> "major_emotional")
    // Also handle scale IDs directly (like "minor_emotional")
    const normalizedScale = currentSongKey.scale.toLowerCase().replace(/\s+/g, '_');
    let scaleId: string;
    
    // Check if it's already a scale ID (emotional bucket or standard scale)
    if (normalizedScale === EMOTIONAL_BUCKET_IDS.MINOR || normalizedScale === 'minor_emotional') {
      scaleId = EMOTIONAL_BUCKET_IDS.MINOR;
    } else if (normalizedScale === EMOTIONAL_BUCKET_IDS.MAJOR || normalizedScale === 'major_emotional') {
      scaleId = EMOTIONAL_BUCKET_IDS.MAJOR;
    } else if (normalizedScale.includes('sad') || normalizedScale.includes('dark')) {
      // Handle display names like "Minor (Sad / Dark)"
      scaleId = EMOTIONAL_BUCKET_IDS.MINOR;
    } else if (normalizedScale.includes('happy') || normalizedScale.includes('bright')) {
      // Handle display names like "Major (Happy / Bright)"
      scaleId = EMOTIONAL_BUCKET_IDS.MAJOR;
    } else if (normalizedScale === 'minor' || (normalizedScale.includes('minor') && !normalizedScale.includes('harmonic') && !normalizedScale.includes('melodic'))) {
      scaleId = 'aeolian';
    } else if (normalizedScale.includes('major') || normalizedScale.includes('ionian')) {
      scaleId = 'major';
    } else {
      // Assume it's already a valid scale ID
      scaleId = normalizedScale;
    }
    
    let currentScale = getScaleById(scaleId);
    if (!currentScale) {
      // Fallback: try to find by name
      currentScale = ALL_SCALES.find(s => 
        s.id === scaleId || 
        s.name.toLowerCase() === currentSongKey.scale.toLowerCase()
      );
    }
    
    // Handle emotional buckets - create synthetic scale if needed
    if (!currentScale && isEmotionalScale(scaleId)) {
      if (scaleId === EMOTIONAL_BUCKET_IDS.MAJOR) {
        currentScale = getScaleById('major')!;
      } else if (scaleId === EMOTIONAL_BUCKET_IDS.MINOR) {
        currentScale = getScaleById('aeolian')!;
      }
    }
    
    if (!currentScale) {
      console.warn(`Could not find scale for key: ${currentSongKey.root} ${currentSongKey.scale}`);
      resolve({ progression: null });
      return;
    }
    
    // Determine tonality (Major or Minor)
    const isMinorTonality = currentScale.family === 'minor' || 
                            scaleId === EMOTIONAL_BUCKET_IDS.MINOR ||
                            ['aeolian', 'harmonic_minor', 'melodic_minor'].includes(scaleId);
    const tonality: 'major' | 'minor' = isMinorTonality ? 'minor' : 'major';

    const backdrop = document.createElement('div');
    backdrop.className = 'progression-selection-backdrop chord-explorer-theme-host';
    backdrop.setAttribute('data-theme', props.theme ?? 'dark');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-labelledby', 'progression-selection-title');

    const dialog = document.createElement('div');
    dialog.className = 'progression-selection-dialog';

    const title = document.createElement('h2');
    title.id = 'progression-selection-title';
    title.className = 'progression-selection-title';
    const rootLabel = currentSongKey.root ?? 'Key';
    const scaleLabel = tonality === 'minor'
      ? (currentSongKey.minorScaleType === 'harmonic' ? 'Harmonic Minor' : currentSongKey.minorScaleType === 'melodic' ? 'Melodic Minor' : 'Natural Minor')
      : 'Major';
    title.textContent = `Chord Progressions ${rootLabel} ${scaleLabel}`;
    dialog.appendChild(title);

    if (tonality === 'minor') {
      const minorHint = document.createElement('p');
      minorHint.className = 'progression-selection-minor-hint';
      minorHint.textContent = 'Minor progressions are labeled by scale type (Natural / Harmonic / Melodic). Choosing one will switch the chord palette to that scale.';
      dialog.appendChild(minorHint);
    }

    const close = (result: ChordProgression | null, force: boolean = false, tensionOverride?: TensionLevel, userProg?: UserProgression | null) => {
      backdrop.remove();
      document.removeEventListener('keydown', handleEscape);
      if (result) {
        (result as any)._forceApply = force;
      }
      const preferredMinorScale = result ? getPreferredMinorScaleFromProgression(result) : undefined;
      resolve({
        progression: result,
        userProgression: userProg,
        forceApply: force,
        tension: tensionOverride ?? currentTension,
        preferredMinorScale,
      });
    };

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'progression-selection-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => close(null));
    dialog.appendChild(closeBtn);

    // Close on backdrop click
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(null);
    });

    // Close on Escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', handleEscape);
        close(null);
      }
    };
    document.addEventListener('keydown', handleEscape);

    // Tension row: Low (triads) | Medium (7ths) | High (extensions)
    const tensionRow = document.createElement('div');
    tensionRow.className = 'progression-tension-row';
    const tensionLabel = document.createElement('span');
    tensionLabel.className = 'progression-tension-label';
    tensionLabel.textContent = 'Tension:';
    tensionRow.appendChild(tensionLabel);
    const tensionLow = document.createElement('button');
    tensionLow.type = 'button';
    tensionLow.className = 'progression-tension-btn';
    tensionLow.textContent = 'Low (triads)';
    tensionLow.setAttribute('aria-pressed', 'true');
    const tensionMedium = document.createElement('button');
    tensionMedium.type = 'button';
    tensionMedium.className = 'progression-tension-btn';
    tensionMedium.textContent = 'Medium (7ths)';
    tensionMedium.setAttribute('aria-pressed', 'false');
    const tensionHigh = document.createElement('button');
    tensionHigh.type = 'button';
    tensionHigh.className = 'progression-tension-btn';
    tensionHigh.textContent = 'High (extensions)';
    tensionHigh.setAttribute('aria-pressed', 'false');
    const updateTensionButtons = (active: TensionLevel) => {
      tensionLow.setAttribute('aria-pressed', active === 'low' ? 'true' : 'false');
      tensionMedium.setAttribute('aria-pressed', active === 'medium' ? 'true' : 'false');
      tensionHigh.setAttribute('aria-pressed', active === 'high' ? 'true' : 'false');
    };
    const refreshExamples = () => {
      const items = dialog.querySelectorAll('.progression-item');
      items.forEach((item) => {
        const id = item.getAttribute('data-progression-id');
        if (!id) return;
        const progression = getProgressionById(id);
        if (!progression) return;
        const exampleChords = generateProgressionExample(progression, currentSongKey, currentTension);
        const exampleEl = item.querySelector('.progression-item-example');
        if (exampleEl) {
          if (exampleChords.length > 0) {
            exampleEl.textContent = `Example (${currentSongKey.root} ${currentScale.name}): ${exampleChords.join(' – ')}`;
            (exampleEl as HTMLElement).style.color = '';
          }
        }
      });
    };
    tensionLow.addEventListener('click', () => {
      currentTension = 'low';
      updateTensionButtons('low');
      refreshExamples();
    });
    tensionMedium.addEventListener('click', () => {
      currentTension = 'medium';
      updateTensionButtons('medium');
      refreshExamples();
    });
    tensionHigh.addEventListener('click', () => {
      currentTension = 'high';
      updateTensionButtons('high');
      refreshExamples();
    });
    tensionRow.appendChild(tensionLow);
    tensionRow.appendChild(tensionMedium);
    tensionRow.appendChild(tensionHigh);
    dialog.appendChild(tensionRow);

    // Get progressions by tier, filtered by tonality
    const progressionsByTier = getProgressionsByTierAndTonality(tonality);

    // Load user progressions
    const userProgressions = loadUserProgressions();

    // Create content container
    const content = document.createElement('div');
    content.className = 'progression-selection-content';

    // Render User Progressions tier (at top)
    if (userProgressions.length > 0) {
      const userTierSection = document.createElement('div');
      userTierSection.className = 'progression-tier-section user-progressions-tier';

      const userTierTitle = document.createElement('h3');
      userTierTitle.className = 'progression-tier-title';
      userTierTitle.textContent = 'User Progressions';
      userTierSection.appendChild(userTierTitle);

      const userProgressionList = document.createElement('div');
      userProgressionList.className = 'progression-list';

      for (const userProg of userProgressions) {
        const chordSymbols = getProgressionChordSymbols(userProg);
        
        const progressionItem = document.createElement('div');
        progressionItem.className = 'progression-item progression-item-user';
        progressionItem.setAttribute('data-user-progression-id', userProg.id);

        // Header with name and chord symbols
        const header = document.createElement('div');
        header.className = 'progression-item-header';
        
        const name = document.createElement('div');
        name.className = 'progression-item-name';
        name.textContent = userProg.name;
        header.appendChild(name);

        const chordSymbolsEl = document.createElement('div');
        chordSymbolsEl.className = 'progression-item-roman';
        chordSymbolsEl.textContent = chordSymbols.length > 0 ? chordSymbols.join(' – ') : 'Custom';
        header.appendChild(chordSymbolsEl);

        progressionItem.appendChild(header);

        // Key and time signature info
        const keyInfo = document.createElement('div');
        keyInfo.className = 'progression-designed-for user-progression-key';
        keyInfo.textContent = `Key: ${userProg.songKey.root} ${userProg.songKey.scale} | Time: ${userProg.timeSignature[0]}/${userProg.timeSignature[1]}`;
        progressionItem.appendChild(keyInfo);

        // Feel
        if (userProg.feel) {
          const feel = document.createElement('div');
          feel.className = 'progression-item-feel';
          feel.textContent = userProg.feel;
          progressionItem.appendChild(feel);
        }

        // Styles
        if (userProg.styles.length > 0) {
          const styles = document.createElement('div');
          styles.className = 'progression-item-styles';
          styles.textContent = `Styles: ${userProg.styles.join(', ')}`;
          progressionItem.appendChild(styles);
        }

        // Typical Use
        if (userProg.typicalUse) {
          const typicalUse = document.createElement('div');
          typicalUse.className = 'progression-item-typical-use';
          typicalUse.textContent = `Typical Use: ${userProg.typicalUse}`;
          progressionItem.appendChild(typicalUse);
        }

        // Notes
        if (userProg.notes) {
          const notes = document.createElement('div');
          notes.className = 'progression-item-notes';
          notes.textContent = userProg.notes;
          progressionItem.appendChild(notes);
        }

        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'user-progression-delete-btn';
        deleteBtn.textContent = '🗑';
        deleteBtn.title = 'Delete this progression';
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm(`Delete "${userProg.name}"?`)) {
            deleteUserProgression(userProg.id);
            progressionItem.remove();
            // Remove the entire tier section if no more user progressions
            const remainingItems = userProgressionList.querySelectorAll('.progression-item');
            if (remainingItems.length === 0) {
              userTierSection.remove();
            }
          }
        });
        progressionItem.appendChild(deleteBtn);

        // Click handler - select this user progression
        progressionItem.addEventListener('click', () => {
          document.removeEventListener('keydown', handleEscape);
          close(null, false, currentTension, userProg);
        });

        userProgressionList.appendChild(progressionItem);
      }

      userTierSection.appendChild(userProgressionList);
      content.appendChild(userTierSection);
    }

    // Render each dictionary tier
    const tiers: Array<{ name: string; progressions: ChordProgression[] }> = [
      { name: 'Core Progressions', progressions: progressionsByTier.Core },
      { name: 'Extended Progressions', progressions: progressionsByTier.Extended },
      { name: 'Exploratory Progressions', progressions: progressionsByTier.Exploratory },
    ];

    for (const tier of tiers) {
      if (tier.progressions.length === 0) continue;

      const tierSection = document.createElement('div');
      tierSection.className = 'progression-tier-section';

      const tierTitle = document.createElement('h3');
      tierTitle.className = 'progression-tier-title';
      tierTitle.textContent = tier.name;
      tierSection.appendChild(tierTitle);

      const progressionList = document.createElement('div');
      progressionList.className = 'progression-list';

      // Optional: sort so progressions whose primaryMinorScale matches current palette appear first
      const paletteMinor = currentSongKey?.minorScaleType ?? 'natural';
      const sortedProgressions = tonality === 'minor'
        ? [...tier.progressions].sort((a, b) => {
            const aMatch = (a.primaryMinorScale ?? 'natural') === paletteMinor;
            const bMatch = (b.primaryMinorScale ?? 'natural') === paletteMinor;
            if (aMatch && !bMatch) return -1;
            if (!aMatch && bMatch) return 1;
            return 0;
          })
        : tier.progressions;

      for (const progression of sortedProgressions) {
        // Check compatibility - pass currentSongKey so minor palette (Natural/Harmonic/Melodic) is considered
        const compatibilityStatus = getProgressionCompatibilityStatus(progression, currentScale, scaleId, currentSongKey);
        const designedForTags = getDesignedForTags(progression);
        
        // Generate dynamic example (guard so one failure does not break the modal)
        let exampleChords: string[] = [];
        try {
          exampleChords = generateProgressionExample(progression, currentSongKey, currentTension);
        } catch (err) {
          console.warn(`Could not generate example for progression ${progression.name}:`, err);
        }
        
        const progressionItem = document.createElement('div');
        progressionItem.className = `progression-item progression-item-${compatibilityStatus}`;
        progressionItem.setAttribute('data-progression-id', progression.id);
        
        if (compatibilityStatus === 'incompatible') {
          progressionItem.style.opacity = '0.5';
          progressionItem.style.cursor = 'not-allowed';
        }

        // Header with name and roman numerals
        const header = document.createElement('div');
        header.className = 'progression-item-header';
        
        const name = document.createElement('div');
        name.className = 'progression-item-name';
        name.textContent = progression.name;
        header.appendChild(name);

        const romanNumerals = document.createElement('div');
        romanNumerals.className = 'progression-item-roman';
        romanNumerals.textContent = progression.romanNumerals.join(' – ');
        header.appendChild(romanNumerals);

        progressionItem.appendChild(header);

        // Designed for: show specific minor scale when minor (e.g. "Designed for Harmonic Minor"), otherwise use tags (e.g. Major)
        if (tonality === 'minor') {
          const minorLabel = getProgressionMinorScaleLabel(progression);
          const capitalized = minorLabel.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          const designedFor = document.createElement('div');
          designedFor.className = 'progression-designed-for';
          designedFor.textContent = `Designed for ${capitalized}`;
          progressionItem.appendChild(designedFor);
        } else if (designedForTags.length > 0) {
          const designedFor = document.createElement('div');
          designedFor.className = 'progression-designed-for';
          designedFor.textContent = `Designed for: ${designedForTags.join(', ')}`;
          progressionItem.appendChild(designedFor);
        }

        // Character label (gravitational vs modal)
        if (progression.character) {
          const characterLabel = document.createElement('div');
          characterLabel.className = 'progression-character';
          let labelText = '';
          let labelColor = '';
          if (progression.character === 'gravitational') {
            labelText = 'Gravitational (Resolving)';
            labelColor = '#4a9eff'; // Blue for resolving
          } else if (progression.character === 'modal') {
            labelText = 'Modal (Circular)';
            labelColor = '#9b59b6'; // Purple for modal
          } else if (progression.character === 'mixed') {
            labelText = 'Mixed';
            labelColor = '#95a5a6'; // Gray for mixed
          }
          characterLabel.textContent = labelText;
          characterLabel.style.color = labelColor;
          characterLabel.style.fontSize = '0.85em';
          characterLabel.style.marginTop = '4px';
          progressionItem.appendChild(characterLabel);
        }

        // Compatibility badge
        const compatibilityBadge = document.createElement('div');
        compatibilityBadge.className = 'progression-compatibility-badge';
        if (compatibilityStatus === 'compatible') {
          compatibilityBadge.textContent = '✓ Compatible';
          compatibilityBadge.style.color = 'var(--accent-warm)';
        } else if (compatibilityStatus === 'altered') {
          compatibilityBadge.textContent = '⚠ Altered';
          compatibilityBadge.style.color = '#ffb833';
        } else {
          compatibilityBadge.textContent = '✗ Incompatible';
          compatibilityBadge.style.color = 'var(--chord-dim)';
        }
        progressionItem.appendChild(compatibilityBadge);

        // Dynamic example based on current root/scale
        if (exampleChords.length > 0) {
          const example = document.createElement('div');
          example.className = 'progression-item-example';
          example.textContent = `Example (${currentSongKey.root} ${currentScale.name}): ${exampleChords.join(' – ')}`;
          progressionItem.appendChild(example);
        } else if (compatibilityStatus === 'incompatible') {
          const example = document.createElement('div');
          example.className = 'progression-item-example';
          example.textContent = 'Not compatible with current scale';
          example.style.color = 'var(--chord-dim)';
          progressionItem.appendChild(example);
        } else {
          // Show error message if example generation failed for other reasons
          const example = document.createElement('div');
          example.className = 'progression-item-example';
          example.textContent = `Could not generate example for ${currentSongKey.root} ${currentScale.name}`;
          example.style.color = 'var(--chord-dim)';
          progressionItem.appendChild(example);
        }

        // Feel/Description
        const feel = document.createElement('div');
        feel.className = 'progression-item-feel';
        feel.textContent = progression.feel;
        progressionItem.appendChild(feel);

        // Styles
        if (progression.styles.length > 0) {
          const styles = document.createElement('div');
          styles.className = 'progression-item-styles';
          styles.textContent = `Styles: ${progression.styles.join(', ')}`;
          progressionItem.appendChild(styles);
        }

        // Typical Use
        if (progression.typicalUse) {
          const typicalUse = document.createElement('div');
          typicalUse.className = 'progression-item-typical-use';
          typicalUse.textContent = `Typical Use: ${progression.typicalUse}`;
          progressionItem.appendChild(typicalUse);
        }

        // Notes
        if (progression.notes) {
          const notes = document.createElement('div');
          notes.className = 'progression-item-notes';
          notes.textContent = progression.notes;
          progressionItem.appendChild(notes);
        }

        // Force apply button for incompatible/altered (always show when status is incompatible or altered)
        if (compatibilityStatus === 'incompatible' || compatibilityStatus === 'altered') {
          const forceApplyBtn = document.createElement('button');
          forceApplyBtn.type = 'button';
          forceApplyBtn.className = 'progression-force-apply-btn';
          forceApplyBtn.textContent = compatibilityStatus === 'incompatible' 
            ? 'Force apply (will alter scale)' 
            : 'Apply (uses altered chords)';
          forceApplyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.removeEventListener('keydown', handleEscape);
            close(progression, true, currentTension);
          });
          progressionItem.appendChild(forceApplyBtn);
        }

        // Click handler: compatible items apply directly; altered items can also be clicked (with warning)
        if (compatibilityStatus === 'compatible') {
          progressionItem.addEventListener('click', () => {
            document.removeEventListener('keydown', handleEscape);
            close(progression, false, currentTension);
          });
        } else if (compatibilityStatus === 'altered') {
          progressionItem.addEventListener('click', () => {
            document.removeEventListener('keydown', handleEscape);
            close(progression, false, currentTension);
          });
        }

        progressionList.appendChild(progressionItem);
      }

      tierSection.appendChild(progressionList);
      content.appendChild(tierSection);
    }

    dialog.appendChild(content);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    // Focus first progression item for keyboard navigation
    const firstItem = dialog.querySelector('.progression-item') as HTMLElement;
    if (firstItem) {
      firstItem.focus();
    }
    } catch (err) {
      console.error('Error in showProgressionSelectionModal:', err);
      resolve({ progression: null });
    }
  });
}

/**
 * Collect all unique chords from the current sections (by symbol).
 */
function getUniqueChordsFromSections(sectionList: ProgressionSection[]): Chord[] {
  const seen = new Set<string>();
  const result: Chord[] = [];
  for (const section of sectionList) {
    for (const bar of section.bars) {
      for (const tc of bar.chords) {
        const sym = tc.chord.symbol.trim().toLowerCase();
        if (!seen.has(sym)) {
          seen.add(sym);
          result.push(tc.chord);
        }
      }
    }
  }
  return result;
}

/**
 * For each chord in the timeline that is not in the palette, add it to custom chords automatically.
 * Chords diatonic to the current key (including all minor scale variants when key is minor) are skipped.
 */
async function runMissingChordsFlow(): Promise<void> {
  const uniqueChords = getUniqueChordsFromSections(sections);
  const missing: Chord[] = [];
  for (const chord of uniqueChords) {
    if (isChordInPalette(chord)) continue;
    if (isChordDiatonicToKey(chord, props.songKey)) continue;
    missing.push(chord);
  }
  for (const chord of missing) {
    const validationError = validateChordSymbol(chord.symbol);
    if (validationError) {
      await showErrorModal(`Cannot add chord: ${validationError}`);
      continue;
    }
    const parsed = chordSymbolToInternalChord(chord.symbol);
    if (!parsed) {
      await showErrorModal('Invalid chord symbol. Cannot add to custom chords.');
      continue;
    }
    addCustomChord(parsed);
    document.dispatchEvent(new CustomEvent('customChordsChanged'));
  }
}

async function handleAddProgressionClick(): Promise<void> {
  try {
    const { progression, userProgression, forceApply: forceApplyFlag, tension, preferredMinorScale } = await showProgressionSelectionModal(false);

    // Handle user progression - flatten to single section (with key/transpose logic if key differs)
    if (userProgression) {
      try {
        // Resolve current app key (for key comparison and transpose target)
        let currentSongKey = props.songKey;
        if (!currentSongKey || !currentSongKey.root || !currentSongKey.scale) {
          const rootSelect = document.getElementById('root-select') as HTMLSelectElement | null;
          const scaleSelect = document.getElementById('scale-select') as HTMLSelectElement | null;
          if (rootSelect && scaleSelect && rootSelect.value && scaleSelect.value) {
            const scaleId = scaleSelect.value.trim();
            const scale = getScaleById(scaleId);
            if (scale) {
              currentSongKey = {
                root: rootSelect.value.trim(),
                scale: isEmotionalScale(scaleId) ? scaleId : scale.name,
              };
            }
          }
        }
        if (!currentSongKey) currentSongKey = { root: 'C', scale: 'Major' };

        let sectionsToApply = userProgression.sections;
        let applyThenChangeKey = false;

        if (!sameSongKey(userProgression.songKey, currentSongKey)) {
          const choice = await showApplyProgressionOptionsModal(userProgression, currentSongKey);
          if (choice === null) return;
          if (choice === 'change-key') {
            applyThenChangeKey = true;
          } else {
            const semitones = getSemitonesBetweenRoots(userProgression.songKey.root, currentSongKey.root);
            sectionsToApply = transposeSections(userProgression.sections, semitones);
          }
        }

        // Flatten all sections into one timeline with new IDs
        const allBars: TimelineBar[] = [];
        for (const savedSection of sectionsToApply) {
          for (const savedBar of savedSection.bars) {
            allBars.push({
              id: generateId(),
              chords: savedBar.chords.map(savedChord => ({
                id: generateId(),
                chord: { ...savedChord.chord },
                position: savedChord.position,
                duration: savedChord.duration,
                sourceMinorScale: savedChord.sourceMinorScale,
              })),
            });
          }
        }
        sections = [{ id: generateId(), bars: allBars, repeatTimes: 1 }];

        timeSignature = [...userProgression.timeSignature] as [number, number];
        const timeSigButton = document.getElementById('time-signature') as HTMLElement;
        if (timeSigButton) {
          timeSigButton.textContent = `${timeSignature[0]}/${timeSignature[1]}`;
        }

        selectedTimelineChord = null;
        completedChords.clear();
        currentChordProgress = null;

        updateTimeline();
        updateTransportButtons();
        updateSelectedChordInfo();
        if (isPlaying) handleStop();

        if (applyThenChangeKey && props.onSongKeyChange) {
          props.onSongKeyChange(userProgression.songKey);
        }

        const delayMs = applyThenChangeKey ? 120 : 0;
        setTimeout(() => {
          runMissingChordsFlow().catch(err => console.error('Error in missing-chords flow:', err));
        }, delayMs);
      } catch (err) {
        console.error('Error applying user progression:', err);
      }
      return;
    }

    // Handle dictionary progression - applies to a specific section
    // Use props.songKey directly - it's kept up to date by the React wrapper
    // Fall back to DOM only if props.songKey is missing or invalid
    let currentSongKey = props.songKey;
    if (!currentSongKey || !currentSongKey.root || !currentSongKey.scale) {
      // Only read from DOM if props.songKey is not available
      const rootSelect = document.getElementById('root-select') as HTMLSelectElement | null;
      const scaleSelect = document.getElementById('scale-select') as HTMLSelectElement | null;
      
      if (rootSelect && scaleSelect && rootSelect.value && scaleSelect.value) {
        try {
          const scaleId = scaleSelect.value.trim();
          const rootValue = rootSelect.value.trim();
          
          // Validate root and scale ID are not empty
          if (scaleId && rootValue && scaleId.length > 0 && rootValue.length > 0) {
            const scale = getScaleById(scaleId);
            if (scale) {
              // Use scale ID for emotional buckets to ensure proper normalization
              // For other scales, use the name
              const scaleValue = isEmotionalScale(scaleId) ? scaleId : scale.name;
              currentSongKey = {
                root: rootValue,
                scale: scaleValue
              };
            }
          }
        } catch (err) {
          console.warn('Failed to read key from DOM:', err);
        }
      }
    }
    
    if (!progression || !currentSongKey || !currentSongKey.root || !currentSongKey.scale) {
      console.warn('Cannot add progression: missing progression or songKey');
      return;
    }

    const forceApply = forceApplyFlag ?? (progression as any)._forceApply ?? false;

  try {
    const chords = convertProgressionToChords(progression, progression.romanNumerals, currentSongKey, undefined, forceApply, tension ?? 'low');

    if (sections.length === 0) {
      sections = [{ id: generateId(), bars: [], repeatTimes: 1 }];
    }
    const section = sections[0];
    if (!section) return;

    selectedTimelineChord = null;
    completedChords.clear();
    currentChordProgress = null;

    const scaleNorm = (currentSongKey.scale || '').toLowerCase().replace(/\s+/g, '_');
    const isMinorKeyForSource = scaleNorm === EMOTIONAL_BUCKET_IDS.MINOR || scaleNorm === 'minor_emotional' || scaleNorm.includes('minor');

    for (let i = 0; i < chords.length; i++) {
      const chord = chords[i];
      const sourceMinorScale: SourceMinorScale | undefined = isMinorKeyForSource
        ? getMinorScaleTypeForProgressionChord(progression, i)
        : undefined;
      const newBar: TimelineBar = {
        id: generateId(),
        chords: [{ id: generateId(), chord, position: 0, duration: 1, ...(sourceMinorScale != null && { sourceMinorScale }) }],
      };
      section.bars.push(newBar);
    }

    // When key is minor and the progression is for a specific minor scale, switch the chord palette to that scale
    if (isMinorKeyForSource && preferredMinorScale && props.onMinorScaleTypeChange) {
      props.onMinorScaleTypeChange(preferredMinorScale);
    }

    updateTimeline();
    updateTransportButtons();
    updateSelectedChordInfo();
    if (isPlaying) handleStop();

    await runMissingChordsFlow();
    } catch (err) {
      console.error('Error applying progression:', err);
    }
  } catch (err) {
    console.error('Error in handleAddProgressionClick:', err);
  }
}

function handleReset(): void {
  sections = [{ id: generateId(), bars: [], repeatTimes: 1 }];
  isPlaying = false;
  currentSectionIndex = null;
  currentBarIndexInSection = null;
  currentBeat = 0;
  selectedTimelineChord = null;
  completedChords.clear();
  currentChordProgress = null;
  stopPlayback();
  stopProgressAnimation();
  updateTimeline();
  updateTransportButtons();
  updateSelectedChordInfo();
}

function toggleTimeSignature(): void {
  // Cycle: 4/4 → 3/4 → 6/8 → 4/4
  timeSignature =
    timeSignature[0] === 4 && timeSignature[1] === 4
      ? [3, 4]
      : timeSignature[0] === 3 && timeSignature[1] === 4
        ? [6, 8]
        : [4, 4];
  const button = document.getElementById('time-signature') as HTMLElement;
  if (button) {
    button.textContent = `${timeSignature[0]}/${timeSignature[1]}`;
  }

  if (isPlaying) {
    handleStop();
    setTimeout(() => {
      handlePlay().catch(err => {
        console.error('Error restarting playback after time signature change:', err);
      });
    }, 100);
  }
}

function toggleMetronomeMenu(): void {
  metronomeMenuOpen = !metronomeMenuOpen;
  updateMetronomeMenu();
}

function handleSaveProgressionClick(): void {
  if (!hasChords(sections)) return;
  
  showSaveProgressionModal().then(result => {
    if (result) {
      const saved = saveUserProgression(result);
      if (!saved) {
        // Name already exists - show simple alert
        alert('A progression with this name already exists. Please choose a different name.');
      }
    }
  }).catch(err => {
    console.error('Error saving progression:', err);
  });
}

function showSaveProgressionModal(): Promise<UserProgression | null> {
  return new Promise((resolve) => {
    try {
      // Get current song key
      let currentSongKey = props.songKey;
      if (!currentSongKey || !currentSongKey.root || !currentSongKey.scale) {
        // Fall back to DOM
        const rootSelect = document.getElementById('root-select') as HTMLSelectElement | null;
        const scaleSelect = document.getElementById('scale-select') as HTMLSelectElement | null;
        
        if (rootSelect && scaleSelect && rootSelect.value && scaleSelect.value) {
          const scaleId = scaleSelect.value.trim();
          const scale = getScaleById(scaleId);
          if (scale) {
            currentSongKey = {
              root: rootSelect.value.trim(),
              scale: isEmotionalScale(scaleId) ? scaleId : scale.name
            };
          }
        }
      }
      
      if (!currentSongKey) {
        currentSongKey = { root: 'C', scale: 'Major' };
      }

      const backdrop = document.createElement('div');
      backdrop.className = 'progression-selection-backdrop save-progression-backdrop chord-explorer-theme-host';
      backdrop.setAttribute('data-theme', props.theme ?? 'dark');
      backdrop.setAttribute('aria-modal', 'true');
      backdrop.setAttribute('role', 'dialog');
      backdrop.setAttribute('aria-labelledby', 'save-progression-title');

      const dialog = document.createElement('div');
      dialog.className = 'progression-selection-dialog save-progression-dialog';

      const title = document.createElement('h2');
      title.id = 'save-progression-title';
      title.className = 'progression-selection-title';
      title.textContent = 'Save Progression';
      dialog.appendChild(title);

      const close = (result: UserProgression | null) => {
        backdrop.remove();
        document.removeEventListener('keydown', handleEscape);
        resolve(result);
      };

      // Close button
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'progression-selection-close';
      closeBtn.setAttribute('aria-label', 'Close');
      closeBtn.textContent = '×';
      closeBtn.addEventListener('click', () => close(null));
      dialog.appendChild(closeBtn);

      // Close on backdrop click
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) close(null);
      });

      // Close on Escape key
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', handleEscape);
          close(null);
        }
      };
      document.addEventListener('keydown', handleEscape);

      // Form content
      const form = document.createElement('form');
      form.className = 'save-progression-form';
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const nameInput = form.querySelector('#save-progression-name') as HTMLInputElement;
        const stylesInput = form.querySelector('#save-progression-styles') as HTMLInputElement;
        const feelInput = form.querySelector('#save-progression-feel') as HTMLInputElement;
        const typicalUseInput = form.querySelector('#save-progression-typical-use') as HTMLInputElement;
        const notesInput = form.querySelector('#save-progression-notes') as HTMLTextAreaElement;
        
        const name = nameInput.value.trim();
        if (!name) {
          nameInput.focus();
          return;
        }
        
        const progression: UserProgression = {
          id: generateUserProgressionId(),
          name,
          styles: stylesInput.value.split(',').map(s => s.trim()).filter(s => s.length > 0),
          feel: feelInput.value.trim(),
          typicalUse: typicalUseInput.value.trim() || undefined,
          notes: notesInput.value.trim() || undefined,
          createdAt: Date.now(),
          songKey: currentSongKey!,
          timeSignature: [...timeSignature] as [number, number],
          sections: JSON.parse(JSON.stringify(sections)), // Deep clone
        };
        
        close(progression);
      });

      // Name field (required)
      const nameGroup = document.createElement('div');
      nameGroup.className = 'save-progression-field';
      const nameLabel = document.createElement('label');
      nameLabel.htmlFor = 'save-progression-name';
      nameLabel.textContent = 'Name *';
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.id = 'save-progression-name';
      nameInput.required = true;
      nameInput.placeholder = 'My Progression';
      nameGroup.appendChild(nameLabel);
      nameGroup.appendChild(nameInput);
      form.appendChild(nameGroup);

      // Styles field
      const stylesGroup = document.createElement('div');
      stylesGroup.className = 'save-progression-field';
      const stylesLabel = document.createElement('label');
      stylesLabel.htmlFor = 'save-progression-styles';
      stylesLabel.textContent = 'Styles (comma-separated)';
      const stylesInput = document.createElement('input');
      stylesInput.type = 'text';
      stylesInput.id = 'save-progression-styles';
      stylesInput.placeholder = 'Pop, Rock, Indie';
      stylesGroup.appendChild(stylesLabel);
      stylesGroup.appendChild(stylesInput);
      form.appendChild(stylesGroup);

      // Feel field
      const feelGroup = document.createElement('div');
      feelGroup.className = 'save-progression-field';
      const feelLabel = document.createElement('label');
      feelLabel.htmlFor = 'save-progression-feel';
      feelLabel.textContent = 'Feel';
      const feelInput = document.createElement('input');
      feelInput.type = 'text';
      feelInput.id = 'save-progression-feel';
      feelInput.placeholder = 'Uplifting, emotional';
      feelGroup.appendChild(feelLabel);
      feelGroup.appendChild(feelInput);
      form.appendChild(feelGroup);

      // Typical Use field
      const typicalUseGroup = document.createElement('div');
      typicalUseGroup.className = 'save-progression-field';
      const typicalUseLabel = document.createElement('label');
      typicalUseLabel.htmlFor = 'save-progression-typical-use';
      typicalUseLabel.textContent = 'Typical Use';
      const typicalUseInput = document.createElement('input');
      typicalUseInput.type = 'text';
      typicalUseInput.id = 'save-progression-typical-use';
      typicalUseInput.placeholder = 'Chorus, Verse';
      typicalUseGroup.appendChild(typicalUseLabel);
      typicalUseGroup.appendChild(typicalUseInput);
      form.appendChild(typicalUseGroup);

      // Notes field
      const notesGroup = document.createElement('div');
      notesGroup.className = 'save-progression-field';
      const notesLabel = document.createElement('label');
      notesLabel.htmlFor = 'save-progression-notes';
      notesLabel.textContent = 'Notes';
      const notesInput = document.createElement('textarea');
      notesInput.id = 'save-progression-notes';
      notesInput.rows = 3;
      notesInput.placeholder = 'Any additional notes...';
      notesGroup.appendChild(notesLabel);
      notesGroup.appendChild(notesInput);
      form.appendChild(notesGroup);

      // Key info (read-only display)
      const keyInfo = document.createElement('div');
      keyInfo.className = 'save-progression-key-info';
      keyInfo.textContent = `Key: ${currentSongKey.root} ${currentSongKey.scale} | Time: ${timeSignature[0]}/${timeSignature[1]}`;
      form.appendChild(keyInfo);

      // Buttons
      const buttonRow = document.createElement('div');
      buttonRow.className = 'save-progression-buttons';
      
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'save-progression-cancel-btn';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', () => close(null));
      
      const saveBtn = document.createElement('button');
      saveBtn.type = 'submit';
      saveBtn.className = 'save-progression-save-btn';
      saveBtn.textContent = 'Save';
      
      buttonRow.appendChild(cancelBtn);
      buttonRow.appendChild(saveBtn);
      form.appendChild(buttonRow);

      dialog.appendChild(form);
      backdrop.appendChild(dialog);
      document.body.appendChild(backdrop);

      // Focus name input
      nameInput.focus();
    } catch (err) {
      console.error('Error in showSaveProgressionModal:', err);
      resolve(null);
    }
  });
}

export type ApplyProgressionChoice = 'change-key' | 'transpose' | null;

/**
 * Show modal when user selects a saved progression that is in a different key.
 * Returns how to apply: change app key to match chords, or transpose chords to current key.
 */
function showApplyProgressionOptionsModal(
  userProgression: UserProgression,
  currentSongKey: { root: string; scale: string }
): Promise<ApplyProgressionChoice> {
  return new Promise((resolve) => {
    const savedRoot = userProgression.songKey.root;
    const savedScale = userProgression.songKey.scale;
    const currentRoot = currentSongKey.root;
    const currentScale = currentSongKey.scale;

    const backdrop = document.createElement('div');
    backdrop.className = 'progression-selection-backdrop save-progression-backdrop apply-progression-backdrop chord-explorer-theme-host';
    backdrop.setAttribute('data-theme', props.theme ?? 'dark');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-labelledby', 'apply-progression-title');

    const dialog = document.createElement('div');
    dialog.className = 'progression-selection-dialog save-progression-dialog apply-progression-dialog';

    const title = document.createElement('h2');
    title.id = 'apply-progression-title';
    title.className = 'progression-selection-title';
    title.textContent = 'How do you want to apply this chord progression?';
    dialog.appendChild(title);

    const close = (choice: ApplyProgressionChoice) => {
      backdrop.remove();
      document.removeEventListener('keydown', handleEscape);
      resolve(choice);
    };

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'progression-selection-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => close(null));
    dialog.appendChild(closeBtn);

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(null);
    });

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', handleEscape);
        close(null);
      }
    };
    document.addEventListener('keydown', handleEscape);

    const message = document.createElement('p');
    message.className = 'apply-progression-message';
    message.textContent = `This progression was saved in ${savedRoot} ${savedScale}. Current key is ${currentRoot} ${currentScale}.`;
    dialog.appendChild(message);

    const buttonGroup = document.createElement('div');
    buttonGroup.className = 'apply-progression-options';

    const changeKeyBtn = document.createElement('button');
    changeKeyBtn.type = 'button';
    changeKeyBtn.className = 'apply-progression-option-btn';
    changeKeyBtn.textContent = 'Change key to match chords';
    changeKeyBtn.title = `Set app key to ${savedRoot} ${savedScale}`;
    changeKeyBtn.addEventListener('click', () => close('change-key'));

    const transposeBtn = document.createElement('button');
    transposeBtn.type = 'button';
    transposeBtn.className = 'apply-progression-option-btn';
    transposeBtn.textContent = 'Transpose chords to match key';
    transposeBtn.title = `Transpose progression to ${currentRoot} ${currentScale}`;
    transposeBtn.addEventListener('click', () => close('transpose'));

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'save-progression-cancel-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => close(null));

    buttonGroup.appendChild(changeKeyBtn);
    buttonGroup.appendChild(transposeBtn);
    buttonGroup.appendChild(cancelBtn);
    dialog.appendChild(buttonGroup);

    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    changeKeyBtn.focus();
  });
}

function handleMetronomeMute(): void {
  const mutedVolume = -40;
  metronomeVolume = mutedVolume;
  setMetronomeVolume(mutedVolume);
  const slider = document.getElementById('metronome-volume') as HTMLInputElement;
  if (slider) {
    slider.value = mutedVolume.toString();
  }
}

function handleChordClick(sectionIndex: number, barIndex: number, chordIndex: number): void {
  selectedTimelineChord = { sectionIndex, barIndex, chordIndex };
  selectedPaletteChord = null;
  updateTimeline();
  updateSelectedChordInfo();
}

function addChordToTimeline(chord: Chord, sectionIndex?: number, barIndexInSection?: number): void {
  const si = sectionIndex ?? 0;
  const section = sections[si];
  if (!section) return;

  if (barIndexInSection === undefined || barIndexInSection < 0) {
    const newBar: TimelineBar = {
      id: generateId(),
      chords: [{ id: generateId(), chord, position: 0, duration: 1 }],
    };
    section.bars.push(newBar);
    updateTimeline();
    updateTransportButtons();
    return;
  }

  const bi = barIndexInSection >= section.bars.length ? section.bars.length - 1 : barIndexInSection;
  const bar = section.bars[bi];

  if (!bar) {
    const newBar: TimelineBar = {
      id: generateId(),
      chords: [{ id: generateId(), chord, position: 0, duration: 1 }],
    };
    section.bars.push(newBar);
    updateTimeline();
    updateTransportButtons();
    return;
  }

  const existingChordCount = bar.chords.length;
  const newChordCount = existingChordCount + 1;
  const subdivision = 1 / newChordCount;
  const newChords: TimelineChord[] = bar.chords.map((c, i) => ({
    ...c,
    position: i * subdivision,
    duration: subdivision,
  }));
  newChords.push({
    id: generateId(),
    chord,
    position: existingChordCount * subdivision,
    duration: subdivision,
  });
  section.bars[bi] = { ...bar, chords: newChords };
  updateTimeline();
  updateTransportButtons();
}

// Global drag over handler for outside detection (only active when dragging from timeline)
let globalDragOverHandler: ((e: DragEvent) => void) | null = null;

/** Hit-test (x, y). Returns { sectionIndex, barIndexInSection } (barIndexInSection -1 = empty bar) or null. */
function getBarIndexAtPoint(x: number, y: number): { sectionIndex: number; barIndexInSection: number } | null {
  const timeline = timelineElement;
  if (!timeline) return null;

  const rows = timeline.querySelectorAll('.player-section-row');
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] as HTMLElement;
    const sectionIndex = parseInt(row.getAttribute('data-section-index') ?? '-1', 10);
    const barEls = row.querySelectorAll('.timeline-bar:not(.empty-bar)');
    for (let b = 0; b < barEls.length; b++) {
      const rect = (barEls[b] as HTMLElement).getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return { sectionIndex, barIndexInSection: b };
      }
    }
    const emptyBar = row.querySelector('.empty-bar') as HTMLElement | null;
    if (emptyBar) {
      const rect = emptyBar.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return { sectionIndex, barIndexInSection: -1 };
      }
    }
  }
  return null;
}

function clearPaletteTouchDrag(): void {
  if (paletteTouchDragGhost?.parentNode) {
    paletteTouchDragGhost.parentNode.removeChild(paletteTouchDragGhost);
  }
  paletteTouchDragGhost = null;
  paletteTouchDragChord = null;
  dragOverSection = null;
  dragOverBarInSection = null;
  dragOverChord = null;
  updateDragOverStylesOnly();
}

function handleChordDragStart(e: DragEvent, sectionIndex: number, barIndex: number, chordIndex: number): void {
  const section = sections[sectionIndex];
  const bar = section?.bars[barIndex];
  if (!bar || !bar.chords[chordIndex]) return;

  const timelineChord = bar.chords[chordIndex];
  const dragData: ChordDragData & { sectionIndex: number; barIndex: number; chordIndex: number } = {
    chord: timelineChord.chord,
    source: 'timeline',
    sectionIndex,
    barIndex,
    chordIndex,
  };

  e.dataTransfer!.setData('application/json', JSON.stringify(dragData));
  e.dataTransfer!.effectAllowed = 'move';

  draggingChord = { sectionIndex, barIndex, chordIndex };
  (e.currentTarget as HTMLElement).style.opacity = '0.5';
  
  // Set up global drag over handler for outside detection
  globalDragOverHandler = (e: DragEvent) => {
    const container = timelineContainer;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const isOutside =
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom;

    if (isDraggingOutside !== isOutside) {
      isDraggingOutside = isOutside;
      updateTimeline();
    }
  };
  
  document.addEventListener('dragover', globalDragOverHandler);
  updateTimeline();
}

function handleChordTouchStart(e: TouchEvent, sectionIndex: number, barIndex: number, chordIndex: number): void {
  const section = sections[sectionIndex];
  const bar = section?.bars[barIndex];
  if (!bar || !bar.chords[chordIndex]) return;

  const touch = e.touches[0];
  const element = e.currentTarget as HTMLElement;

  (element as any)._touchStartX = touch.clientX;
  (element as any)._touchStartY = touch.clientY;
  (element as any)._touchSectionIndex = sectionIndex;
  (element as any)._touchBarIndex = barIndex;
  (element as any)._touchChordIndex = chordIndex;
  (element as any)._touchStarted = true;

  draggingChord = { sectionIndex, barIndex, chordIndex };
  element.style.opacity = '0.5';
  updateTimeline();
}

function handleChordTouchMove(e: TouchEvent): void {
  if (!draggingChord) return;

  const touch = e.touches[0];
  const container = timelineContainer;
  if (!container) return;

  const rect = container.getBoundingClientRect();
  const isOutside =
    touch.clientX < rect.left ||
    touch.clientX > rect.right ||
    touch.clientY < rect.top ||
    touch.clientY > rect.bottom;

  // Only update if state changed
  if (isDraggingOutside !== isOutside) {
    isDraggingOutside = isOutside;
    updateTimeline();
  }
}

function handleChordTouchEnd(e: TouchEvent): void {
  const element = e.currentTarget as HTMLElement;
  const touchStarted = (element as any)._touchStarted;

  if (!touchStarted || !draggingChord) {
    element.style.opacity = '1';
    (element as any)._touchStarted = false;
    return;
  }

  if (isDraggingOutside) {
    playTrashSound();
    const chordToDelete = draggingChord;
    deletingChord = chordToDelete;

    const section = sections[chordToDelete.sectionIndex];
    const bar = section?.bars[chordToDelete.barIndex];
    if (section && bar) {
      const newChords = bar.chords.filter((_, idx) => idx !== chordToDelete.chordIndex);

      if (newChords.length === 0) {
        section.bars = section.bars.filter((_, idx) => idx !== chordToDelete.barIndex);
      } else {
        const subdivision = 1 / newChords.length;
        const updatedChords = newChords.map((c, i) => ({
          ...c,
          position: i * subdivision,
          duration: subdivision,
        }));
        section.bars[chordToDelete.barIndex] = { ...bar, chords: updatedChords };
      }
    }

    setTimeout(() => {
      deletingChord = null;
      updateTimeline();
      updateTransportButtons();
    }, 0);
  }

  element.style.opacity = '1';
  (element as any)._touchStarted = false;
  draggingChord = null;
  dragOverBarInSection = null;
  dragOverChord = null;
  isDraggingOutside = false;
  updateTimeline();
  updateTransportButtons();
}

function handleChordDragEnd(e: DragEvent): void {
  e.preventDefault();

  const element = e.currentTarget as HTMLElement;

  // Remove global drag over handler
  if (globalDragOverHandler) {
    document.removeEventListener('dragover', globalDragOverHandler);
    globalDragOverHandler = null;
  }

  if (dropHandled) {
    dropHandled = false;
    element.style.opacity = '1';
    draggingChord = null;
    dragOverSection = null;
    dragOverBarInSection = null;
    dragOverChord = null;
    isDraggingOutside = false;
    updateTimeline();
    return;
  }

  if (isDraggingOutside && draggingChord) {
    playTrashSound();
    deletingChord = draggingChord;
    const chordToDelete = draggingChord;
    const section = sections[chordToDelete.sectionIndex];
    const bar = section?.bars[chordToDelete.barIndex];
    if (section && bar) {
      const newChords = bar.chords.filter((_, idx) => idx !== chordToDelete.chordIndex);
      if (newChords.length === 0) {
        section.bars = section.bars.filter((_, idx) => idx !== chordToDelete.barIndex);
      } else {
        const subdivision = 1 / newChords.length;
        const updatedChords = newChords.map((c, i) => ({
          ...c,
          position: i * subdivision,
          duration: subdivision,
        }));
        section.bars[chordToDelete.barIndex] = { ...bar, chords: updatedChords };
      }
    }
    setTimeout(() => {
      deletingChord = null;
      updateTimeline();
      updateTransportButtons();
    }, 50);
  }

  element.style.opacity = '1';
  draggingChord = null;
  dragOverSection = null;
  dragOverBarInSection = null;
  dragOverChord = null;
  isDraggingOutside = false;
  updateTimeline();
  updateTransportButtons();
  
  // Ensure global handler is removed
  if (globalDragOverHandler) {
    document.removeEventListener('dragover', globalDragOverHandler);
    globalDragOverHandler = null;
  }
}

function handleTimelineDragOver(e: DragEvent): void {
  // Note: preventDefault is already called in the container's dragover handler
  if (!draggingChord) return;

  const container = timelineContainer;
  if (!container) return;

  const rect = container.getBoundingClientRect();
  const isOutside =
    e.clientX < rect.left ||
    e.clientX > rect.right ||
    e.clientY < rect.top ||
    e.clientY > rect.bottom;

  // Only update if state changed
  if (isDraggingOutside !== isOutside) {
    isDraggingOutside = isOutside;
    if (!isOutside) {
      dragOverSection = null;
      dragOverBarInSection = null;
      dragOverChord = null;
    }
    updateTimeline();
  }
}

function handleDragOver(e: DragEvent, sectionIndex?: number, barIndexInSection?: number): void {
  e.preventDefault();
  e.stopPropagation();

  const hasJsonData = e.dataTransfer?.types.includes('application/json');

  if (hasJsonData && draggingChord) {
    e.dataTransfer!.dropEffect = 'move';

    if (sectionIndex !== undefined && barIndexInSection !== undefined && barIndexInSection >= 0) {
      const barElement = (e.currentTarget as HTMLElement).closest('.timeline-bar') as HTMLElement;
      if (barElement) {
        const barRect = barElement.getBoundingClientRect();
        const dropX = e.clientX - barRect.left;
        const dropPercent = dropX / barRect.width;

        const section = sections[sectionIndex];
        const targetBar = section?.bars[barIndexInSection];
        if (targetBar) {
          let targetChordIndex = -1;
          for (let i = 0; i < targetBar.chords.length; i++) {
            const chord = targetBar.chords[i];
            const chordEnd = chord.position + chord.duration;
            if (dropPercent >= chord.position && dropPercent <= chordEnd) {
              targetChordIndex = i;
              break;
            }
          }
          const newDragOverChord = targetChordIndex >= 0 ? { sectionIndex, barIndex: barIndexInSection, chordIndex: targetChordIndex } : null;
          const changed = dragOverSection !== sectionIndex || dragOverBarInSection !== barIndexInSection ||
            dragOverChord?.chordIndex !== newDragOverChord?.chordIndex;
          if (changed) {
            dragOverSection = sectionIndex;
            dragOverBarInSection = barIndexInSection;
            dragOverChord = newDragOverChord;
            isDraggingOutside = false;
            updateDragOverStylesOnly();
          }
        }
      }
    } else {
      if (dragOverSection !== sectionIndex || dragOverBarInSection !== -1 || dragOverChord !== null) {
        dragOverSection = sectionIndex ?? null;
        dragOverBarInSection = sectionIndex !== undefined ? -1 : null;
        dragOverChord = null;
        isDraggingOutside = false;
        updateDragOverStylesOnly();
      }
    }
    return;
  }

  if (hasJsonData) {
    e.dataTransfer!.dropEffect = 'copy';
    if (sectionIndex !== undefined && (dragOverSection !== sectionIndex || dragOverBarInSection !== barIndexInSection)) {
      dragOverSection = sectionIndex;
      dragOverBarInSection = barIndexInSection ?? -1;
      dragOverChord = null;
      isDraggingOutside = false;
      updateDragOverStylesOnly();
    }
  }
}

function handleDrop(e: DragEvent, sectionIndex: number, barIndexInSection: number): void {
  e.preventDefault();
  e.stopPropagation();

  const dataStr = e.dataTransfer?.getData('application/json');
  if (!dataStr) return;

  try {
    const dragData = JSON.parse(dataStr) as ChordDragData & { sectionIndex?: number; barIndex?: number; chordIndex?: number };
    if (!dragData.chord) return;

    if (dragData.source === 'timeline' && draggingChord) {
      const sourceSectionIndex = dragData.sectionIndex!;
      const sourceBarIndex = dragData.barIndex!;
      const sourceChordIndex = dragData.chordIndex!;

      let targetSectionIndex = sectionIndex;
      let targetBarIndex = barIndexInSection;
      let targetChordIndex = -1;

      if (dragOverChord && dragOverChord.sectionIndex === sectionIndex && dragOverChord.barIndex === barIndexInSection) {
        targetChordIndex = dragOverChord.chordIndex;
      } else if (barIndexInSection >= 0) {
        const barElement = (e.currentTarget as HTMLElement).closest('.timeline-bar') as HTMLElement;
        if (barElement) {
          const barRect = barElement.getBoundingClientRect();
          const dropPercent = (e.clientX - barRect.left) / barRect.width;
          const targetSection = sections[sectionIndex];
          const targetBar = targetSection?.bars[barIndexInSection];
          if (targetBar) {
            for (let i = 0; i < targetBar.chords.length; i++) {
              const c = targetBar.chords[i];
              if (dropPercent >= c.position && dropPercent <= c.position + c.duration) {
                targetChordIndex = i;
                break;
              }
            }
          }
        }
      }

      if (targetChordIndex >= 0) {
        const sourceSection = sections[sourceSectionIndex];
        const targetSection = sections[targetSectionIndex];
        const sourceBar = sourceSection?.bars[sourceBarIndex];
        const targetBar = targetSection?.bars[targetBarIndex];
        const isSameBar = sourceSectionIndex === targetSectionIndex && sourceBarIndex === targetBarIndex;
        const isSameChord = isSameBar && sourceChordIndex === targetChordIndex;

        if (!isSameChord && sourceBar && targetBar) {
          if (isSameBar) {
            const newChords = [...sourceBar.chords];
            [newChords[sourceChordIndex], newChords[targetChordIndex]] = [newChords[targetChordIndex], newChords[sourceChordIndex]];
            const tempPos = newChords[sourceChordIndex].position;
            const tempDur = newChords[sourceChordIndex].duration;
            newChords[sourceChordIndex].position = newChords[targetChordIndex].position;
            newChords[sourceChordIndex].duration = newChords[targetChordIndex].duration;
            newChords[targetChordIndex].position = tempPos;
            newChords[targetChordIndex].duration = tempDur;
            sourceSection.bars[sourceBarIndex] = { ...sourceBar, chords: newChords };
          } else {
            const sourceChord = sourceBar.chords[sourceChordIndex];
            const targetChord = targetBar.chords[targetChordIndex];
            const recalculateBar = (chords: TimelineChord[]): TimelineChord[] => {
              if (chords.length === 0) return chords;
              const sub = 1 / chords.length;
              return chords.map((c, i) => ({ ...c, position: i * sub, duration: sub }));
            };
            const sourceBarNew = sourceBar.chords.filter((_, idx) => idx !== sourceChordIndex);
            sourceBarNew.splice(sourceChordIndex, 0, { ...targetChord, position: sourceChord.position, duration: sourceChord.duration });
            const targetBarNew = targetBar.chords.filter((_, idx) => idx !== targetChordIndex);
            targetBarNew.splice(targetChordIndex, 0, { ...sourceChord, position: targetChord.position, duration: targetChord.duration });
            sourceSection.bars[sourceBarIndex] = { ...sourceBar, chords: recalculateBar(sourceBarNew) };
            targetSection.bars[targetBarIndex] = { ...targetBar, chords: recalculateBar(targetBarNew) };
          }
          dropHandled = true;
          updateTimeline();
        }
      }
    } else if (dragData.source === 'palette' || !dragData.source) {
      addChordToTimeline(dragData.chord, sectionIndex, barIndexInSection);
    }

    isDraggingOutside = false;
    draggingChord = null;
    dragOverSection = null;
    dragOverBarInSection = null;
    dragOverChord = null;
    updateTimeline();
  } catch (err) {
    console.error('Failed to parse drag data:', err);
    isDraggingOutside = false;
    draggingChord = null;
    dragOverSection = null;
    dragOverBarInSection = null;
    dragOverChord = null;
    updateTimeline();
  }
}

function handleBorderMouseDown(e: MouseEvent, sectionIndex: number, barIndex: number, chordIndex: number): void {
  if (e.type === 'touchstart') return;

  e.preventDefault();
  e.stopPropagation();

  const section = sections[sectionIndex];
  const bar = section?.bars[barIndex];
  if (!bar || chordIndex >= bar.chords.length - 1) return;

  const barElement = (e.currentTarget as HTMLElement).closest('.timeline-bar') as HTMLElement;
  if (!barElement) return;

  const barRect = barElement.getBoundingClientRect();
  const mouseX = e.clientX;
  const currentChord = bar.chords[chordIndex];
  const borderPosition = currentChord.position + currentChord.duration;

  resizingBorder = { sectionIndex, barIndex, chordIndex };
  resizeStartX = mouseX;
  resizeStartPosition = borderPosition;

  document.addEventListener('mousemove', handleBorderMouseMove);
  document.addEventListener('mouseup', handleBorderMouseUp);
}

function handleBorderMouseMove(e: MouseEvent): void {
  if (!resizingBorder) return;

  const { sectionIndex, barIndex, chordIndex } = resizingBorder;

  const barElement = document.querySelector(`.timeline-bar[data-section-index="${sectionIndex}"][data-bar-index="${barIndex}"]`) as HTMLElement;
  if (!barElement) return;

  const barRect = barElement.getBoundingClientRect();
  const barWidth = barRect.width;
  const mouseX = e.clientX;
  const deltaX = mouseX - resizeStartX;
  const deltaPercent = deltaX / barWidth;

  let newPosition = resizeStartPosition + deltaPercent;

  const snapIncrement =
    timeSignature[0] === 6 && timeSignature[1] === 8 ? 1 / 6 : 0.5 / timeSignature[0];
  newPosition = Math.round(newPosition / snapIncrement) * snapIncrement;

  const section = sections[sectionIndex];
  const bar = section?.bars[barIndex];
  if (!bar || chordIndex >= bar.chords.length - 1) return;

  const currentChord = bar.chords[chordIndex];
  const nextChord = bar.chords[chordIndex + 1];

  const minPosition = currentChord.position + snapIncrement;
  const maxPosition = nextChord.position + nextChord.duration - snapIncrement;

  newPosition = Math.max(minPosition, Math.min(maxPosition, newPosition));

  const newCurrentChord = {
    ...currentChord,
    duration: newPosition - currentChord.position,
  };

  const newNextChord = {
    ...nextChord,
    position: newPosition,
    duration: (nextChord.position + nextChord.duration) - newPosition,
  };

  section.bars[barIndex] = {
    ...bar,
    chords: [
      ...bar.chords.slice(0, chordIndex),
      newCurrentChord,
      newNextChord,
      ...bar.chords.slice(chordIndex + 2),
    ],
  };

  updateTimeline();
}

function handleBorderMouseUp(): void {
  resizingBorder = null;
  resizeStartX = 0;
  resizeStartPosition = 0;
  document.removeEventListener('mousemove', handleBorderMouseMove);
  document.removeEventListener('mouseup', handleBorderMouseUp);
}

function handleInsertChord(): void {
  const chord = selectedTimelineChord
    ? (() => {
        const { sectionIndex, barIndex, chordIndex } = selectedTimelineChord;
        const section = sections[sectionIndex];
        const bar = section?.bars[barIndex];
        return bar?.chords[chordIndex]?.chord;
      })()
    : selectedPaletteChord;

  if (!chord || !props.onInsert || !props.songKey) return;

  const scaleId = getScaleIdForDto(props.songKey);
  const dto = chordToChordDto(chord, {
    songKeyRoot: props.songKey.root,
    songKeyScale: scaleId,
    inversion: getInversion(),
  });

  props.onInsert(dto);
}

function handleUpdateChord(): void {
  if (!props.onUpdate || !props.songKey) return;

  const chord = selectedTimelineChord
    ? (() => {
        const { sectionIndex, barIndex, chordIndex } = selectedTimelineChord;
        const section = sections[sectionIndex];
        const bar = section?.bars[barIndex];
        return bar?.chords[chordIndex]?.chord;
      })()
    : selectedPaletteChord;

  if (!chord) return;

  const scaleId = getScaleIdForDto(props.songKey);
  const dto = chordToChordDto(chord, {
    songKeyRoot: props.songKey.root,
    songKeyScale: scaleId,
    inversion: getInversion(),
  });

  props.onUpdate(dto);
}

function handleRemoveChord(): void {
  if (!props.onRemove) return;
  props.onRemove();
}

function playTrashSound(): void {
  void (async () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(150, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(80, audioContext.currentTime + 0.1);

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);
    } catch (err) {
      console.warn('Could not play trash sound:', err);
    }
  })();
}

// ===========================
// PROGRESS ANIMATION (60fps, direct DOM updates)
// ===========================

function startProgressAnimation(): void {
  if (animationFrameId) return;

  let lastTransportTime = 0;
  let lastFlatBarIndex: number | null = null;
  const timingBeatsPerBar = getTimingBeatsPerBar(timeSignature);
  const secondsPerBeat = getSecondsPerBeat(timeSignature, bpm);
  const secondsPerBar = getSecondsPerBar(timeSignature, bpm);
  const totalDuration = playbackBars.length * secondsPerBar;

  const updateProgress = () => {
    if (!isPlaying || playbackBars.length === 0) {
      stopProgressAnimation();
      return;
    }

    try {
      const transportTime = Tone.Transport.seconds;
      const loopReset = transportTime < lastTransportTime;
      if (loopReset) completedChords.clear();
      lastTransportTime = transportTime;

      const loopTime = transportTime % totalDuration;
      const flatBarIndex = Math.floor(loopTime / secondsPerBar) % playbackBars.length;
      const timeInBar = loopTime % secondsPerBar;
      const beatInBar = timeInBar / secondsPerBeat;

      if (lastFlatBarIndex !== null && lastFlatBarIndex === playbackBars.length - 1 && flatBarIndex === 0 && !loopReset) {
        completedChords.clear();
      }
      lastFlatBarIndex = flatBarIndex;

      const mapped = flatBarToSectionBar(flatBarIndex);
      if (!mapped) {
        currentChordProgress = null;
        currentSectionIndex = null;
        currentBarIndexInSection = null;
        updateProgressStylesOnly();
        animationFrameId = requestAnimationFrame(updateProgress);
        return;
      }
      const { sectionIndex, barIndexInSection } = mapped;
      const section = sections[sectionIndex];
      const bar = section?.bars[barIndexInSection];
      if (!bar || bar.chords.length === 0) {
        currentChordProgress = null;
        currentSectionIndex = sectionIndex;
        currentBarIndexInSection = barIndexInSection;
        updateProgressStylesOnly();
        animationFrameId = requestAnimationFrame(updateProgress);
        return;
      }

      const beatFraction = beatInBar / timingBeatsPerBar;

      for (let i = 0; i < bar.chords.length; i++) {
        const timelineChord = bar.chords[i];
        const chordEnd = timelineChord.position + timelineChord.duration;
        if (beatFraction >= chordEnd) {
          const chordKey = `${sectionIndex}-${barIndexInSection}-${i}`;
          if (!completedChords.has(chordKey)) completedChords.add(chordKey);
        }
      }

      let currentChord: { chordIndex: number; progress: number } | null = null;
      for (let i = 0; i < bar.chords.length; i++) {
        const timelineChord = bar.chords[i];
        const chordStart = timelineChord.position;
        const chordEnd = chordStart + timelineChord.duration;
        if (beatFraction >= chordStart && beatFraction < chordEnd) {
          const progressInChord = (beatFraction - chordStart) / timelineChord.duration;
          currentChord = { chordIndex: i, progress: Math.min(1, Math.max(0, progressInChord)) };
          break;
        }
      }

      if (currentChord) {
        const chordKey = `${sectionIndex}-${barIndexInSection}-${currentChord.chordIndex}`;
        if (currentChord.progress >= 0.99) completedChords.add(chordKey);
        currentChordProgress = {
          sectionIndex,
          barIndex: barIndexInSection,
          chordIndex: currentChord.chordIndex,
          progress: currentChord.progress,
        };
        // Dynamic palette switch: when this chord belongs to a different minor scale, switch toggle so the palette highlights it
        const timelineChord = bar.chords[currentChord.chordIndex];
        const sourceMinorScale = timelineChord?.sourceMinorScale;
        const scaleNorm = (props.songKey?.scale ?? '').toString().toLowerCase().replace(/\s+/g, '_');
        const isMinorKey = scaleNorm === EMOTIONAL_BUCKET_IDS.MINOR || scaleNorm === 'minor_emotional' || scaleNorm.includes('minor');
        const currentPalette = props.songKey?.minorScaleType ?? 'natural';
        const effectiveMinorScale =
          sourceMinorScale ??
          (isMinorKey && timelineChord?.chord && props.songKey?.root
            ? inferMinorScaleForChord(timelineChord.chord, props.songKey.root)
            : null);
        if (effectiveMinorScale && props.onMinorScaleTypeChange && chordKey !== lastPaletteSwitchChordKey && effectiveMinorScale !== currentPalette) {
          props.onMinorScaleTypeChange(effectiveMinorScale);
          lastPaletteSwitchChordKey = chordKey;
        }
      } else {
        currentChordProgress = null;
      }

      const prevSectionIndex = currentSectionIndex;
      const prevBarIndex = currentBarIndexInSection;
      currentSectionIndex = sectionIndex;
      currentBarIndexInSection = barIndexInSection;
      currentBeat = Math.floor(beatInBar);
      updateProgressStylesOnly();

      if (prevSectionIndex !== sectionIndex || prevBarIndex !== barIndexInSection) {
        scrollActiveBarIntoView();
      }
    } catch (error) {
      console.warn('Error updating chord progress:', error);
      currentChordProgress = null;
      currentSectionIndex = null;
      currentBarIndexInSection = null;
      updateProgressStylesOnly();
    }

    animationFrameId = requestAnimationFrame(updateProgress);
  };

  animationFrameId = requestAnimationFrame(updateProgress);
}

function stopProgressAnimation(): void {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

/** Scroll the timeline container so the currently active bar is visible. */
function scrollActiveBarIntoView(): void {
  if (currentSectionIndex == null || currentBarIndexInSection == null) return;
  const container = timelineContainer;
  if (!container) return;
  const activeBar = container.querySelector(
    `.timeline-bar[data-section-index="${currentSectionIndex}"][data-bar-index="${currentBarIndexInSection}"]:not(.empty-bar)`
  ) as HTMLElement | null;
  if (!activeBar) return;

  const containerRect = container.getBoundingClientRect();
  const barRect = activeBar.getBoundingClientRect();

  const barLeftRelative = barRect.left - containerRect.left + container.scrollLeft;
  const barRightRelative = barLeftRelative + barRect.width;
  const visibleLeft = container.scrollLeft;
  const visibleRight = container.scrollLeft + containerRect.width;

  if (barRightRelative > visibleRight) {
    container.scrollLeft = barLeftRelative - containerRect.width * 0.25;
  } else if (barLeftRelative < visibleLeft) {
    container.scrollLeft = barLeftRelative - containerRect.width * 0.25;
  }
}

// ===========================
// EVENT LISTENERS (External)
// ===========================

function setupExternalListeners(): (() => void) {
  // Listen for chord selections from palette
  const handleChordSelected = (event: Event) => {
    const customEvent = event as CustomEvent<{ chord: Chord; octaveShift: number; inversion: number }>;
    if (customEvent.detail?.chord) {
      selectedPaletteChord = customEvent.detail.chord;
      selectedTimelineChord = null;
      updateTimeline();
      updateSelectedChordInfo();
    }
  };

  const handleChordDoubleClick = (event: Event) => {
    const customEvent = event as CustomEvent<{ chord: Chord }>;
    if (customEvent.detail?.chord) {
      addChordToTimeline(customEvent.detail.chord, 0, -1);
    }
  };

  const handleChordLongPressDrag = (event: Event) => {
    const e = event as CustomEvent<{ chord: Chord; element: HTMLElement; startX: number; startY: number }>;
    if (!e.detail?.chord) return;
    paletteTouchDragChord = e.detail.chord;
    const ghost = document.createElement('div');
    ghost.className = 'palette-touch-drag-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    ghost.textContent = e.detail.chord.symbol;
    ghost.style.left = `${e.detail.startX}px`;
    ghost.style.top = `${e.detail.startY}px`;
    document.body.appendChild(ghost);
    paletteTouchDragGhost = ghost;
    dragOverBarInSection = null;
    dragOverChord = null;
    updateDragOverStylesOnly();
  };

  const handleChordTouchDrag = (event: Event) => {
    const e = event as CustomEvent<{ chord: Chord; x: number; y: number }>;
    if (!paletteTouchDragChord || !paletteTouchDragGhost) return;
    paletteTouchDragGhost.style.left = `${e.detail.x}px`;
    paletteTouchDragGhost.style.top = `${e.detail.y}px`;
    const hit = getBarIndexAtPoint(e.detail.x, e.detail.y);
    if (hit !== null && (dragOverSection !== hit.sectionIndex || dragOverBarInSection !== hit.barIndexInSection)) {
      dragOverSection = hit.sectionIndex;
      dragOverBarInSection = hit.barIndexInSection;
      dragOverChord = null;
      updateDragOverStylesOnly();
    } else if (hit === null && (dragOverSection !== null || dragOverBarInSection !== null)) {
      dragOverSection = null;
      dragOverBarInSection = null;
      dragOverChord = null;
      updateDragOverStylesOnly();
    }
  };

  const handleChordTouchDragEnd = (event: Event) => {
    const e = event as CustomEvent<{ chord: Chord; x: number; y: number }>;
    if (!paletteTouchDragChord) {
      clearPaletteTouchDrag();
      return;
    }
    const hit = getBarIndexAtPoint(e.detail.x, e.detail.y);
    if (hit !== null) {
      addChordToTimeline(paletteTouchDragChord, hit.sectionIndex, hit.barIndexInSection);
      updateTimeline();
      updateTransportButtons();
    }
    clearPaletteTouchDrag();
  };

  const handleSpacebar = (e: KeyboardEvent) => {
    if (e.key !== ' ' || e.repeat) return;
    const target = e.target as HTMLElement;
    if (target?.closest('input, textarea, select') || target?.isContentEditable) return;
    // Disable space (play/stop) when any modal is open (e.g. save progression)
    if (target?.closest?.('.save-progression-backdrop, .progression-selection-backdrop, .add-chord-modal-backdrop')) return;
    e.preventDefault();
    if (isPlaying) {
      handleStop();
    } else {
      handlePlay().catch(err => console.error('Error starting playback:', err));
    }
  };

  document.addEventListener('chordSelected', handleChordSelected);
  document.addEventListener('chordDoubleClick', handleChordDoubleClick);
  document.addEventListener('chordLongPressDrag', handleChordLongPressDrag);
  document.addEventListener('chordTouchDrag', handleChordTouchDrag);
  document.addEventListener('chordTouchDragEnd', handleChordTouchDragEnd);
  document.addEventListener('keydown', handleSpacebar);

  // Cleanup function stored for destroy
  return () => {
    document.removeEventListener('chordSelected', handleChordSelected);
    document.removeEventListener('chordDoubleClick', handleChordDoubleClick);
    document.removeEventListener('chordLongPressDrag', handleChordLongPressDrag);
    document.removeEventListener('chordTouchDrag', handleChordTouchDrag);
    document.removeEventListener('chordTouchDragEnd', handleChordTouchDragEnd);
    document.removeEventListener('keydown', handleSpacebar);
    clearPaletteTouchDrag();
  };
}

let externalListenersCleanup: (() => void) | null = null;

// ===========================
// PUBLIC API - Settings Control
// ===========================

export function setProgressionBpm(newBpm: number): void {
  const clampedBpm = Math.min(MAX_BPM, Math.max(MIN_BPM, newBpm));
  if (clampedBpm === bpm) return;
  bpm = clampedBpm;
  const display = document.getElementById('tempo-display') as HTMLElement;
  if (display) {
    display.textContent = bpm.toString();
  }
  updateTempoDisplay();
  if (isPlaying) updateTempo(bpm);
}

export function getProgressionBpm(): number {
  return bpm;
}

export function setProgressionTimeSignature(newTimeSig: TimeSignature): void {
  timeSignature = newTimeSig;
  const button = document.getElementById('time-signature') as HTMLElement;
  if (button) {
    button.textContent = `${timeSignature[0]}/${timeSignature[1]}`;
  }
  if (isPlaying) {
    handleStop();
    setTimeout(() => {
      handlePlay().catch(err => {
        console.error('Error restarting playback after time signature change:', err);
      });
    }, 100);
  }
}

export function getProgressionTimeSignature(): TimeSignature {
  return [...timeSignature] as TimeSignature;
}

export function setProgressionMetronomeEnabled(enabled: boolean): void {
  metronomeEnabled = enabled;
  setMetronomeEnabled(enabled);
  updateMetronomeMenu();
}

export function getProgressionMetronomeEnabled(): boolean {
  return metronomeEnabled;
}

export function setProgressionMetronomeVolume(volume: number): void {
  metronomeVolume = volume;
  setMetronomeVolume(volume);
  const slider = document.getElementById('metronome-volume') as HTMLInputElement;
  const volumeValue = document.getElementById('metronome-volume-value') as HTMLElement;
  if (slider) {
    slider.value = volume.toString();
  }
  if (volumeValue) {
    volumeValue.textContent = `${volume.toFixed(1)} dB`;
  }
}

export function getProgressionMetronomeVolume(): number {
  return metronomeVolume;
}

export function setProgressionMetronomeType(type: MetronomeTypeId): void {
  metronomeType = type;
  setMetronomeType(type);
  const select = document.getElementById('metronome-type') as HTMLSelectElement;
  if (select) select.value = type;
}

export function getProgressionMetronomeType(): MetronomeTypeId {
  return metronomeType;
}

/** Returns a deep copy of the current progression sections, or empty array if no progression. */
export function getProgressionSections(): ProgressionSection[] {
  return JSON.parse(JSON.stringify(sections));
}

/** Replaces progression sections and updates playback/timeline. Flattens to single section. Used when transposing on root change. */
export function setProgressionSections(newSections: ProgressionSection[]): void {
  const allBars: TimelineBar[] = [];
  for (const s of newSections) {
    for (const b of s.bars) {
      allBars.push({
        id: generateId(),
        chords: b.chords.map(tc => ({
          id: generateId(),
          chord: { ...tc.chord },
          position: tc.position,
          duration: tc.duration,
          sourceMinorScale: tc.sourceMinorScale,
        })),
      });
    }
  }
  sections = [{ id: generateId(), bars: allBars, repeatTimes: 1 }];
  selectedTimelineChord = null;
  completedChords.clear();
  currentChordProgress = null;
  buildPlaybackFromSections();
  updateTimeline();
  updateTransportButtons();
  updateSelectedChordInfo();
  if (isPlaying) handleStop();
}

// ===========================
// PUBLIC API
// ===========================

export function mountChordProgressionPlayer(
  containerElement: HTMLElement,
  initialProps: ChordProgressionPlayerProps
): ChordProgressionPlayerInstance {
  // Clean up previous instance if exists
  if (container) {
    stopPlayback();
    stopProgressAnimation();
    if (externalListenersCleanup) {
      externalListenersCleanup();
      externalListenersCleanup = null;
    }
  }
  
  container = containerElement;
  props = { ...initialProps };
  
  // Reset state for fresh mount (single section timeline)
  sections = [{ id: generateId(), bars: [], repeatTimes: 1 }];
  isPlaying = false;
  currentSectionIndex = null;
  currentBarIndexInSection = null;
  currentBeat = 0;
  selectedTimelineChord = null;
  selectedPaletteChord = null;
  currentChordProgress = null;
  completedChords.clear();
  bpm = Math.min(MAX_BPM, Math.max(MIN_BPM, bpm));
  
  // If currentChord is provided (edit mode), convert it to internal Chord and set as selected
  if (initialProps.currentChord) {
    try {
      const internalChord = chordDtoToInternalChord(initialProps.currentChord);
      selectedPaletteChord = internalChord;
    } catch (err) {
      console.warn('Failed to convert currentChord to internal format:', err);
      selectedPaletteChord = null;
    }
  }

  // Initialize engine
  initProgressionEngine().catch(err => {
    console.warn('Failed to initialize progression engine:', err);
  });

  setMetronomeVolume(metronomeVolume);
  setMetronomeType(metronomeType);

  onBeat((beat, flatBar) => {
    currentBeat = beat;
    const mapped = flatBarToSectionBar(flatBar);
    if (mapped) {
      currentSectionIndex = mapped.sectionIndex;
      currentBarIndexInSection = mapped.barIndexInSection;
    }
  });
  onEnd(() => {
    handleStop();
  });
  onChordPlay((chord) => {
    // Highlight piano notes when chord plays during progression playback
    highlightNotes(chord.midiNotes);
    // Defer palette highlight by one frame so dynamic minor-scale switch (if any) has time to update the grid
    requestAnimationFrame(() => {
      highlightChordForPlayback(chord);
    });
  });

  // Set up external event listeners (only if not already set up)
  if (!externalListenersCleanup) {
    const cleanup = setupExternalListeners();
    externalListenersCleanup = cleanup;
  }

  // Initial render
  render();
  
  // Sync settings UI with primary-controls elements
  syncSettingsUI();

  return {
    updateProps(newProps: ChordProgressionPlayerProps) {
      props = { ...newProps };
      
      // If currentChord is provided (edit mode), convert it to internal Chord and set as selected
      if (newProps.currentChord) {
        try {
          const internalChord = chordDtoToInternalChord(newProps.currentChord);
          selectedPaletteChord = internalChord;
          selectedTimelineChord = null; // Clear timeline selection when editing external chord
        } catch (err) {
          console.warn('Failed to convert currentChord to internal format:', err);
          selectedPaletteChord = null;
        }
      } else if (newProps.mode === 'insert') {
        // Clear selection when switching to insert mode
        selectedPaletteChord = null;
        selectedTimelineChord = null;
      }
      
      // Don't reset bars on prop update - only update UI
      updateTimeline();
      updateSelectedChordInfo();
      updateTransportButtons();
      updateMetronomeMenu();
      // Note: If progression selection modal is open, it will use props.songKey
      // which is now updated, so it will show correct progressions on next open
    },
    destroy() {
      stopPlayback();
      clearPlaybackHighlight();
      stopProgressAnimation();
      if (externalListenersCleanup) {
        externalListenersCleanup();
        externalListenersCleanup = null;
      }
      // Remove global drag over handler if active
      if (globalDragOverHandler) {
        document.removeEventListener('dragover', globalDragOverHandler);
        globalDragOverHandler = null;
      }
      if (container) {
        container.innerHTML = '';
      }
      container = null;
      props = {};
      sections = [];
      isPlaying = false;
      selectedTimelineChord = null;
      selectedPaletteChord = null;
      currentChordProgress = null;
      completedChords.clear();
    },
  };
}
