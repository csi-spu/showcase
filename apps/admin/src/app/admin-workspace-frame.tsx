'use client';

import { Button } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import {
  BellIcon,
  CalendarClockIcon,
  ClipboardCheckIcon,
  FilePenLineIcon,
  FileSpreadsheetIcon,
  LayoutDashboardIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  RotateCcwIcon,
  UserRoundCogIcon,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AdminBrand, AdminBrandMark } from './admin-brand';
import { AdminMobileNavigation } from './admin-mobile-navigation';

export type AdminWorkspacePage =
  | 'account-controls'
  | 'academic-year'
  | 'corrections'
  | 'dashboard'
  | 'notifications'
  | 'recovery'
  | 'reviews'
  | 'roster';

export interface AdminNavigationGroup {
  items: Array<{ href: string; label: string; page: AdminWorkspacePage }>;
  label: string;
}

const PAGE_ICONS: Record<AdminWorkspacePage, LucideIcon> = {
  'account-controls': UserRoundCogIcon,
  'academic-year': CalendarClockIcon,
  corrections: FilePenLineIcon,
  dashboard: LayoutDashboardIcon,
  notifications: BellIcon,
  recovery: RotateCcwIcon,
  reviews: ClipboardCheckIcon,
  roster: FileSpreadsheetIcon,
};

export function AdminWorkspaceFrame({
  activeLabel,
  activePage,
  children,
  collapsedLogout,
  collapseLabel,
  department,
  expandLabel,
  groups,
  logout,
  mobileLabels,
  navigationLabel,
  status,
  workspace,
}: {
  activeLabel: string;
  activePage: AdminWorkspacePage;
  children: ReactNode;
  collapsedLogout: ReactNode;
  collapseLabel: string;
  department: string;
  expandLabel: string;
  groups: AdminNavigationGroup[];
  logout: ReactNode;
  mobileLabels: { close: string; description: string; open: string; title: string };
  navigationLabel: string;
  status: string;
  workspace: string;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <main
      className={cn(
        'admin-canvas mx-auto grid min-h-svh w-full max-w-[1600px] bg-background transition-[grid-template-columns] duration-200 motion-reduce:transition-none lg:items-start',
        isCollapsed ? 'lg:grid-cols-[4rem_minmax(0,1fr)]' : 'lg:grid-cols-[16rem_minmax(0,1fr)]',
      )}
    >
      <aside
        className={cn(
          'hidden flex-col justify-between border-r border-sidebar-border bg-sidebar/95 text-sidebar-foreground backdrop-blur lg:sticky lg:top-0 lg:flex lg:h-svh',
          isCollapsed ? 'px-2 py-5' : 'px-5 py-6',
        )}
        role="complementary"
      >
        <div className="flex min-h-0 flex-col gap-6">
          <div className={cn('min-h-12', isCollapsed ? 'grid place-items-center' : 'px-2')}>
            {isCollapsed ? <AdminBrandMark /> : <AdminBrand />}
            {isCollapsed ? null : (
              <p className="mt-2 truncate text-sm text-muted-foreground">{workspace}</p>
            )}
          </div>
          <WorkspaceNavigation
            activePage={activePage}
            groups={groups}
            isCollapsed={isCollapsed}
            label={navigationLabel}
          />
        </div>
        <div className="flex flex-col gap-3">
          {isCollapsed ? (
            collapsedLogout
          ) : (
            <>
              <Separator />
              <Badge className="w-fit" variant="secondary">
                {status}
              </Badge>
              <p className="text-xs leading-5 text-muted-foreground">{department}</p>
              {logout}
            </>
          )}
          <Button
            aria-label={isCollapsed ? expandLabel : collapseLabel}
            className={cn(isCollapsed ? 'w-full' : 'self-end')}
            onClick={() => setIsCollapsed((value) => !value)}
            size="icon-sm"
            title={isCollapsed ? expandLabel : collapseLabel}
            variant="ghost"
          >
            {isCollapsed ? <PanelLeftOpenIcon /> : <PanelLeftCloseIcon />}
          </Button>
        </div>
      </aside>

      <div className="min-w-0">
        <AdminMobileNavigation
          closeLabel={mobileLabels.close}
          description={mobileLabels.description}
          label={mobileLabels.open}
          title={mobileLabels.title}
        >
          <div className="flex min-h-0 flex-1 flex-col justify-between gap-6 overflow-y-auto p-6">
            <div className="flex flex-col gap-6">
              <AdminBrand />
              <WorkspaceNavigation
                activePage={activePage}
                groups={groups}
                isCollapsed={false}
                label={navigationLabel}
              />
            </div>
            <div className="flex flex-col gap-4">
              <Separator />
              {logout}
            </div>
          </div>
        </AdminMobileNavigation>
        <header className="sticky top-0 z-30 hidden min-h-16 items-center justify-between border-b border-border/80 bg-background px-8 lg:flex">
          <div className="flex min-w-0 items-center gap-3 text-sm">
            <span className="text-muted-foreground">{workspace}</span>
            <span aria-hidden="true" className="text-border">
              /
            </span>
            <span className="truncate font-medium">{activeLabel}</span>
          </div>
          <Badge variant="outline">{status}</Badge>
        </header>
        <section className="p-4 pb-12 sm:p-8 sm:pb-16 lg:p-12 lg:pb-20">{children}</section>
      </div>
    </main>
  );
}

function WorkspaceNavigation({
  activePage,
  groups,
  isCollapsed,
  label,
}: {
  activePage: AdminWorkspacePage;
  groups: AdminNavigationGroup[];
  isCollapsed: boolean;
  label: string;
}) {
  return (
    <nav aria-label={label} className="min-h-0 overflow-y-auto overflow-x-hidden">
      <div className="flex flex-col gap-5">
        {groups.map((group) => (
          <section aria-label={group.label} className="grid gap-1.5" key={group.label}>
            {isCollapsed ? null : (
              <p className="px-3 text-xs font-medium tracking-wide text-muted-foreground">
                {group.label}
              </p>
            )}
            <ul className="flex flex-col gap-1">
              {group.items.map(({ href, label: itemLabel, page }) => {
                const Icon = PAGE_ICONS[page];
                const isActive = activePage === page;
                return (
                  <li key={page}>
                    <Link
                      aria-current={isActive ? 'page' : undefined}
                      aria-label={itemLabel}
                      className={cn(
                        'relative flex min-h-10 items-center rounded-control text-sm font-medium transition-colors duration-150 before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full motion-reduce:transition-none',
                        isCollapsed ? 'justify-center px-2' : 'gap-3 px-3',
                        isActive
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground before:bg-primary'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                      href={href}
                      title={isCollapsed ? itemLabel : undefined}
                    >
                      <Icon aria-hidden="true" className="size-[1.125rem] shrink-0" />
                      {isCollapsed ? null : <span className="truncate">{itemLabel}</span>}
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
