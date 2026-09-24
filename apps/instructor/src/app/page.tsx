import { Button } from '@showcase/ui/button';
import { ShieldCheckIcon, UsersRoundIcon } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AuthLayout } from '@/components/ui/auth-layout';
import { getInstructorAuthPageState } from '@/lib/instructor-auth-page-state';
import {
  changePasswordAction,
  clearExpiredSessionAction,
  loginAction,
  logoutAction,
} from './instructor-auth.actions';
import { ChangePasswordForm, LoginForm, LogoutForm } from './instructor-auth-forms';

interface HomeProps {
  searchParams: Promise<{ expired?: string; passwordSet?: string }>;
}

export default async function Home({ searchParams }: HomeProps) {
  const { expired } = await searchParams;
  const [state, authT, homeT] = await Promise.all([
    getInstructorAuthPageState(expired === '1'),
    getTranslations('Auth'),
    getTranslations('Home'),
  ]);

  if (state.kind === 'active') {
    redirect('/dashboard');
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
    <AuthLayout
      eyebrow={authT('kicker')}
      featureForms={homeT('features.forms')}
      featureReview={homeT('features.review')}
      featureTracking={homeT('features.tracking')}
      headline={homeT('headline')}
      headlineAccent={homeT('headlineAccent')}
      tagline={homeT('description')}
    >
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
          <Button className="auth-submit-button w-full" size="lg" type="submit">
            {authT('expired.action')}
          </Button>
        </form>
      ) : null}

      {state.kind === 'password_change_required' ? (
        <LogoutForm action={logoutAction} />
      ) : (
        <div className="auth-security-note">
          <ShieldCheckIcon aria-hidden="true" className="size-5 shrink-0" />
          <p>{authT('login.privacy')}</p>
        </div>
      )}

      {state.kind === 'login' ? (
        <p className="auth-account-help">
          <UsersRoundIcon aria-hidden="true" className="size-5 shrink-0" />
          {authT('login.accountHelp')}
        </p>
      ) : null}
    </AuthLayout>
  );
}
