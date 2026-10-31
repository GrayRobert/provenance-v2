/**
 * Chord Palette UI
 * Renders the interactive chord grid with variations and borrowed chords
 */

import type { HarmonizedScale, DegreeChords, Chord } from './harmonizer';
import { ensureChordTonesMinimumRegister } from './harmonizer';
import { playChord, releaseAll } from './audioEngine';
import type { BorrowedModeChords, BorrowedChord, BorrowedSuggestion } from './modalInterchange';
import { getSuggestedBorrowedChords, isBorrowedChordSuggested } from './modalInterchange';
import { loadCustomChords, addCustomChord, removeCustomChord, chordSymbolToInternalChord, validateChordSymbol } from './customChords';

// ===========================
// STATE
// ===========================

let currentHarmonization: HarmonizedScale | null = null;
let expandedDegree: number | null = null;
let activeChordElement: HTMLElement | null = null;
let currentlyPlayingChord: Chord | null = null;

// Borrowed chords state
let borrowedModeChords: BorrowedModeChords[] = [];
let currentSuggestions: BorrowedSuggestion[] = [];
let suggestionConfidenceThreshold = 0.6; // Default threshold (0.4 = bold, 0.8 = safe)
let lastPlayedChord: Chord | null = null; // Track last chord for slider updates

/** Element currently highlighted as "playing" during progression playback (not user click). */
let playbackHighlightElement: HTMLElement | null = null;

// Callbacks for external listeners
let onChordPlay: ((chord: Chord, octaveShift: number, inversion: number) => void) | null = null;
let onChordRelease: (() => void) | null = null;
let onOctaveShiftChange: ((shift: number) => void) | null = null;
let onInversionChange: ((inversion: number, maxInversion: number) => void) | null = null;

// ===========================
// OCTAVE SHIFT
// ===========================

let octaveShift = 0;  // -3 to +3 (octaves)
let octaveUpHeld = false;
let octaveDownHeld = false;

/**
 * Apply octave shift to a chord's MIDI notes
 */
function applyOctaveShift(chord: Chord): Chord {
  if (octaveShift === 0) return chord;
  
  const shiftedMidiNotes = chord.midiNotes.map(midi => midi + (octaveShift * 12));
  
  return {
    ...chord,
    midiNotes: shiftedMidiNotes,
  };
}

/**
 * Update octave shift based on held keys
 */
function updateOctaveShift(): void {
  let newShift = 0;
  if (octaveUpHeld) newShift = 1;
  if (octaveDownHeld) newShift = -1;
  // If both held, they cancel out (newShift stays 0)
  if (octaveUpHeld && octaveDownHeld) newShift = 0;
  
  if (newShift !== octaveShift) {
    octaveShift = newShift;
    if (onOctaveShiftChange) {
      onOctaveShiftChange(octaveShift);
    }
  }
}

// ===========================
// CHORD INVERSION
// ===========================

let currentInversion = 1;  // 0 = root position, 1 = 1st inversion, 2 = 2nd, 3 = 3rd (for 7ths)
let lastChordNoteCount = 4;  // Track how many notes in last chord to know max inversions
let keepRootBass = true;  // When true, bass stays on root even when chord tones are inverted

/**
 * Apply inversion to a chord
 * Inversion rotates the chord tones:
 * - Root position (0): C | C E G
 * - 1st inversion (1): E | E G C (3rd as bass, chord tones rotated)
 * - 2nd inversion (2): G | G C E (5th as bass, chord tones rotated)
 * - 3rd inversion (3): B | B C E G (7th as bass, only for 7th chords)
 * 
 * When keepRootBass is true:
 * - 1st inversion: C | E G C (root stays in bass, chord tones rotated)
 * - 2nd inversion: C | G C E (root stays in bass, chord tones rotated)
 */
function applyInversion(chord: Chord, inversion: number): Chord {
  // Original structure: [bass, ...chordTones]
  // Bass is typically root in octave 2, chord tones in octave 3+
  // The chord tones (indices 1+) are what we rotate

  const originalBass = chord.midiNotes[0];
  const originalBassName = chord.notes[0];
  const chordTones = chord.midiNotes.slice(1);  // Exclude bass
  const chordToneNames = chord.notes.slice(1);  // Exclude bass note name

  // Number of chord tones
  const numTones = chordTones.length;

  // Normalize chord tones so root position is always voiced above the root tone
  const rootMidi = chordTones[0];
  const normalizedMidi: number[] = [];
  const normalizedNames: string[] = [];

  for (let i = 0; i < numTones; i++) {
    let midiNote = chordTones[i];

    while (midiNote < rootMidi) {
      midiNote += 12;
    }

    if (normalizedMidi.length > 0 && midiNote <= normalizedMidi[normalizedMidi.length - 1]) {
      midiNote += 12;
    }

    normalizedMidi.push(midiNote);
    normalizedNames.push(chordToneNames[i]);
  }

  // Clamp inversion to valid range (can't invert more than we have tones)
  const maxInversion = Math.min(numTones - 1, 3);
  const effectiveInversion = Math.min(inversion, maxInversion);

  // Rotate the chord tones by the inversion amount
  // For 1st inversion: [C, E, G] -> [E, G, C]
  // For 2nd inversion: [C, E, G] -> [G, C, E]
  const rotatedMidi: number[] = [];
  const rotatedNames: string[] = [];

  for (let i = 0; i < numTones; i++) {
    const srcIdx = (i + effectiveInversion) % numTones;
    let midiNote = normalizedMidi[srcIdx];

    // Notes that wrapped around need to go up an octave to maintain ascending order
    // If this note would be lower than the previous, bump it up
    if (rotatedMidi.length > 0 && midiNote <= rotatedMidi[rotatedMidi.length - 1]) {
      midiNote += 12;
    }

    rotatedMidi.push(midiNote);
    rotatedNames.push(normalizedNames[srcIdx]);
  }

  let finalBassMidi: number;
  let finalBassName: string;

  if (keepRootBass) {
    // Keep the original root as bass
    finalBassMidi = originalBass;
    finalBassName = originalBassName;
  } else {
    // Bass follows the inversion (first of rotated chord tones, dropped an octave)
    finalBassMidi = rotatedMidi[0] - 12;
    finalBassName = rotatedNames[0];
  }

  // Build the inverted chord: [bass, ...rotatedChordTones]
  const invertedMidiNotes = [finalBassMidi, ...rotatedMidi];
  const invertedNotes = [finalBassName, ...rotatedNames];

  const inverted: Chord = {
    ...chord,
    notes: invertedNotes,
    midiNotes: invertedMidiNotes,
  };
  return ensureChordTonesMinimumRegister(inverted);
}

/**
 * Get maximum valid inversion for current chord context
 */
function getMaxInversion(): number {
  // Triads have 2 inversions (0, 1, 2), 7ths have 3 (0, 1, 2, 3)
  return lastChordNoteCount >= 5 ? 3 : 2;
}

/**
 * Cycle to next inversion
 */
function cycleInversion(): void {
  const maxInv = getMaxInversion();
  currentInversion = (currentInversion + 1) % (maxInv + 1);
  
  if (onInversionChange) {
    onInversionChange(currentInversion, maxInv);
  }
}

/**
 * Manually set inversion
 */
export function setInversion(inversion: number): void {
  const maxInv = getMaxInversion();
  currentInversion = Math.max(0, Math.min(inversion, maxInv));
  if (onInversionChange) {
    onInversionChange(currentInversion, maxInv);
  }
}

// ===========================
// KEYBOARD MAPPING
// ===========================
// Row 0 (primary): 1–7; Row 1: qwertyu; Row 2: asdfghj; Row 3: zxcvbnm
// Same chords +1 octave: Row 0: 8 9 0 - = [ ]; Row 1: p o i \ ; ' ,; Row 2: k l . / (degrees 1–4); Row 3: (no keys – overlap)

const DEGREE_KEYS = ['1', '2', '3', '4', '5', '6', '7'];
const ROW_KEYS: string[][] = [
  ['1', '2', '3', '4', '5', '6', '7'],       // row 0: primary
  ['q', 'w', 'e', 'r', 't', 'y', 'u'],       // row 1
  ['a', 's', 'd', 'f', 'g', 'h', 'j'],       // row 2
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],       // row 3
];

