import { UserRoundIcon } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { GridPattern } from '@/components/ui/grid-pattern';
import type { StudentCollectionNotificationFeed } from '@/lib/student-collection-forms-contract';
import { HeaderLogoutButton } from './header-logout-button';
import { NotificationsMenu } from './notifications-menu';
import { NotificationsPanel } from './notifications-panel';
import { logoutAction } from './student-collection-auth.actions';

/*
 * The signed-in frame. Student Collection has a single destination today, so
 * it carries a top bar rather than a sidebar -- the same tokens, spacing and
 * header behaviour as Instructor, without navigation that would lead nowhere.
 */
export async function AppShell({
  children,
  notifications,
  studentName,
}: {
  children: ReactNode;
  /**
   * The Student's notification feed, opened from the header bell. Pages that
   * do not read the feed omit it, and the bell is left out with it.
   */
  notifications?: {
    feed: StudentCollectionNotificationFeed;
    markReadAction: () => Promise<void>;
  };
  /**
   * The signed-in Student's Roster name, for the header chip. Never the
   * Student ID: Core keeps only a keyed hash of it, so no read path can
   * return one to show here.
   */
  studentName?: string;
}) {
  const t = await getTranslations('Nav');

  return (
    <div className="app-canvas relative isolate flex min-h-svh flex-col">
      {/*
       * Decoration only. This page centres a narrow column on a wide canvas and
       * its cards are translucent, so the mask is anchored past the right edge
       * of that column -- the grid reads in the margin and never shows through
       * the content. A phone has no such margin, so the grid is dropped there
       * rather than drawn across the text.
       */}
      <GridPattern className="fixed hidden sm:block [mask-image:radial-gradient(40rem_28rem_at_100%_0%,black,transparent)]" />
      <header className="app-topbar sticky top-0 z-20 border-b border-border/70">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
          <Link aria-label={t('brand')} className="flex shrink-0 items-center" href="/">
            <Image
              alt="ตราสัญลักษณ์ CSI"
              className="size-10 shrink-0 sm:size-11"
              height={512}
              priority
              sizes="44px"
              src="/brand/csi-compact-mark.png"
              width={512}
            />
          </Link>
          <div className="flex min-w-0 shrink-0 items-center gap-1 sm:gap-2">
            {notifications === undefined ? null : (
              <NotificationsMenu unreadCount={notifications.feed.unreadCount}>
                <NotificationsPanel
                  markReadAction={notifications.markReadAction}
                  notifications={notifications.feed.notifications}
                  unreadCount={notifications.feed.unreadCount}
                />
              </NotificationsMenu>
            )}
            {studentName === undefined ? null : (
              <span className="hidden min-w-0 items-center gap-2 border-l border-border/70 pl-2 sm:flex sm:pl-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <UserRoundIcon aria-hidden="true" className="size-4" />
                </span>
                <span className="min-w-0 max-w-32 truncate text-sm font-medium text-foreground">
                  {studentName}
                </span>
              </span>
            )}
            <HeaderLogoutButton action={logoutAction} />
          </div>
        </div>
      </header>
      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
