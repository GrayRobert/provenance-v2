'use client';

import { useState } from 'react';
import { Guitar } from 'lucide-react';
import { TUNINGS } from '@/lib/chord-builder/chord-utils';
import { Note } from '@tonaljs/tonal';

interface TuningSelectorProps {
  currentTuning: string[];
  tuningName: string;
  onTuningChange: (tuning: string[], name: string) => void;
}

export default function TuningSelector({
  currentTuning,
  tuningName,
  onTuningChange,
}: TuningSelectorProps) {
  const [isCustom, setIsCustom] = useState(false);
  const [customNotes, setCustomNotes] = useState<string[]>(currentTuning);

  const handlePresetChange = (name: string) => {
    const tuning = TUNINGS[name];
    if (tuning) {
      setIsCustom(false);
      setCustomNotes(tuning);
      onTuningChange(tuning, name);
    }
  };

  const handleCustomNoteChange = (index: number, value: string) => {
    const trimmed = value.trim();
    const newNotes = [...customNotes];
    newNotes[index] = trimmed;
    setCustomNotes(newNotes);

    const allValid = newNotes.every((n) => {
      const midi = Note.midi(n);
      return midi !== null && midi !== undefined;
    });

    if (allValid) {
      onTuningChange(newNotes, 'Custom');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="tuning-select" className="flex items-center text-muted" title="Tuning">
          <Guitar className="w-4 h-4" aria-hidden />
          <span className="sr-only">Tuning</span>
        </label>
        <select
          id="tuning-select"
          value={isCustom ? '__custom__' : tuningName}
          onChange={(e) => {
            if (e.target.value === '__custom__') {
              setIsCustom(true);
            } else {
              handlePresetChange(e.target.value);
            }
          }}
          className="bg-surface text-foreground text-sm rounded-md px-3 py-1.5 border border-border focus:outline-none focus:ring-2 focus:ring-accent"
        >
          {Object.keys(TUNINGS).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          <option value="__custom__">Custom</option>
        </select>
      </div>

      {isCustom && (
        <div className="flex items-center gap-1.5">
          {customNotes.map((note, i) => (
            <input
              key={i}
              type="text"
              value={note}
              onChange={(e) => handleCustomNoteChange(i, e.target.value)}
              className="w-12 bg-surface text-foreground text-xs text-center rounded px-1 py-1 border border-border focus:outline-none focus:ring-2 focus:ring-accent font-mono"
              placeholder={`S${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