/** Same chord grid but +1 octave. Row 0: 8 9 0 - = [ ]; Row 1: p o i \ ; ' ,; Row 2: k l ; ' , . / (first-come wins so k l . / for 1–4); Row 3: , . / (overlap, so no keys in map). */
const ROW_KEYS_OCT_UP: string[][] = [
  ['8', '9', '0', '-', '=', '[', ']'],        // row 0 +1 oct
  ['p', 'o', 'i', '\\', ';', "'", ','],       // row 1 +1 oct (p = 1st chord var +oct)
  ['k', 'l', ';', "'", ',', '.', '/'],        // row 2 +1 oct
  [',', '.', '/', "'", '[', ']', '\\'],       // row 3 +1 oct
];

/** Map key (lowercase) -> [rowIndex, degreeIndex]. Rows 0–3 only. */
const KEY_TO_POSITION = new Map<string, [number, number]>();
for (let row = 0; row < ROW_KEYS.length; row++) {
  ROW_KEYS[row].forEach((k, col) => KEY_TO_POSITION.set(k, [row, col]));
}

/** Map key -> [rowIndex, degreeIndex] for +1 octave. First-come wins so row 0 is preferred for number row. */
const KEY_TO_POSITION_OCT_UP = new Map<string, [number, number]>();
for (let row = 0; row < ROW_KEYS_OCT_UP.length; row++) {
  ROW_KEYS_OCT_UP[row].forEach((k, col) => {
    if (!KEY_TO_POSITION_OCT_UP.has(k)) KEY_TO_POSITION_OCT_UP.set(k, [row, col]);
  });
}

/** Key used to trigger current chord via keyboard; released = sustain release when !alwaysSustain. */
let heldChordKey: string | null = null;

// ===========================
// RENDERING
// ===========================

/**
 * Render the complete chord palette
 */
export function renderChordPalette(
  container: HTMLElement,
  harmonization: HarmonizedScale,
  borrowed: BorrowedModeChords[] = []
): void {
  currentHarmonization = harmonization;
  borrowedModeChords = borrowed;
  currentSuggestions = [];
  container.innerHTML = '';
  
  // Create chord grid container
  const gridContainer = document.createElement('div');
  gridContainer.className = 'chord-grid-container';
  
  // Create diatonic chord grid
  const diatonicSection = document.createElement('div');
  diatonicSection.className = 'diatonic-section';
  diatonicSection.setAttribute('data-tour', 'diatonic-chords');
  
  const grid = document.createElement('div');
  grid.className = 'chord-grid';
  grid.id = 'diatonic-grid';
  
  harmonization.degrees.forEach((degreeChords, index) => {
    const column = createDegreeColumn(degreeChords, index);
    grid.appendChild(column);
  });
  
  diatonicSection.appendChild(grid);
  gridContainer.appendChild(diatonicSection);
  
  // Create a container for both borrowed and custom chords (drawer section)
  const drawerSection = document.createElement('div');
  drawerSection.className = 'borrowed-section';
  drawerSection.setAttribute('data-tour', 'modal-interchange');
  
  // Create borrowed chords section (if any)
  if (borrowed.length > 0) {
    const borrowedLabel = document.createElement('div');
    borrowedLabel.className = 'borrowed-section-label';
    
    // Calculate initial slider value from current threshold
    // threshold 0.8 = 0%, threshold 0.4 = 100%
    const initialSliderValue = Math.round((0.8 - suggestionConfidenceThreshold) / 0.4 * 100);
    
    borrowedLabel.innerHTML = `
      <span class="label-text">Modal Interchange</span>
      <div class="boldness-control">
        <span class="boldness-label">Safe</span>
        <input type="range" id="boldness-slider" class="boldness-slider" min="0" max="100" value="${initialSliderValue}" aria-label="Suggestion boldness">
        <span class="boldness-label boldness-label-bold">Bold</span>
      </div>
    `;
    drawerSection.appendChild(borrowedLabel);
    
    // Set up boldness slider event listener
    const slider = borrowedLabel.querySelector('#boldness-slider') as HTMLInputElement;
    if (slider) {
      slider.addEventListener('input', () => {
        const value = parseInt(slider.value);
        setSuggestionBoldness(value);
      });
    }
    
    const borrowedGrid = document.createElement('div');
    borrowedGrid.className = 'chord-grid borrowed-grid';
    borrowedGrid.id = 'borrowed-grid';
    
    borrowed.forEach(modeChords => {
      const column = createBorrowedModeColumn(modeChords);
      borrowedGrid.appendChild(column);
    });
    
    drawerSection.appendChild(borrowedGrid);
  }
  
  // Always create custom chords section inside drawer section (so it's in the drawer)
  const customChords = loadCustomChords();
  const customSection = createCustomChordsSection(customChords, borrowed.length > 0);
  drawerSection.appendChild(customSection);
  
  gridContainer.appendChild(drawerSection);
  
  // Add drawer toggle tab (visible on narrow screens via CSS)
  const drawerToggle = document.createElement('button');
  drawerToggle.className = 'drawer-toggle-tab';
  drawerToggle.innerHTML = `
    <span class="drawer-icon">◀</span>
    <span class="drawer-label">${borrowed.length > 0 ? 'Modal Interchange' : 'Custom Chords'}</span>
  `;
  drawerToggle.addEventListener('click', () => {
    drawerSection.classList.toggle('drawer-open');
    drawerToggle.classList.toggle('drawer-open');
    drawerOverlay.classList.toggle('visible');
  });
  container.appendChild(drawerToggle);
  
  // Add drawer overlay (for closing drawer when clicking outside)
  const drawerOverlay = document.createElement('div');
  drawerOverlay.className = 'drawer-overlay';
  drawerOverlay.addEventListener('click', () => {
    drawerSection.classList.remove('drawer-open');
    drawerToggle.classList.remove('drawer-open');
    drawerOverlay.classList.remove('visible');
  });
  container.appendChild(drawerOverlay);
  
  container.appendChild(gridContainer);
}

/**
 * Create a column for a scale degree
 */
function createDegreeColumn(degreeChords: DegreeChords, index: number): HTMLElement {
  const column = document.createElement('div');
  column.className = 'degree-column';
  column.dataset.degree = String(degreeChords.degree);
  
  // Degree header
  const degreeHeader = document.createElement('div');
  degreeHeader.className = 'degree-header';
  degreeHeader.innerHTML = `
    <span class="degree-numeral">${degreeChords.degreeRoman}</span>
    <span class="degree-key">${DEGREE_KEYS[index] || ''}</span>
  `;
  column.appendChild(degreeHeader);
  
  // Primary chord button (row 0, keys 1–7)
  const primaryBtn = createChordButton(degreeChords.primaryChord, true, undefined, index);
  column.appendChild(primaryBtn);
  
  // Variations container (initially hidden). Rows 1–3: q-u, a-j, z-m; row 4+: no key
  const variationsContainer = document.createElement('div');
  variationsContainer.className = 'variations-container';
  
  degreeChords.variations.forEach((chord, varIndex) => {
    const varBtn = createChordButton(chord, false, varIndex, index);
    variationsContainer.appendChild(varBtn);
  });
  
  column.appendChild(variationsContainer);
  
  return column;
}

/**
 * Create a column for borrowed chords from a mode
 */
function createBorrowedModeColumn(modeChords: BorrowedModeChords): HTMLElement {
  const column = document.createElement('div');
  column.className = 'degree-column borrowed-column';
  column.dataset.mode = modeChords.modeId;
  
  // Mode header
  const modeHeader = document.createElement('div');
  modeHeader.className = 'degree-header borrowed-header';
  modeHeader.innerHTML = `
    <span class="degree-numeral borrowed-mode-name">${modeChords.modeName}</span>
  `;
  column.appendChild(modeHeader);
  
  // Borrowed chord buttons
  const chordsContainer = document.createElement('div');
  chordsContainer.className = 'borrowed-chords-container';
  
  modeChords.chords.forEach(chord => {
    const btn = createBorrowedChordButton(chord);
    chordsContainer.appendChild(btn);
  });
  
  column.appendChild(chordsContainer);
  
  return column;
}

/**
 * Create a button for a borrowed chord
 */
