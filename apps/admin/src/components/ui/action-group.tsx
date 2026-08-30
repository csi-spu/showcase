import { cn } from '@showcase/ui/cn';
import type { ReactNode } from 'react';

export function ActionGroup({
  align = 'end',
  children,
  className,
}: {
  align?: 'end' | 'start';
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-control border border-border/70 bg-muted/40 p-1',
        align === 'end' ? 'justify-end' : 'justify-start',
        className,
      )}
    >
      {children}
    </div>
  );
}
