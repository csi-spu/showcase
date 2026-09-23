import { Button } from '@showcase/ui/button';
import { ClipboardListIcon, FolderOpenIcon, InboxIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AuthLayout } from '@/components/ui/auth-layout';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { getStudentCollectionAuthPageState } from '@/lib/student-collection-auth-page-state';
import { readStudentCollectionSessionToken } from '@/lib/student-collection-auth-session';
import { StudentCollectionFormsCoreClient } from '@/lib/student-collection-forms-core';
import type { StudentCollectionPrefill } from '@/lib/student-collection-forms-core';
import { getStudentCollectionServerEnvironment } from '@/lib/server-environment';
import { AppShell } from './app-shell';
import { CollectionForm } from './collection-form';
import { NotificationsPanel } from './notifications-panel';
import { markNotificationsReadAction } from './collection-forms.actions';
import {
  changePasswordAction,
  clearExpiredSessionAction,
  loginAction,
  logoutAction,
} from './student-collection-auth.actions';
import { ChangePasswordForm, LoginForm, LogoutForm } from './student-collection-auth-forms';

interface HomeProps {
  searchParams: Promise<{ expired?: string; passwordSet?: string }>;
}

export default async function Home({ searchParams }: HomeProps) {
  const { expired } = await searchParams;
  const [state, authT, homeT] = await Promise.all([
    getStudentCollectionAuthPageState(expired === '1'),
    getTranslations('Auth'),
    getTranslations('Home'),
  ]);

  /*
   * Signed in: the Student gets their real obligations, each rendered as a form
   * they can answer, with its own status, deadline and checking feedback.
   */
  if (state.kind === 'active') {
    const token = await readStudentCollectionSessionToken();
    if (token === null) redirect('/?expired=1');

    const client = new StudentCollectionFormsCoreClient(getStudentCollectionServerEnvironment());
    const [obligations, feed] = await Promise.all([
      client.list(token),
      client.readNotifications(token),
    ]);
    /*
     * Bound at the server action, not the button: the ids shown are the ids
     * marked, so a stale page cannot ask Core to mark anything newer.
     */
    const markShownRead = markNotificationsReadAction.bind(
      null,
      feed.notifications
        .filter((notification) => !notification.isRead)
        .map((notification) => notification.id),
    );

    /*
     * Prefills are fetched per form because each one is scoped to that form's
     * mapping keys. Only forms the Student can still answer need them: a
     * submitted form shows what was sent, never a fresh suggestion.
     */
    const answerable = obligations.filter(
      (obligation) =>
        obligation.status === 'not_submitted' || obligation.status === 'changes_required',
    );
    const prefillEntries = await Promise.all(
      answerable.map(async (obligation): Promise<[string, StudentCollectionPrefill[]]> => [
        obligation.form.id,
        await client.listPrefills(token, obligation.form.id),
      ]),
    );
    const prefillsByForm = new Map(prefillEntries);
    return (
      <AppShell>
        <PageHeader
          description={homeT('dashboardDescription')}
          eyebrow={
            <StatusBadge icon={ClipboardListIcon} tone="information">
              {obligations.length === 0
                ? homeT('statusUpcoming')
                : homeT('countLabel', { count: obligations.length })}
            </StatusBadge>
          }
          title={homeT('dashboardTitle')}
        />
        <NotificationsPanel
          markReadAction={markShownRead}
          notifications={feed.notifications}
          unreadCount={feed.unreadCount}
        />
        {obligations.length === 0 ? (
          <EmptyState
            description={homeT('placeholderDescription')}
            icon={InboxIcon}
            title={homeT('placeholderTitle')}
          />
        ) : (
          <div className="flex flex-col gap-6">
            {obligations.map((obligation) => (
              <CollectionForm
                isLate={obligation.isLate}
                key={obligation.form.id}
                obligation={obligation}
                prefills={prefillsByForm.get(obligation.form.id) ?? []}
              />
            ))}
          </div>
        )}
      </AppShell>
    );
  }

  const heading =
    state.kind === 'expired'
      ? authT('expired.heading')
      : state.kind === 'password_change_required'
        ? authT('change.heading')
        : authT('login.heading');
  const description =
    state.kind === 'expired'
      ? authT('expired.description')
      : state.kind === 'password_change_required'
        ? authT('change.description')
        : authT('login.description');

  return (
    <AuthLayout eyebrow={authT('kicker')} icon={FolderOpenIcon} tagline={homeT('description')}>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl leading-tight font-semibold tracking-tight text-balance sm:text-3xl">
          {heading}
        </h1>
        <p className="text-muted-foreground">{description}</p>
      </div>

      {state.kind === 'login' ? (
        <div className="flex flex-col gap-5">
          {state.isServiceUnavailable ? (
            <Alert variant="destructive">
              <AlertTitle>{authT('errors.unavailable')}</AlertTitle>
              <AlertDescription>{authT('errors.network')}</AlertDescription>
            </Alert>
          ) : null}
          <LoginForm action={loginAction} />
        </div>
      ) : null}
      {state.kind === 'password_change_required' ? (
        <ChangePasswordForm action={changePasswordAction} />
      ) : null}
      {state.kind === 'expired' ? (
        <form action={clearExpiredSessionAction}>
          <Button className="w-full" size="lg" type="submit">
            {authT('expired.action')}
          </Button>
        </form>
      ) : null}

      {state.kind === 'password_change_required' ? (
        <LogoutForm action={logoutAction} />
      ) : (
        <p className="text-sm text-muted-foreground">{authT('login.privacy')}</p>
      )}
    </AuthLayout>
  );
}
