import type { ReactNode } from 'react';

export function ActionTooltip({ children, label }: { children: ReactNode; label: string }) {
  return (
    <span className="group/action relative inline-flex">
      {children}
      <span
        className="pointer-events-none absolute top-1/2 right-[calc(100%+0.5rem)] z-40 -translate-y-1/2 rounded-control bg-foreground px-2 py-1 text-xs whitespace-nowrap text-background opacity-0 shadow-sm transition-opacity group-focus-within/action:opacity-100 group-hover/action:opacity-100 motion-reduce:transition-none"
        role="tooltip"
      >
        {label}
      </span>
    </span>
  );
}
