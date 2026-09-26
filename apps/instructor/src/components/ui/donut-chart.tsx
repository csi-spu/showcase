'use client';

import { cn } from '@showcase/ui/cn';
import { useState } from 'react';

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
const SEGMENT_STAGGER_MILLISECONDS = 120;

function percentOf(value: number, total: number): string {
  return total === 0 ? '0%' : `${Math.round((value / total) * 100)}%`;
}

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
 *
 * Pointing at a segment or its legend entry highlights it and puts its count
 * in the middle; pressing the legend entry keeps it highlighted.
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
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);
  const activeIndex = hoveredIndex ?? pinnedIndex;
  const active = activeIndex === null ? undefined : segments[activeIndex];
  let offset = 0;

  return (
    // Sized by its own box, not the viewport: in a narrow rail the legend goes
    // under the ring instead of pushing the column wider than the page.
    <div className="@container w-full">
      <figure
        aria-label={title}
        className="flex flex-col items-center gap-4 @sm:flex-row @sm:gap-5"
      >
        <div className="relative shrink-0">
          <svg aria-hidden="true" className="size-36 -rotate-90" viewBox="0 0 100 100">
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
              : segments.map((segment, index) => {
                  const length = (segment.value / total) * CIRCUMFERENCE;
                  const dash = `${length} ${CIRCUMFERENCE - length}`;
                  const segmentOffset = offset;
                  offset += length;
                  return (
                    <circle
                      className={cn(
                        'cursor-pointer transition-[opacity,stroke-width] duration-200 motion-reduce:transition-none',
                        DONUT_TONE_CLASSES[segment.tone],
                        activeIndex !== null && activeIndex !== index && 'opacity-25',
                      )}
                      cx="50"
                      cy="50"
                      data-animate="ring-draw"
                      fill="none"
                      key={segment.label}
                      onMouseEnter={() => setHoveredIndex(index)}
                      onMouseLeave={() => setHoveredIndex(null)}
                      r={RADIUS}
                      stroke="currentColor"
                      strokeDasharray={dash}
                      strokeDashoffset={-segmentOffset}
                      strokeWidth={activeIndex === index ? 15 : 12}
                      style={{ animationDelay: `${index * SEGMENT_STAGGER_MILLISECONDS}ms` }}
                    />
                  );
                })}
          </svg>
          {/* Keyed on what it shows, so switching segments replays the entrance. */}
          <span
            className="pointer-events-none absolute inset-0 flex animate-in flex-col items-center justify-center duration-200 fade-in zoom-in-90 motion-reduce:animate-none"
            key={activeIndex ?? 'total'}
          >
            <span
              className={cn(
                'text-3xl leading-none font-semibold tabular-nums',
                active === undefined ? 'text-foreground' : DONUT_TONE_CLASSES[active.tone],
              )}
            >
              {active === undefined ? total : active.value}
            </span>
            <span className="max-w-20 truncate text-xs text-muted-foreground">
              {active === undefined ? centerLabel : percentOf(active.value, total)}
            </span>
          </span>
        </div>

        <figcaption className="flex w-full min-w-0 flex-1 flex-col gap-1">
          {segments.map((segment, index) => (
            <button
              aria-pressed={pinnedIndex === index}
              className={cn(
                'flex w-full cursor-pointer items-center gap-2.5 rounded-control px-2 py-1.5 text-left text-sm transition-[background-color,opacity] duration-200 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none',
                pinnedIndex === index && 'bg-muted',
                activeIndex !== null && activeIndex !== index && 'opacity-60',
              )}
              key={segment.label}
              onBlur={() => setHoveredIndex(null)}
              onClick={() => setPinnedIndex((current) => (current === index ? null : index))}
              onFocus={() => setHoveredIndex(index)}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              type="button"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'size-2.5 shrink-0 rounded-full bg-current transition-transform duration-200 motion-reduce:transition-none',
                  DONUT_TONE_CLASSES[segment.tone],
                  activeIndex === index && 'scale-150',
                )}
              />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{segment.label}</span>
              <span className="shrink-0 font-medium tabular-nums text-foreground">
                {segment.value}
              </span>
              <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {percentOf(segment.value, total)}
              </span>
            </button>
          ))}
        </figcaption>
      </figure>
    </div>
  );
}
