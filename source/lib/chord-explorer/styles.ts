/**
 * Playback Style Definitions
 * 
 * All 10 curated playback styles from canonical-style-schemas.md
 * These are fixed, non-user-editable styles designed for chord auditioning and songwriting.
 */

import type { Style } from './types/playbackStyle';

/**
 * All available playback styles
 */
export const STYLES: Style[] = [
  // 1. Block Chords (Once) - works with 4/4, 3/4, or 6/8; time signature is user-selectable
  {
    id: 'block',
    name: 'Block Chords',
    layers: [
      {
        id: 'chord',
        role: 'chord',
        pattern: {
          resolution: 'slice',
          steps: [
            {
              offset: 0,
              choices: [
                { weight: 1, action: { type: 'chord' } }
              ]
            }
          ],
          stepsByMeter: {
            '3/4': [{ offset: 0, choices: [{ weight: 1, action: { type: 'chord' } }] }],
            '6/8': [{ offset: 0, choices: [{ weight: 1, action: { type: 'chord' } }] }],
          },
        },
        articulation: { length: 'legato' }
      }
    ],
    // Block Chords respects previous defaults but ensures sustain is on; no time sig lock
    overrides: {
      sustain: {
        value: true, // Enable sustain pedal (default is on)
        lock: false // Don't lock - user can still change it
      }
    }
  },

  {
    id: 'judy-style',
    name: 'Pop Comping',
    meterConstraint: { beatsPerBar: [4] },
    overrides: { timeSignature: { value: [4, 4], lock: true } },
    layers: [
      {
        id: 'bass',
        role: 'bass',
        pattern: {
          resolution: 'slice',
          steps: [
            // Steady quarter-note bass roots or octaves
            { offset: 0,    choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
            { offset: 0.25, choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
            { offset: 0.5,  choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
            { offset: 0.75, choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] }
          ]
        }
      },
      {
        id: 'chord-pulse',
        role: 'chord',
        pattern: {
          resolution: 'slice',
          steps: [
            // Chords land on the "off-beats" or alternate with the bass
            // Beat 1: Together with bass
            { offset: 0,     choices: [{ weight: 1, action: { type: 'chord' } }] },
            // Beats 2, 3, 4: Pulse the chord to fill the space
            { offset: 0.25,  choices: [{ weight: 1, action: { type: 'chord' } }] },
            { offset: 0.5,   choices: [{ weight: 1, action: { type: 'chord' } }] },
            { offset: 0.75,  choices: [{ weight: 1, action: { type: 'chord' } }] }
          ]
        }
      }
    ]
  },

  {
    id: 'capaldi-style',
    name: 'Capaldi',
    meterConstraint: { beatsPerBar: [4] },
    overrides: { timeSignature: { value: [4, 4], lock: true } },
    layers: [
      {
        id: 'bass',
        role: 'bass',
        pattern: {
          resolution: 'slice',
          steps: [
            // Play root note at the start of the bar
            { offset: 0, choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] }
          ]
        }
      },
      {
        id: 'chord-rocking',
        role: 'chord',
        pattern: {
          resolution: 'slice',
          steps: [
            // Beat 1: Start with the chord "shell" (Bottom + Top notes)
            { offset: 0, choices: [{ weight: 1, action: { type: 'chord' } }] },
            // Beats 1.5, 2, 2.5, 3, 3.5, 4: Rock back and forth
            // We alternate between a high note (degree 5) and a lower note (degree 3)
            { offset: 0.125, choices: [{ weight: 1, action: { type: 'note', degree: 3 } }] },
            { offset: 0.25,  choices: [{ weight: 1, action: { type: 'note', degree: 5 } }] },
            { offset: 0.375, choices: [{ weight: 1, action: { type: 'note', degree: 3 } }] },
            { offset: 0.5,   choices: [{ weight: 1, action: { type: 'note', degree: 5 } }] },
            { offset: 0.625, choices: [{ weight: 1, action: { type: 'note', degree: 3 } }] },
            { offset: 0.75,  choices: [{ weight: 1, action: { type: 'note', degree: 5 } }] },
            // Beat 4.5: The "Sneaky Note" (often drops to the 7th or 2nd to lead back)
            { offset: 0.875, choices: [{ weight: 1, action: { type: 'note', degree: 2 } }] }
          ]
        }
      }
    ]
  },

  {
    id: 'anthemic-pop',
    name: 'Anthem Pop',
    meterConstraint: { beatsPerBar: [4] },
    overrides: { timeSignature: { value: [4, 4], lock: true } },
    layers: [
      {
        id: 'bass-octave',
        role: 'bass',
        pattern: {
          resolution: 'slice',
          steps: [
            // Steady driving eighth notes for momentum
            { offset: 0,    choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
            { offset: 0.25, choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
            { offset: 0.5,  choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
            { offset: 0.75, choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] }
          ]
        }
      },
      {
        id: 'chord-syncopation',
        role: 'chord',
        pattern: {
          resolution: 'slice',
          steps: [
            // The "3-3-2" rhythm: Hits on 1, the 'and' of 2, and 4
            { offset: 0,     choices: [{ weight: 1, action: { type: 'chord' } }] },
            { offset: 0.375, choices: [{ weight: 1, action: { type: 'chord' } }] }, 
            { offset: 0.75,  choices: [{ weight: 1, action: { type: 'chord' } }] }
          ]
        }
      }
    ]
  },

  {
    id: 'coldplay-clocks',
    name: 'Ostinato Style',
    meterConstraint: { beatsPerBar: [4] },
    overrides: { timeSignature: { value: [4, 4], lock: true } },
    layers: [
      {
        id: 'bass-anchor',
        role: 'bass',
        pattern: {
          resolution: 'slice',
          steps: [
            // Single root note held or pulsed on the downbeat
            { offset: 0, choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] }
          ]
        }
      },
      {
        id: 'arpeggio-riff',
        role: 'chord',
        pattern: {
          resolution: 'slice',
          steps: [
            // Group 1 (3 notes): Top - Middle - Bottom
            { offset: 0,     choices: [{ weight: 1, action: { type: 'note', degree: 5 } }] },
            { offset: 0.125, choices: [{ weight: 1, action: { type: 'note', degree: 3 } }] },
            { offset: 0.25,  choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
            
            // Group 2 (3 notes): Top - Middle - Bottom
            { offset: 0.375, choices: [{ weight: 1, action: { type: 'note', degree: 5 } }] },
            { offset: 0.5,   choices: [{ weight: 1, action: { type: 'note', degree: 3 } }] },
            { offset: 0.625, choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
            
            // Group 3 (2 notes): Top - Middle
            { offset: 0.75,  choices: [{ weight: 1, action: { type: 'note', degree: 5 } }] },
            { offset: 0.875, choices: [{ weight: 1, action: { type: 'note', degree: 3 } }] }
          ]
        }
      }
    ]
  },

  {
    id: 'coldplay-scientist',
    name: 'Pulse',
    meterConstraint: { beatsPerBar: [4] },
    overrides: { timeSignature: { value: [4, 4], lock: true } },
    layers: [
      {
        id: 'bass-pulse',
        role: 'bass',
        pattern: {
          resolution: 'slice',
          steps: [
            // Constant eighth-note pulse on the root
            { offset: 0,     choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
            { offset: 0.125, choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
            { offset: 0.25,  choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
            { offset: 0.375, choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
            { offset: 0.5,   choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
            { offset: 0.625, choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
            { offset: 0.75,  choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
            { offset: 0.875, choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] }
          ]
        }
      },
      {
        id: 'chord-pulse',
        role: 'chord',
        pattern: {
          resolution: 'slice',
          steps: [
            // Right hand also pulses eighth notes
            { offset: 0,     choices: [{ weight: 1, action: { type: 'chord' } }] },
            { offset: 0.125, choices: [{ weight: 1, action: { type: 'chord' } }] },
            { offset: 0.25,  choices: [{ weight: 1, action: { type: 'chord' } }] },
            { offset: 0.375, choices: [{ weight: 1, action: { type: 'chord' } }] },
            { offset: 0.5,   choices: [{ weight: 1, action: { type: 'chord' } }] },
            { offset: 0.625, choices: [{ weight: 1, action: { type: 'chord' } }] },
            { offset: 0.75,  choices: [{ weight: 1, action: { type: 'chord' } }] },
            { offset: 0.875, choices: [{ weight: 1, action: { type: 'chord' } }] }
          ]
        }
      }
    ]
  },
  {
    id: 'journey-motor',
    name: 'Journey',
    meterConstraint: { beatsPerBar: [4] },
    overrides: { timeSignature: { value: [4, 4], lock: true } },
    layers: [
      {
        id: 'bass-driving',
        role: 'bass',
        pattern: {
          resolution: 'slice',
          steps: [
            // Constant eighth-note pulse for that driving rock engine
            { offset: 0,     choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
            { offset: 0.125, choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
            { offset: 0.25,  choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
            { offset: 0.375, choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
            { offset: 0.5,   choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
            { offset: 0.625, choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
            { offset: 0.75,  choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
            { offset: 0.875, choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] }
          ]
        }
      },
      {
        id: 'chord-syncopation',
        role: 'chord',
        pattern: {
          resolution: 'slice',
          steps: [
            // The RH "Bounce": Chord on the downbeats, single note on the "ands"
            { offset: 0,     choices: [{ weight: 1, action: { type: 'chord' } }] },
            { offset: 0.125, choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] }, // The "Thumb" pulse
            { offset: 0.25,  choices: [{ weight: 1, action: { type: 'chord' } }] },
            { offset: 0.375, choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
            { offset: 0.5,   choices: [{ weight: 1, action: { type: 'chord' } }] },
            { offset: 0.625, choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
            { offset: 0.75,  choices: [{ weight: 1, action: { type: 'chord' } }] },
            { offset: 0.875, choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] }
          ]
        }
      }
    ]
  },

  {
    id: 'classic-waltz',
    name: 'Waltz',
    meterConstraint: { beatsPerBar: [3] },
    overrides: { timeSignature: { value: [3, 4], lock: true } },
    feel: { accentPattern: [1, 0.75, 0.65], accentWeighting: 0.9 },
    layers: [
      {
        id: 'waltz-bass',
        role: 'bass',
        pattern: {
          resolution: 'slice',
          steps: [{ offset: 0, choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] }]
        }
      },
      {
        id: 'waltz-chords',
        role: 'chord',
        pattern: {
          resolution: 'slice',
          steps: [
            // Boom-Chic-Chic (Chords on beats 2 and 3)
            { offset: 0.333, choices: [{ weight: 1, action: { type: 'chord' } }] },
            { offset: 0.666, choices: [{ weight: 1, action: { type: 'chord' } }] }
          ]
        }
      }
    ]
  },
  {
    id: 'jazz-swing',
    name: 'Jazz Manouche',
    meterConstraint: { beatsPerBar: [4] },
    feel: { swing: 0.66, swingMode: 'eighth', groove: 'swing', humanise: true, humaniseAmount: 0.12 },
    layers: [
      {
        id: 'walking-bass',
        role: 'bass',
        pattern: {
          resolution: 'slice',
          steps: [
            { offset: 0,    choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
            { offset: 0.25, choices: [{ weight: 1, action: { type: 'note', degree: 5 } }] },
            { offset: 0.5,  choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
            { offset: 0.75, choices: [{ weight: 1, action: { type: 'note', degree: 2 } }] }
          ]
        }
      },
      {
        id: 'four-on-the-floor',
        role: 'chord',
        articulation: { length: 'staccato' },
        pattern: {
          resolution: 'slice',
          steps: [
            // "Freddie Green" style rhythmic pulsing
            { offset: 0,    choices: [{ weight: 1, action: { type: 'chord' } }] },
            { offset: 0.25, choices: [{ weight: 1, action: { type: 'chord' } }] },
            { offset: 0.5,  choices: [{ weight: 1, action: { type: 'chord' } }] },
            { offset: 0.75, choices: [{ weight: 1, action: { type: 'chord' } }] }
          ]
        }
      }
    ]
  },
  {
    id: 'retro-soul-winehouse',
    name: 'Retro Soul',
    meterConstraint: { beatsPerBar: [4] },
    overrides: {
      timeSignature: { value: [4, 4], lock: true },
      sustain: { value: false, lock: false }, // Staccato/Dry feel is key
      // Amy Winehouse "Back to Black": high chords (octave up), 1st inversion for that bright punch
      octaveOffset: { value: 1, lock: false },   // 0 = none, 1 = one octave up (-3 to +3)
      inversion: { value: 1, lock: false }       // 0 = root, 1 = 1st inversion
    },
    layers: [
      {
        id: 'chord-quarter-pulse',
        role: 'chord',
        articulation: { length: 'staccato' },
        pattern: {
          resolution: 'slice',
          steps: [
            // Steady quarter-note pulse for that "Wall of Sound" piano (uses style octaveOffset + inversion)
            { offset: 0,    choices: [{ weight: 1, action: { type: 'chord' } }] },
            { offset: 0.25, choices: [{ weight: 1, action: { type: 'chord' } }] },
            { offset: 0.5,  choices: [{ weight: 1, action: { type: 'chord' } }] },
            { offset: 0.75, choices: [{ weight: 1, action: { type: 'chord' } }] }
          ]
        }
      },
      {
        id: 'chord-octave-accent',
        role: 'chord',
        pattern: {
          resolution: 'slice',
          steps: [
            // High octave "chime" on the same quarter-note pulse (explicit +1 on top of style)
            { offset: 0,    choices: [{ weight: 1, action: { type: 'chord', octaveOffset: 0 } }] },
            { offset: 0.25, choices: [{ weight: 1, action: { type: 'chord', octaveOffset: 0 } }] },
            { offset: 0.5,  choices: [{ weight: 1, action: { type: 'chord', octaveOffset: 0 } }] },
            { offset: 0.75, choices: [{ weight: 1, action: { type: 'chord', octaveOffset: 0 } }] }
          ]
        }
      },
      {
        id: 'syncopated-bass',
        role: 'bass',
        pattern: {
          resolution: 'slice',
          steps: [
            // The signature "Back to Black" bass rhythm (1, the 'and' of 2, and 4)
            { offset: 0,     choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
            { offset: 0.375, choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
            { offset: 0.75,  choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] }
          ]
        }
      }
    ]
  },
  {
    id: 'indie-tremolo',
    name: 'Indie Tension',
    meterConstraint: { beatsPerBar: [4] },
    layers: [
      {
        id: 'eighth-bass',
        role: 'bass',
        pattern: {
          resolution: 'slice',
          steps: [
            { offset: 0,    choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
            { offset: 0.25, choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
            { offset: 0.5,  choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
            { offset: 0.75, choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] }
          ]
        }
      },
      {
        id: 'sixteenth-tremolo',
        role: 'chord',
        pattern: {
          resolution: 'slice',
          steps: [
            // Fast repetition of top voicing
            { offset: 0,     choices: [{ weight: 1, action: { type: 'chord' } }] },
            { offset: 0.062, choices: [{ weight: 1, action: { type: 'chord' } }] },
            { offset: 0.125, choices: [{ weight: 1, action: { type: 'chord' } }] },
            { offset: 0.187, choices: [{ weight: 1, action: { type: 'chord' } }] },
            // ... repeat for the whole bar
            { offset: 0.25,  choices: [{ weight: 1, action: { type: 'chord' } }] },
            { offset: 0.312, choices: [{ weight: 1, action: { type: 'chord' } }] },
            { offset: 0.375, choices: [{ weight: 1, action: { type: 'chord' } }] },
            { offset: 0.437, choices: [{ weight: 1, action: { type: 'chord' } }] }
          ]
        }
      }
    ]
  },
    // 1. Hallelujah - Leonard Cohen (Flowing Arpeggio)
    {
      id: 'hallelujah-style',
      name: 'Gospel 6/8 Arpeggio',
      meterConstraint: { beatsPerBar: [6] },
      overrides: { timeSignature: { value: [6, 8], lock: true } },
      feel: { groove: 'triplet' },
      layers: [
        {
          id: 'bass',
          role: 'bass',
          pattern: {
            resolution: 'slice',
            steps: [
              { offset: 0, choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
              { offset: 0.5, choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] }
            ]
          }
        },
        {
          id: 'arp',
          role: 'chord',
          pattern: {
            resolution: 'slice',
            steps: [
              { offset: 0,     choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
              { offset: 0.166, choices: [{ weight: 1, action: { type: 'note', degree: 3 } }] },
              { offset: 0.333, choices: [{ weight: 1, action: { type: 'note', degree: 5 } }] },
              { offset: 0.5,   choices: [{ weight: 1, action: { type: 'note', degree: 1, octaveOffset: 1 } }] },
              { offset: 0.666, choices: [{ weight: 1, action: { type: 'note', degree: 5 } }] },
              { offset: 0.833, choices: [{ weight: 1, action: { type: 'note', degree: 3 } }] }
            ]
          }
        }
      ]
    },
  
    // 2. We Are The Champions - Queen (Power Pulse)
    {
      id: 'champions-style',
      name: 'Anthem 6/8',
      meterConstraint: { beatsPerBar: [6] },
      overrides: { timeSignature: { value: [6, 8], lock: true } },
      layers: [
        {
          id: 'heavy-bass',
          role: 'bass',
          pattern: {
            resolution: 'slice',
            steps: [
              { offset: 0,   choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
              { offset: 0.5, choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] }
            ]
          }
        },
        {
          id: 'chord-pulse',
          role: 'chord',
          pattern: {
            resolution: 'slice',
            steps: [
              { offset: 0,     choices: [{ weight: 1, action: { type: 'chord' } }] },
              { offset: 0.166, choices: [{ weight: 1, action: { type: 'chord' } }] },
              { offset: 0.333, choices: [{ weight: 1, action: { type: 'chord' } }] },
              { offset: 0.5,   choices: [{ weight: 1, action: { type: 'chord' } }] },
              { offset: 0.666, choices: [{ weight: 1, action: { type: 'chord' } }] },
              { offset: 0.833, choices: [{ weight: 1, action: { type: 'chord' } }] }
            ]
          }
        }
      ]
    },
  
    // 3. Nothing Else Matters - Metallica (Rock Arpeggio)
    {
      id: 'nothing-else-style',
      name: 'Dark 6/8 Arpeggio',
      meterConstraint: { beatsPerBar: [6] },
      overrides: { timeSignature: { value: [6, 8], lock: true } },
      layers: [
        {
          id: 'bass-low',
          role: 'bass',
          pattern: {
            resolution: 'slice',
            steps: [{ offset: 0, choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] }]
          }
        },
        {
          id: 'guitar-pick',
          role: 'chord',
          pattern: {
            resolution: 'slice',
            steps: [
              { offset: 0,     choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
              { offset: 0.166, choices: [{ weight: 1, action: { type: 'note', degree: 3 } }] },
              { offset: 0.333, choices: [{ weight: 1, action: { type: 'note', degree: 5 } }] },
              { offset: 0.5,   choices: [{ weight: 1, action: { type: 'note', degree: 1, octaveOffset: 1 } }] },
              { offset: 0.666, choices: [{ weight: 1, action: { type: 'note', degree: 5 } }] },
              { offset: 0.833, choices: [{ weight: 1, action: { type: 'note', degree: 3 } }] }
            ]
          }
        }
      ]
    },
  
    // 4. The Only Exception - Paramore (Lilting Folk)
    {
      id: 'exception-style',
      name: 'Folk 6/8 Strum',
      meterConstraint: { beatsPerBar: [6] },
      overrides: { timeSignature: { value: [6, 8], lock: true } },
      layers: [
        {
          id: 'bass-accent',
          role: 'bass',
          pattern: {
            resolution: 'slice',
            steps: [
              { offset: 0,   choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
              { offset: 0.5, choices: [{ weight: 1, action: { type: 'note', degree: 5 } }] }
            ]
          }
        },
        {
          id: 'strum',
          role: 'chord',
          pattern: {
            resolution: 'slice',
            steps: [
              { offset: 0,     choices: [{ weight: 1, action: { type: 'chord' } }] },
              { offset: 0.333, choices: [{ weight: 1, action: { type: 'chord' } }] },
              { offset: 0.5,   choices: [{ weight: 1, action: { type: 'chord' } }] },
              { offset: 0.833, choices: [{ weight: 1, action: { type: 'chord' } }] }
            ]
          }
        }
      ]
    },
  
    // 5. Love On The Brain - Rihanna (Doo-Wop Soul)
    {
      id: 'love-brain-style',
      name: 'Vintage 6/8 Soul',
      meterConstraint: { beatsPerBar: [6] },
      overrides: { timeSignature: { value: [6, 8], lock: true } },
      layers: [
        {
          id: 'soul-bass',
          role: 'bass',
          pattern: {
            resolution: 'slice',
            steps: [
              { offset: 0,     choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
              { offset: 0.416, choices: [{ weight: 1, action: { type: 'note', degree: 5 } }] }, // Anticipated hit
              { offset: 0.5,   choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] }
            ]
          }
        },
        {
          id: 'soul-stabs',
          role: 'chord',
          articulation: { length: 'staccato' },
          pattern: {
            resolution: 'slice',
            steps: [
              { offset: 0,     choices: [{ weight: 1, action: { type: 'chord' } }] },
              { offset: 0.166, choices: [{ weight: 1, action: { type: 'chord' } }] },
              { offset: 0.333, choices: [{ weight: 1, action: { type: 'chord' } }] },
              { offset: 0.5,   choices: [{ weight: 1, action: { type: 'chord' } }] },
              { offset: 0.666, choices: [{ weight: 1, action: { type: 'chord' } }] },
              { offset: 0.833, choices: [{ weight: 1, action: { type: 'chord' } }] }
            ]
          }
        }
      ]
    },
  
    // 6. Piano Man - Billy Joel (Classic Waltz)
    {
      id: 'piano-man-style',
      name: 'Ballad Waltz',
      meterConstraint: { beatsPerBar: [3] },
      overrides: { timeSignature: { value: [3, 4], lock: true } },
      feel: { accentPattern: [1, 0.75, 0.65], accentWeighting: 0.85 },
      layers: [
        {
          id: 'bass-root',
          role: 'bass',
          pattern: {
            resolution: 'slice',
            steps: [{ offset: 0, choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] }]
          }
        },
        {
          id: 'waltz-chords',
          role: 'chord',
          pattern: {
            resolution: 'slice',
            steps: [
              { offset: 0.333, choices: [{ weight: 1, action: { type: 'chord' } }] },
              { offset: 0.666, choices: [{ weight: 1, action: { type: 'chord' } }] }
            ]
          }
        }
      ]
    },
  
    // 7. Iris - Goo Goo Dolls (Fast Rock Waltz)
    {
      id: 'iris-style',
      name: 'Driving 3/4 Rock',
      meterConstraint: { beatsPerBar: [3] },
      layers: [
        {
          id: 'driving-bass',
          role: 'bass',
          pattern: {
            resolution: 'slice',
            steps: [
              { offset: 0,     choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
              { offset: 0.166, choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
              { offset: 0.333, choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
              { offset: 0.5,   choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
              { offset: 0.666, choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
              { offset: 0.833, choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] }
            ]
          }
        },
        {
          id: 'wash-chords',
          role: 'chord',
          pattern: {
            resolution: 'slice',
            steps: [
              { offset: 0,     choices: [{ weight: 1, action: { type: 'chord' } }] },
              { offset: 0.333, choices: [{ weight: 1, action: { type: 'chord' } }] },
              { offset: 0.666, choices: [{ weight: 1, action: { type: 'chord' } }] }
            ]
          }
        }
      ]
    },
  
    // 8. Perfect - Ed Sheeran (Modern Waltz)
    {
      id: 'perfect-style',
      name: 'Modern Pop Waltz',
      meterConstraint: { beatsPerBar: [3] },
      layers: [
        {
          id: 'bass-soft',
          role: 'bass',
          pattern: {
            resolution: 'slice',
            steps: [{ offset: 0, choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] }]
          }
        },
        {
          id: 'legato-arp',
          role: 'chord',
          articulation: { length: 'legato' },
          pattern: {
            resolution: 'slice',
            steps: [
              { offset: 0,     choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
              { offset: 0.166, choices: [{ weight: 1, action: { type: 'note', degree: 3 } }] },
              { offset: 0.333, choices: [{ weight: 1, action: { type: 'note', degree: 5 } }] },
              { offset: 0.5,   choices: [{ weight: 1, action: { type: 'chord' } }] }
            ]
          }
        }
      ]
    },
  
    // 9. The Times They Are A-Changin' - Bob Dylan (Folk 3/4)
    {
      id: 'dylan-style',
      name: 'Folk 3/4 Strum',
      meterConstraint: { beatsPerBar: [3] },
      feel: { accentPattern: [1, 0.78, 0.68], accentWeighting: 0.8 },
      layers: [
        {
          id: 'alternating-bass',
          role: 'bass',
          pattern: {
            resolution: 'slice',
            steps: [
              { offset: 0,     choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
              { offset: 0.666, choices: [{ weight: 1, action: { type: 'note', degree: 5 } }] }
            ]
          }
        },
        {
          id: 'folk-strum',
          role: 'chord',
          pattern: {
            resolution: 'slice',
            steps: [
              { offset: 0,     choices: [{ weight: 1, action: { type: 'chord' } }] },
              { offset: 0.333, choices: [{ weight: 1, action: { type: 'chord' } }] },
              { offset: 0.5,   choices: [{ weight: 1, action: { type: 'chord' } }] },
              { offset: 0.833, choices: [{ weight: 1, action: { type: 'chord' } }] }
            ]
          }
        }
      ]
    },
  
    // 10. A Thousand Years - Christina Perri (Cinematic Waltz)
    {
      id: 'thousand-years-style',
      name: 'Cinematic',
      meterConstraint: { beatsPerBar: [3] },
      feel: { accentPattern: [1, 0.75, 0.65], accentWeighting: 0.9 },
      layers: [
        {
          id: 'low-bass',
          role: 'bass',
          pattern: {
            resolution: 'slice',
            steps: [{ offset: 0, choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] }]
          }
        },
        {
          id: 'ascending-arp',
          role: 'chord',
          pattern: {
            resolution: 'slice',
            steps: [
              { offset: 0,     choices: [{ weight: 1, action: { type: 'note', degree: 1 } }] },
              { offset: 0.166, choices: [{ weight: 1, action: { type: 'note', degree: 3 } }] },
              { offset: 0.333, choices: [{ weight: 1, action: { type: 'note', degree: 5 } }] },
              { offset: 0.5,   choices: [{ weight: 1, action: { type: 'note', degree: 1, octaveOffset: 1 } }] },
              { offset: 0.666, choices: [{ weight: 1, action: { type: 'note', degree: 5 } }] },
              { offset: 0.833, choices: [{ weight: 1, action: { type: 'note', degree: 3 } }] }
            ]
          }
        }
      ]
    }  
];

/**
 * Get a style by its ID
 */
export function getStyleById(id: string): Style | undefined {
  return STYLES.find(style => style.id === id);
}

/**
 * Get all available styles
 */
export function getAllStyles(): Style[] {
  return STYLES;
}

/**
 * True if the style is valid for the given time signature.
 * Use the time signature numerator: 4 for 4/4, 3 for 3/4, 6 for 6/8 (not getTimingBeatsPerBar).
 * Meter-agnostic styles (no meterConstraint) are always compatible.
 */
export function isStyleCompatibleWithMeter(styleId: string, beatsPerBarOrNumerator: number): boolean {
  const style = getStyleById(styleId);
  if (!style) return false;
  if (!style.meterConstraint) return true;
  return style.meterConstraint.beatsPerBar.includes(beatsPerBarOrNumerator);
}

/**
 * Human-readable meter constraint label, e.g. "4/4 only" or "4/4, 3/4".
 * Returns null if style is meter-agnostic.
 */
function getTimeSigDisplay(beats: number, noteValue: number): string {
  return `${beats}/${noteValue}`;
}

export function getMeterConstraintLabel(style: Style): string | null {
  const mc = style.meterConstraint;
  if (!mc || mc.beatsPerBar.length === 0) return null;
  const ts = style.overrides?.timeSignature?.value;
  const parts = mc.beatsPerBar.map(b => {
    let nv = 4;
    if (ts && ts[0] === b) nv = ts[1];
    else if (b === 6) nv = 8;
    return getTimeSigDisplay(b, nv);
  });
  return parts.length === 1 ? `${parts[0]} only` : parts.join(', ');
}

/**
 * Short meter suffix for display after style name, e.g. "4/4" or "6/8".
 * Uses style overrides when present (e.g. 6/8 styles show "6/8" not "6/4").
 */
export function getMeterConstraintSuffix(style: Style): string | null {
  const mc = style.meterConstraint;
  if (!mc || mc.beatsPerBar.length === 0) return null;
  const ts = style.overrides?.timeSignature?.value;
  if (mc.beatsPerBar.length === 1 && ts && ts[0] === mc.beatsPerBar[0]) {
    return getTimeSigDisplay(ts[0], ts[1]);
  }
  return mc.beatsPerBar.map(b => {
    let nv = 4;
    if (ts && ts[0] === b) nv = ts[1];
    else if (b === 6) nv = 8; // 6 beats per bar is conventionally 6/8
    return getTimeSigDisplay(b, nv);
  }).join(', ');
}
