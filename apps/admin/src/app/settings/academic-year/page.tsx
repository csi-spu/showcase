import { randomUUID } from 'node:crypto';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getAdminAcademicYear } from '@/lib/admin-account-controls-page-state';
import { getAdminAuthPageState } from '@/lib/admin-auth-page-state';
import { AccountControlsPanel } from '../../account-controls-panel';
import {
  manageStudentAccountAction,
  updateAcademicYearAction,
} from '../../account-controls.actions';
import { AdminWorkspacePage } from '../../admin-workspace-page';
import { AdminWorkspaceShell } from '../../admin-workspace-shell';

export default async function AcademicYearSettingsPage() {
  const [state, t] = await Promise.all([
    getAdminAuthPageState(),
    getTranslations('AccountControls'),
  ]);
  if (state.kind !== 'active') {
    redirect(state.kind === 'expired' ? '/?expired=1' : '/');
  }
  const academicYear = await getAdminAcademicYear();

  return (
    <AdminWorkspaceShell activePage="academic-year">
      <AdminWorkspacePage
        description={t('year.description')}
        eyebrow={t('year.kicker')}
        title={t('year.title')}
      >
        <AccountControlsPanel
          academicYear={academicYear}
          academicYearAction={updateAcademicYearAction}
          academicYearIdempotencyKey={randomUUID()}
          mode="academic-year"
          studentAction={manageStudentAccountAction}
          studentIdempotencyKey={randomUUID()}
        />
      </AdminWorkspacePage>
    </AdminWorkspaceShell>
  );
}
