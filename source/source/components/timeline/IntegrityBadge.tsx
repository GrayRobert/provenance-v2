'use client';

import { useState } from 'react';
import HelpText from '../shared/HelpText';

interface IntegrityBadgeProps {
  songId: string;
  onValidate: () => Promise<boolean>;
}

export default function IntegrityBadge({ songId, onValidate }: IntegrityBadgeProps) {
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [validating, setValidating] = useState(false);

  const handleValidate = async () => {
    setValidating(true);
    try {
      const result = await onValidate();
      setIsValid(result);
    } catch (error) {
      console.error('Validation failed', error);
      setIsValid(false);
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="bg-surface rounded-lg shadow border border-border p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center">
            <h3 className="text-base font-semibold text-foreground">
              Hash Chain Integrity
            </h3>
            <div onClick={(e) => e.stopPropagation()}>
              <HelpText trigger="icon">
                Each creative action is cryptographically linked to the one before it.
                If any event were changed, this verification would fail. This creates
                a tamper-evident record of your creative process.
              </HelpText>
            </div>
          </div>
          
          {isValid !== null && (
            <p
              className={`text-sm font-medium mt-2 ${
                isValid ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {isValid
                ? '✔ No events in this song\'s history have been altered'
                : '✗ Event chain validation failed - tampering detected'}
            </p>
          )}
        </div>
        
        <button
          onClick={handleValidate}
          disabled={validating}
          className="ml-4 px-4 py-2 bg-accent text-white text-sm rounded-md hover:bg-accent-hover disabled:opacity-50 disabled:bg-accent transition-colors"
        >
          {validating ? 'Validating...' : 'Validate Chain'}
        </button>
      </div>
    </div>
  );
}

