'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';

type ProvenanceLogoProps = {
  /** Optional wrapper className (e.g. flex items-center gap-2). */
  className?: string;
  /** Size of the icon in pixels. Default 48. */
  iconSize?: number;
  /** Use white icon (e.g. on amber background). Applies filter so SVG reads as white. */
  iconWhite?: boolean;
  /** Optional class for a wrapper around the icon only (e.g. amber box in admin sidebar). */
  iconWrapClassName?: string;
  /** Text to show next to icon. Default "Provenance". */
  text?: string;
  /** Hide the text (icon only). */
  hideText?: boolean;
  /** Optional subtitle below main text (e.g. "Admin Panel"). */
  subtitle?: string;
  /** Hide text when parent has group-data-[collapsible=icon] (sidebar collapsed). */
  collapseText?: boolean;
  /** Visual size of the text (icon size is separate). */
  size?: 'sm' | 'md' | 'lg';
};

const textSizeClass = {
  sm: 'text-base font-semibold',
  md: 'text-base font-semibold sm:text-lg',
  lg: 'text-3xl font-bold sm:text-4xl',
} as const;

export function ProvenanceLogo({
  className,
  iconSize = 35,
  iconWhite = false,
  iconWrapClassName,
  text = 'Provenance',
  hideText = false,
  subtitle,
  collapseText = false,
  size = 'md',
}: ProvenanceLogoProps) {
  const icon = (
    <Image
      src="/logo/8thnote_cropped.svg"
      alt=""
      width={iconSize}
      height={iconSize}
      className={cn('shrink-0', iconWhite && 'brightness-0 invert')}
      aria-hidden
    />
  );

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      {iconWrapClassName ? (
        <span className={cn('flex shrink-0 items-center justify-center', iconWrapClassName)}>
          {icon}
        </span>
      ) : (
        icon
      )}
      {!hideText && (
        <span
          className={cn(
            'flex flex-col',
            collapseText && 'group-data-[collapsible=icon]:hidden'
          )}
        >
          <span className={cn('leading-tight text-foreground', textSizeClass[size])}>
            {text}
          </span>
          {subtitle && (
            <span className="text-xs text-muted-foreground">{subtitle}</span>
          )}
        </span>
      )}
    </span>
  );
}
