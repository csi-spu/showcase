'use client';

import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@showcase/ui/cn';
import type { MotionStyle, Transition } from 'motion/react';
import type { CSSProperties } from 'react';

interface BorderBeamProps {
  /** The size of the border beam. */
  size?: number;
  /** The duration of the border beam. */
  duration?: number;
  /** The delay of the border beam. */
  delay?: number;
  /** The color of the border beam from. */
  colorFrom?: string;
  /** The color of the border beam to. */
  colorTo?: string;
  /** The motion transition of the border beam. */
  transition?: Transition;
  /** The class name of the border beam. */
  className?: string;
  /** The style of the border beam. */
  style?: CSSProperties;
  /** Whether to reverse the animation direction. */
  reverse?: boolean;
  /** The initial offset position (0-100). */
  initialOffset?: number;
  /** The border width of the beam. */
  borderWidth?: number;
}

/**
 * An animated light beam travelling around a container's border. Colors
 * default to the app's own primary token rather than the component's
 * upstream orange/purple, so it reads as part of this design, not a demo.
 * Renders a static beam under `prefers-reduced-motion`.
 */
export function BorderBeam({
  borderWidth = 1,
  className,
  colorFrom = 'var(--primary)',
  colorTo = 'var(--primary-soft)',
  delay = 0,
  duration = 6,
  initialOffset = 0,
  reverse = false,
  size = 50,
  style,
  transition,
}: BorderBeamProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div
      className="pointer-events-none absolute inset-0 rounded-[inherit] border-(length:--border-beam-width) border-transparent mask-[linear-gradient(transparent,transparent),linear-gradient(#000,#000)] mask-intersect [mask-clip:padding-box,border-box]"
      style={
        {
          '--border-beam-width': `${borderWidth}px`,
        } as CSSProperties
      }
    >
      <motion.div
        animate={
          prefersReducedMotion === true
            ? { offsetDistance: `${initialOffset}%` }
            : {
                offsetDistance: reverse
                  ? [`${100 - initialOffset}%`, `${-initialOffset}%`]
                  : [`${initialOffset}%`, `${100 + initialOffset}%`],
              }
        }
        className={cn(
          'absolute aspect-square',
          'bg-linear-to-l from-(--color-from) via-(--color-to) to-transparent',
          className,
        )}
        initial={{ offsetDistance: `${initialOffset}%` }}
        style={
          {
            '--color-from': colorFrom,
            '--color-to': colorTo,
            offsetPath: `rect(0 auto auto 0 round ${size}px)`,
            width: size,
            ...style,
          } as MotionStyle
        }
        transition={{
          delay: -delay,
          duration,
          ease: 'linear',
          repeat: Infinity,
          ...transition,
        }}
      />
    </div>
  );
}
