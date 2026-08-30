import * as React from 'react';

const MOBILE_BREAKPOINT = 768;
const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function getMobileSnapshot() {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia(MOBILE_MEDIA_QUERY).matches
    : window.innerWidth < MOBILE_BREAKPOINT;
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window.matchMedia !== 'function') {
        window.addEventListener('resize', onStoreChange);
        return () => window.removeEventListener('resize', onStoreChange);
      }
      const mql = window.matchMedia(MOBILE_MEDIA_QUERY);
      mql.addEventListener('change', onStoreChange);
      return () => mql.removeEventListener('change', onStoreChange);
    },
    getMobileSnapshot,
    () => false,
  );
}
