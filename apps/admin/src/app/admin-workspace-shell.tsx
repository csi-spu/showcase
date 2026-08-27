import { cn } from '@showcase/ui/cn';
import {
  BellIcon,
  ClipboardCheckIcon,
  FilePenLineIcon,
  FileSpreadsheetIcon,
  RotateCcwIcon,
  UserCogIcon,
  type LucideIcon,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AdminMobileNavigation } from './admin-mobile-navigation';
import { logoutAction } from './admin-auth.actions';
import { LogoutForm } from './admin-auth-forms';

type AdminWorkspacePage =
  'account-controls' | 'corrections' | 'notifications' | 'recovery' | 'reviews' | 'roster';

interface NavigationItem {
  href: string;
  icon: LucideIcon;
  label: string;
  page: AdminWorkspacePage;
}

interface NavigationGroup {
  items: NavigationItem[];
  label: string;
}

export async function AdminWorkspaceShell({
  activePage,
  children,
}: {
  activePage: AdminWorkspacePage;
  children: ReactNode;
}) {
  const [accountControlsT, correctionT, notificationsT, recoveryT, reviewT, rosterT, workspaceT] =
    await Promise.all([
      getTranslations('AccountControls'),
      getTranslations('Correction'),
      getTranslations('Notifications'),
      getTranslations('Recovery'),
      getTranslations('Review'),
      getTranslations('Roster'),
      getTranslations('Workspace'),
    ]);
  const groups: NavigationGroup[] = [
    {
      items: [
        {
          href: '/reviews',
          icon: ClipboardCheckIcon,
          label: reviewT('navigation'),
          page: 'reviews',
        },
        {
          href: '/corrections',
          icon: FilePenLineIcon,
          label: correctionT('navigation'),
          page: 'corrections',
        },
        {
          href: '/recovery',
          icon: RotateCcwIcon,
          label: recoveryT('navigation'),
          page: 'recovery',
        },
      ],
      label: workspaceT('groups.works'),
    },
    {
      items: [
        {
          href: '/',
          icon: FileSpreadsheetIcon,
          label: rosterT('navigation'),
          page: 'roster',
        },
        {
          href: '/account-controls',
          icon: UserCogIcon,
          label: accountControlsT('navigation'),
          page: 'account-controls',
        },
      ],
      label: workspaceT('groups.students'),
    },
    {
      items: [
        {
          href: '/notifications',
          icon: BellIcon,
          label: notificationsT('navigation'),
          page: 'notifications',
        },
      ],
      label: workspaceT('groups.system'),
    },
  ];
  const activeItem = groups
    .flatMap((group) => group.items)
    .find((item) => item.page === activePage);

  return (
    <main className="mx-auto grid min-h-svh w-full max-w-[1440px] bg-background lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
      <aside className="hidden flex-col justify-between border-r border-border bg-sidebar px-6 py-7 text-sidebar-foreground lg:sticky lg:top-0 lg:flex lg:h-svh">
        <div className="flex min-h-0 flex-col gap-8">
          <WorkspaceIdentity label={workspaceT('workspace')} />
          <WorkspaceNavigation
            activePage={activePage}
            groups={groups}
            label={workspaceT('navigation.label')}
          />
        </div>
        <div className="flex flex-col gap-4">
          <Separator />
          <Badge variant="secondary">{workspaceT('status')}</Badge>
          <p className="max-w-48 text-sm text-muted-foreground">{workspaceT('department')}</p>
          <LogoutForm action={logoutAction} />
        </div>
      </aside>

      <div className="min-w-0">
        <AdminMobileNavigation
          closeLabel={workspaceT('navigation.closeMenu')}
          description={workspaceT('navigation.description')}
          label={workspaceT('navigation.openMenu')}
          title={workspaceT('navigation.title')}
        >
          <div className="flex min-h-0 flex-1 flex-col justify-between gap-6 overflow-y-auto p-6">
            <div className="flex flex-col gap-6">
              <Badge variant="secondary">{workspaceT('status')}</Badge>
              <WorkspaceNavigation
                activePage={activePage}
                groups={groups}
                label={workspaceT('navigation.label')}
              />
            </div>
            <div className="flex flex-col gap-4">
              <Separator />
              <LogoutForm action={logoutAction} />
            </div>
          </div>
        </AdminMobileNavigation>
        <header className="hidden min-h-16 items-center justify-between border-b border-border bg-card px-8 lg:flex">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">{workspaceT('workspace')}</span>
            <span aria-hidden="true" className="text-border">
              /
            </span>
            <span className="font-medium">{activeItem?.label}</span>
          </div>
          <Badge variant="outline">{workspaceT('status')}</Badge>
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
        className="grid size-10 place-items-center rounded-control bg-foreground text-sm font-semibold text-background"
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
  groups,
  label,
}: {
  activePage: AdminWorkspacePage;
  groups: NavigationGroup[];
  label: string;
}) {
  return (
    <nav aria-label={label} className="min-h-0 overflow-y-auto">
      <div className="flex flex-col gap-6">
        {groups.map((group) => (
          <section aria-label={group.label} className="grid gap-2" key={group.label}>
            <p className="px-3 text-sm font-medium text-muted-foreground">{group.label}</p>
            <ul className="flex flex-col gap-1">
              {group.items.map(({ href, icon: Icon, label: itemLabel, page }) => {
                const isActive = activePage === page;
                return (
                  <li key={page}>
                    <Link
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'relative flex min-h-9 items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors duration-150 before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full motion-reduce:transition-none max-lg:min-h-11',
                        isActive
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground before:bg-primary'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                      href={href}
                    >
                      <Icon aria-hidden="true" className="size-5 shrink-0 lg:size-4" />
                      <span>{itemLabel}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </nav>
  );
}
