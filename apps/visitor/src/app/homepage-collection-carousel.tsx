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
 * list stays stable, and are marked so they can be hidden from assistive
 * technology while staying fully interactive for pointer users.
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

/**
 * Keeps an `aria-hidden` slide out of the tab order.
 *
 * A focusable element inside an `aria-hidden` subtree is an accessibility fault:
 * keyboard focus lands somewhere a screen reader will not announce. Setting the
 * tab index on the rendered links removes that without disabling them, so the
 * repeat still responds to a click or an Enter press once focus reaches it by
 * pointer.
 */
function markSubtreeUntabbable(slide: HTMLDivElement | null) {
  if (!slide) return;

  for (const focusable of slide.querySelectorAll<HTMLElement>('a[href], button, [tabindex]')) {
    focusable.tabIndex = -1;
  }
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
            // A repeat is a duplicate of a card already in the document, so it is
            // hidden from assistive technology and kept out of the tab order.
            // `inert` would do both, but it also swallows pointer events, which
            // left every card past the first pass unclickable once the rail
            // scrolled. `aria-hidden` plus a negative tab index on the subtree
            // announces and focuses each work exactly once while leaving repeats
            // clickable wherever the loop happens to land.
            aria-hidden={slide.isRepeat || undefined}
            className={cn('pl-(--carousel-gap)', itemClassName)}
            key={slide.key}
            ref={slide.isRepeat ? markSubtreeUntabbable : undefined}
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
