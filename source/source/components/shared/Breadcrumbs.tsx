'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export type BreadcrumbItem = {
  href?: string;
  label: string;
  icon?: React.ReactNode;
};

type BreadcrumbsProps = {
  items: BreadcrumbItem[];
  className?: string;
};

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={cn('flex items-center gap-1.5 text-sm', className)}>
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        const content = (
          <>
            {item.icon && (
              <span className="shrink-0 text-muted-foreground [&_svg]:size-4" aria-hidden>
                {item.icon}
              </span>
            )}
            <span
              className={cn('hidden sm:inline', isLast && 'font-medium text-foreground')}
              title={item.label}
            >
              {item.label}
            </span>
          </>
        );

        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && (
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
                title={item.label}
              >
                {content}
              </Link>
            ) : (
              <span className="flex items-center gap-1.5" title={item.label}>
                {content}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
