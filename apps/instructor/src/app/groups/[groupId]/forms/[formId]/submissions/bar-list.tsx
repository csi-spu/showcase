'use client';

import { cn } from '@showcase/ui/cn';
import Link from 'next/link';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { staggerDelay } from '@/lib/motion';

export interface Bar {
  /** Names a linked bar for assistive technology; unlinked bars read their text. */
  ariaLabel?: string;
  count: number;
  href?: string;
  id: string;
  isMuted?: boolean;
  label: string;
  tooltip: string;
  /** The figure shown beside the bar. */
  value: string;
}

const ROW_CLASS =
  'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-control px-2 py-1.5 text-sm outline-none transition-[background-color,scale] duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto]';

/**
 * Horizontal bars drawn with CSS, one per value.
 *
 * Every bar is focusable and shows its figures in a tooltip; the same figures
 * are also written beside it, so nothing depends on hovering. The drawn bar
 * itself is decorative. A bar with an `href` is a link to the answers behind it.
 */
export function BarList({
  bars,
  denominator,
  label,
}: {
  bars: Bar[];
  /** What a full-width bar stands for. */
  denominator: number;
  label: string;
}) {
  return (
    <ul aria-label={label} className="flex list-none flex-col gap-0.5 p-0">
      {bars.map((bar, index) => {
        const width = denominator === 0 ? 0 : Math.min(100, (bar.count / denominator) * 100);
        const trigger =
          bar.href === undefined ? (
            <div className={ROW_CLASS} tabIndex={0} />
          ) : (
            <Link
              aria-label={bar.ariaLabel}
              className={cn(ROW_CLASS, 'cursor-pointer active:scale-[0.99]')}
              href={bar.href}
            />
          );
        return (
          <li key={bar.id}>
            <Tooltip>
              <TooltipTrigger render={trigger}>
                <span
                  className={cn(
                    'order-1 truncate',
                    bar.isMuted ? 'text-muted-foreground italic' : 'text-foreground',
                  )}
                >
                  {bar.label}
                </span>
                <span className="order-2 text-right text-muted-foreground tabular-nums sm:order-3">
                  {bar.value}
                </span>
                <span
                  aria-hidden="true"
                  className="order-3 col-span-2 h-2.5 overflow-hidden rounded-full bg-muted sm:order-2 sm:col-span-1"
                >
                  <span
                    className={cn(
                      'block h-full origin-left rounded-full',
                      bar.isMuted ? 'bg-muted-foreground/50' : 'bg-primary',
                    )}
                    data-animate="bar-grow-x"
                    style={{ width: `${width}%`, ...staggerDelay(index) }}
                  />
                </span>
              </TooltipTrigger>
              <TooltipContent>{bar.tooltip}</TooltipContent>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}
