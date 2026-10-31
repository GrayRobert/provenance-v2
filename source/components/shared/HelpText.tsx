'use client';

import { useState } from 'react';

interface HelpTextProps {
  children: React.ReactNode;
  trigger?: 'icon' | 'link';
  triggerText?: string;
}

export default function HelpText({ 
  children, 
  trigger = 'link',
  triggerText = 'Learn more'
}: HelpTextProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="inline-block">
      {trigger === 'icon' ? (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="ml-1 text-gray-400 hover:text-gray-600 focus:outline-none"
          aria-label="Show help"
        >
          <svg
            className="w-4 h-4 inline"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </button>
      ) : (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs text-blue-600 hover:text-blue-700 focus:outline-none ml-2"
        >
          {triggerText}
        </button>
      )}
      
      {isExpanded && (
        <div className="mt-2 p-3 bg-blue-50 border border-blue-100 rounded-md text-sm text-gray-700">
          {children}
        </div>
      )}
    </div>
  );
}