function createBorrowedChordButton(chord: BorrowedChord): HTMLElement {
  const btn = document.createElement('button');
  btn.className = 'chord-button borrowed-chord';
  btn.dataset.chord = JSON.stringify(chord);
  btn.dataset.mode = chord.sourceMode;
  btn.dataset.chordRoot = chord.root;
  btn.dataset.chordQuality = chord.quality;
  btn.draggable = true;
  
  // Determine chord quality class for coloring
  const qualityClass = getQualityClass(chord.quality);
  btn.classList.add(qualityClass);
  
  // Display notes with bass note visually distinct
  const bassNote = chord.notes[0];
  const chordTones = chord.notes.slice(1);
  
  btn.innerHTML = `
    <span class="chord-symbol">${formatChordSymbol(chord.symbol)}</span>
    <span class="chord-notes">
      <span class="bass-note-label">${bassNote}</span>
      <span class="note-separator">│</span>
      <span class="chord-tones">${chordTones.join(' ')}</span>
    </span>
    <span class="borrowed-badge">${chord.sourceModeName.slice(0, 3)}</span>
  `;
  
  // Event handlers
  btn.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    triggerChord(btn, chord);
  });
  
  btn.addEventListener('mouseup', () => {
    // Release when we mouse up on the chord we're holding (sustain off = release; sustain on = no-op)
    if (btn === activeChordElement) {
      deactivateChord(btn);
    }
  });
  
  btn.addEventListener('mouseleave', () => {
    // Release when we leave the active chord (e.g. drag off) — sustain off = release
    if (btn === activeChordElement) {
      deactivateChord(btn);
    }
  });
  
  // Double-click to add to progression player
  let lastClickTime = 0;
  let clickTimeout: number | null = null;
  btn.addEventListener('click', (e) => {
    const currentTime = Date.now();
    const timeSinceLastClick = currentTime - lastClickTime;
    
    if (timeSinceLastClick < 300 && timeSinceLastClick > 0) {
      // Double-click detected
      e.preventDefault();
      e.stopPropagation();
      if (clickTimeout) {
        clearTimeout(clickTimeout);
        clickTimeout = null;
      }
      
      // Dispatch event to add chord to progression player
      const event = new CustomEvent('chordDoubleClick', {
        detail: { chord: chord },
        bubbles: true,
      });
      document.dispatchEvent(event);
      
      lastClickTime = 0; // Reset to prevent triple-click
    } else {
      // Single click - set timeout to track potential double-click
      lastClickTime = currentTime;
      clickTimeout = window.setTimeout(() => {
        lastClickTime = 0;
      }, 300);
    }
  });
  
  // Touch: tap < 1.5s = play; long-press >= 1.5s = drag; fast double-tap = add to progression
  const LONG_PRESS_MS = 1500;
  const MOVE_THRESHOLD_PX = 10;
  const SCROLL_THRESHOLD_PX = 5; // Threshold to detect scrolling vs button interaction
  const DOUBLE_TAP_MS = 300;
  let touchStartX = 0;
  let touchStartY = 0;
  let longPressTimeout: number | null = null;
  let isDragging = false;
  let isScrolling = false;
  let lastTapTime = 0;
  let doubleTapHandled = false;
  let touchStarted = false;
  
  btn.addEventListener('touchstart', (e) => {
    // Don't prevent default immediately - allow scroll to work
    touchStarted = true;
    isScrolling = false;
    const now = Date.now();
    if (now - lastTapTime < DOUBLE_TAP_MS) {
      doubleTapHandled = true;
      lastTapTime = 0;
      e.preventDefault();
      e.stopPropagation();
      document.dispatchEvent(new CustomEvent('chordDoubleClick', { detail: { chord }, bubbles: true }));
      return;
    }
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    isDragging = false;
    longPressTimeout = window.setTimeout(() => {
      if (!isScrolling) {
        longPressTimeout = null;
        isDragging = true;
        deactivateChord(btn, true);
        btn.style.opacity = '0.5';
        btn.classList.add('dragging');
        document.dispatchEvent(new CustomEvent('chordLongPressDrag', {
          detail: { chord, element: btn, startX: touchStartX, startY: touchStartY },
          bubbles: true,
        }));
      }
    }, LONG_PRESS_MS);
    // Don't prevent default here - let touchmove decide
  }, { passive: true });
  
  btn.addEventListener('touchmove', (e) => {
    if (!touchStarted) return;
    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - touchStartX);
    const deltaY = Math.abs(touch.clientY - touchStartY);
    
    // Detect if user is scrolling (primarily vertical movement)
    if (deltaY > SCROLL_THRESHOLD_PX && deltaY > deltaX * 1.5) {
      // User is scrolling - don't prevent default, allow scroll
      isScrolling = true;
      if (longPressTimeout) {
        clearTimeout(longPressTimeout);
        longPressTimeout = null;
      }
      return; // Let the browser handle scrolling
    }
    
    // User is interacting with button, not scrolling
    if (isDragging) {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent('chordTouchDrag', {
        detail: { chord, x: touch.clientX, y: touch.clientY },
        bubbles: true,
      }));
      return;
    }
    if (deltaX > MOVE_THRESHOLD_PX || deltaY > MOVE_THRESHOLD_PX) {
      if (longPressTimeout) {
        clearTimeout(longPressTimeout);
        longPressTimeout = null;
      }
      // Small movement - might be trying to interact, prevent default
      if (!isScrolling) {
        e.preventDefault();
      }
    }
  }, { passive: false });
  
  btn.addEventListener('touchend', (e) => {
    if (!touchStarted) return;
    touchStarted = false;
    
    if (doubleTapHandled) {
      doubleTapHandled = false;
      return;
    }
    if (longPressTimeout) {
      clearTimeout(longPressTimeout);
      longPressTimeout = null;
    }
    if (isDragging) {
      isDragging = false;
      btn.style.opacity = '1';
      btn.classList.remove('dragging');
      const touch = e.changedTouches[0];
      document.dispatchEvent(new CustomEvent('chordTouchDragEnd', {
        detail: { chord, x: touch.clientX, y: touch.clientY },
        bubbles: true,
      }));
    } else if (!isScrolling) {
      // Only trigger chord if not scrolling
      triggerChord(btn, chord);
      lastTapTime = Date.now();
      if (btn === activeChordElement) {
        // Small delay before deactivating to allow chord to play (sustain off = release on tap release)
        setTimeout(() => {
          if (btn === activeChordElement) deactivateChord(btn);
        }, 100);
      }
    }
    isScrolling = false;
  }, { passive: true });
  
  // Drag & Drop support for progression player (desktop)
  btn.addEventListener('dragstart', (e) => {
    const dragData = {
      chord: chord,
      source: 'palette' as const,
    };
    if (e.dataTransfer) {
      e.dataTransfer.setData('application/json', JSON.stringify(dragData));
      e.dataTransfer.effectAllowed = 'copy';
    }
    btn.style.opacity = '0.5';
  });
  
  btn.addEventListener('dragend', () => {
    btn.style.opacity = '1';
  });
  
  return btn;
}

/**
 * Create the custom chords section with input form and chord grid
 */
