'use client';

import { useRef, useSyncExternalStore } from 'react';
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
  type MotionProps,
  type UseInViewOptions,
  type Variants,
} from 'motion/react';

type MarginType = UseInViewOptions['margin'];

interface BlurFadeProps extends MotionProps {
  children: React.ReactNode;
  className?: string;
  variant?: { hidden: { y: number }; visible: { y: number } };
  duration?: number;
  delay?: number;
  offset?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
  inView?: boolean;
  inViewMargin?: MarginType;
  blur?: string;
}

const getFilter = (value: Variants[string]) =>
  typeof value === 'function' ? undefined : value.filter;
const subscribeToHydration = () => () => undefined;
const getHydratedSnapshot = () => true;
const getServerSnapshot = () => false;

export function BlurFade({
  children,
  className,
  variant,
  duration = 0.2,
  delay = 0,
  offset = 6,
  direction = 'down',
  inView = false,
  inViewMargin = '-50px',
  blur = '0px',
  ...props
}: BlurFadeProps) {
  const ref = useRef(null);
  const disabledRef = useRef(null);
  const isHydrated = useSyncExternalStore(
    subscribeToHydration,
    getHydratedSnapshot,
    getServerSnapshot,
  );
  const isReducedMotion = useReducedMotion();
  const canObserve = typeof IntersectionObserver !== 'undefined';
  const inViewResult = useInView(inView && canObserve ? ref : disabledRef, {
    once: true,
    margin: inViewMargin,
  });
  const isInView = !inView || !canObserve || inViewResult;
  const defaultVariants: Variants = {
    hidden: {
      [direction === 'left' || direction === 'right' ? 'x' : 'y']:
        direction === 'right' || direction === 'down' ? -offset : offset,
      opacity: 0,
      filter: `blur(${blur})`,
    },
    visible: {
      [direction === 'left' || direction === 'right' ? 'x' : 'y']: 0,
      opacity: 1,
      filter: 'blur(0px)',
    },
  };
  const combinedVariants = variant ?? defaultVariants;
  const hiddenFilter = getFilter(combinedVariants.hidden);
  const visibleFilter = getFilter(combinedVariants.visible);
  const shouldTransitionFilter =
    hiddenFilter != null && visibleFilter != null && hiddenFilter !== visibleFilter;

  return (
    <AnimatePresence>
      <motion.div
        animate={!isHydrated || isReducedMotion || isInView ? 'visible' : 'hidden'}
        className={className}
        exit="hidden"
        initial={false}
        ref={ref}
        transition={{
          delay: 0.04 + delay,
          duration: isReducedMotion ? 0 : duration,
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
