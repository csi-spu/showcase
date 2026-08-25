import { cn } from '@showcase/ui/cn';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { logoutAction } from './admin-auth.actions';
import { LogoutForm } from './admin-auth-forms';

type AdminWorkspacePage = 'account-controls' | 'reviews' | 'roster';

export async function AdminWorkspaceShell({
  activePage,
  children,
}: {
  activePage: AdminWorkspacePage;
  children: ReactNode;
}) {
  const [accountControlsT, reviewT, rosterT] = await Promise.all([
    getTranslations('AccountControls'),
    getTranslations('Review'),
    getTranslations('Roster'),
  ]);

  return (
    <main className="mx-auto grid min-h-svh w-full max-w-[1440px] bg-background lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
      <aside className="flex min-h-28 flex-col justify-between border-b border-border bg-background p-6 text-foreground lg:sticky lg:top-0 lg:h-svh lg:min-h-0 lg:self-start lg:border-r lg:border-b-0 lg:p-8">
        <div className="flex flex-col gap-3">
          <span aria-hidden="true" className="h-1 w-12 bg-primary" />
          <p className="text-sm font-semibold tracking-[0.18em]">STUDENT SHOWCASE</p>
          <p className="text-sm text-muted-foreground">ADMIN WORKSPACE</p>
          <nav aria-label="เมนูผู้ดูแล" className="mt-6">
            <ul className="flex flex-col gap-1 text-sm font-medium">
              <NavigationItem
                href="/reviews"
                isActive={activePage === 'reviews'}
                label={reviewT('navigation')}
              />
              <NavigationItem
                href="/"
                isActive={activePage === 'roster'}
                label={rosterT('navigation')}
              />
              <NavigationItem
                href="/account-controls"
                isActive={activePage === 'account-controls'}
                label={accountControlsT('navigation')}
              />
            </ul>
          </nav>
        </div>
        <div className="hidden flex-col gap-5 lg:flex">
          <p className="max-w-48 text-sm text-muted-foreground">CS &amp; SOFTWARE DEVELOPMENT</p>
          <LogoutForm action={logoutAction} />
        </div>
      </aside>

      <section className="p-4 sm:p-8 lg:p-12">
        {children}
        <div className="mt-6 lg:hidden">
          <LogoutForm action={logoutAction} />
        </div>
      </section>
    </main>
  );
}

function NavigationItem({
  href,
  isActive,
  label,
}: {
  href: string;
  isActive: boolean;
  label: string;
}) {
  return (
    <li>
      <Link
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'block border-l-2 py-2 pl-3 transition-colors duration-150',
          isActive
            ? 'border-primary text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground',
        )}
        href={href}
      >
        {label}
      </Link>
    </li>
  );
}
