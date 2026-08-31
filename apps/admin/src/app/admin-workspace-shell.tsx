import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { logoutAction } from './admin-auth.actions';
import { LogoutForm } from './admin-auth-forms';
import {
  AdminWorkspaceFrame,
  type AdminNavigationGroup,
  type AdminWorkspacePage,
} from './admin-workspace-frame';

export type { AdminWorkspacePage } from './admin-workspace-frame';

export async function AdminWorkspaceShell({
  activePage,
  children,
}: {
  activePage: AdminWorkspacePage;
  children: ReactNode;
}) {
  const [accountControlsT, rosterT, workManagementT, workspaceT] = await Promise.all([
    getTranslations('AccountControls'),
    getTranslations('Roster'),
    getTranslations('WorkManagement'),
    getTranslations('Workspace'),
  ]);
  const groups: AdminNavigationGroup[] = [
    {
      items: [{ href: '/', label: workspaceT('navigation.dashboard'), page: 'dashboard' }],
      label: workspaceT('groups.overview'),
    },
    {
      items: [{ href: '/works', label: workManagementT('navigation'), page: 'works' }],
      label: workspaceT('groups.works'),
    },
    {
      items: [
        { href: '/roster', label: rosterT('navigation'), page: 'roster' },
        {
          href: '/account-controls',
          label: accountControlsT('navigation'),
          page: 'account-controls',
        },
      ],
      label: workspaceT('groups.students'),
    },
    {
      items: [
        {
          href: '/settings/academic-year',
          label: accountControlsT('year.navigation'),
          page: 'academic-year',
        },
      ],
      label: workspaceT('groups.system'),
    },
  ];
  const activeLabel = groups
    .flatMap((group) => group.items)
    .find((item) => item.page === activePage)?.label;

  return (
    <AdminWorkspaceFrame
      activeLabel={activeLabel ?? workspaceT('workspace')}
      activePage={activePage}
      collapsedLogout={<LogoutForm action={logoutAction} compact />}
      collapseLabel={workspaceT('navigation.collapse')}
      department={workspaceT('department')}
      expandLabel={workspaceT('navigation.expand')}
      groups={groups}
      logout={<LogoutForm action={logoutAction} />}
      mobileLabels={{
        close: workspaceT('navigation.closeMenu'),
        description: workspaceT('navigation.description'),
        open: workspaceT('navigation.openMenu'),
        title: workspaceT('navigation.title'),
      }}
      navigationLabel={workspaceT('navigation.label')}
      status={workspaceT('status')}
      workspace={workspaceT('workspace')}
    >
      {children}
    </AdminWorkspaceFrame>
  );
}
