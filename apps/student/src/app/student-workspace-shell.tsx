import { cn } from '@showcase/ui/cn';
import {
  BellIcon,
  HouseIcon,
  MailIcon,
  PlusIcon,
  UserRoundIcon,
  type LucideIcon,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { logoutAction } from './student-auth.actions';
import { LogoutForm } from './student-auth-forms';
import { MobileWorkspaceNavigation } from './mobile-workspace-navigation';

export type StudentWorkspacePage =
  'create-work' | 'home' | 'invitations' | 'notifications' | 'profile' | 'work';

interface NavigationItem {
  href: string;
  icon: LucideIcon;
  label: string;
  page: StudentWorkspacePage;
}

export async function StudentWorkspaceShell({
  activePage,
  canCreateWork,
  children,
}: {
  activePage: StudentWorkspacePage;
  canCreateWork: boolean;
  children: ReactNode;
}) {
  const t = await getTranslations('Workspace');
  const items: NavigationItem[] = [
    { href: '/', icon: HouseIcon, label: t('navigation.home'), page: 'home' },
    ...(canCreateWork
      ? [
          {
            href: '/works/new',
            icon: PlusIcon,
            label: t('navigation.createWork'),
            page: 'create-work' as const,
          },
        ]
      : []),
    { href: '/profile', icon: UserRoundIcon, label: t('navigation.profile'), page: 'profile' },
    {
      href: '/contributor-invitations',
      icon: MailIcon,
      label: t('navigation.invitations'),
      page: 'invitations',
    },
    {
      href: '/notifications',
      icon: BellIcon,
      label: t('navigation.notifications'),
      page: 'notifications',
    },
  ];
  const activeItem = items.find((item) => item.page === activePage);
  const statusLabel = canCreateWork ? t('status.active') : t('status.readOnly');

  return (
    <main className="mx-auto grid min-h-svh w-full max-w-[1440px] bg-background lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start">
      <aside className="hidden flex-col justify-between border-r border-border bg-sidebar px-5 py-6 text-sidebar-foreground lg:sticky lg:top-0 lg:flex lg:h-svh">
        <div className="flex flex-col gap-8">
          <WorkspaceIdentity label={t('workspace')} />
          <WorkspaceNavigation
            activePage={activePage}
            items={items}
            label={t('navigation.label')}
          />
        </div>
        <div className="flex flex-col gap-4">
          <Separator />
          <Badge variant="secondary">{statusLabel}</Badge>
          <p className="text-sm text-muted-foreground">{t('department')}</p>
          <LogoutForm action={logoutAction} />
        </div>
      </aside>

      <div className="min-w-0">
        <MobileWorkspaceNavigation
          closeLabel={t('navigation.closeMenu')}
          description={t('navigation.menuDescription')}
          label={t('navigation.openMenu')}
          title={t('navigation.menuTitle')}
        >
          <div className="flex min-h-0 flex-1 flex-col justify-between gap-6 overflow-y-auto p-6">
            <div className="flex flex-col gap-6">
              <Badge variant="secondary">{statusLabel}</Badge>
              <WorkspaceNavigation
                activePage={activePage}
                items={items}
                label={t('navigation.label')}
              />
            </div>
            <div className="flex flex-col gap-4">
              <Separator />
              <LogoutForm action={logoutAction} />
            </div>
          </div>
        </MobileWorkspaceNavigation>
        <header className="hidden min-h-16 items-center justify-between border-b border-border bg-card px-8 lg:flex">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">{t('workspace')}</span>
            <span aria-hidden="true" className="text-border">
              /
            </span>
            <span className="font-medium">{activeItem?.label}</span>
          </div>
          <Badge variant="outline">{statusLabel}</Badge>
        </header>
        <section className="p-4 sm:p-8 lg:p-12">{children}</section>
      </div>
    </main>
  );
}

function WorkspaceIdentity({ label }: { label: string }) {
  return (
    <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-3">
      <span
        aria-hidden="true"
        className="grid size-10 place-items-center rounded-control bg-primary text-sm font-semibold text-primary-foreground"
      >
        SS
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold tracking-[0.08em]">SHOWCASE</p>
        <p className="truncate text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function WorkspaceNavigation({
  activePage,
  items,
  label,
}: {
  activePage: StudentWorkspacePage;
  items: NavigationItem[];
  label: string;
}) {
  return (
    <nav aria-label={label}>
      <ul className="flex flex-col gap-1">
        {items.map(({ href, icon: Icon, label: itemLabel, page }) => {
          const isActive = activePage === page;
          return (
            <li key={page}>
              <Link
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-11 items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors duration-150 before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full motion-reduce:transition-none',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground before:bg-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
                href={href}
              >
                <Icon aria-hidden="true" className="size-5 shrink-0" />
                <span>{itemLabel}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