function createCustomChordsSection(initialChords: Chord[], hasBorrowedChords: boolean = false): HTMLElement {
  const section = document.createElement('div');
  section.className = 'custom-chords-section';
  section.setAttribute('data-tour', 'custom-chords');
  if (!hasBorrowedChords) {
    section.classList.add('no-borrowed-chords');
  }
  
  const label = document.createElement('div');
  label.className = 'custom-chords-section-label';
  label.innerHTML = `<span class="label-text">My Custom Chords</span>`;
  section.appendChild(label);
  
  // Input form
  const form = document.createElement('div');
  form.className = 'custom-chord-input-form';
  
  const inputWrapper = document.createElement('div');
  inputWrapper.className = 'custom-chord-input-wrapper';
  
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'custom-chord-input';
  input.placeholder = 'Enter chord (e.g., Em)';
  input.setAttribute('aria-label', 'Custom chord symbol input');
  
  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'custom-chord-add-button';
  addButton.textContent = 'ADD';
  
  inputWrapper.appendChild(input);
  inputWrapper.appendChild(addButton);
  form.appendChild(inputWrapper);
  
  const errorMessage = document.createElement('div');
  errorMessage.className = 'chord-input-error';
  errorMessage.style.display = 'none';
  form.appendChild(errorMessage);
  
  section.appendChild(form);
  
  // Chord grid
  const grid = document.createElement('div');
  grid.className = 'chord-grid custom-chords-grid';
  grid.id = 'custom-chords-grid';
  
  // Render existing chords
  function renderCustomChords() {
    grid.innerHTML = '';
    const chords = loadCustomChords();
    chords.forEach(chord => {
      const btn = createCustomChordButton(chord, () => {
        // Delete callback - remove chord and re-render
        removeCustomChord(chord.symbol);
        renderCustomChords();
      });
      grid.appendChild(btn);
    });
  }
  
  // Handle form submission
  const handleAdd = () => {
    const symbol = input.value.trim();
    
    // Clear previous error
    errorMessage.style.display = 'none';
    errorMessage.textContent = '';
    
    if (!symbol) {
      errorMessage.textContent = 'Please enter a chord symbol';
      errorMessage.style.display = 'block';
      return;
    }
    
    // Validate chord symbol
    const validationError = validateChordSymbol(symbol);
    if (validationError) {
      errorMessage.textContent = validationError;
      errorMessage.style.display = 'block';
      return;
    }
    
    // Check if already exists
    const existing = loadCustomChords();
    if (existing.some(c => c.symbol === symbol)) {
      errorMessage.textContent = 'Chord already exists';
      errorMessage.style.display = 'block';
      return;
    }
    
    // Parse and add chord
    const chord = chordSymbolToInternalChord(symbol);
    if (!chord) {
      errorMessage.textContent = 'Invalid chord symbol';
      errorMessage.style.display = 'block';
      return;
    }
    
    // Add to storage
    const added = addCustomChord(chord);
    if (!added) {
      errorMessage.textContent = 'Chord already exists';
      errorMessage.style.display = 'block';
      return;
    }
    
    // Clear input and re-render
    input.value = '';
    renderCustomChords();
  };
  
  addButton.addEventListener('click', handleAdd);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  });
  
  // Initial render
  renderCustomChords();
  
  section.appendChild(grid);
  return section;
}

/**
 * Create a button for a custom chord
 */
function createCustomChordButton(chord: Chord, onDelete?: () => void): HTMLElement {
  const btn = document.createElement('div');
  btn.className = 'custom-chord-item';
  btn.dataset.chord = JSON.stringify(chord);
  btn.dataset.chordRoot = chord.root;
  btn.dataset.chordQuality = chord.quality;
  
  // Determine chord quality class for coloring
  const qualityClass = getQualityClass(chord.quality);
  btn.classList.add(qualityClass);
  
  // Display notes with bass note visually distinct
  const bassNote = chord.notes[0];
  const chordTones = chord.notes.slice(1);
  
  const chordButton = document.createElement('button');
  chordButton.className = 'chord-button custom-chord';
  chordButton.draggable = true;
  chordButton.innerHTML = `
    <span class="chord-symbol">${formatChordSymbol(chord.symbol)}</span>
    <span class="chord-notes">
      <span class="bass-note-label">${bassNote}</span>
      <span class="note-separator">│</span>
      <span class="chord-tones">${chordTones.join(' ')}</span>
    </span>
    <span class="custom-chord-badge">Custom</span>
  `;
  
  // Delete button
  const deleteButton = document.createElement('button');
  deleteButton.className = 'custom-chord-delete';
  deleteButton.innerHTML = '🗑';
  deleteButton.setAttribute('aria-label', 'Delete chord');
  deleteButton.type = 'button';
  deleteButton.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (onDelete) {
      onDelete();
    }
  });
  
  btn.appendChild(chordButton);
  btn.appendChild(deleteButton);
  
  // Move event handlers to the inner button
  const innerBtn = chordButton;
  
  // Event handlers (same as borrowed chords)
  innerBtn.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    triggerChord(innerBtn, chord);
  });
  
  innerBtn.addEventListener('mouseup', () => {
    if (innerBtn === activeChordElement) {
      deactivateChord(innerBtn);
    }
  });
  
  innerBtn.addEventListener('mouseleave', () => {
    if (innerBtn === activeChordElement) {
      deactivateChord(innerBtn);
    }
  });
  
  // Double-click to add to progression player
  let lastClickTime = 0;
  let clickTimeout: number | null = null;
  innerBtn.addEventListener('click', (e) => {
    const currentTime = Date.now();
    const timeSinceLastClick = currentTime - lastClickTime;
    
    if (timeSinceLastClick < 300 && timeSinceLastClick > 0) {
      e.preventDefault();
      e.stopPropagation();
      if (clickTimeout) {
        clearTimeout(clickTimeout);
        clickTimeout = null;
      }
      
      const event = new CustomEvent('chordDoubleClick', {
        detail: { chord: chord },
        bubbles: true,
      });
      document.dispatchEvent(event);
      
      lastClickTime = 0;
    } else {
      lastClickTime = currentTime;
      clickTimeout = window.setTimeout(() => {
        lastClickTime = 0;
      }, 300);
    }
  });
  
  // Touch: tap < 1.5s = play; long-press >= 1.5s = drag; fast double-tap = add to progression
  const LONG_PRESS_MS = 1500;
  const MOVE_THRESHOLD_PX = 10;
  const SCROLL_THRESHOLD_PX = 5; // Threshold to detect scrolling vs button interaction
  const DOUBLE_TAP_MS = 300;
  let touchStartX = 0;
  let touchStartY = 0;
  let longPressTimeout: number | null = null;
  let isDragging = false;
  let isScrolling = false;
  let lastTapTime = 0;
  let doubleTapHandled = false;
  let touchStarted = false;
  
  innerBtn.addEventListener('touchstart', (e) => {
    // Don't prevent default immediately - allow scroll to work
    touchStarted = true;
    isScrolling = false;
    const now = Date.now();
    if (now - lastTapTime < DOUBLE_TAP_MS) {
      doubleTapHandled = true;
      lastTapTime = 0;
      e.preventDefault();
      e.stopPropagation();
      document.dispatchEvent(new CustomEvent('chordDoubleClick', { detail: { chord }, bubbles: true }));
      return;
    }
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    isDragging = false;
    longPressTimeout = window.setTimeout(() => {
      if (!isScrolling) {
        longPressTimeout = null;
        isDragging = true;
        deactivateChord(innerBtn, true);
        innerBtn.style.opacity = '0.5';
        innerBtn.classList.add('dragging');
        document.dispatchEvent(new CustomEvent('chordLongPressDrag', {
          detail: { chord, element: innerBtn, startX: touchStartX, startY: touchStartY },
          bubbles: true,
        }));
      }
    }, LONG_PRESS_MS);
    // Don't prevent default here - let touchmove decide
  }, { passive: true });
  
  innerBtn.addEventListener('touchmove', (e) => {
    if (!touchStarted) return;
    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - touchStartX);
    const deltaY = Math.abs(touch.clientY - touchStartY);
    
    // Detect if user is scrolling (primarily vertical movement)
    if (deltaY > SCROLL_THRESHOLD_PX && deltaY > deltaX * 1.5) {
      // User is scrolling - don't prevent default, allow scroll
      isScrolling = true;
      if (longPressTimeout) {
        clearTimeout(longPressTimeout);
        longPressTimeout = null;
      }
      return; // Let the browser handle scrolling
    }
    
    // User is interacting with button, not scrolling
    if (isDragging) {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent('chordTouchDrag', {
        detail: { chord, x: touch.clientX, y: touch.clientY },
        bubbles: true,
      }));
      return;
    }
    if (deltaX > MOVE_THRESHOLD_PX || deltaY > MOVE_THRESHOLD_PX) {
      if (longPressTimeout) {
        clearTimeout(longPressTimeout);
        longPressTimeout = null;
      }
      // Small movement - might be trying to interact, prevent default
      if (!isScrolling) {
        e.preventDefault();
      }
    }
  }, { passive: false });
  
  innerBtn.addEventListener('touchend', (e) => {
    if (!touchStarted) return;
    touchStarted = false;
    
    if (doubleTapHandled) {
      doubleTapHandled = false;
      return;
    }
    if (longPressTimeout) {
      clearTimeout(longPressTimeout);
      longPressTimeout = null;
    }
    if (isDragging) {
      isDragging = false;
      innerBtn.style.opacity = '1';
      innerBtn.classList.remove('dragging');
      const touch = e.changedTouches[0];
      document.dispatchEvent(new CustomEvent('chordTouchDragEnd', {
        detail: { chord, x: touch.clientX, y: touch.clientY },
        bubbles: true,
      }));
    } else if (!isScrolling) {
      // Only trigger chord if not scrolling
      triggerChord(innerBtn, chord);
      lastTapTime = Date.now();
      if (innerBtn === activeChordElement) {
        // Small delay before deactivating to allow chord to play (sustain off = release on tap release)
        setTimeout(() => {
          if (innerBtn === activeChordElement) deactivateChord(innerBtn);
        }, 100);
      }
    }
    isScrolling = false;
  }, { passive: true });
  
  // Drag & Drop support for progression player (desktop)
  innerBtn.addEventListener('dragstart', (e) => {
    const dragData = {
      chord: chord,
      source: 'palette' as const,
    };
    if (e.dataTransfer) {
      e.dataTransfer.setData('application/json', JSON.stringify(dragData));
      e.dataTransfer.effectAllowed = 'copy';
    }
    innerBtn.style.opacity = '0.5';
  });
  
  innerBtn.addEventListener('dragend', () => {
    innerBtn.style.opacity = '1';
  });
  
  return btn;
}

