'use client';

import { cn } from '@showcase/ui/cn';
import { useEffect, useState } from 'react';

const COUNT_DURATION_MILLISECONDS = 900;

/*
 * A number that counts up to `value` once, so the eye is drawn to it as the
 * page settles. The moving digits are decorative: screen readers get the
 * final value once, from the visually hidden copy, rather than every frame.
 * Reduced motion shows the final value straight away.
 */
export function NumberTicker({
  className,
  suffix = '',
  value,
}: {
  className?: string;
  suffix?: string;
  value: number;
}) {
  const [shown, setShown] = useState(0);
  const decimals = Number.isInteger(value) ? 0 : 1;

  useEffect(() => {
    const shouldAnimate =
      typeof window.matchMedia === 'function' &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const startedAt = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = shouldAnimate
        ? Math.min((now - startedAt) / COUNT_DURATION_MILLISECONDS, 1)
        : 1;
      // Ease out, so the count slows as it lands on the real value.
      setShown(value * (1 - (1 - progress) ** 3));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <span className={cn('tabular-nums', className)}>
      <span aria-hidden="true">
        {shown.toFixed(decimals)}
        {suffix}
      </span>
      <span className="sr-only">
        {value.toFixed(decimals)}
        {suffix}
      </span>
    </span>
  );
}
