/**
 * Piano Keyboard Visualization
 * Displays a visual keyboard that highlights notes being played
 */

// ===========================
// CONFIGURATION
// ===========================

// Keyboard range: C1 (MIDI 24) to C6 (MIDI 84) = 5 octaves
// Extended to accommodate +/- 1 octave shift from the base range (C2-C5)
const START_MIDI = 24;  // C1
const END_MIDI = 84;    // C6

// Note info for building keyboard
const NOTE_INFO: { name: string; isBlack: boolean }[] = [
  { name: 'C', isBlack: false },
  { name: 'C#', isBlack: true },
  { name: 'D', isBlack: false },
  { name: 'D#', isBlack: true },
  { name: 'E', isBlack: false },
  { name: 'F', isBlack: false },
  { name: 'F#', isBlack: true },
  { name: 'G', isBlack: false },
  { name: 'G#', isBlack: true },
  { name: 'A', isBlack: false },
  { name: 'A#', isBlack: true },
  { name: 'B', isBlack: false },
];

// ===========================
// STATE
// ===========================

let keyElements: Map<number, HTMLElement> = new Map();
let activeNotes: Set<number> = new Set();

// ===========================
// RENDERING
// ===========================

/**
 * Render the piano keyboard into a container
 */
export function renderPianoKeyboard(container: HTMLElement): void {
  container.innerHTML = '';
  keyElements.clear();
  
  // Create keyboard wrapper
  const keyboard = document.createElement('div');
  keyboard.className = 'piano-keyboard';
  
  // Create white keys layer
  const whiteKeysContainer = document.createElement('div');
  whiteKeysContainer.className = 'white-keys';
  
  // Create black keys layer
  const blackKeysContainer = document.createElement('div');
  blackKeysContainer.className = 'black-keys';
  
  // Track white key positions for black key placement
  let whiteKeyIndex = 0;
  
  // First pass: create white keys
  for (let midi = START_MIDI; midi <= END_MIDI; midi++) {
    const noteIndex = midi % 12;
    const noteInfo = NOTE_INFO[noteIndex];
    const octave = Math.floor(midi / 12) - 1;
    
    if (!noteInfo.isBlack) {
      const key = document.createElement('div');
      key.className = 'piano-key white-key';
      key.dataset.midi = String(midi);
      key.dataset.note = `${noteInfo.name}${octave}`;
      
      // Add octave markers on C keys
      if (noteInfo.name === 'C') {
        const label = document.createElement('span');
        label.className = 'key-label';
        label.textContent = `C${octave}`;
        key.appendChild(label);
      }
      
      whiteKeysContainer.appendChild(key);
      keyElements.set(midi, key);
      whiteKeyIndex++;
    }
  }
  
  // Second pass: create black keys with proper positioning
  whiteKeyIndex = 0;
  for (let midi = START_MIDI; midi <= END_MIDI; midi++) {
    const noteIndex = midi % 12;
    const noteInfo = NOTE_INFO[noteIndex];
    const octave = Math.floor(midi / 12) - 1;
    
    if (!noteInfo.isBlack) {
      whiteKeyIndex++;
    } else {
      const key = document.createElement('div');
      key.className = 'piano-key black-key';
      key.dataset.midi = String(midi);
      key.dataset.note = `${noteInfo.name}${octave}`;
      
      // Position black key relative to white keys
      // White keys overlap by 1px to hide double borders, so use the step width
      key.style.left = `calc(${whiteKeyIndex} * var(--white-key-step) - (var(--black-key-width) / 2))`;
      
      blackKeysContainer.appendChild(key);
      keyElements.set(midi, key);
    }
  }
  
  keyboard.appendChild(whiteKeysContainer);
  keyboard.appendChild(blackKeysContainer);
  container.appendChild(keyboard);
}

// ===========================
// NOTE HIGHLIGHTING
// ===========================

/**
 * Highlight notes on the keyboard
 */
export function highlightNotes(midiNotes: number[]): void {
  // Clear previous highlights
  clearHighlights();
  
  // Highlight new notes
  midiNotes.forEach((midi, index) => {
    const key = keyElements.get(midi);
    if (key) {
      key.classList.add('active');
      
      // Mark the first note (bass) differently
      if (index === 0) {
        key.classList.add('bass-note');
      }
      
      activeNotes.add(midi);
    }
  });
}

/**
 * Clear all note highlights
 */
export function clearHighlights(): void {
  activeNotes.forEach(midi => {
    const key = keyElements.get(midi);
    if (key) {
      key.classList.remove('active', 'bass-note');
    }
  });
  activeNotes.clear();
}

/**
 * Get the MIDI range of the keyboard
 */
export function getKeyboardRange(): { start: number; end: number } {
  return { start: START_MIDI, end: END_MIDI };
}
