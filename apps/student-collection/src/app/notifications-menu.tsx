'use client';

import { Popover } from '@base-ui/react/popover';
import { buttonVariants } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import { BellIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

/*
 * The header bell, opening the notification feed in place. The feed itself is
 * rendered on the server and passed in as children; only the open/closed state
 * lives here. Base UI supplies the focus handling, Escape, outside-click and
 * the dialog semantics, so the popup is labelled by the feed's own heading.
 */
export function NotificationsMenu({
  children,
  unreadCount,
}: {
  children: ReactNode;
  unreadCount: number;
}) {
  const t = useTranslations('Nav');

  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={
          unreadCount === 0 ? t('notifications') : t('notificationsUnread', { count: unreadCount })
        }
        className={cn(
          buttonVariants({ size: 'icon-sm', variant: 'ghost' }),
          'relative data-popup-open:bg-accent data-popup-open:text-accent-foreground',
        )}
      >
        <BellIcon
          aria-hidden="true"
          className="origin-top transition-transform duration-200 group-hover/button:rotate-12 group-data-popup-open/button:rotate-0 motion-reduce:transition-none"
        />
        {unreadCount === 0 ? null : (
          /* The count is already in the accessible name, so the badge is visual only. */
          <span aria-hidden="true" className="absolute -top-1 -right-1 flex">
            <span className="absolute inset-0 animate-ping rounded-full bg-destructive/40 motion-reduce:hidden" />
            <span className="relative flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-destructive px-1 text-[0.6875rem] leading-none font-semibold text-destructive-foreground tabular-nums">
              {unreadCount}
            </span>
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner align="end" className="z-50" collisionPadding={16} sideOffset={8}>
          <Popover.Popup
            aria-labelledby="notifications-heading"
            className="flex max-h-[min(32rem,var(--available-height))] w-[min(24rem,calc(100vw-2rem))] origin-(--transform-origin) flex-col overflow-hidden rounded-surface border border-border bg-popover text-popover-foreground shadow-[0_1.5rem_3.5rem_-1.5rem_rgba(22,22,22,0.28)] outline-none transition duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none"
          >
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
