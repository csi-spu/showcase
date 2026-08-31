'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { cn } from '@showcase/ui/cn';

const AUTOPLAY_INTERVAL_MS = 6_000;

export interface ImageCarouselSlide {
  alt: string;
  dotLabel: string;
  src: string;
  srcSet: string;
}

/**
 * Fills its positioned parent (e.g. `relative inset-0`) with a cross-fading,
 * auto-playing image slideshow. Meant as a full-bleed backdrop layer, not a
 * bounded card — the caller owns sizing, rounding, and any scrim overlay.
 */
export function ImageCarousel({
  className,
  labels,
  slides,
}: {
  className?: string;
  labels: { next: string; previous: string };
  slides: ImageCarouselSlide[];
}) {
  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const isReducedMotion = useReducedMotion();
  const active = slides[index];

  useEffect(() => {
    if (isReducedMotion || isPaused || slides.length < 2) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, AUTOPLAY_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [isPaused, isReducedMotion, slides.length]);

  if (active === undefined) return null;

  function go(nextIndex: number) {
    setIndex(((nextIndex % slides.length) + slides.length) % slides.length);
  }

  return (
    <div
      className={cn('absolute inset-0 overflow-hidden', className)}
      onBlur={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.img
          alt={active.alt}
          animate={{ opacity: 1 }}
          className="absolute inset-0 size-full object-cover"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          key={active.src}
          src={active.src}
          srcSet={active.srcSet}
          transition={{ duration: isReducedMotion ? 0 : 0.7, ease: 'easeInOut' }}
        />
      </AnimatePresence>
      {slides.length > 1 ? (
        <>
          <CarouselButton
            aria-label={labels.previous}
            className="left-3"
            onClick={() => go(index - 1)}
          >
            <ChevronLeftIcon aria-hidden="true" className="size-5" />
          </CarouselButton>
          <CarouselButton
            aria-label={labels.next}
            className="right-3"
            onClick={() => go(index + 1)}
          >
            <ChevronRightIcon aria-hidden="true" className="size-5" />
          </CarouselButton>
          <div className="absolute inset-x-0 bottom-3 z-10 flex items-center justify-center gap-2">
            {slides.map((slide, slideIndex) => (
              <button
                aria-current={slideIndex === index}
                aria-label={slide.dotLabel}
                className={cn(
                  'size-2 rounded-full transition-colors duration-200',
                  slideIndex === index ? 'bg-white' : 'bg-white/40 hover:bg-white/70',
                )}
                key={slide.src}
                onClick={() => go(slideIndex)}
                type="button"
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function CarouselButton({
  children,
  className,
  ...props
}: React.ComponentProps<'button'> & { className: string }) {
  return (
    <button
      className={cn(
        'absolute top-1/2 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-black/35 text-white backdrop-blur-sm transition-transform duration-200 hover:-translate-y-1/2 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none',
        className,
      )}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}
