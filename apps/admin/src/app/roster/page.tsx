import { buttonVariants } from '@showcase/ui/button';
import { CheckCircle2Icon, FileSpreadsheetIcon, ListChecksIcon, UserPlusIcon } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getAdminAuthPageState } from '@/lib/admin-auth-page-state';
import { getAdminRosterBatch, getAdminRosterConflicts } from '@/lib/admin-roster-page-state';
import { AdminWorkspacePage } from '../admin-workspace-page';
import { AdminWorkspaceShell } from '../admin-workspace-shell';
import { resolveRosterPageMode } from '../roster-page-mode';
import { RosterBatchStatus } from '../roster-batch-status';
import { RosterConflictList } from '../roster-conflict-list';
import { RosterStudentForm } from '../roster-student-form';
import { RosterUploadForm } from '../roster-upload-form';
import {
  createRosterStudentAction,
  resolveRosterConflictAction,
  uploadRosterAction,
} from '../roster.actions';

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{ batchId?: string; conflictAfter?: string; resolved?: string }>;
}) {
  const { batchId, conflictAfter, resolved } = await searchParams;
  const mode = resolveRosterPageMode(batchId);
  const [state, t] = await Promise.all([getAdminAuthPageState(), getTranslations('Roster')]);
  if (state.kind !== 'active') redirect(state.kind === 'expired' ? '/?expired=1' : '/');
  const batch = batchId ? await getAdminRosterBatch(batchId) : null;
  const conflictPage =
    batch && batchId ? await getAdminRosterConflicts(batchId, conflictAfter) : null;

  return (
    <AdminWorkspaceShell activePage="roster">
      <AdminWorkspacePage
        actions={
          mode === 'result' ? (
            <Link className={buttonVariants({ variant: 'outline' })} href="/roster">
              {t('batchResult.back')}
            </Link>
          ) : undefined
        }
        description={mode === 'result' ? t('batchResult.description') : t('description')}
        eyebrow={t('kicker')}
        layout={mode === 'result' ? 'detail' : 'overview'}
        title={mode === 'result' ? t('batchResult.title') : t('title')}
      >
        {mode === 'result' ? (
          <div className="grid max-w-5xl gap-6">
            {resolved === '1' ? (
              <Alert className="border-success/30 bg-success-background text-success">
                <CheckCircle2Icon aria-hidden="true" />
                <AlertTitle>{t('conflicts.resolvedSuccess')}</AlertTitle>
              </Alert>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>{t('status.title')}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {batch ? (
                  <RosterBatchStatus batch={batch} />
                ) : (
                  <Alert variant="destructive">
                    <AlertTitle>{t('status.title')}</AlertTitle>
                    <AlertDescription>{t('status.unavailable')}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {conflictPage && batchId ? (
              <RosterConflictList
                action={resolveRosterConflictAction}
                batchId={batchId}
                page={conflictPage}
              />
            ) : batch?.status === 'completed_with_errors' ? (
              <Alert variant="destructive">
                <AlertTitle>{t('conflicts.title')}</AlertTitle>
                <AlertDescription>{t('status.conflictsUnavailable')}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        ) : (
          <div className="grid items-start gap-6 xl:grid-cols-12">
            <Card className="xl:col-span-6">
              <CardHeader>
                <span className="grid size-10 place-items-center rounded-control bg-primary-soft text-primary">
                  <UserPlusIcon aria-hidden="true" className="size-5" />
                </span>
                <CardTitle>
                  <h2>{t('single.title')}</h2>
                </CardTitle>
                <CardDescription>{t('single.description')}</CardDescription>
              </CardHeader>
              <CardContent>
                <RosterStudentForm action={createRosterStudentAction} />
              </CardContent>
            </Card>

            <Card className="xl:col-span-6">
              <CardHeader>
                <span className="grid size-10 place-items-center rounded-control bg-primary-soft text-primary">
                  <FileSpreadsheetIcon aria-hidden="true" className="size-5" />
                </span>
                <CardTitle>
                  <h2>{t('form.groupLabel')}</h2>
                </CardTitle>
                <CardDescription>{t('form.fileHelp')}</CardDescription>
              </CardHeader>
              <CardContent>
                <RosterUploadForm action={uploadRosterAction} />
              </CardContent>
            </Card>

            <details className="group rounded-surface border border-border/80 bg-card xl:col-span-12">
              <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-6 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                <ListChecksIcon aria-hidden="true" className="size-5 text-primary" />
                {t('preparation.title')}
              </summary>
              <ol className="grid gap-4 border-t border-border/80 p-6 md:grid-cols-3">
                <PreparationStep index="1" text={t('preparation.columns')} />
                <PreparationStep index="2" text={t('preparation.years')} />
                <PreparationStep index="3" text={t('preparation.limits')} />
              </ol>
            </details>
          </div>
        )}
      </AdminWorkspacePage>
    </AdminWorkspaceShell>
  );
}

function PreparationStep({ index, text }: { index: string; text: string }) {
  return (
    <li className="grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-3 text-sm leading-relaxed">
      <Badge aria-hidden="true" variant="secondary">
        {index}
      </Badge>
      <span className="pt-1.5 text-muted-foreground">{text}</span>
    </li>
  );
}
