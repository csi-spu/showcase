'use client';

import { cn } from '@showcase/ui/cn';
import { type ReactNode } from 'react';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';

/**
 * Below this count a collection cannot fill the rail on a wide viewport, so the
 * leftover track reads as missing content rather than as scrollable overflow.
 */
const MIN_ITEMS_TO_FILL_RAIL = 4;

/**
 * Embla wraps by cloning slides, and it only does so once the track can cover the
 * viewport. A short collection therefore scrolls to a hard stop with dead track
 * beside the last card. Repeating the collection up to this many slides gives
 * Embla enough to clone, so the rail wraps instead of stranding the reader.
 */
const MIN_SLIDES_TO_LOOP = 12;

const CAROUSEL_OPTIONS = { align: 'start', containScroll: false, loop: true } as const;

/**
 * Repeats a short collection until the track is long enough for Embla to wrap.
 *
 * Repeats are presentational duplicates: they carry a distinct React key so the
 * list stays stable, and are hidden from assistive technology so each work is
 * still announced exactly once.
 */
function toLoopingSlides(items: { content: ReactNode; key: string }[]) {
  const passes = Math.ceil(MIN_SLIDES_TO_LOOP / items.length);

  return Array.from({ length: passes }, (_, pass) =>
    items.map((item) => ({
      content: item.content,
      isRepeat: pass > 0,
      key: `${item.key}:${pass}`,
    })),
  ).flat();
}

export interface CollectionCarouselLabels {
  next: string;
  previous: string;
  region: string;
}

/**
 * Horizontal rail for homepage collection cards.
 *
 * A collection long enough to overflow scrolls as a carousel. A shorter one
 * renders as a centered row capped to its own content width, so two cards read
 * as a deliberate pair instead of leaving a dead half-row to their right.
 */
export function HomepageCollectionCarousel({
  itemClassName,
  items,
  labels,
  shortItemClassName,
}: {
  itemClassName: string;
  items: { content: ReactNode; key: string }[];
  labels: CollectionCarouselLabels;
  shortItemClassName: string;
}) {
  if (items.length < MIN_ITEMS_TO_FILL_RAIL) {
    return (
      <ul
        className="mx-auto flex w-fit max-w-full list-none flex-wrap justify-center gap-5 p-0"
        data-featured-layout="short"
      >
        {items.map((item) => (
          <li className={cn('shrink-0 grow-0', shortItemClassName)} key={item.key}>
            {item.content}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Carousel
      aria-label={labels.region}
      className="group/rail [--carousel-gap:1.25rem]"
      data-featured-layout="carousel"
      opts={CAROUSEL_OPTIONS}
    >
      <CarouselContent className="ml-[calc(var(--carousel-gap)*-1)] py-1">
        {toLoopingSlides(items).map((slide) => (
          <CarouselItem
            className={cn('pl-(--carousel-gap)', itemClassName)}
            // `inert` hides repeats from assistive technology and from the tab
            // order together, so a duplicated card is never announced or focused
            // while the original stays fully reachable.
            inert={slide.isRepeat}
            key={slide.key}
          >
            {slide.content}
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious
        className="left-2 hidden size-11 border-none bg-black/55 text-white opacity-0 shadow-lg backdrop-blur-sm transition-opacity duration-200 group-hover/rail:opacity-100 hover:bg-black/75 hover:text-white focus-visible:opacity-100 sm:flex"
        aria-label={labels.previous}
      >
        <span className="sr-only">{labels.previous}</span>
      </CarouselPrevious>
      <CarouselNext
        className="right-2 hidden size-11 border-none bg-black/55 text-white opacity-0 shadow-lg backdrop-blur-sm transition-opacity duration-200 group-hover/rail:opacity-100 hover:bg-black/75 hover:text-white focus-visible:opacity-100 sm:flex"
        aria-label={labels.next}
      >
        <span className="sr-only">{labels.next}</span>
      </CarouselNext>
    </Carousel>
  );
}
