import * as React from 'react';

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  return React.useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window.matchMedia !== 'function') {
        window.addEventListener('resize', onStoreChange);
        return () => window.removeEventListener('resize', onStoreChange);
      }
      const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
      mql.addEventListener('change', onStoreChange);
      return () => mql.removeEventListener('change', onStoreChange);
    },
    () => window.innerWidth < MOBILE_BREAKPOINT,
    () => false,
  );
}
