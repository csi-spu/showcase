'use client';

import { Button } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import {
  BellIcon,
  CalendarClockIcon,
  FileSpreadsheetIcon,
  FolderKanbanIcon,
  LayoutDashboardIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  UserRoundCogIcon,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { PulseDot } from '@/components/ui/status-badge';
import { AdminBrand, AdminBrandMark } from './admin-brand';
import { AdminMobileNavigation } from './admin-mobile-navigation';

export type AdminWorkspacePage =
  'account-controls' | 'academic-year' | 'dashboard' | 'notifications' | 'roster' | 'works';

export interface AdminNavigationGroup {
  items: Array<{ href: string; label: string; page: AdminWorkspacePage }>;
  label: string;
}

const PAGE_ICONS: Record<AdminWorkspacePage, LucideIcon> = {
  'account-controls': UserRoundCogIcon,
  'academic-year': CalendarClockIcon,
  dashboard: LayoutDashboardIcon,
  notifications: BellIcon,
  roster: FileSpreadsheetIcon,
  works: FolderKanbanIcon,
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
  const [isPointerExpanded, setIsPointerExpanded] = useState(false);
  const isSidebarCollapsed = isCollapsed && !isPointerExpanded;

  return (
    <main
      className={cn(
        'admin-canvas mx-auto grid min-h-svh w-full max-w-[1600px] bg-background transition-[grid-template-columns] duration-200 motion-reduce:transition-none lg:items-start',
        isSidebarCollapsed
          ? 'lg:grid-cols-[4rem_minmax(0,1fr)]'
          : 'lg:grid-cols-[16rem_minmax(0,1fr)]',
      )}
    >
      <aside
        className={cn(
          'hidden flex-col justify-between border-r border-sidebar-border bg-sidebar/95 text-sidebar-foreground backdrop-blur lg:sticky lg:top-0 lg:flex lg:h-svh',
          isSidebarCollapsed ? 'px-2 py-5' : 'px-5 py-6',
        )}
        onPointerEnter={() => setIsPointerExpanded(isCollapsed)}
        onPointerLeave={() => setIsPointerExpanded(false)}
        role="complementary"
      >
        <div className="flex min-h-0 flex-col gap-6">
          <div className={cn('min-h-12', isSidebarCollapsed ? 'grid place-items-center' : 'px-2')}>
            {isSidebarCollapsed ? <AdminBrandMark /> : <AdminBrand />}
            {isSidebarCollapsed ? null : (
              <p className="mt-2 truncate text-sm text-muted-foreground">{workspace}</p>
            )}
          </div>
          <WorkspaceNavigation
            activePage={activePage}
            groups={groups}
            isCollapsed={isSidebarCollapsed}
            showsCollapsedTooltips={isSidebarCollapsed}
            label={navigationLabel}
          />
        </div>
        <div className="flex flex-col gap-3">
          {isSidebarCollapsed ? (
            collapsedLogout
          ) : (
            <>
              <Separator />
              <Badge className="w-fit gap-1.5" variant="secondary">
                <PulseDot tone="success" />
                {status}
              </Badge>
              <p className="text-xs leading-5 text-muted-foreground">{department}</p>
              {logout}
            </>
          )}
          <Button
            aria-label={isCollapsed ? expandLabel : collapseLabel}
            className={cn(isSidebarCollapsed ? 'w-full' : 'self-end')}
            onClick={() => {
              setIsCollapsed((value) => !value);
              setIsPointerExpanded(false);
            }}
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
                showsCollapsedTooltips={false}
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
          <Badge className="gap-1.5" variant="outline">
            <PulseDot tone="success" />
            {status}
          </Badge>
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
  showsCollapsedTooltips,
}: {
  activePage: AdminWorkspacePage;
  groups: AdminNavigationGroup[];
  isCollapsed: boolean;
  label: string;
  showsCollapsedTooltips: boolean;
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
                const tooltipId = `admin-navigation-${page}-tooltip`;
                return (
                  <li key={page}>
                    <div className="group/navigation-item relative">
                      <Link
                        aria-current={isActive ? 'page' : undefined}
                        aria-describedby={showsCollapsedTooltips ? tooltipId : undefined}
                        aria-label={itemLabel}
                        className={cn(
                          'group relative flex min-h-10 items-center rounded-control text-sm font-medium transition-all duration-150 before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full motion-reduce:transition-none',
                          isCollapsed ? 'justify-center px-2' : 'gap-3 px-3',
                          isActive
                            ? 'bg-sidebar-accent text-sidebar-accent-foreground before:bg-primary'
                            : 'text-muted-foreground before:bg-transparent hover:bg-muted hover:text-foreground',
                        )}
                        href={href}
                      >
                        <span
                          className={cn(
                            'grid size-7 shrink-0 place-items-center rounded-control transition-colors duration-150',
                            isActive
                              ? 'bg-primary text-primary-foreground shadow-sm'
                              : 'text-muted-foreground group-hover:text-foreground',
                          )}
                        >
                          <Icon aria-hidden="true" className="size-[1.05rem]" />
                        </span>
                        {isCollapsed ? null : <span className="truncate">{itemLabel}</span>}
                      </Link>
                      {showsCollapsedTooltips ? (
                        <span
                          className="pointer-events-none absolute top-1/2 left-[calc(100%+0.5rem)] z-50 -translate-y-1/2 rounded-control bg-foreground px-2 py-1 text-xs whitespace-nowrap text-background opacity-0 shadow-sm transition-opacity group-focus-within/navigation-item:opacity-100"
                          id={tooltipId}
                          role="tooltip"
                        >
                          {itemLabel}
                        </span>
                      ) : null}
                    </div>
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
