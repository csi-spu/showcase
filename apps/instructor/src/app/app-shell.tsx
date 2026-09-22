import { ChevronRightIcon } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { GridPattern } from '@/components/ui/grid-pattern';
import { AppNav, AppNavBar, type NavItem } from './app-nav';
import { HeaderLogoutButton } from './header-logout-button';
import { logoutAction } from './instructor-auth.actions';

export interface Breadcrumb {
  href?: string;
  label: string;
}

async function getNavItems(): Promise<NavItem[]> {
  const t = await getTranslations('Nav');
  return [
    { href: '/rounds', icon: 'calendarRange', label: t('rounds') },
    { href: '/templates', icon: 'layoutTemplate', label: t('templates') },
  ];
}

/*
 * CSI is the lead mark on every signed-in screen. SIT is paired with it on the
 * sign-in page, where there is room; here the shell is only 17rem wide, so
 * carrying both marks would truncate the app name beside them.
 */
function BrandMark({ label }: { label: string }) {
  return (
    <Link className="flex min-w-0 items-center gap-2.5" href="/rounds">
      <Image
        alt="ตราสัญลักษณ์ CSI"
        className="h-auto w-[5.5rem] shrink-0"
        height={363}
        priority
        sizes="88px"
        src="/brand/csi-computer-science-software-development-innovation.png"
        width={1280}
      />
      <span className="truncate text-sm font-semibold tracking-tight text-foreground">{label}</span>
    </Link>
  );
}

function Breadcrumbs({ label, trail }: { label: string; trail: Breadcrumb[] }) {
  if (trail.length === 0) return null;

  return (
    <nav aria-label={label} className="flex min-w-0 items-center gap-1 text-sm">
      {trail.map((crumb, index) => (
        <span
          className="flex min-w-0 items-center gap-1"
          key={`${crumb.label}-${crumb.href ?? ''}`}
        >
          {index === 0 ? null : (
            <ChevronRightIcon
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground"
            />
          )}
          {crumb.href ? (
            <Link
              className="truncate text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none"
              href={crumb.href}
            >
              {crumb.label}
            </Link>
          ) : (
            <span aria-current="page" className="truncate font-medium text-foreground">
              {crumb.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

/*
 * The dashboard frame: a persistent sidebar on desktop, a top bar plus a
 * scrollable nav strip on small screens. Pages only supply their breadcrumb
 * trail and content, so navigation never differs between screens.
 */
export async function AppShell({
  children,
  trail = [],
}: {
  children: ReactNode;
  trail?: Breadcrumb[];
}) {
  const [t, navItems] = await Promise.all([getTranslations('Nav'), getNavItems()]);

  return (
    <div className="app-canvas relative isolate min-h-svh lg:grid lg:grid-cols-[var(--app-sidebar-width)_1fr]">
      {/*
       * Decoration only. The mask fades the grid out below the fold so it
       * never competes with the tables and cards further down the page. A
       * phone has no margin to spare, so the grid is dropped there rather than
       * drawn across the page heading.
       */}
      <GridPattern className="fixed hidden sm:block [mask-image:radial-gradient(56rem_36rem_at_70%_0%,black,transparent)]" />
      <aside
        aria-label={t('sidebarLabel')}
        className="app-sidebar sticky top-0 z-10 hidden h-svh flex-col gap-6 px-4 py-5 lg:flex"
      >
        <BrandMark label={t('brand')} />
        <AppNav items={navItems} />
      </aside>

      <div className="relative z-10 flex min-w-0 flex-col">
        <header className="app-topbar sticky top-0 z-10 border-b border-border/70">
          <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <span className="lg:hidden">
                <BrandMark label={t('brand')} />
              </span>
              <span className="hidden min-w-0 lg:block">
                <Breadcrumbs label={t('breadcrumbLabel')} trail={trail} />
              </span>
            </div>
            <HeaderLogoutButton action={logoutAction} />
          </div>
          <AppNavBar items={navItems} />
          {trail.length === 0 ? null : (
            <div className="border-t border-border/60 px-4 py-2 sm:px-6 lg:hidden">
              <Breadcrumbs label={t('breadcrumbLabel')} trail={trail} />
            </div>
          )}
        </header>

        <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
