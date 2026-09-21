import { Button } from '@showcase/ui/button';
import { ClipboardListIcon, FolderOpenIcon, InboxIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AuthLayout } from '@/components/ui/auth-layout';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { getStudentCollectionAuthPageState } from '@/lib/student-collection-auth-page-state';
import { AppShell } from './app-shell';
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
   * Signed in: the student gets the dashboard frame, not a login card holding
   * a notice. There is nothing to submit in this milestone, so the page states
   * that plainly instead of implying a feature that is not there yet.
   */
  if (state.kind === 'active') {
    return (
      <AppShell>
        <PageHeader
          description={homeT('dashboardDescription')}
          eyebrow={
            <StatusBadge icon={ClipboardListIcon} tone="information">
              {homeT('statusUpcoming')}
            </StatusBadge>
          }
          title={homeT('dashboardTitle')}
        />
        <EmptyState
          description={homeT('placeholderDescription')}
          icon={InboxIcon}
          title={homeT('placeholderTitle')}
        />
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