/**
 * Create a chord button element.
 * Rows 0–3 show key badges (1–7, q-u, a-j, z-m); row 4+ no key.
 */
function createChordButton(chord: Chord, isPrimary: boolean, variationIndex?: number, degreeIndex?: number): HTMLElement {
  const btn = document.createElement('button');
  btn.className = `chord-button ${isPrimary ? 'primary' : 'variation'}`;
  btn.dataset.chord = JSON.stringify(chord);
  btn.dataset.degree = String(chord.degree);
  btn.draggable = true;
  
  if (variationIndex !== undefined) {
    btn.dataset.variationIndex = String(variationIndex);
  }
  if (degreeIndex !== undefined) {
    btn.dataset.degreeIndex = String(degreeIndex);
  }
  
  // Determine chord quality class for coloring
  const qualityClass = getQualityClass(chord.quality);
  btn.classList.add(qualityClass);
  
  // Display notes with bass note visually distinct
  // First note is bass (in lower octave), rest are chord tones
  const bassNote = chord.notes[0];
  const chordTones = chord.notes.slice(1);
  
  const rowIndex = isPrimary ? 0 : (variationIndex ?? 0) + 1;
  const keyLabel = (degreeIndex !== undefined && rowIndex < ROW_KEYS.length && degreeIndex < 7)
    ? ROW_KEYS[rowIndex][degreeIndex]
    : null;
  
  btn.innerHTML = `
    <span class="chord-symbol">${formatChordSymbol(chord.symbol)}</span>
    <span class="chord-notes">
      <span class="bass-note-label">${bassNote}</span>
      <span class="note-separator">│</span>
      <span class="chord-tones">${chordTones.join(' ')}</span>
    </span>
    ${keyLabel ? `<span class="variation-key">${keyLabel}</span>` : ''}
  `;
  
  // Event handlers
  btn.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    triggerChord(btn, chord);
  });
  
  btn.addEventListener('mouseup', () => {
    // Release when we mouse up on the chord we're holding (sustain off = release; sustain on = no-op)
    if (btn === activeChordElement) {
      deactivateChord(btn);
    }
  });
  
  btn.addEventListener('mouseleave', () => {
    // Release when we leave the active chord (e.g. drag off) — sustain off = release
    if (btn === activeChordElement) {
      deactivateChord(btn);
    }
  });
  
  // Double-click to add to progression player
  let lastClickTime = 0;
  let clickTimeout: number | null = null;
  btn.addEventListener('click', (e) => {
    const currentTime = Date.now();
    const timeSinceLastClick = currentTime - lastClickTime;
    
    if (timeSinceLastClick < 300 && timeSinceLastClick > 0) {
      // Double-click detected
      e.preventDefault();
      e.stopPropagation();
      if (clickTimeout) {
        clearTimeout(clickTimeout);
        clickTimeout = null;
      }
      
      // Dispatch event to add chord to progression player
      const event = new CustomEvent('chordDoubleClick', {
        detail: { chord: chord },
        bubbles: true,
      });
      document.dispatchEvent(event);
      
      lastClickTime = 0; // Reset to prevent triple-click
    } else {
      // Single click - set timeout to track potential double-click
      lastClickTime = currentTime;
      clickTimeout = window.setTimeout(() => {
        lastClickTime = 0;
      }, 300);
    }
  });
  
  // Touch: tap < 1.5s = play; long-press >= 1.5s = drag; fast double-tap = add to progression
  const LONG_PRESS_MS = 1500;
  const MOVE_THRESHOLD_PX = 10;
  const SCROLL_THRESHOLD_PX = 5; // Threshold to detect scrolling vs button interaction
  const DOUBLE_TAP_MS = 300;
  let touchStartX = 0;
  let touchStartY = 0;
  let longPressTimeout: number | null = null;
  let isDragging = false;
  let isScrolling = false;
  let lastTapTime = 0;
  let doubleTapHandled = false;
  let touchStarted = false;
  
  btn.addEventListener('touchstart', (e) => {
    // Don't prevent default immediately - allow scroll to work
    touchStarted = true;
    isScrolling = false;
    const now = Date.now();
    if (now - lastTapTime < DOUBLE_TAP_MS) {
      doubleTapHandled = true;
      lastTapTime = 0;
      e.preventDefault();
      e.stopPropagation();
      document.dispatchEvent(new CustomEvent('chordDoubleClick', { detail: { chord }, bubbles: true }));
      return;
    }
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    isDragging = false;
    longPressTimeout = window.setTimeout(() => {
      if (!isScrolling) {
        longPressTimeout = null;
        isDragging = true;
        deactivateChord(btn, true);
        btn.style.opacity = '0.5';
        btn.classList.add('dragging');
        document.dispatchEvent(new CustomEvent('chordLongPressDrag', {
          detail: { chord, element: btn, startX: touchStartX, startY: touchStartY },
          bubbles: true,
        }));
      }
    }, LONG_PRESS_MS);
    // Don't prevent default here - let touchmove decide
  }, { passive: true });
  
  btn.addEventListener('touchmove', (e) => {
    if (!touchStarted) return;
    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - touchStartX);
    const deltaY = Math.abs(touch.clientY - touchStartY);
    
    // Detect if user is scrolling (primarily vertical movement)
    if (deltaY > SCROLL_THRESHOLD_PX && deltaY > deltaX * 1.5) {
      // User is scrolling - don't prevent default, allow scroll
      isScrolling = true;
      if (longPressTimeout) {
        clearTimeout(longPressTimeout);
        longPressTimeout = null;
      }
      return; // Let the browser handle scrolling
    }
    
    // User is interacting with button, not scrolling
    if (isDragging) {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent('chordTouchDrag', {
        detail: { chord, x: touch.clientX, y: touch.clientY },
        bubbles: true,
      }));
      return;
    }
    if (deltaX > MOVE_THRESHOLD_PX || deltaY > MOVE_THRESHOLD_PX) {
      if (longPressTimeout) {
        clearTimeout(longPressTimeout);
        longPressTimeout = null;
      }
      // Small movement - might be trying to interact, prevent default
      if (!isScrolling) {
        e.preventDefault();
      }
    }
  }, { passive: false });
  
  btn.addEventListener('touchend', (e) => {
    if (!touchStarted) return;
    touchStarted = false;
    
    if (doubleTapHandled) {
      doubleTapHandled = false;
      return;
    }
    if (longPressTimeout) {
      clearTimeout(longPressTimeout);
      longPressTimeout = null;
    }
    if (isDragging) {
      isDragging = false;
      btn.style.opacity = '1';
      btn.classList.remove('dragging');
      const touch = e.changedTouches[0];
      document.dispatchEvent(new CustomEvent('chordTouchDragEnd', {
        detail: { chord, x: touch.clientX, y: touch.clientY },
        bubbles: true,
      }));
    } else if (!isScrolling) {
      // Only trigger chord if not scrolling
      triggerChord(btn, chord);
      lastTapTime = Date.now();
      if (btn === activeChordElement) {
        // Small delay before deactivating to allow chord to play (sustain off = release on tap release)
        setTimeout(() => {
          if (btn === activeChordElement) deactivateChord(btn);
        }, 100);
      }
    }
    isScrolling = false;
  }, { passive: true });
  
  // Drag & Drop support for progression player (desktop)
  btn.addEventListener('dragstart', (e) => {
    const dragData = {
      chord: chord,
      source: 'palette' as const,
    };
    if (e.dataTransfer) {
      e.dataTransfer.setData('application/json', JSON.stringify(dragData));
      e.dataTransfer.effectAllowed = 'copy';
    }
    btn.style.opacity = '0.5';
  });
  
  btn.addEventListener('dragend', () => {
    btn.style.opacity = '1';
  });
  
  return btn;
}

