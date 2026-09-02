'use client';

import type { CSSProperties } from 'react';
import { Toaster as SonnerToaster, type ToasterProps } from 'sonner';

function Toaster({ ...props }: ToasterProps) {
  return (
    <SonnerToaster
      className="toaster group"
      richColors
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--success-bg': 'var(--success-background)',
          '--success-text': 'var(--success)',
          '--success-border': 'var(--success)',
          '--warning-bg': 'var(--warning-background)',
          '--warning-text': 'var(--warning)',
          '--warning-border': 'var(--warning)',
          '--error-bg': 'var(--destructive-background)',
          '--error-text': 'var(--destructive)',
          '--error-border': 'var(--destructive)',
        } as CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: 'rounded-surface border font-sans shadow-lg',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
export { toast } from 'sonner';
