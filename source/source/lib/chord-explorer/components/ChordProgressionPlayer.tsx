import React, { useState, useCallback, useRef, useEffect } from 'react';
import * as Tone from 'tone';
import type { TimelineBar, TimelineChord, TimeSignature, ChordDragData } from '../types/chordProgression';
import { getTimingBeatsPerBar, getSecondsPerBar, getSecondsPerBeat } from '../types/chordProgression';
import type { Chord } from '../harmonizer';
import type { ChordDTO } from '../types/chordDto';
import { chordToChordDto } from '../utils/chordDtoAdapters';
import {
  startPlayback,
  stopPlayback,
  updateTempo,
  setMetronomeEnabled,
  setMetronomeVolume,
  setMetronomeType,
  onBeat,
  initProgressionEngine,
  METRONOME_TYPES,
} from '../chordProgressionEngine';
import type { MetronomeTypeId } from '../chordProgressionEngine';
import { getInversion, setChordPlayCallback } from '../chordPalette';
import { getScaleById } from '../scales';
import { ensureMaterialSymbolsLoaded } from '../materialSymbols';
import './ChordProgressionPlayer.css';

interface ChordProgressionPlayerProps {
  songKey?: { root: string; scale: string };
  mode?: 'insert' | 'edit';
  onInsert?: (chord: ChordDTO) => void;
  onUpdate?: (chord: ChordDTO) => void;
  onRemove?: () => void;
}

