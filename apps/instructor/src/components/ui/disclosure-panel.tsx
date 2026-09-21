'use client';

import { Button } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import { PlusIcon, XIcon } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

/*
 * Keeps a creation form out of the way until it is wanted. Lists are the point
 * of a dashboard page, so the form opens on demand rather than permanently
 * pushing the list below the fold.
 */
export function DisclosurePanel({
  children,
  className,
  closeLabel,
  openLabel,
  title,
}: {
  children: ReactNode;
  className?: string;
  closeLabel: string;
  openLabel: string;
  title: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex justify-end">
        <Button
          aria-controls={panelId}
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
          type="button"
          variant={isOpen ? 'outline' : 'default'}
        >
          {isOpen ? (
            <XIcon aria-hidden="true" data-icon="inline-start" />
          ) : (
            <PlusIcon aria-hidden="true" data-icon="inline-start" />
          )}
          {isOpen ? closeLabel : openLabel}
        </Button>
      </div>
      {isOpen ? (
        <section
          aria-label={title}
          className="rounded-surface border border-border/80 bg-card p-4 sm:p-5"
          id={panelId}
        >
          <h2 className="mb-4 text-sm font-semibold text-foreground">{title}</h2>
          {children}
        </section>
      ) : null}
    </div>
  );
}
