export interface NavigationScrollInput {
  currentY: number;
  isReducedMotion: boolean;
  previousY: number;
}

export interface NavigationScrollState {
  isAtTop: boolean;
  isVisible: boolean;
}

const TOP_THRESHOLD = 64;
const HIDE_THRESHOLD = 120;

export function deriveNavigationScrollState({
  currentY,
  isReducedMotion,
  previousY,
}: NavigationScrollInput): NavigationScrollState {
  if (currentY <= TOP_THRESHOLD) return { isAtTop: true, isVisible: true };

  if (isReducedMotion) return { isAtTop: false, isVisible: true };

  const isScrollingDown = currentY > previousY;

  return {
    isAtTop: false,
    isVisible: !isScrollingDown || currentY < HIDE_THRESHOLD,
  };
}
