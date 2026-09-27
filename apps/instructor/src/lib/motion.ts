import type { CSSProperties } from 'react';

const ITEM_STAGGER_MILLISECONDS = 60;
/* Past this many items the rest arrive together, so a long list never lags. */
const MAX_ITEM_STAGGER_STEPS = 8;

/* Rises into place, one after another when given increasing delays. */
export const ENTRANCE_CLASS =
  'animate-in duration-500 fill-mode-both fade-in slide-in-from-bottom-2 motion-reduce:animate-none';

/* When the item at `index` starts, for animations that take a delay directly. */
export function staggerMilliseconds(index: number, baseMilliseconds = 0): number {
  return baseMilliseconds + Math.min(index, MAX_ITEM_STAGGER_STEPS) * ITEM_STAGGER_MILLISECONDS;
}

export function staggerDelay(index: number, baseMilliseconds = 0): CSSProperties {
  return { animationDelay: `${staggerMilliseconds(index, baseMilliseconds)}ms` };
}
