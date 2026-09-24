'use client';

import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react';
import { useRef } from 'react';
import type { MotionProps, UseInViewOptions, Variants } from 'motion/react';
import type { ReactNode } from 'react';

type MarginType = UseInViewOptions['margin'];

interface BlurFadeProps extends MotionProps {
  children: ReactNode;
  className?: string;
  variant?: {
    hidden: { y: number };
    visible: { y: number };
  };
  duration?: number;
  delay?: number;
  offset?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
  inView?: boolean;
  inViewMargin?: MarginType;
  blur?: string;
}

function getFilter(v: Variants[string]) {
  return typeof v === 'function' ? undefined : v.filter;
}

/**
 * Fades content in on mount (or on scroll into view). Skips the motion
 * entirely under `prefers-reduced-motion`, showing the final state at once.
 */
export function BlurFade({
  blur = '6px',
  children,
  className,
  delay = 0,
  direction = 'down',
  duration = 0.4,
  inView = false,
  inViewMargin = '-50px',
  offset = 6,
  variant,
  ...props
}: BlurFadeProps) {
  const ref = useRef(null);
  const inViewResult = useInView(ref, { margin: inViewMargin, once: true });
  const isInView = !inView || inViewResult;
  const prefersReducedMotion = useReducedMotion();

  const defaultVariants: Variants = {
    hidden: {
      [direction === 'left' || direction === 'right' ? 'x' : 'y']:
        direction === 'right' || direction === 'down' ? -offset : offset,
      filter: `blur(${blur})`,
      opacity: 0,
    },
    visible: {
      [direction === 'left' || direction === 'right' ? 'x' : 'y']: 0,
      filter: `blur(0px)`,
      opacity: 1,
    },
  };
  const combinedVariants = variant ?? defaultVariants;

  if (prefersReducedMotion === true) {
    return (
      <div className={className} ref={ref}>
        {children}
      </div>
    );
  }

  const hiddenFilter = getFilter(combinedVariants.hidden);
  const visibleFilter = getFilter(combinedVariants.visible);
  const shouldTransitionFilter =
    hiddenFilter !== undefined && visibleFilter !== undefined && hiddenFilter !== visibleFilter;

  return (
    <AnimatePresence>
      <motion.div
        animate={isInView ? 'visible' : 'hidden'}
        className={className}
        exit="hidden"
        initial="hidden"
        ref={ref}
        transition={{
          delay: 0.04 + delay,
          duration,
          ease: 'easeOut',
          ...(shouldTransitionFilter ? { filter: { duration } } : {}),
        }}
        variants={combinedVariants}
        {...props}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
