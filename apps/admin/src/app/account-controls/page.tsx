import { randomUUID } from 'node:crypto';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getAdminAcademicYear } from '@/lib/admin-account-controls-page-state';
import { getAdminAuthPageState } from '@/lib/admin-auth-page-state';
import { AccountControlsPanel } from '../account-controls-panel';
import { manageStudentAccountAction, updateAcademicYearAction } from '../account-controls.actions';
import { AdminWorkspaceShell } from '../admin-workspace-shell';

export default async function AccountControlsPage() {
  const [state, t] = await Promise.all([
    getAdminAuthPageState(),
    getTranslations('AccountControls'),
  ]);
  if (state.kind !== 'active') {
    redirect(state.kind === 'expired' ? '/?expired=1' : '/');
  }
  const academicYear = await getAdminAcademicYear();

  return (
    <AdminWorkspaceShell activePage="account-controls">
      <header className="mb-8 flex max-w-4xl flex-col gap-3">
        <p className="text-sm font-medium text-muted-foreground">
          {t('kicker')} / {t('title')}
        </p>
        <h1
          className="text-3xl leading-[1.25] font-semibold tracking-tight sm:text-4xl"
          id="account-controls-title"
        >
          {t('title')}
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground">{t('description')}</p>
      </header>

      <AccountControlsPanel
        academicYear={academicYear}
        academicYearAction={updateAcademicYearAction}
        academicYearIdempotencyKey={randomUUID()}
        studentAction={manageStudentAccountAction}
        studentIdempotencyKey={randomUUID()}
      />
    </AdminWorkspaceShell>
  );
}
