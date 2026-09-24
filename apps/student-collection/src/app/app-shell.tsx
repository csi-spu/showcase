import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { GridPattern } from '@/components/ui/grid-pattern';
import { HeaderLogoutButton } from './header-logout-button';
import { logoutAction } from './student-collection-auth.actions';

/*
 * The signed-in frame. Student Collection has a single destination today, so
 * it carries a top bar rather than a sidebar -- the same tokens, spacing and
 * header behaviour as Instructor, without navigation that would lead nowhere.
 */
export async function AppShell({ children }: { children: ReactNode }) {
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
      <header className="app-topbar sticky top-0 z-10 border-b border-border/70">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <Image
              alt="ตราสัญลักษณ์ CSI"
              className="h-auto w-24 shrink-0"
              height={363}
              priority
              sizes="96px"
              src="/brand/csi-computer-science-software-development-innovation.png"
              width={1280}
            />
            <span className="truncate text-sm font-semibold tracking-tight text-foreground">
              {t('brand')}
            </span>
          </div>
          <HeaderLogoutButton action={logoutAction} />
        </div>
      </header>
      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