/**
 * Insert soft break points for long chord symbols.
 */
function formatChordSymbol(symbol: string): string {
  return symbol.replace(/(sus|add|no|alt)/gi, '<wbr>$1');
}

/**
 * Get CSS class based on chord quality
 */
function getQualityClass(quality: string): string {
  if (quality.includes('dim') || quality === 'diminished') return 'quality-dim';
  if (quality.includes('aug') || quality === 'augmented') return 'quality-aug';
  if (quality.includes('sus')) return 'quality-sus';
  if (quality.includes('min') || quality === 'minor') return 'quality-minor';
  if (quality.includes('maj') || quality === 'major') return 'quality-major';
  if (quality.includes('dom') || quality === 'dom7') return 'quality-dom';
  return 'quality-major';
}

/**
 * Trigger a chord (play and visual feedback).
 * @param octaveUp - if true, play this chord one octave higher (in addition to global octave shift)
 */
function triggerChord(element: HTMLElement, chord: Chord, octaveUp = false): void {
  heldChordKey = null;  // Clear so key-up doesn't release when triggered by mouse/touch
  // Visual feedback
  if (activeChordElement) {
    activeChordElement.classList.remove('active');
  }
  element.classList.add('active');
  activeChordElement = element;
  
  // Track previous chord before updating
  const previousChordForSuggestions = currentlyPlayingChord;
  
  // Track currently playing chord for suggestions
  currentlyPlayingChord = chord;
  lastPlayedChord = chord; // Remember for slider updates
  
  // Track chord size for inversion limits
  lastChordNoteCount = chord.midiNotes.length;
  
  // Apply inversion, then octave shift (+1 if octaveUp), then enforce min register (≥2 chord tones ≥ C3)
  const invertedChord = applyInversion(chord, currentInversion);
  let shiftedChord = applyOctaveShift(invertedChord);
  if (octaveUp) {
    shiftedChord = {
      ...shiftedChord,
      midiNotes: shiftedChord.midiNotes.map(m => m + 12),
    };
  }
  const finalChord = ensureChordTonesMinimumRegister(shiftedChord);
  playChord(finalChord);
  
  // Update borrowed chord suggestions - pass previous chord and check if current is borrowed
  updateBorrowedSuggestions(chord, previousChordForSuggestions);
  
  // Notify listeners with the final chord
  if (onChordPlay) {
    onChordPlay(finalChord, octaveShift, currentInversion);
  }
  
  // Also dispatch a custom event for components that need to listen (like progression player)
  const event = new CustomEvent('chordSelected', {
    detail: { chord: finalChord, octaveShift, inversion: currentInversion },
    bubbles: true,
  });
  document.dispatchEvent(event);
}

/**
 * Update borrowed chord suggestions based on currently playing chord
 */
