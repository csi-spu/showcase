'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { motion, useInView, useReducedMotion, type MotionProps } from 'motion/react';
import { cn } from '@showcase/ui/cn';

interface TypingAnimationProps extends Omit<MotionProps, 'children'> {
  blinkCursor?: boolean;
  children?: string;
  className?: string;
  cursorStyle?: 'block' | 'line' | 'underscore';
  delay?: number;
  deleteSpeed?: number;
  loop?: boolean;
  pauseDelay?: number;
  showCursor?: boolean;
  startOnView?: boolean;
  typeSpeed?: number;
  words?: readonly string[];
}

interface TypingState {
  charIndex: number;
  isDeleting: boolean;
  wordIndex: number;
}

const subscribeToClient = () => () => undefined;

export function TypingAnimation({
  blinkCursor = true,
  children,
  className,
  cursorStyle = 'line',
  delay = 0,
  deleteSpeed = 35,
  loop = false,
  pauseDelay = 1_400,
  showCursor = true,
  startOnView = true,
  typeSpeed = 70,
  words,
  ...props
}: TypingAnimationProps) {
  const elementRef = useRef<HTMLSpanElement | null>(null);
  const isInView = useInView(elementRef, { amount: 0.3, once: true });
  const isReducedMotion = useReducedMotion();
  const isClient = useSyncExternalStore(
    subscribeToClient,
    () => true,
    () => false,
  );
  const wordsToAnimate = useMemo(
    () => words ?? (children === undefined ? [] : [children]),
    [children, words],
  );
  const [state, setState] = useState<TypingState>({
    charIndex: 0,
    isDeleting: false,
    wordIndex: 0,
  });
  const safeWordIndex = wordsToAnimate.length === 0 ? 0 : state.wordIndex % wordsToAnimate.length;
  const currentWord = wordsToAnimate[safeWordIndex] ?? '';
  const graphemes = Array.from(currentWord);
  const isLastWord = safeWordIndex === wordsToAnimate.length - 1;
  const isFinished =
    !loop && isLastWord && !state.isDeleting && state.charIndex >= graphemes.length;
  const shouldAnimate = isClient && (startOnView ? isInView : true) && isReducedMotion === false;

  useEffect(() => {
    if (!shouldAnimate || wordsToAnimate.length === 0 || isFinished) return;

    const isInitialCharacter = state.wordIndex === 0 && state.charIndex === 0 && !state.isDeleting;
    const timeoutDelay = isInitialCharacter
      ? delay
      : state.isDeleting
        ? deleteSpeed
        : state.charIndex >= graphemes.length
          ? pauseDelay
          : typeSpeed;
    const timeout = window.setTimeout(() => {
      setState((current) => {
        if (!current.isDeleting && current.charIndex < graphemes.length) {
          return { ...current, charIndex: current.charIndex + 1 };
        }
        if (!current.isDeleting) return { ...current, isDeleting: true };
        if (current.charIndex > 0) return { ...current, charIndex: current.charIndex - 1 };
        return {
          charIndex: 0,
          isDeleting: false,
          wordIndex: (current.wordIndex + 1) % wordsToAnimate.length,
        };
      });
    }, timeoutDelay);

    return () => window.clearTimeout(timeout);
  }, [
    delay,
    deleteSpeed,
    graphemes.length,
    isFinished,
    pauseDelay,
    shouldAnimate,
    state.charIndex,
    state.isDeleting,
    state.wordIndex,
    typeSpeed,
    wordsToAnimate.length,
  ]);

  const displayedText =
    isClient && isReducedMotion === false
      ? graphemes.slice(0, state.charIndex).join('')
      : currentWord;
  const cursor = cursorStyle === 'block' ? '▌' : cursorStyle === 'underscore' ? '_' : '|';

  return (
    <motion.span
      className={cn('inline-block', className)}
      data-typing-animation="true"
      ref={elementRef}
      {...props}
    >
      {displayedText}
      {showCursor && shouldAnimate && !isFinished ? (
        <span className={cn('inline-block', blinkCursor && 'animate-blink-cursor')}>{cursor}</span>
      ) : null}
    </motion.span>
  );
}
