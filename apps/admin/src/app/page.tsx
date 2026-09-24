import { Button } from '@showcase/ui/button';
import { ShieldCheckIcon, UsersRoundIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getAdminAuthPageState } from '@/lib/admin-auth-page-state';
import { AdminAuthLayout } from './admin-auth-layout';
import { AdminDashboard } from './admin-dashboard';
import { AdminWorkspaceShell } from './admin-workspace-shell';
import { AuthSuccessToast } from './auth-success-toast';
import {
  changePasswordAction,
  clearExpiredSessionAction,
  loginAction,
  logoutAction,
} from './admin-auth.actions';
import { ChangePasswordForm, LoginForm, LogoutForm } from './admin-auth-forms';

interface HomeProps {
  searchParams: Promise<{ expired?: string; passwordSet?: string }>;
}

export default async function Home({ searchParams }: HomeProps) {
  const { expired, passwordSet } = await searchParams;
  const [state, authT, dashboardT, homeT] = await Promise.all([
    getAdminAuthPageState(expired === '1'),
    getTranslations('Auth'),
    getTranslations('Dashboard'),
    getTranslations('Home'),
  ]);

  if (state.kind === 'active') {
    return (
      <AdminWorkspaceShell activePage="dashboard">
        <AuthSuccessToast message={passwordSet === '1' ? authT('change.success') : null} />
        <AdminDashboard
          labels={{
            accountDescription: dashboardT('accountDescription'),
            accountTitle: dashboardT('accountTitle'),
            description: dashboardT('description'),
            eyebrow: dashboardT('eyebrow'),
            recoveryDescription: dashboardT('recoveryDescription'),
            recoveryTitle: dashboardT('recoveryTitle'),
            reviewDescription: dashboardT('reviewDescription'),
            reviewTitle: dashboardT('reviewTitle'),
            rosterDescription: dashboardT('rosterDescription'),
            rosterTitle: dashboardT('rosterTitle'),
            title: dashboardT('title'),
          }}
        />
      </AdminWorkspaceShell>
    );
  }

  return (
    <AdminAuthLayout
      eyebrow={authT('kicker')}
      featureAccounts={homeT('features.accounts')}
      featureReview={homeT('features.review')}
      featureTracking={homeT('features.tracking')}
      headline={homeT('authHeadline')}
      headlineAccent={homeT('authHeadlineAccent')}
      tagline={homeT('description')}
    >
      <AuthPanel state={state} t={authT} />
    </AdminAuthLayout>
  );
}

type AuthPageState = Awaited<ReturnType<typeof getAdminAuthPageState>>;
type AuthTranslations = Awaited<ReturnType<typeof getTranslations<'Auth'>>>;

function AuthPanel({ state, t }: { state: AuthPageState; t: AuthTranslations }) {
  const heading =
    state.kind === 'expired'
      ? t('expired.heading')
      : state.kind === 'password_change_required'
        ? t('change.heading')
        : t('login.heading');
  const description =
    state.kind === 'expired'
      ? t('expired.description')
      : state.kind === 'password_change_required'
        ? t('change.description')
        : t('login.description');
  return (
    <>
      <div className="auth-card-heading">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl leading-tight font-semibold tracking-tight text-balance sm:text-3xl">
            {heading}
          </h1>
          <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
            {description}
          </p>
        </div>
      </div>

      {state.kind === 'login' ? (
        <div className="flex flex-col gap-5">
          {state.isServiceUnavailable ? (
            <Alert variant="destructive">
              <AlertTitle>{t('errors.unavailable')}</AlertTitle>
              <AlertDescription>{t('errors.network')}</AlertDescription>
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
          <Button className="auth-submit-button w-full" size="lg" type="submit">
            {t('expired.action')}
          </Button>
        </form>
      ) : null}

      {state.kind === 'password_change_required' ? (
        <LogoutForm action={logoutAction} />
      ) : (
        <div className="auth-security-note">
          <ShieldCheckIcon aria-hidden="true" className="size-5 shrink-0" />
          <p>{t('login.privacy')}</p>
        </div>
      )}

      {state.kind === 'login' ? (
        <p className="auth-account-help">
          <UsersRoundIcon aria-hidden="true" className="size-5 shrink-0" />
          {t('login.accountHelp')}
        </p>
      ) : null}
    </>
  );
}
