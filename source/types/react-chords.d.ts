declare module '@tombatossals/react-chords/lib/Chord' {
  import { ComponentType } from 'react';
  interface ChordProps {
    chord: {
      frets: number[];
      fingers?: number[];
      barres?: number[];
      capo?: boolean;
      baseFret?: number;
    };
    instrument: {
      strings: number;
      fretsOnChord: number;
      name: string;
      keys?: string[];
      tunings: { standard: string[] };
    };
    lite?: boolean;
  }
  const Chord: ComponentType<ChordProps>;
  export default Chord;
}
