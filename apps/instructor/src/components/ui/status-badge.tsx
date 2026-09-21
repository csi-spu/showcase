import { cn } from '@showcase/ui/cn';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/*
 * Tones follow the convention documented in globals.css. Components pick a
 * tone by meaning, never by colour name, so a palette change stays in one file.
 */
const STATUS_TONE_CLASSES = {
  information: 'bg-information-background text-information',
  muted: 'bg-muted text-muted-foreground',
  primary: 'bg-primary-soft text-accent-foreground',
  success: 'bg-success-background text-success',
  warning: 'bg-warning-background text-warning',
  destructive: 'bg-destructive-background text-destructive',
} as const;

export type StatusTone = keyof typeof STATUS_TONE_CLASSES;

export function StatusBadge({
  children,
  className,
  icon: Icon,
  tone,
}: {
  children: ReactNode;
  className?: string;
  icon?: LucideIcon;
  tone: StatusTone;
}) {
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        STATUS_TONE_CLASSES[tone],
        className,
      )}
    >
      {Icon ? <Icon aria-hidden="true" className="size-3.5 shrink-0" /> : null}
      {children}
    </span>
  );
}
