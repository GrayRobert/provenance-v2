'use client';

import { usePathname } from 'next/navigation';

const FILTER_ID = 'beta-corner-flash-ribbon-shadow-flat';

/**
 * Beta corner ribbon (top-right) for Provenance. Shown on home and main app;
 * hidden on /admin and when full-screen modals are open (modals use z-[100], this uses z-[70]; profile dropdown uses z-[80] so it opens above the badge).
 */
export function BetaCornerFlash() {
  const pathname = usePathname();
  if (pathname?.startsWith('/admin')) return null;

  return (
    <div
      className="fixed top-0 right-0 z-[70] w-[90px] h-[90px] pointer-events-none"
      aria-hidden
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 120 120"
        width="90"
        height="90"
        className="block"
      >
        <defs>
          <filter id={FILTER_ID} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="-2" dy="2" stdDeviation="3" floodOpacity="0.25" />
          </filter>
        </defs>

        <path
          d="M 0,0 L 120,0 L 120,120 Z"
          fill="#f6992c"
          filter={`url(#${FILTER_ID})`}
        />

        <g transform="translate(82, 38) rotate(45)">
          <text
            x="0"
            y="-2"
            fill="#ffffff"
            fontFamily="Arial, Helvetica, sans-serif"
            fontWeight="900"
            fontSize="14"
            textAnchor="middle"
            letterSpacing="1"
          >
            BETA
          </text>
          <text
            x="0"
            y="14"
            fill="#ffffff"
            fontFamily="Arial, Helvetica, sans-serif"
            fontWeight="900"
            fontSize="14"
            textAnchor="middle"
            letterSpacing="1"
          >
            VERSION
          </text>
        </g>
      </svg>
    </div>
  );
}
