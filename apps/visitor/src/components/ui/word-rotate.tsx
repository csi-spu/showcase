'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion, type MotionProps } from 'motion/react';
import { cn } from '@showcase/ui/cn';

interface WordRotateProps {
  accessibleLabel: string;
  className?: string;
  duration?: number;
  motionProps?: MotionProps;
  words: readonly [string, ...string[]];
}

export function WordRotate({
  accessibleLabel,
  className,
  duration = 3000,
  motionProps = {
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: '0.35em' },
    initial: { opacity: 0, y: '-0.35em' },
    transition: { duration: 0.35, ease: 'easeOut' },
  },
  words,
}: WordRotateProps) {
  const [index, setIndex] = useState(0);
  const isReducedMotion = useReducedMotion();
  const reserveWord = words.reduce((longest, word) =>
    word.length > longest.length ? word : longest,
  );

  useEffect(() => {
    if (isReducedMotion !== false || words.length === 1) return;

    const interval = window.setInterval(() => {
      setIndex((currentIndex) => (currentIndex + 1) % words.length);
    }, duration);

    return () => window.clearInterval(interval);
  }, [duration, isReducedMotion, words]);

  return (
    <span className={cn('grid overflow-hidden', className)}>
      <span className="sr-only">{accessibleLabel}</span>
      <span aria-hidden="true" className="invisible col-start-1 row-start-1">
        {reserveWord}
      </span>
      <span aria-hidden="true" className="col-start-1 row-start-1">
        <AnimatePresence initial={false} mode="wait">
          <motion.span className="block" key={words[index]} {...motionProps}>
            {words[index]}
          </motion.span>
        </AnimatePresence>
      </span>
    </span>
  );
}
