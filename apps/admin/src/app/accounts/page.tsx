import { randomUUID } from 'node:crypto';
import { buttonVariants } from '@showcase/ui/button';
import { ArrowRightIcon, SearchIcon } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AddAdminSheet } from '../add-admin-sheet';
import { AddStudentSheet } from '../add-student-sheet';
import { AdminRowActions } from '../admin-row-actions';
import { manageStudentAccountAction } from '../account-controls.actions';
import { createAdminAction, setAdminStatusAction } from '../accounts.actions';
import { AdminWorkspacePage } from '../admin-workspace-page';
import { AdminWorkspaceShell } from '../admin-workspace-shell';
import { createRosterStudentAction } from '../roster.actions';
import { StudentRowActions } from '../student-row-actions';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getAdminAuthPageState } from '@/lib/admin-auth-page-state';
import { readAdminSessionToken } from '@/lib/admin-auth-session';
import { AdminAccountControlsCoreClient } from '@/lib/admin-account-controls-core';
import { getAdminServerEnvironment } from '@/lib/server-environment';

const TABS = ['students', 'admins'] as const;
type AccountsTab = (typeof TABS)[number];

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; q?: string; tab?: string }>;
}) {
  const [authState, query, t] = await Promise.all([
    getAdminAuthPageState(),
    searchParams,
    getTranslations('Accounts'),
  ]);
  if (authState.kind !== 'active') redirect(authState.kind === 'expired' ? '/?expired=1' : '/');
  const token = await readAdminSessionToken();
  if (token === null) redirect('/?expired=1');

  const tab: AccountsTab = query.tab === 'admins' ? 'admins' : 'students';
  const search = query.q?.trim() || null;
  const cursor = query.cursor ?? null;
  const core = new AdminAccountControlsCoreClient(getAdminServerEnvironment());
  const students = tab === 'students' ? await core.listStudents(token, { cursor, search }) : null;
  const admins = tab === 'admins' ? await core.listAdmins(token, { cursor, search }) : null;
  const nextCursor = students?.nextCursor ?? admins?.nextCursor ?? null;
  const isEmpty = (students?.items.length ?? admins?.items.length ?? 0) === 0;

  return (
    <AdminWorkspaceShell activePage="accounts">
      <AdminWorkspacePage description={t('description')} eyebrow={t('kicker')} title={t('title')}>
        <div className="grid max-w-6xl gap-5">
          <section
            aria-label={t('filterLabel')}
            className="grid gap-4 rounded-surface border border-border/80 bg-card p-4 shadow-sm sm:p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <nav aria-label={t('filterLabel')} className="flex flex-wrap gap-2">
                {TABS.map((tabValue) => (
                  <Link
                    aria-current={tab === tabValue ? 'page' : undefined}
                    className={buttonVariants({
                      size: 'sm',
                      variant: tab === tabValue ? 'default' : 'outline',
                    })}
                    href={accountsHref(tabValue)}
                    key={tabValue}
                  >
                    {t(`tabs.${tabValue}`)}
                  </Link>
                ))}
              </nav>
              {tab === 'students' ? (
                <AddStudentSheet action={createRosterStudentAction} />
              ) : (
                <AddAdminSheet action={createAdminAction} idempotencyKey={randomUUID()} />
              )}
            </div>
            <form className="flex w-full gap-2 sm:max-w-xl" method="get">
              <input name="tab" type="hidden" value={tab} />
              <Input
                aria-label={t('search.label')}
                className="min-w-0"
                defaultValue={search ?? ''}
                name="q"
                placeholder={t('search.placeholder')}
              />
              <button
                aria-label={t('search.submit')}
                className={buttonVariants({ size: 'icon', variant: 'outline' })}
                title={t('search.submit')}
                type="submit"
              >
                <SearchIcon aria-hidden="true" />
              </button>
            </form>
          </section>

          <Table aria-label={t(`table.${tab}Label`)}>
            <TableHeader>
              <TableRow>
                {tab === 'students' ? (
                  <>
                    <TableHead>{t('columns.name')}</TableHead>
                    <TableHead>{t('columns.entryYear')}</TableHead>
                    <TableHead>{t('columns.accessEnds')}</TableHead>
                    <TableHead>{t('columns.status')}</TableHead>
                    <TableHead>{t('columns.state')}</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead>{t('columns.name')}</TableHead>
                    <TableHead>{t('columns.createdAt')}</TableHead>
                    <TableHead>{t('columns.status')}</TableHead>
                  </>
                )}
                <TableHead className="text-right">{t('columns.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isEmpty ? (
                <TableRow>
                  <TableCell
                    className="h-32 text-center text-muted-foreground"
                    colSpan={tab === 'students' ? 6 : 4}
                  >
                    {t(`empty.${tab}`)}
                  </TableCell>
                </TableRow>
              ) : null}
              {students?.items.map((student) => (
                <TableRow key={student.accountId}>
                  <TableCell>{`${student.firstNameTh} ${student.lastNameTh}`}</TableCell>
                  <TableCell>{student.entryYear}</TableCell>
                  <TableCell>{student.accessEndsAcademicYear}</TableCell>
                  <TableCell>
                    <StatusBadge tone={student.status === 'active' ? 'success' : 'warning'}>
                      {t(`status.${student.status}`)}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={student.state === 'student' ? 'success' : 'neutral'}>
                      {t(`studentState.${student.state}`)}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="text-right">
                    <StudentRowActions
                      action={manageStudentAccountAction}
                      idempotencyKey={randomUUID()}
                      student={student}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {admins?.items.map((admin) => (
                <TableRow key={admin.accountId}>
                  <TableCell>{`${admin.firstNameTh} ${admin.lastNameTh}`}</TableCell>
                  <TableCell>
                    <time dateTime={admin.createdAt}>{formatBangkokDate(admin.createdAt)}</time>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={admin.status === 'active' ? 'success' : 'warning'}>
                      {t(`status.${admin.status}`)}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="text-right">
                    <AdminRowActions
                      action={setAdminStatusAction}
                      admin={admin}
                      idempotencyKey={randomUUID()}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {nextCursor === null ? null : (
            <Link
              className={buttonVariants({ className: 'w-fit', variant: 'outline' })}
              href={accountsHref(tab, {
                cursor: nextCursor,
                ...(search === null ? {} : { q: search }),
              })}
            >
              {t('next')}
              <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
            </Link>
          )}
        </div>
      </AdminWorkspacePage>
    </AdminWorkspaceShell>
  );
}

function accountsHref(tab: AccountsTab, params?: { cursor?: string; q?: string }): string {
  const search = new URLSearchParams({ tab, ...params });
  return `/accounts?${search.toString()}`;
}

function formatBangkokDate(value: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value));
}
