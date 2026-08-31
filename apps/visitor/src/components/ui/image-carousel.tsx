'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { cn } from '@showcase/ui/cn';

const AUTOPLAY_INTERVAL_MS = 5_000;

export interface ImageCarouselSlide {
  alt: string;
  dominantColor: string;
  dotLabel: string;
  height: number;
  src: string;
  srcSet: string;
  width: number;
}

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
  const [direction, setDirection] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const isReducedMotion = useReducedMotion();
  const active = slides[index];

  useEffect(() => {
    if (isReducedMotion || isPaused || slides.length < 2) return;
    const timer = window.setInterval(() => {
      setDirection(1);
      setIndex((current) => (current + 1) % slides.length);
    }, AUTOPLAY_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [isPaused, isReducedMotion, slides.length]);

  if (active === undefined) return null;

  function go(nextIndex: number) {
    setDirection(nextIndex > index ? 1 : -1);
    setIndex(((nextIndex % slides.length) + slides.length) % slides.length);
  }

  return (
    <div
      className={cn('overflow-hidden rounded-media border border-border bg-muted', className)}
      onBlur={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="relative aspect-[16/10]" style={{ backgroundColor: active.dominantColor }}>
        <AnimatePresence custom={direction} initial={false} mode="wait">
          <motion.img
            alt={active.alt}
            animate={{ opacity: 1, x: 0 }}
            className="absolute inset-0 size-full object-contain"
            exit={{ opacity: 0, x: direction * -32 }}
            height={active.height}
            initial={{ opacity: 0, x: direction * 32 }}
            key={active.src}
            src={active.src}
            srcSet={active.srcSet}
            transition={{ duration: isReducedMotion ? 0 : 0.35, ease: 'easeOut' }}
            width={active.width}
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
          </>
        ) : null}
      </div>
      {slides.length > 1 ? (
        <div className="flex items-center justify-center gap-2 py-3">
          {slides.map((slide, slideIndex) => (
            <button
              aria-current={slideIndex === index}
              aria-label={slide.dotLabel}
              className={cn(
                'size-2 rounded-full transition-colors duration-200',
                slideIndex === index ? 'bg-primary' : 'bg-border hover:bg-primary/50',
              )}
              key={slide.src}
              onClick={() => go(slideIndex)}
              type="button"
            />
          ))}
        </div>
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
        'absolute top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-border bg-background/90 text-foreground shadow-sm backdrop-blur-sm transition-transform duration-200 hover:-translate-y-1/2 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
        className,
      )}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}
