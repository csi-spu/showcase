import { cn } from '@showcase/ui/cn';
import type { LucideIcon } from 'lucide-react';

const STAT_TONE_CLASSES = {
  information: 'bg-information-background text-information',
  muted: 'bg-muted text-muted-foreground',
  primary: 'bg-primary-soft text-accent-foreground',
  success: 'bg-success-background text-success',
} as const;

export type StatTone = keyof typeof STAT_TONE_CLASSES;

/*
 * A single metric tile. Numbers lead, the label explains -- the reverse of the
 * old layout, where a metric was buried inside a sentence.
 */
export function StatCard({
  hint,
  icon: Icon,
  label,
  tone = 'muted',
  value,
}: {
  hint?: string;
  icon: LucideIcon;
  label: string;
  tone?: StatTone;
  value: number | string;
}) {
  return (
    <div className="flex min-h-24 items-center gap-3.5 rounded-surface border border-border/80 bg-card px-4 py-3.5">
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full',
          STAT_TONE_CLASSES[tone],
        )}
      >
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-2xl leading-none font-semibold tabular-nums text-foreground">
          {value}
        </span>
        <span className="truncate text-sm text-muted-foreground">{label}</span>
        {hint ? <span className="truncate text-xs text-muted-foreground">{hint}</span> : null}
      </span>
    </div>
  );
}
