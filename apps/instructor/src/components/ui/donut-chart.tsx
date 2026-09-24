import { cn } from '@showcase/ui/cn';

const DONUT_TONE_CLASSES = {
  information: 'text-information',
  muted: 'text-muted-foreground',
  success: 'text-success',
  warning: 'text-warning',
} as const;

export type DonutTone = keyof typeof DONUT_TONE_CLASSES;

export interface DonutSegment {
  label: string;
  tone: DonutTone;
  value: number;
}

/*
 * Geometry for a 100-unit viewBox. The circumference is what the dash array is
 * expressed in, so every segment is a length of it rather than a pixel size,
 * and the ring scales with whatever the container gives it.
 */
const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * A ring of proportions, with the total in the middle and a labelled legend.
 *
 * `total` is passed rather than summed from the segments: the dashboard's
 * denominator is the Students who hold an obligation, and a Student who holds
 * none belongs to no segment. Summing would silently redefine the chart.
 *
 * The ring is decorative -- `aria-hidden` -- because the legend beside it
 * already states every value in text. Announcing both would read each number
 * twice.
 */
export function DonutChart({
  centerLabel,
  segments,
  title,
  total,
}: {
  centerLabel: string;
  segments: DonutSegment[];
  /** Names the figure for screen readers. */
  title: string;
  total: number;
}) {
  let offset = 0;

  return (
    <figure aria-label={title} className="flex flex-col items-center gap-4 sm:flex-row sm:gap-5">
      <div className="relative shrink-0">
        <svg aria-hidden="true" className="size-32 -rotate-90" viewBox="0 0 100 100">
          <circle
            className="text-muted"
            cx="50"
            cy="50"
            fill="none"
            r={RADIUS}
            stroke="currentColor"
            strokeWidth="12"
          />
          {total === 0
            ? null
            : segments.map((segment) => {
                const length = (segment.value / total) * CIRCUMFERENCE;
                const dash = `${length} ${CIRCUMFERENCE - length}`;
                const segmentOffset = offset;
                offset += length;
                return (
                  <circle
                    className={DONUT_TONE_CLASSES[segment.tone]}
                    cx="50"
                    cy="50"
                    fill="none"
                    key={segment.label}
                    r={RADIUS}
                    stroke="currentColor"
                    strokeDasharray={dash}
                    strokeDashoffset={-segmentOffset}
                    strokeWidth="12"
                  />
                );
              })}
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl leading-none font-semibold tabular-nums text-foreground">
            {total}
          </span>
          <span className="text-xs text-muted-foreground">{centerLabel}</span>
        </span>
      </div>

      <figcaption className="flex min-w-0 flex-1 flex-col gap-2">
        {segments.map((segment) => (
          <span className="flex items-center gap-2.5 text-sm" key={segment.label}>
            <span
              aria-hidden="true"
              className={cn(
                'size-2.5 shrink-0 rounded-full bg-current',
                DONUT_TONE_CLASSES[segment.tone],
              )}
            />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{segment.label}</span>
            <span className="shrink-0 font-medium tabular-nums text-foreground">
              {segment.value}
            </span>
            <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {total === 0 ? '0%' : `${Math.round((segment.value / total) * 100)}%`}
            </span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
