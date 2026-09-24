/*
 * A completed-of-total bar. The numbers stay visible beside it: a bar alone
 * communicates "roughly half", and an Instructor chasing submissions needs the
 * count itself.
 */
export function ProgressBar({
  completed,
  label,
  total,
}: {
  completed: number;
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
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
