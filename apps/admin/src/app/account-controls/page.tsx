import { randomUUID } from 'node:crypto';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getAdminAuthPageState } from '@/lib/admin-auth-page-state';
import { AccountControlsPanel } from '../account-controls-panel';
import { manageStudentAccountAction, updateAcademicYearAction } from '../account-controls.actions';
import { AdminWorkspacePage } from '../admin-workspace-page';
import { AdminWorkspaceShell } from '../admin-workspace-shell';

export default async function AccountControlsPage() {
  const [state, t] = await Promise.all([
    getAdminAuthPageState(),
    getTranslations('AccountControls'),
  ]);
  if (state.kind !== 'active') {
    redirect(state.kind === 'expired' ? '/?expired=1' : '/');
  }
  return (
    <AdminWorkspaceShell activePage="account-controls">
      <AdminWorkspacePage description={t('description')} eyebrow={t('kicker')} title={t('title')}>
        <AccountControlsPanel
          academicYear={null}
          academicYearAction={updateAcademicYearAction}
          academicYearIdempotencyKey={randomUUID()}
          mode="student"
          studentAction={manageStudentAccountAction}
          studentIdempotencyKey={randomUUID()}
        />
      </AdminWorkspacePage>
    </AdminWorkspaceShell>
  );
}