const ChordProgressionPlayer: React.FC<ChordProgressionPlayerProps> = (props) => {
  // State
  const [bars, setBars] = useState<TimelineBar[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(110);
  const [timeSignature, setTimeSignature] = useState<TimeSignature>([4, 4]);
  const [metronomeEnabled, setMetronomeEnabled] = useState(true);
  const [metronomeVolume, setMetronomeVolumeState] = useState(0); // dB, 0 = benchmark
  const [currentBarIndex, setCurrentBarIndex] = useState<number | null>(null);
  const [currentBeat, setCurrentBeat] = useState<number>(0);
  const [selectedTimelineChord, setSelectedTimelineChord] = useState<{ barIndex: number; chordIndex: number } | null>(null);
  const [selectedPaletteChord, setSelectedPaletteChord] = useState<Chord | null>(null);
  const [currentChordProgress, setCurrentChordProgress] = useState<{ barIndex: number; chordIndex: number; progress: number } | null>(null);
  const [completedChords, setCompletedChords] = useState<Set<string>>(new Set()); // Track completed chords by "barIndex-chordIndex"
  const [metronomeMenuOpen, setMetronomeMenuOpen] = useState(false);
  const [metronomeType, setMetronomeTypeState] = useState<MetronomeTypeId>('thump');
  const [resizingBorder, setResizingBorder] = useState<{ barIndex: number; chordIndex: number } | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartPosition, setResizeStartPosition] = useState(0);
  const [draggingChord, setDraggingChord] = useState<{ barIndex: number; chordIndex: number } | null>(null);
  const [dragOverBar, setDragOverBar] = useState<number | null>(null);
  const [isDraggingOutside, setIsDraggingOutside] = useState(false);
  const [deletingChord, setDeletingChord] = useState<{ barIndex: number; chordIndex: number } | null>(null);
  
  const timelineRef = useRef<HTMLDivElement>(null);
  const metronomeMenuRef = useRef<HTMLDivElement>(null);
  const nextIdRef = useRef(0);
  const dropHandledRef = useRef(false);

  useEffect(() => {
    ensureMaterialSymbolsLoaded();
  }, []);

  // Generate unique IDs
  const generateId = useCallback(() => {
    return `chord-${Date.now()}-${nextIdRef.current++}`;
  }, []);

  // Helper function to add a chord to the timeline
  const addChordToTimeline = useCallback((chord: Chord, targetBarIndex?: number) => {
    // If no bars exist, create a new one
    if (bars.length === 0 || targetBarIndex === undefined || targetBarIndex < 0) {
      const newBar: TimelineBar = {
        id: generateId(),
        chords: [{
          id: generateId(),
          chord,
          position: 0,
          duration: 1,
        }],
      };
      setBars(prev => [...prev, newBar]);
      return;
    }

    // Add to existing bar (or last bar if targetBarIndex is out of range)
    const barIndex = targetBarIndex >= bars.length ? bars.length - 1 : targetBarIndex;
    setBars(prev => {
      const newBars = [...prev];
      const bar = newBars[barIndex];
      
      if (!bar) {
        // Create new bar if target doesn't exist
        const newBar: TimelineBar = {
          id: generateId(),
          chords: [{
            id: generateId(),
            chord,
            position: 0,
            duration: 1,
          }],
        };
        return [...prev, newBar];
      }

      // If dropping on existing chord, split the bar
      const existingChordCount = bar.chords.length;
      const newChordCount = existingChordCount + 1;
      const subdivision = 1 / newChordCount;

      // Redistribute all chords evenly
      const newChords: TimelineChord[] = bar.chords.map((c, i) => ({
        ...c,
        position: i * subdivision,
        duration: subdivision,
      }));

      // Add new chord
      newChords.push({
        id: generateId(),
        chord,
        position: existingChordCount * subdivision,
        duration: subdivision,
      });

      newBars[barIndex] = {
        ...bar,
        chords: newChords,
      };

      return newBars;
    });
  }, [generateId, bars.length]);

  // Handle chord drag start (from timeline)
  const handleChordDragStart = useCallback((e: React.DragEvent, barIndex: number, chordIndex: number) => {
    const bar = bars[barIndex];
    if (!bar || !bar.chords[chordIndex]) return;
    
    const timelineChord = bar.chords[chordIndex];
    const dragData = {
      chord: timelineChord.chord,
      source: 'timeline' as const,
      barIndex,
      chordIndex,
    };
    
    e.dataTransfer.setData('application/json', JSON.stringify(dragData));
    e.dataTransfer.effectAllowed = 'move';
    
    setDraggingChord({ barIndex, chordIndex });
    
    // Add visual feedback
    (e.currentTarget as HTMLElement).style.opacity = '0.5';
  }, [bars]);

  // Handle touch drag start (for mobile)
  const handleChordTouchStart = useCallback((e: React.TouchEvent, barIndex: number, chordIndex: number) => {
    const bar = bars[barIndex];
    if (!bar || !bar.chords[chordIndex]) return;
    
    const touch = e.touches[0];
    const element = e.currentTarget as HTMLElement;
    
    // Store initial touch position and chord data
    (element as any)._touchStartX = touch.clientX;
    (element as any)._touchStartY = touch.clientY;
    (element as any)._touchBarIndex = barIndex;
    (element as any)._touchChordIndex = chordIndex;
    (element as any)._touchStarted = true;
    
    setDraggingChord({ barIndex, chordIndex });
    element.style.opacity = '0.5';
  }, [bars]);

  // Play trash sound when deleting (resume context on iOS so sound plays)
  const playTrashSound = useCallback(() => {
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
  }, []);

  // Handle touch move to detect drag outside
  const handleChordTouchMove = useCallback((e: React.TouchEvent) => {
    if (!draggingChord) return;
    
    const touch = e.touches[0];
    const container = timelineRef.current;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const isOutside = 
      touch.clientX < rect.left || 
      touch.clientX > rect.right || 
      touch.clientY < rect.top || 
      touch.clientY > rect.bottom;
    
    setIsDraggingOutside(isOutside);
  }, [draggingChord]);

  // Handle touch end
  const handleChordTouchEnd = useCallback((e: React.TouchEvent) => {
    const element = e.currentTarget as HTMLElement;
    const touchStarted = (element as any)._touchStarted;
    
    if (!touchStarted || !draggingChord) {
      element.style.opacity = '1';
      return;
    }
    
    // If dropped outside, delete the chord
    if (isDraggingOutside) {
      // Play trash sound
      playTrashSound();
      
      // Mark as deleting immediately to remove from render
      if (draggingChord) {
        setDeletingChord(draggingChord);
      }
      
      // Remove from state
      const chordToDelete = draggingChord;
      if (!chordToDelete) return;
      
      setBars(prev => {
        const newBars = [...prev];
        const bar = newBars[chordToDelete.barIndex];
        if (!bar) return prev;
        
        const newChords = bar.chords.filter((_, idx) => idx !== chordToDelete.chordIndex);
        
        if (newChords.length === 0) {
          // Remove empty bar
          return newBars.filter((_, idx) => idx !== chordToDelete.barIndex);
        }
        
        // Redistribute chord positions evenly
        const subdivision = 1 / newChords.length;
        const updatedChords = newChords.map((c, i) => ({
          ...c,
          position: i * subdivision,
          duration: subdivision,
        }));
        
        newBars[chordToDelete.barIndex] = {
          ...bar,
          chords: updatedChords,
        };
        
        return newBars;
      });
      
      // Clear deleting state after a brief moment
      setTimeout(() => {
        setDeletingChord(null);
      }, 0);
      
      (element as any)._touchStarted = false;
      setDraggingChord(null);
      setDragOverBar(null);
      setIsDraggingOutside(false);
      return;
    }
    
    element.style.opacity = '1';
    (element as any)._touchStarted = false;
    setDraggingChord(null);
    setDragOverBar(null);
    setIsDraggingOutside(false);
  }, [isDraggingOutside, draggingChord, playTrashSound]);

  // Handle chord drag end
  const handleChordDragEnd = useCallback((e: React.DragEvent) => {
    e.preventDefault(); // Prevent default drag end animation
    
    const element = e.currentTarget as HTMLElement;
    
    // If a valid drop was handled, don't do anything here
    if (dropHandledRef.current) {
      dropHandledRef.current = false;
      element.style.opacity = '1';
      setDraggingChord(null);
      setDragOverBar(null);
      setIsDraggingOutside(false);
      return;
    }
    
    // If dropped outside, delete the chord
    if (isDraggingOutside && draggingChord) {
      // Play trash sound
      playTrashSound();
      
      // Mark as deleting immediately to remove from render
      setDeletingChord(draggingChord);
      
      // Remove from state immediately
      const chordToDelete = draggingChord;
      
      setBars(prev => {
        const newBars = [...prev];
        const bar = newBars[chordToDelete.barIndex];
        if (!bar) return prev;
        
        const newChords = bar.chords.filter((_, idx) => idx !== chordToDelete.chordIndex);
        
        if (newChords.length === 0) {
          // Remove empty bar
          return newBars.filter((_, idx) => idx !== chordToDelete.barIndex);
        }
        
        // Redistribute chord positions evenly
        const subdivision = 1 / newChords.length;
        const updatedChords = newChords.map((c, i) => ({
          ...c,
          position: i * subdivision,
          duration: subdivision,
        }));
        
        newBars[chordToDelete.barIndex] = {
          ...bar,
          chords: updatedChords,
        };
        
        return newBars;
      });
      
      // Clear deleting state after state update completes
      setTimeout(() => {
        setDeletingChord(null);
      }, 50);
      
      // Clear dragging state immediately
      setDraggingChord(null);
      setDragOverBar(null);
      setIsDraggingOutside(false);
      return;
    }
    
    // Restore opacity only if not deleted
    element.style.opacity = '1';
    setDraggingChord(null);
    setDragOverBar(null);
    setIsDraggingOutside(false);
  }, [isDraggingOutside, draggingChord, playTrashSound]);

  // Handle drag over timeline container to detect outside drag
  const handleTimelineDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    
    // Check if dragging a timeline chord
    // Note: getData only works in drop event, so we check draggingChord state instead
    if (!draggingChord) return;
    
    // Check if mouse is outside the timeline container
    const container = timelineRef.current;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const isOutside = 
      e.clientX < rect.left || 
      e.clientX > rect.right || 
      e.clientY < rect.top || 
      e.clientY > rect.bottom;
    
    setIsDraggingOutside(isOutside);
    
    if (!isOutside) {
      setDragOverBar(null);
    }
  }, [draggingChord]);

  // Global drag over handler to track outside drag
  useEffect(() => {
    if (!draggingChord) return;
    
    const handleGlobalDragOver = (e: DragEvent) => {
      const container = timelineRef.current;
      if (!container) return;
      
      const rect = container.getBoundingClientRect();
      const isOutside = 
        e.clientX < rect.left || 
        e.clientX > rect.right || 
        e.clientY < rect.top || 
        e.clientY > rect.bottom;
      
      setIsDraggingOutside(isOutside);
    };
    
    document.addEventListener('dragover', handleGlobalDragOver);
    
    return () => {
      document.removeEventListener('dragover', handleGlobalDragOver);
    };
  }, [draggingChord]);

  // Handle chord drop (from palette or reordering)
  const handleDrop = useCallback((e: React.DragEvent, barIndex: number, position?: number) => {
    e.preventDefault();
    e.stopPropagation();

    const dataStr = e.dataTransfer.getData('application/json');
    if (!dataStr) return;

    try {
      const dragData: ChordDragData = JSON.parse(dataStr);
      
      // If dragging from timeline, handle swapping within the same bar
      if (dragData.source === 'timeline' && draggingChord && dragData.barIndex !== undefined && dragData.chordIndex !== undefined) {
        const sourceBarIndex = dragData.barIndex;
        const sourceChordIndex = dragData.chordIndex;
        
        // Only handle swaps within the same bar
        if (sourceBarIndex === barIndex && barIndex >= 0) {
          // Calculate drop position to determine target chord
          const barElement = e.currentTarget.closest('.timeline-bar') as HTMLElement;
          if (!barElement) return;
          
          const barRect = barElement.getBoundingClientRect();
          const dropX = e.clientX - barRect.left;
          const dropPercent = dropX / barRect.width;
          
          // Use functional update to get latest state
          setBars(prev => {
            const targetBar = prev[barIndex];
            if (!targetBar) return prev;
            
            // Find which chord this position falls in
            let targetChordIndex = -1;
            for (let i = 0; i < targetBar.chords.length; i++) {
              const chord = targetBar.chords[i];
              const chordStart = chord.position;
              const chordEnd = chord.position + chord.duration;
              if (dropPercent >= chordStart && dropPercent <= chordEnd) {
                targetChordIndex = i;
                break;
              }
            }
            
            // If we found a target and it's different from source, swap them
            if (targetChordIndex >= 0 && targetChordIndex !== sourceChordIndex) {
              const newBars = [...prev];
              const bar = newBars[barIndex];
              const newChords = [...bar.chords];
              
              // Swap the chords
              [newChords[sourceChordIndex], newChords[targetChordIndex]] = 
                [newChords[targetChordIndex], newChords[sourceChordIndex]];
              
              // Swap their positions and durations to maintain visual positions
              const tempPos = newChords[sourceChordIndex].position;
              const tempDur = newChords[sourceChordIndex].duration;
              newChords[sourceChordIndex].position = newChords[targetChordIndex].position;
              newChords[sourceChordIndex].duration = newChords[targetChordIndex].duration;
              newChords[targetChordIndex].position = tempPos;
              newChords[targetChordIndex].duration = tempDur;
              
              newBars[barIndex] = {
                ...bar,
                chords: newChords,
              };
              
              // Mark that we handled the drop
              dropHandledRef.current = true;
              
              return newBars;
            }
            
            return prev;
          });
        }
      } else {
        // Handle drop from palette
        addChordToTimeline(dragData.chord, barIndex);
      }
      
      setIsDraggingOutside(false);
      setDraggingChord(null);
      setDragOverBar(null);
    } catch (err) {
      console.error('Failed to parse drag data:', err);
      setIsDraggingOutside(false);
      setDraggingChord(null);
      setDragOverBar(null);
    }
  }, [addChordToTimeline, draggingChord, generateId]);

  const handleDragOver = useCallback((e: React.DragEvent, barIndex?: number) => {
    e.preventDefault();
    
    // Check if dragging a timeline chord
    const dataStr = e.dataTransfer.getData('application/json');
    if (dataStr) {
      try {
        const dragData = JSON.parse(dataStr);
        if (dragData.source === 'timeline') {
          e.dataTransfer.dropEffect = 'move';
          if (barIndex !== undefined) {
            setDragOverBar(barIndex);
            setIsDraggingOutside(false);
          }
          return;
        }
      } catch (err) {
        // Not a timeline drag, continue
      }
    }
    
    e.dataTransfer.dropEffect = 'copy';
    if (barIndex !== undefined) {
      setDragOverBar(barIndex);
    }
  }, []);

  // Initialize engine on mount
  useEffect(() => {
    // Initialize the engine (but don't start audio until user interaction)
    initProgressionEngine().catch(err => {
      console.warn('Failed to initialize progression engine:', err);
    });
    
    // Set initial metronome volume
    setMetronomeVolume(metronomeVolume);
    
    // Set up beat callback for playhead animation
    onBeat((beat, bar) => {
      setCurrentBeat(beat);
      setCurrentBarIndex(bar);
    });

    return () => {
      stopPlayback();
    };
  }, []);

  const getPlaybackContextOpt = useCallback((): { keyRoot: string; scaleId: string } | null => {
    const sk = props.songKey;
    if (!sk?.root || !sk?.scale) return null;
    const scaleId = sk.scale === 'minor' ? 'aeolian' : sk.scale;
    if (!getScaleById(scaleId)) return null;
    return { keyRoot: sk.root, scaleId };
  }, [props.songKey]);

  const handlePlay = useCallback(async () => {
    if (bars.length === 0) return;

    try {
      await Tone.start();
    } catch (err) {
      console.warn('Audio context already started or failed:', err);
    }

    setIsPlaying(true);
    const contextOpt = getPlaybackContextOpt();
    await startPlayback(
      bars,
      bpm,
      timeSignature,
      metronomeEnabled,
      true,
      contextOpt ?? undefined
    );
  }, [bars, bpm, timeSignature, metronomeEnabled, getPlaybackContextOpt]);

  const handleStop = useCallback(() => {
    stopPlayback();
    setIsPlaying(false);
    setCurrentBarIndex(null);
    setCurrentBeat(0);
    setCompletedChords(new Set()); // Clear completed chords on stop
    setCurrentChordProgress(null);
  }, []);

  const handleReset = useCallback(() => {
    setBars([]);
    setIsPlaying(false);
    setCurrentBarIndex(null);
    setCurrentBeat(0);
    setSelectedTimelineChord(null);
    setCompletedChords(new Set());
    setCurrentChordProgress(null);
  }, []);

  // Handle chord selection from timeline
  const handleChordClick = useCallback((barIndex: number, chordIndex: number) => {
    setSelectedTimelineChord({ barIndex, chordIndex });
    setSelectedPaletteChord(null); // Clear palette selection when timeline chord is selected
  }, []);

  // Listen to chord selections from the palette via custom event
  useEffect(() => {
    const handleChordSelected = (event: Event) => {
      const customEvent = event as CustomEvent<{ chord: Chord; octaveShift: number; inversion: number }>;
      if (customEvent.detail?.chord) {
        setSelectedPaletteChord(customEvent.detail.chord);
        setSelectedTimelineChord(null); // Clear timeline selection when palette chord is selected
      }
    };
    
    // Listen for double-click to add chord directly
    const handleChordDoubleClick = (event: Event) => {
      const customEvent = event as CustomEvent<{ chord: Chord }>;
      if (customEvent.detail?.chord) {
        // Add chord to the last bar, or create a new bar if none exist
        const targetBarIndex = bars.length > 0 ? bars.length - 1 : -1;
        addChordToTimeline(customEvent.detail.chord, targetBarIndex);
      }
    };
    
    document.addEventListener('chordSelected', handleChordSelected);
    document.addEventListener('chordDoubleClick', handleChordDoubleClick);
    
    return () => {
      document.removeEventListener('chordSelected', handleChordSelected);
      document.removeEventListener('chordDoubleClick', handleChordDoubleClick);
    };
  }, [addChordToTimeline, bars.length]);

  // Handle insert/update/remove
  // Use whichever chord was selected last (timeline or palette)
  const handleInsertChord = useCallback(() => {
    const chord = selectedTimelineChord 
      ? (() => {
          const { barIndex, chordIndex } = selectedTimelineChord;
          const bar = bars[barIndex];
          return bar?.chords[chordIndex]?.chord;
        })()
      : selectedPaletteChord;
    
    if (!chord || !props.onInsert || !props.songKey) return;

    // Normalize scale ID (handle 'minor' -> 'aeolian' mapping)
    const scaleId = props.songKey.scale === 'minor' ? 'aeolian' : props.songKey.scale;
    
    const dto = chordToChordDto(chord, {
      songKeyRoot: props.songKey.root,
      songKeyScale: scaleId,
      inversion: getInversion(),
    });

    props.onInsert(dto);
  }, [selectedTimelineChord, selectedPaletteChord, bars, props]);

  const handleUpdateChord = useCallback(() => {
    // Update only works with timeline chords (editing existing progression)
    if (!selectedTimelineChord || !props.onUpdate || !props.songKey) return;
    
    const { barIndex, chordIndex } = selectedTimelineChord;
    const bar = bars[barIndex];
    if (!bar || !bar.chords[chordIndex]) return;

    const chord = bar.chords[chordIndex].chord;
    // Normalize scale ID (handle 'minor' -> 'aeolian' mapping)
    const scaleId = props.songKey.scale === 'minor' ? 'aeolian' : props.songKey.scale;
    
    const dto = chordToChordDto(chord, {
      songKeyRoot: props.songKey.root,
      songKeyScale: scaleId,
      inversion: getInversion(),
    });

    props.onUpdate(dto);
  }, [selectedTimelineChord, bars, props]);

  const handleRemoveChord = useCallback(() => {
    if (!props.onRemove) return;
    props.onRemove();
  }, [props]);

  // Handle border resize
  const handleBorderMouseDown = useCallback((e: React.MouseEvent, barIndex: number, chordIndex: number) => {
    // Only allow resize on desktop (mouse), not touch devices
    if (e.type === 'touchstart') return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const bar = bars[barIndex];
    if (!bar || chordIndex >= bar.chords.length - 1) return; // Can't resize after last chord
    
    const barElement = e.currentTarget.closest('.timeline-bar') as HTMLElement;
    if (!barElement) return;
    
    const barRect = barElement.getBoundingClientRect();
    const mouseX = e.clientX;
    const barWidth = barRect.width;
    
    // Calculate current position of the border (end of current chord)
    const currentChord = bar.chords[chordIndex];
    const borderPosition = currentChord.position + currentChord.duration;
    
    setResizingBorder({ barIndex, chordIndex });
    setResizeStartX(mouseX);
    setResizeStartPosition(borderPosition);
  }, [bars]);

  const handleBorderMouseMove = useCallback((e: MouseEvent) => {
    if (!resizingBorder) return;
    
    const { barIndex, chordIndex } = resizingBorder;
    
    // Find the bar element
    const barElement = document.querySelector(`.timeline-bar[data-bar-index="${barIndex}"]`) as HTMLElement;
    if (!barElement) return;
    
    const barRect = barElement.getBoundingClientRect();
    const barWidth = barRect.width;
    const mouseX = e.clientX;
    const deltaX = mouseX - resizeStartX;
    const deltaPercent = deltaX / barWidth;
    
    // Calculate new position
    let newPosition = resizeStartPosition + deltaPercent;
    
    // Snap to half-beat divisions
    // In 4/4: 1 bar = 4 beats, so 0.5 beats = 0.125 of a bar
    // In 3/4: 1 bar = 3 beats, so 0.5 beats = 0.1667 of a bar
    const snapIncrement =
      timeSignature[0] === 6 && timeSignature[1] === 8 ? 1 / 6 : 0.5 / timeSignature[0];
    
    newPosition = Math.round(newPosition / snapIncrement) * snapIncrement;
    
    // Update chord durations using functional update to get latest state
    setBars(prev => {
      const bar = prev[barIndex];
      if (!bar || chordIndex >= bar.chords.length - 1) return prev;
      
      const newBars = [...prev];
      const updatedBar = { ...bar };
      const newChords = [...updatedBar.chords];
      
      const currentChord = newChords[chordIndex];
      const nextChord = newChords[chordIndex + 1];
      
      // Clamp to valid range
      const minPosition = currentChord.position + snapIncrement; // At least half a beat
      const maxPosition = nextChord.position + nextChord.duration - snapIncrement; // Leave at least half a beat for next chord
      
      newPosition = Math.max(minPosition, Math.min(maxPosition, newPosition));
      
      // Update current chord duration
      const newCurrentChord = {
        ...currentChord,
        duration: newPosition - currentChord.position,
      };
      
      // Update next chord position and duration
      const newNextChord = {
        ...nextChord,
        position: newPosition,
        duration: (nextChord.position + nextChord.duration) - newPosition,
      };
      
      newChords[chordIndex] = newCurrentChord;
      newChords[chordIndex + 1] = newNextChord;
      
      updatedBar.chords = newChords;
      newBars[barIndex] = updatedBar;
      
      return newBars;
    });
  }, [resizingBorder, resizeStartX, resizeStartPosition, timeSignature]);

  const handleBorderMouseUp = useCallback(() => {
    setResizingBorder(null);
    setResizeStartX(0);
    setResizeStartPosition(0);
  }, []);

  // Set up global mouse move/up handlers for resizing
  useEffect(() => {
    if (resizingBorder) {
      document.addEventListener('mousemove', handleBorderMouseMove);
      document.addEventListener('mouseup', handleBorderMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleBorderMouseMove);
        document.removeEventListener('mouseup', handleBorderMouseUp);
      };
    }
  }, [resizingBorder, handleBorderMouseMove, handleBorderMouseUp]);

  const handleTempoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newBpm = parseInt(e.target.value, 10);
    if (newBpm >= 40 && newBpm <= 200) {
      setBpm(newBpm);
      if (isPlaying) {
        updateTempo(newBpm);
      }
    }
  }, [isPlaying]);

  const toggleTimeSignature = useCallback(() => {
    setTimeSignature(prev => {
      // Cycle: 4/4 → 3/4 → 6/8 → 4/4
      const newSig: [number, number] =
        prev[0] === 4 && prev[1] === 4
          ? [3, 4]
          : prev[0] === 3 && prev[1] === 4
            ? [6, 8]
            : [4, 4];
      if (isPlaying) {
        handleStop();
        setTimeout(() => {
          const ctx = getPlaybackContextOpt();
          startPlayback(bars, bpm, newSig, metronomeEnabled, true, ctx ?? undefined);
          setIsPlaying(true);
        }, 100);
      }
      return newSig;
    });
  }, [isPlaying, bars, bpm, metronomeEnabled, handleStop, getPlaybackContextOpt]);

  const toggleMetronomeMenu = useCallback(() => {
    setMetronomeMenuOpen(prev => !prev);
  }, []);

  const handleMetronomeMute = useCallback(() => {
    const mutedVolume = -40; // Minimum volume (effectively mute)
    setMetronomeVolumeState(mutedVolume);
    setMetronomeVolume(mutedVolume);
  }, []);

  const handleMetronomeVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setMetronomeVolumeState(newVolume); // Update state
    setMetronomeVolume(newVolume); // Update engine volume (imported function)
  }, []);

  // Close metronome menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (metronomeMenuRef.current && !metronomeMenuRef.current.contains(event.target as Node)) {
        const target = event.target as HTMLElement;
        // Don't close if clicking the metronome toggle button
        if (!target.closest('.metronome-toggle')) {
          setMetronomeMenuOpen(false);
        }
      }
    };

    if (metronomeMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [metronomeMenuOpen]);

  // Update chord progress for gradient fill (smooth, linear animation)
  useEffect(() => {
    if (!isPlaying || bars.length === 0) {
      setCurrentChordProgress(null);
      return;
    }

    let animationFrameId: number;
    let lastBarIndex: number | null = null;
    const timingBeatsPerBar = getTimingBeatsPerBar(timeSignature);
    const secondsPerBeat = getSecondsPerBeat(timeSignature, bpm);
    const secondsPerBar = getSecondsPerBar(timeSignature, bpm);
    const totalDuration = bars.length * secondsPerBar;

    const updateProgress = () => {
      // Check if still playing (check state directly, not from closure)
      if (!isPlaying || bars.length === 0) {
        setCurrentChordProgress(null);
        return;
      }

      try {
        // Get current transport time
        const transportTime = Tone.Transport.seconds;
        const loopTime = transportTime % totalDuration; // Handle looping

        // Find which bar we're in
        const barIndex = Math.floor(loopTime / secondsPerBar) % bars.length;
        const timeInBar = loopTime % secondsPerBar;
        const beatInBar = timeInBar / secondsPerBeat;
        
        // Detect loop reset: if we went from last bar back to first bar
        if (lastBarIndex !== null && lastBarIndex === bars.length - 1 && barIndex === 0) {
          // Loop has reset - clear all completed chords
          setCompletedChords(new Set());
        }
        lastBarIndex = barIndex;

        const bar = bars[barIndex];
        if (!bar || bar.chords.length === 0) {
          setCurrentChordProgress(null);
          animationFrameId = requestAnimationFrame(updateProgress);
          return;
        }

        // Find which chord is currently playing
        // Convert beatInBar to a fraction of the bar (0-1)
        const beatFraction = beatInBar / timingBeatsPerBar;
        
        let currentChord: { chordIndex: number; progress: number } | null = null;

        // First, mark any chords we've passed as completed
        for (let i = 0; i < bar.chords.length; i++) {
          const timelineChord = bar.chords[i];
          const chordStart = timelineChord.position;
          const chordEnd = chordStart + timelineChord.duration;
          
          // If we've passed this chord's end, mark it as completed
          if (beatFraction >= chordEnd) {
            const chordKey = `${barIndex}-${i}`;
            setCompletedChords(prev => {
              if (!prev.has(chordKey)) {
                const next = new Set(prev);
                next.add(chordKey);
                return next;
              }
              return prev;
            });
          }
        }

        // Now find the currently playing chord
        for (let i = 0; i < bar.chords.length; i++) {
          const timelineChord = bar.chords[i];
          const chordStart = timelineChord.position; // Already a fraction (0-1)
          const chordEnd = chordStart + timelineChord.duration; // Already a fraction (0-1)

          if (beatFraction >= chordStart && beatFraction < chordEnd) {
            // Calculate progress within this chord (0 to 1)
            const progressInChord = (beatFraction - chordStart) / timelineChord.duration;
            currentChord = { chordIndex: i, progress: Math.min(1, Math.max(0, progressInChord)) };
            break;
          }
        }

        if (currentChord) {
          const progressValue = currentChord.progress;
          const chordKey = `${barIndex}-${currentChord.chordIndex}`;
          
          // If chord is complete (progress >= 1 or very close), mark it as completed
          if (progressValue >= 0.99) {
            setCompletedChords(prev => {
              const next = new Set(prev);
              next.add(chordKey);
              return next;
            });
          }
          
          // Always update to ensure smooth animation (React will batch updates)
          setCurrentChordProgress({
            barIndex,
            chordIndex: currentChord.chordIndex,
            progress: progressValue,
          });
        } else {
          setCurrentChordProgress(null);
        }
      } catch (error) {
        // Transport might not be initialized yet
        console.warn('Error updating chord progress:', error);
        setCurrentChordProgress(null);
      }

      animationFrameId = requestAnimationFrame(updateProgress);
    };

    animationFrameId = requestAnimationFrame(updateProgress);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isPlaying, bars, bpm, timeSignature]);

  // Get selected chord info for display in control bar
  // Priority: timeline selection > palette selection
  const selectedChordInfo = selectedTimelineChord ? (() => {
    const { barIndex, chordIndex } = selectedTimelineChord;
    const bar = bars[barIndex];
    if (!bar || !bar.chords[chordIndex]) return null;
    const chord = bar.chords[chordIndex].chord;
    const uniqueNotes = [...new Set(chord.notes)];
    const scaleId = props.songKey?.scale === 'minor' ? 'aeolian' : props.songKey?.scale;
    const scale = scaleId ? getScaleById(scaleId) : null;
    const scaleName = scale?.name || props.songKey?.scale || '';
    return {
      symbol: chord.symbol,
      notes: uniqueNotes.join(' '),
      degree: chord.degreeRoman,
      scale: props.songKey ? `${props.songKey.root} ${scaleName}` : '',
      chord: chord,
      source: 'timeline' as const,
    };
  })() : selectedPaletteChord ? (() => {
    const chord = selectedPaletteChord;
    const uniqueNotes = [...new Set(chord.notes)];
    const scaleId = props.songKey?.scale === 'minor' ? 'aeolian' : props.songKey?.scale;
    const scale = scaleId ? getScaleById(scaleId) : null;
    const scaleName = scale?.name || props.songKey?.scale || '';
    return {
      symbol: chord.symbol,
      notes: uniqueNotes.join(' '),
      degree: chord.degreeRoman,
      scale: props.songKey ? `${props.songKey.root} ${scaleName}` : '',
      chord: chord,
      source: 'palette' as const,
    };
  })() : null;

  return (
    <div className="chord-progression-player">
      <div className="player-transport-bar">
        <div className="transport-controls">
          <button
            type="button"
            className={`transport-button play-stop-button${isPlaying ? ' is-playing' : ''}`}
            onClick={isPlaying ? handleStop : handlePlay}
            disabled={!isPlaying && bars.length === 0}
            aria-label={isPlaying ? 'Stop' : 'Play'}
          >
            {isPlaying ? '■' : '▶'}
          </button>
          <button
            type="button"
            className="transport-button reset-button"
            onClick={handleReset}
            aria-label="Reset"
          >
            ↻
          </button>
        </div>

        {/* Selected chord info - centered in control bar */}
        {selectedChordInfo && (
          <div className="player-selected-chord-info">
            <div className="player-selected-chord-symbol">{selectedChordInfo.symbol}</div>
            <div className="player-selected-chord-notes">{selectedChordInfo.notes}</div>
            <div className="player-selected-chord-meta">
              <span className="player-selected-chord-degree">{selectedChordInfo.degree}</span>
              <span className="player-selected-chord-scale">{selectedChordInfo.scale}</span>
            </div>
          </div>
        )}

        <div className="player-settings">
          <div className="setting-group">
            <label htmlFor="time-signature">Time</label>
            <button
              type="button"
              id="time-signature"
              className="time-signature-button"
              onClick={toggleTimeSignature}
            >
              {timeSignature[0]}/{timeSignature[1]}
            </button>
          </div>

          <div className="setting-group">
            <label htmlFor="tempo-input">Tempo</label>
            <input
              type="number"
              id="tempo-input"
              className="tempo-input"
              min="40"
              max="200"
              value={bpm}
              onChange={handleTempoChange}
            />
            <span className="tempo-label">BPM</span>
          </div>

          <div className="setting-group metronome-menu-group" ref={metronomeMenuRef}>
            <button
              type="button"
              className={`metronome-toggle ${metronomeEnabled ? 'enabled' : ''}`}
              onClick={toggleMetronomeMenu}
              aria-label="Metronome settings"
              aria-expanded={metronomeMenuOpen}
              title="Metronome"
            >
              ♩
            </button>
            {metronomeMenuOpen && (
              <div className="metronome-menu">
                <div className="settings-menu-row">
                  <span className="settings-label">Type</span>
                  <select
                    id="metronome-type"
                    className="metronome-type-select"
                    value={metronomeType}
                    onChange={(e) => {
                      const value = e.target.value as MetronomeTypeId;
                      setMetronomeTypeState(value);
                      setMetronomeType(value);
                    }}
                    aria-label="Metronome type"
                  >
                    {METRONOME_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="settings-menu-row metronome-volume-row">
                  <span className="settings-label">Volume</span>
                  <div className="metronome-volume-control">
                    <input
                      type="range"
                      id="metronome-volume"
                      className="metronome-volume-slider"
                      min="-40"
                      max="15"
                      step="1"
                      value={metronomeVolume}
                      onChange={handleMetronomeVolumeChange}
                      aria-label="Metronome volume"
                    />
                    <span className="metronome-volume-value">{metronomeVolume} dB</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="metronome-mute-button"
                  onClick={handleMetronomeMute}
                  aria-label="Mute metronome"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mute-icon">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                    <line x1="23" y1="9" x2="17" y2="15"></line>
                    <line x1="17" y1="9" x2="23" y2="15"></line>
                  </svg>
                  <span>Mute</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div 
        className="player-timeline-container" 
        ref={timelineRef}
        onDragOver={handleTimelineDragOver}
      >
        <div className="player-timeline">
          {bars.map((bar, barIndex) => (
            <div
              key={bar.id}
              className={`timeline-bar ${currentBarIndex === barIndex ? 'active' : ''} ${dragOverBar === barIndex ? 'drag-over' : ''}`}
              onDragOver={(e) => handleDragOver(e, barIndex)}
              onDrop={(e) => handleDrop(e, barIndex)}
              onDragLeave={() => setDragOverBar(null)}
              data-bar-index={barIndex}
            >
              {bar.chords.map((timelineChord, chordIndex) => {
                // Skip rendering if this chord is being deleted
                if (deletingChord?.barIndex === barIndex && deletingChord?.chordIndex === chordIndex) {
                  return null;
                }
                
                const isSelected = selectedTimelineChord?.barIndex === barIndex && 
                                  selectedTimelineChord?.chordIndex === chordIndex;
                const isPlaying = currentChordProgress?.barIndex === barIndex && 
                                 currentChordProgress?.chordIndex === chordIndex;
                const chordKey = `${barIndex}-${chordIndex}`;
                const isCompleted = completedChords.has(chordKey);
                const progress = isPlaying ? currentChordProgress.progress : (isCompleted ? 1 : 0);
                
                // Determine background style
                let backgroundStyle: React.CSSProperties = {};
                if ((isPlaying && progress >= 0) || isCompleted) {
                  // Apply gradient fill based on progress
                  const fillPercent = Math.min(100, Math.max(0, progress * 100));
                  // Use a more visible gradient with higher opacity and ensure it's applied
                  const gradientString = `linear-gradient(to right, 
                    rgba(245, 166, 35, 0.8) 0%, 
                    rgba(245, 166, 35, 0.8) ${fillPercent}%, 
                    #1a1a26 ${fillPercent}%, 
                    #1a1a26 100%)`;
                  backgroundStyle.background = gradientString;
                  backgroundStyle.backgroundImage = gradientString;
                  // Force override any CSS
                  backgroundStyle.backgroundClip = 'border-box';
                }
                
                // Check if this border is being resized
                const isResizing = resizingBorder?.barIndex === barIndex && 
                                  resizingBorder?.chordIndex === chordIndex;
                
                const isDraggingThis = draggingChord?.barIndex === barIndex && draggingChord?.chordIndex === chordIndex;
                
                return (
                  <React.Fragment key={timelineChord.id}>
                    <div
                      className={`timeline-chord ${currentBarIndex === barIndex && !isPlaying && !isCompleted ? 'sounding' : ''} ${isSelected ? 'selected' : ''} ${isPlaying || isCompleted ? 'playing' : ''} ${isDraggingThis ? 'dragging' : ''} ${isDraggingOutside && isDraggingThis ? 'dragging-outside' : ''}`}
                      style={{
                        left: `${timelineChord.position * 100}%`,
                        width: `${timelineChord.duration * 100}%`,
                        ...backgroundStyle,
                      }}
                      draggable={true}
                      onDragStart={(e) => handleChordDragStart(e, barIndex, chordIndex)}
                      onDragEnd={handleChordDragEnd}
                      onTouchStart={(e) => handleChordTouchStart(e, barIndex, chordIndex)}
                      onTouchMove={handleChordTouchMove}
                      onTouchEnd={handleChordTouchEnd}
                      onClick={() => handleChordClick(barIndex, chordIndex)}
                    >
                      <span className="chord-symbol">{timelineChord.chord.symbol}</span>
                    </div>
                    {/* Resize handle between chords (only show if not last chord) */}
                    {chordIndex < bar.chords.length - 1 && (
                      <div
                        className={`timeline-border-resize ${isResizing ? 'resizing' : ''}`}
                        style={{
                          left: `${(timelineChord.position + timelineChord.duration) * 100}%`,
                        }}
                        onMouseDown={(e) => handleBorderMouseDown(e, barIndex, chordIndex)}
                        data-bar-index={barIndex}
                        data-chord-index={chordIndex}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          ))}
          
          {/* Empty drop zone for adding new bars */}
          <div
            className="timeline-bar empty-bar"
            onDragOver={(e) => handleDragOver(e, -1)}
            onDrop={(e) => handleDrop(e, -1)}
            onDragLeave={() => setDragOverBar(null)}
          >
            <span className="empty-bar-hint">Drop chord here</span>
          </div>

          {/* Insert button - positioned at far right of timeline */}
          {(selectedTimelineChord || selectedPaletteChord) && (
            <div className="player-timeline-actions">
              {props.mode === 'edit' && selectedTimelineChord && (
                <button
                  type="button"
                  className="player-remove-chord-button"
                  onClick={handleRemoveChord}
                  aria-label="Remove chord"
                >
                  <span className="remove-icon">×</span>
                  <span className="remove-text">Remove</span>
                </button>
              )}
              <button
                type="button"
                className="player-insert-chord-button"
                onClick={props.mode === 'edit' && selectedTimelineChord ? handleUpdateChord : handleInsertChord}
                aria-label={props.mode === 'edit' && selectedTimelineChord ? 'Update chord' : 'Insert chord'}
              >
                <span className="insert-icon">↵</span>
                <span className="insert-text">{props.mode === 'edit' && selectedTimelineChord ? 'Update' : 'Insert'}</span>
              </button>
            </div>
          )}
        </div>
        
      </div>
    </div>
  );
};

export default ChordProgressionPlayer;
