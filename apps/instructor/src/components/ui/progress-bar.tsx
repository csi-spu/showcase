import { cn } from '@showcase/ui/cn';

/*
 * A completed-of-total bar. The numbers stay visible beside it: a bar alone
 * communicates "roughly half", and an Instructor chasing submissions needs the
 * count itself.
 */
export function ProgressBar({
  className,
  completed,
  delayMilliseconds = 0,
  label,
  total,
}: {
  /** Sizing, such as a taller bar where it leads a section. */
  className?: string;
  completed: number;
  /** Staggers the fill when several bars draw in together. */
  delayMilliseconds?: number;
  /** Names the bar for screen readers, e.g. the form it belongs to. */
  label: string;
  total: number;
}) {
  /* A form with no obligations yet is 0%, not a division by zero. */
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  return (
    <div
      aria-label={label}
      aria-valuemax={total}
      aria-valuemin={0}
      aria-valuenow={completed}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
      role="progressbar"
    >
      {/* A finished bar turns to the success tone, so a complete form reads as
          done at a glance rather than as "almost full". */}
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none',
          total > 0 && completed >= total ? 'bg-success' : 'bg-primary',
        )}
        data-animate="progress-fill"
        style={{ animationDelay: `${delayMilliseconds}ms`, width: `${percent}%` }}
      />
    </div>
  );
}