function updateBorrowedSuggestions(currentChord: Chord, previousChord?: Chord | null): void {
  // Clear previous suggestions (both borrowed and resolution)
  // But preserve the 'active' class on the currently active chord element
  document.querySelectorAll('.chord-button.suggested, .chord-button.resolution').forEach(btn => {
    // Don't remove classes from the active element - it should keep its active state
    if (btn !== activeChordElement) {
      btn.classList.remove('suggested', 'resolution', 'suggested-tension');
    }
  });
  
  // Get new suggestions with scale context for proper resolution checking
  const currentScale = currentHarmonization?.scale;
  const scaleRoot = currentHarmonization?.root;
  
  currentSuggestions = getSuggestedBorrowedChords(
    currentChord,
    borrowedModeChords,
    3,  // maxSuggestions
    suggestionConfidenceThreshold,
    currentScale,
    scaleRoot,
    previousChord,
    currentHarmonization
  );
  
  // Highlight suggested chords (both borrowed and resolution)
  currentSuggestions.forEach(suggestion => {
    if (suggestion.isResolution) {
      // This is a resolution chord - highlight in the diatonic section
      // Find chord button by matching root and quality from JSON data
      const allDiatonicButtons = document.querySelectorAll('.chord-button:not(.borrowed-chord)');
      let found = false;
      for (const btn of allDiatonicButtons) {
        const chordData = btn.getAttribute('data-chord');
        if (chordData) {
          try {
            const chord = JSON.parse(chordData);
            // Match by root and quality (exact match)
            if (chord.root === suggestion.chord.root && chord.quality === suggestion.chord.quality) {
              // Add suggestion classes, but don't override 'active' if this is the active element
              if (btn !== activeChordElement) {
                btn.classList.add('suggested', 'resolution');
              }
              found = true;
              break;
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
      // If not found by exact match, try matching by degree (for variations)
      if (!found) {
        const degree = suggestion.chord.degree;
        const degreeButtons = document.querySelectorAll(`.chord-button:not(.borrowed-chord)[data-degree="${degree}"]`);
        for (const btn of degreeButtons) {
          const chordData = btn.getAttribute('data-chord');
          if (chordData) {
            try {
              const chord = JSON.parse(chordData);
              if (chord.root === suggestion.chord.root && chord.quality === suggestion.chord.quality) {
                // Add suggestion classes, but don't override 'active' if this is the active element
                if (btn !== activeChordElement) {
                  btn.classList.add('suggested', 'resolution');
                }
                break;
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }
    } else {
      // This is a borrowed chord - highlight in the borrowed section
      const borrowedChord = suggestion.chord as BorrowedChord;
      const selector = `.borrowed-chord[data-chord-root="${borrowedChord.root}"][data-chord-quality="${borrowedChord.quality}"][data-mode="${borrowedChord.sourceMode}"]`;
      const btn = document.querySelector(selector);
      if (btn) {
        btn.classList.add('suggested');
        
        // Mark diminished chords with tension class for softer styling
        const quality = borrowedChord.quality;
        if (quality === 'diminished' || quality === 'dim7' || quality === 'min7b5') {
          btn.classList.add('suggested-tension');
        }
      }
    }
  });
}

/**
 * Seed borrowed chord suggestions without playing audio
 */
export function seedBorrowedSuggestions(chord: Chord, previousChord?: Chord | null): void {
  lastPlayedChord = chord;
  updateBorrowedSuggestions(chord, previousChord);
}

/**
 * Deactivate chord visual feedback and optionally release audio
 */
function deactivateChord(element: HTMLElement, forceRelease = false): void {
  // In always sustain mode, don't release unless forced
  // When not in always sustain mode, release on deactivate
  const shouldRelease = forceRelease || !alwaysSustain;
  
  if (shouldRelease) {
    element.classList.remove('active');
    if (activeChordElement === element) {
      activeChordElement = null;
      currentlyPlayingChord = null;
      releaseAll();
      
      // Clear borrowed chord suggestions (keep them visible but inactive)
      // We don't clear them on release so user can still see recent suggestions
      
      // Notify listeners
      if (onChordRelease) {
        onChordRelease();
      }
    }
  }
}

// ===========================
// SUSTAIN MODE
// ===========================

let alwaysSustain = true;  // When true: chords sustain until next chord played

/**
 * Setup keyboard handlers
 */
export function setupKeyboardHandlers(): () => void {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Check if custom chord input is focused - disable keyboard shortcuts
    const customChordInput = document.querySelector('.custom-chord-input') as HTMLInputElement;
    if (customChordInput && document.activeElement === customChordInput) {
      return; // Allow normal typing in the input field
    }

    // Disable all key mappings when any modal with inputs is open (e.g. save progression)
    const target = e.target as HTMLElement | null;
    if (target?.closest?.('.save-progression-backdrop, .progression-selection-backdrop, .add-chord-modal-backdrop')) {
      return;
    }
    
    // Prevent repeat when holding key
    if (e.repeat) return;
    
    const key = e.key;
    
    // Octave shift keys (+ and -)
    // Handle both = and + (since + requires shift on most keyboards)
    if (key === '+' || key === '=') {
      e.preventDefault();
      octaveUpHeld = true;
      updateOctaveShift();
      return;
    }
    
    if (key === '-' || key === '_') {
      e.preventDefault();
      octaveDownHeld = true;
      updateOctaveShift();
      return;
    }
    
    const keyLower = key.toLowerCase();
    
    // Inversion key (I for inversion; V is used for chord playback)
    if (keyLower === 'i') {
      e.preventDefault();
      cycleInversion();
      return;
    }
    
    if (!currentHarmonization) return;
    
    // Same chord +1 octave: 8 9 0 - = [ ] (row 0), p o i \ ; ' , (row 1), k l . / (row 2 degrees 1–4)
    const posOctUp = KEY_TO_POSITION_OCT_UP.get(keyLower);
    if (posOctUp) {
      e.preventDefault();
      const [rowIndex, degreeIndex] = posOctUp;
      if (degreeIndex >= currentHarmonization.degrees.length) return;
      
      const degreeChords = currentHarmonization.degrees[degreeIndex];
      let chord: Chord;
      let btn: HTMLElement | null;
      
      if (rowIndex === 0) {
        chord = degreeChords.primaryChord;
        btn = document.querySelector(
          `.degree-column[data-degree="${degreeChords.degree}"] .chord-button.primary`
        ) as HTMLElement | null;
      } else {
        const varIndex = rowIndex - 1;
        if (varIndex >= degreeChords.variations.length) return;
        chord = degreeChords.variations[varIndex];
        btn = document.querySelector(
          `.degree-column[data-degree="${degreeChords.degree}"] .chord-button.variation[data-variation-index="${varIndex}"]`
        ) as HTMLElement | null;
      }
      
      if (btn) {
        triggerChord(btn, chord, true);
        heldChordKey = keyLower;
      }
      return;
    }
    
    // Direct chord keys: 1–7 (row 0), q–u (row 1), a–j (row 2), z–m (row 3)
    const pos = KEY_TO_POSITION.get(keyLower);
    if (pos) {
      e.preventDefault();
      const [rowIndex, degreeIndex] = pos;
      if (degreeIndex >= currentHarmonization.degrees.length) return;
      
      const degreeChords = currentHarmonization.degrees[degreeIndex];
      let chord: Chord;
      let btn: HTMLElement | null;
      
      if (rowIndex === 0) {
        chord = degreeChords.primaryChord;
        btn = document.querySelector(
          `.degree-column[data-degree="${degreeChords.degree}"] .chord-button.primary`
        ) as HTMLElement | null;
      } else {
        const varIndex = rowIndex - 1;
        if (varIndex >= degreeChords.variations.length) return;
        chord = degreeChords.variations[varIndex];
        btn = document.querySelector(
          `.degree-column[data-degree="${degreeChords.degree}"] .chord-button.variation[data-variation-index="${varIndex}"]`
        ) as HTMLElement | null;
      }
      
      if (btn) {
        triggerChord(btn, chord);
        heldChordKey = keyLower;
      }
      return;
    }
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    // Check if custom chord input is focused - disable keyboard shortcuts
    const customChordInput = document.querySelector('.custom-chord-input') as HTMLInputElement;
    if (customChordInput && document.activeElement === customChordInput) {
      return; // Allow normal typing in the input field
    }

    // Disable all key mappings when any modal with inputs is open (e.g. save progression)
    const target = e.target as HTMLElement | null;
    if (target?.closest?.('.save-progression-backdrop, .progression-selection-backdrop, .add-chord-modal-backdrop')) {
      return;
    }
    
    const key = e.key;
    
    // Octave shift keys released
    if (key === '+' || key === '=') {
      octaveUpHeld = false;
      updateOctaveShift();
      return;
    }
    
    if (key === '-' || key === '_') {
      octaveDownHeld = false;
      updateOctaveShift();
      return;
    }
    
    const keyLower = key.toLowerCase();
    
    // Chord key released (root or +oct). Only release if this key triggered the current chord.
    const isChordKey = KEY_TO_POSITION.has(keyLower) || KEY_TO_POSITION_OCT_UP.has(keyLower);
    if (isChordKey && heldChordKey === keyLower) {
      heldChordKey = null;
      if (!alwaysSustain && activeChordElement) {
        releaseAll();
        activeChordElement.classList.remove('active');
        activeChordElement = null;
        if (onChordRelease) {
          onChordRelease();
        }
      }
      return;
    }
  };

  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup', handleKeyUp);

  return () => {
    document.removeEventListener('keydown', handleKeyDown);
    document.removeEventListener('keyup', handleKeyUp);
  };
}

/**
 * Collapse all expanded degrees
 */
export function collapseAll(): void {
  document.querySelectorAll('.degree-column.expanded').forEach(col => {
    col.classList.remove('expanded');
  });
  expandedDegree = null;
}

/**
 * Get currently expanded degree
 */
export function getExpandedDegree(): number | null {
  return expandedDegree;
}

/**
 * Set callback for when a chord is played
 */
export function setChordPlayCallback(callback: (chord: Chord, octaveShift: number, inversion: number) => void): void {
  onChordPlay = callback;
}

/**
 * Set callback for when chord is released
 */
export function setChordReleaseCallback(callback: () => void): void {
  onChordRelease = callback;
}

/**
 * Find the palette button that best matches the given chord (root+quality; prefer symbol match).
 * Used to highlight the chord in the palette when it is played during progression playback.
 */
function findPaletteButtonForChord(chord: Chord): HTMLElement | null {
  const palette = document.querySelector('.chord-palette');
  if (!palette) return null;

  const buttons = palette.querySelectorAll<HTMLElement>('.chord-button');
  let bestMatch: HTMLElement | null = null;

  for (const btn of buttons) {
    const dataEl = btn.closest('.custom-chord-item') as HTMLElement | null;
    const chordJson = (dataEl ?? btn).getAttribute('data-chord');
    if (!chordJson) continue;

    try {
      const stored = JSON.parse(chordJson) as { root?: string; quality?: string; symbol?: string };
      if (stored.root !== chord.root || stored.quality !== chord.quality) continue;

      const symbolMatch = stored.symbol === chord.symbol;
      if (symbolMatch) return btn;
      if (!bestMatch) bestMatch = btn;
    } catch {
      // ignore parse errors
    }
  }

  return bestMatch;
}

/**
 * Highlight the chord in the palette that matches the given chord (playback sync).
 * Call when a chord is played during progression playback so the palette lights up inline with the piano roll.
 */
export function highlightChordForPlayback(chord: Chord): void {
  if (playbackHighlightElement) {
    playbackHighlightElement.classList.remove('playback-active');
    playbackHighlightElement = null;
  }
  const btn = findPaletteButtonForChord(chord);
  if (btn) {
    btn.classList.add('playback-active');
    playbackHighlightElement = btn;
  }
}

/**
 * Clear the playback highlight from the chord palette.
 * Call when progression playback stops.
 */
export function clearPlaybackHighlight(): void {
  if (playbackHighlightElement) {
    playbackHighlightElement.classList.remove('playback-active');
    playbackHighlightElement = null;
  }
}

/**
 * Set always sustain mode
 * When true: chords sustain until next chord is played
 * When false: chords release when key/mouse is released
 */
export function setAlwaysSustain(enabled: boolean): void {
  alwaysSustain = enabled;
}

/**
 * Set whether to keep the root in the bass when inverting
 */
export function setKeepRootBass(enabled: boolean): void {
  keepRootBass = enabled;
}

/**
 * Get current keep root bass mode
 */
export function getKeepRootBass(): boolean {
  return keepRootBass;
}

/**
 * Get current always sustain mode
 */
export function getAlwaysSustain(): boolean {
  return alwaysSustain;
}

/**
 * Set callback for octave shift changes
 */
export function setOctaveShiftCallback(callback: (shift: number) => void): void {
  onOctaveShiftChange = callback;
}

/**
 * Manually set octave shift (from UI buttons)
 * Returns false if the shift would be out of range
 */
export function setOctaveShift(shift: number): boolean {
  if (shift < -3 || shift > 3) return false;
  
  octaveShift = shift;
  if (onOctaveShiftChange) {
    onOctaveShiftChange(octaveShift);
  }
  return true;
}

/**
 * Get current octave shift
 */
export function getOctaveShift(): number {
  return octaveShift;
}

/**
 * Set callback for inversion changes
 */
export function setInversionCallback(callback: (inversion: number, maxInversion: number) => void): void {
  onInversionChange = callback;
}

/**
 * Manually cycle inversion (from UI button)
 */
export function triggerInversionCycle(): void {
  cycleInversion();
}

/**
 * Get current inversion
 */
export function getInversion(): number {
  return currentInversion;
}

/**
 * Reset inversion to root position
 */
export function resetInversion(): void {
  currentInversion = 0;
  if (onInversionChange) {
    onInversionChange(0, getMaxInversion());
  }
}

/**
 * Set the confidence threshold for borrowed chord suggestions
 * Lower values = more bold/adventurous suggestions
 * Higher values = safer/conservative suggestions
 * Range: 0.4 (bold) to 0.8 (safe)
 */
function setSuggestionBoldness(boldnessPercent: number): void {
  // Convert 0-100 slider to 0.8-0.4 threshold (inverted: higher boldness = lower threshold)
  // 0% boldness = 0.8 threshold (safe)
  // 100% boldness = 0.4 threshold (bold)
  suggestionConfidenceThreshold = 0.8 - (boldnessPercent / 100) * 0.4;
  
  // Re-update suggestions using last played chord (even if released)
  if (lastPlayedChord) {
    updateBorrowedSuggestions(lastPlayedChord);
  }
}

/**
 * Find a chord button that matches the given chord (read-only, no activation).
 * Searches through primary chords, variations, borrowed chords, and custom chords.
 * Returns { button, chord } if a match is found, null otherwise.
 */
function findMatchingChordButton(chord: Chord): { button: HTMLElement; chord: Chord } | null {
  if (!chord) return null;

  // Normalize root for comparison (handle enharmonic equivalents)
  const normalizeRoot = (root: string): string[] => {
    const enharmonics: Record<string, string[]> = {
      'C#': ['C#', 'Db'], 'Db': ['C#', 'Db'],
      'D#': ['D#', 'Eb'], 'Eb': ['D#', 'Eb'],
      'F#': ['F#', 'Gb'], 'Gb': ['F#', 'Gb'],
      'G#': ['G#', 'Ab'], 'Ab': ['G#', 'Ab'],
      'A#': ['A#', 'Bb'], 'Bb': ['A#', 'Bb'],
    };
    return enharmonics[root] || [root];
  };

  const targetRoots = normalizeRoot(chord.root);
  const quality = chord.quality;
  const originalSymbol = chord.symbol.trim();
  const targetSymbol = originalSymbol.toLowerCase();

  const hasCustomAlterations = /(b5|b9|#5|#9|ø|°|dim7|aug|min7b5|m7b5)/i.test(originalSymbol) ||
                               ['min7b5', 'dim7', 'aug', 'diminished'].includes(quality);

  const normalizeSymbol = (sym: string): string => sym.trim().toLowerCase();

  // Priority 1: Exact symbol match
  const customChordItems = document.querySelectorAll('.custom-chord-item');
  for (const item of customChordItems) {
    const itemEl = item as HTMLElement;
    try {
      const chordData = itemEl.dataset.chord;
      if (chordData) {
        const parsedChord = JSON.parse(chordData) as Chord;
        if (normalizeSymbol(parsedChord.symbol) === targetSymbol) {
          const innerButton = itemEl.querySelector('.chord-button.custom-chord') as HTMLElement;
          if (innerButton) return { button: innerButton, chord: parsedChord };
        }
      }
    } catch {
      /* ignore */
    }
  }

  const allButtons = document.querySelectorAll('.chord-button:not(.custom-chord)');
  for (const button of allButtons) {
    const btn = button as HTMLElement;
    try {
      const chordData = btn.dataset.chord;
      if (chordData) {
        const parsedChord = JSON.parse(chordData) as Chord;
        if (normalizeSymbol(parsedChord.symbol) === targetSymbol) return { button: btn, chord: parsedChord };
      }
    } catch {
      /* ignore */
    }
  }

  if (hasCustomAlterations || ['min7b5', 'dim7', 'aug', 'diminished'].includes(quality)) {
    return null;
  }

  // Priority 2: Match by root + quality
  const matches: Array<{ button: HTMLElement; isCustom: boolean }> = [];
  const allButtonsWithCustom = document.querySelectorAll('.chord-button');
  for (const button of allButtonsWithCustom) {
    const btn = button as HTMLElement;
    const isCustom = btn.classList.contains('custom-chord');
    let btnRoot: string | undefined = btn.dataset.chordRoot;
    let btnQuality: string | undefined = btn.dataset.chordQuality;
    let chordData = btn.dataset.chord;

    if (isCustom) {
      const parent = btn.closest('.custom-chord-item') as HTMLElement;
      if (parent) {
        btnRoot = parent.dataset.chordRoot || btnRoot;
        btnQuality = parent.dataset.chordQuality || btnQuality;
        chordData = parent.dataset.chord || chordData;
      }
    }
    if (!btnRoot || !btnQuality) {
      try {
        if (chordData) {
          const parsed = JSON.parse(chordData) as Chord;
          btnRoot = parsed.root;
          btnQuality = parsed.quality;
        }
      } catch {
        continue;
      }
    }
    if (!btnRoot || !btnQuality) continue;

    const btnRoots = normalizeRoot(btnRoot);
    const rootMatches = targetRoots.some(tr => btnRoots.includes(tr)) || btnRoots.some(br => targetRoots.includes(br));
    if (!(rootMatches && btnQuality === quality)) continue;

    try {
      if (chordData) {
        const parsedChord = JSON.parse(chordData) as Chord;
        const btnSymbol = normalizeSymbol(parsedChord.symbol);
        if (btnSymbol === targetSymbol) {
          matches.push({ button: btn, isCustom });
        } else if (!hasCustomAlterations) {
          const symbolsSimilar = btnSymbol.length === targetSymbol.length ||
            Math.abs(btnSymbol.length - targetSymbol.length) <= 1;
          if (symbolsSimilar) matches.push({ button: btn, isCustom });
        }
      } else if (!hasCustomAlterations) {
        matches.push({ button: btn, isCustom });
      }
    } catch {
      /* ignore */
    }
  }

  if (matches.length === 0) return null;

  matches.sort((a, b) => (a.isCustom && !b.isCustom ? -1 : !a.isCustom && b.isCustom ? 1 : 0));
  const bestMatch = matches[0].button;
  let bestMatchChord: Chord | null = null;
  try {
    if (bestMatch.dataset.chord) {
      bestMatchChord = JSON.parse(bestMatch.dataset.chord) as Chord;
    } else if (bestMatch.classList.contains('custom-chord')) {
      const parent = bestMatch.closest('.custom-chord-item') as HTMLElement;
      if (parent?.dataset.chord) bestMatchChord = JSON.parse(parent.dataset.chord) as Chord;
    }
  } catch {
    /* ignore */
  }
  if (!bestMatchChord) bestMatchChord = chord;
  return { button: bestMatch, chord: bestMatchChord };
}

/**
 * Check whether a chord is present in the current palette (diatonic, variations, modal interchange, or custom).
 * Read-only; does not activate or scroll.
 */
export function isChordInPalette(chord: Chord): boolean {
  try {
    return !!findMatchingChordButton(chord);
  } catch (err) {
    console.warn('Error checking chord in palette:', err);
    return false;
  }
}

/**
 * Activate a chord button visually without playing (e.g. when syncing palette during playback minor-scale switch).
 */
function activateChordButtonDisplayOnly(element: HTMLElement, chord: Chord): void {
  if (activeChordElement) {
    activeChordElement.classList.remove('active');
  }
  element.classList.add('active');
  activeChordElement = element;
  currentlyPlayingChord = chord;
  lastPlayedChord = chord;
  lastChordNoteCount = chord.midiNotes.length;
  updateBorrowedSuggestions(chord, null);
}

/**
 * Find and activate a chord button that matches the given chord
 * Searches through primary chords, variations, borrowed chords, and custom chords
 * Returns true if a matching button was found and activated, false otherwise
 * @param options.play - When false, only update visual/state; do not play audio (used when syncing palette during playback).
 */
export function findAndActivateChordButton(chord: Chord, options?: { play?: boolean }): boolean {
  if (!chord) return false;
  const play = options?.play !== false;
  try {
    const match = findMatchingChordButton(chord);
    if (match) {
      if (play) {
        triggerChord(match.button, match.chord);
      } else {
        activateChordButtonDisplayOnly(match.button, match.chord);
      }
      match.button.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return true;
    }
    return false;
  } catch (err) {
    console.warn('Error finding chord button:', err);
    return false;
  }
}
