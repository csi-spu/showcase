import * as React from 'react';
import { cn } from '@showcase/ui/cn';

/** A table always names its scroll region, so the keyboard stop it adds is announced. */
interface TableProps extends React.ComponentProps<'table'> {
  label: string;
}

function Table({ className, label, ...props }: TableProps) {
  return (
    /*
     * The scroll container is focusable and labelled. A table wider than the
     * viewport -- the matrix is, once a group has a few forms -- can otherwise
     * only be scrolled by dragging it, which leaves its right-hand columns
     * unreachable by keyboard (WCAG 2.1.1). `tabIndex` makes it scrollable with
     * the arrow keys, and a focusable region needs an accessible name and role
     * for that stop to mean something when it is announced.
     */
    <div
      aria-label={label}
      className="relative w-full overflow-x-auto rounded-surface border border-border/80 bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
      data-slot="table-container"
      role="region"
      tabIndex={0}
    >
      <table
        className={cn('w-full caption-bottom text-sm', className)}
        data-slot="table"
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return (
    <thead
      className={cn('bg-muted/70 [&_tr]:border-b', className)}
      data-slot="table-header"
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      className={cn('[&_tr:last-child]:border-0', className)}
      data-slot="table-body"
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      className={cn(
        'border-b border-border/80 transition-colors hover:bg-muted/35 motion-reduce:transition-none',
        className,
      )}
      data-slot="table-row"
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      className={cn(
        'h-11 px-4 text-left align-middle text-xs font-semibold tracking-wide text-muted-foreground',
        className,
      )}
      data-slot="table-head"
      scope="col"
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      className={cn('px-4 py-3.5 align-middle text-foreground', className)}
      data-slot="table-cell"
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption
      className={cn('mt-4 text-sm text-muted-foreground', className)}
      data-slot="table-caption"
      {...props}
    />
  );
}

export { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow };
