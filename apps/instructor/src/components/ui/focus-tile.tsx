import { cn } from '@showcase/ui/cn';
import { ArrowUpRightIcon, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ENTRANCE_CLASS, staggerDelay } from '@/lib/motion';

const FOCUS_TONE_CLASSES = {
  information: 'bg-information-background text-information',
  primary: 'bg-primary-soft text-primary',
  success: 'bg-success-background text-success',
  warning: 'bg-warning-background text-warning',
} as const;

/**
 * One figure in a focus panel: a large number with its meaning directly under
 * it, which opens the place it is acted on when it has somewhere to go. Must
 * sit in a `ul`; it renders its own `li` so the tiles rise in order.
 */
export function FocusTile({
  delayIndex,
  hint,
  href,
  icon: Icon,
  isUrgent = false,
  label,
  tone,
  value,
}: {
  delayIndex: number;
  hint: string;
  href?: string;
  icon: LucideIcon;
  /** Pulses the icon, for the one tile that cannot wait. */
  isUrgent?: boolean;
  label: string;
  tone: keyof typeof FOCUS_TONE_CLASSES;
  value: ReactNode;
}) {
  const body = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span
          className={cn(
            'relative flex size-9 items-center justify-center rounded-full transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6 motion-reduce:transition-none motion-reduce:group-hover:transform-none',
            FOCUS_TONE_CLASSES[tone],
          )}
        >
          <Icon aria-hidden="true" className="size-4.5" />
          {isUrgent ? (
            <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-warning opacity-75 motion-reduce:hidden" />
              <span className="relative inline-flex size-2.5 rounded-full bg-warning" />
            </span>
          ) : null}
        </span>
        {href === undefined ? null : (
          <ArrowUpRightIcon
            aria-hidden="true"
            className="size-4 text-muted-foreground transition-[translate,color] duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary motion-reduce:transition-none"
          />
        )}
      </span>
      <span className="text-3xl leading-none font-semibold text-foreground">{value}</span>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="line-clamp-2 text-xs text-muted-foreground">{hint}</span>
      </span>
    </>
  );
  const tileClass =
    'group flex h-full flex-col gap-3 rounded-surface border border-border/80 bg-card/80 p-4 backdrop-blur-sm';

  return (
    <li className={ENTRANCE_CLASS} style={staggerDelay(delayIndex, 80)}>
      {href === undefined ? (
        <div className={tileClass}>{body}</div>
      ) : (
        <Link
          className={cn(
            tileClass,
            'outline-none transition-[translate,scale,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10 focus-visible:ring-2 focus-visible:ring-ring/50 active:translate-y-0 active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:translate-y-0',
          )}
          href={href}
        >
          {body}
        </Link>
      )}
    </li>
  );
}
