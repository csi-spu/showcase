import { Button } from '@showcase/ui/button';
import { ShieldCheckIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getStudentAuthPageState } from '@/lib/student-auth-page-state';
import {
  changePasswordAction,
  clearExpiredSessionAction,
  loginAction,
  logoutAction,
} from './student-auth.actions';
import { ChangePasswordForm, LoginForm, LogoutForm } from './student-auth-forms';

interface HomeProps {
  searchParams: Promise<{ expired?: string }>;
}

export default async function Home({ searchParams }: HomeProps) {
  const { expired } = await searchParams;
  const [state, t] = await Promise.all([
    getStudentAuthPageState(expired === '1'),
    getTranslations('Auth'),
  ]);

  let heading: string;
  let description: string;
  if (state.kind === 'active') {
    heading = t('active.heading');
    description = state.session.canUseStudentCapabilities
      ? t('active.description')
      : t('active.readOnlyDescription');
  } else if (state.kind === 'expired') {
    heading = t('expired.heading');
    description = t('expired.description');
  } else if (state.kind === 'password_change_required') {
    heading = t('change.heading');
    description = t('change.description');
  } else {
    heading = t('login.heading');
    description = t('login.description');
  }

  return (
    <main className="grid min-h-svh bg-muted/30 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(28rem,1.2fr)]">
      <aside className="flex min-h-28 flex-col justify-between bg-primary p-6 text-primary-foreground lg:min-h-svh lg:p-12">
        <p className="text-xs font-semibold tracking-[0.18em]">STUDENT SHOWCASE</p>
        <p className="hidden max-w-64 text-sm text-primary-foreground/70 lg:block">
          CS &amp; SOFTWARE DEVELOPMENT
        </p>
      </aside>

      <section className="flex items-center justify-center p-4 sm:p-8 lg:p-12">
        <Card className="w-full max-w-xl">
          <CardHeader className="gap-3">
            <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground">
              {t('kicker')}
            </p>
            <CardTitle>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{heading}</h1>
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>

          <CardContent>
            {state.kind === 'login' ? (
              <div className="space-y-5">
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
            {state.kind === 'active' ? (
              <Alert>
                <ShieldCheckIcon />
                <AlertTitle>{heading}</AlertTitle>
                <AlertDescription>{description}</AlertDescription>
              </Alert>
            ) : null}
            {state.kind === 'expired' ? (
              <form action={clearExpiredSessionAction}>
                <Button className="w-full" size="lg" type="submit">
                  {t('expired.action')}
                </Button>
              </form>
            ) : null}
          </CardContent>

          <CardFooter>
            {state.kind === 'active' || state.kind === 'password_change_required' ? (
              <LogoutForm action={logoutAction} />
            ) : (
              <p className="text-xs text-muted-foreground">{t('login.privacy')}</p>
            )}
          </CardFooter>
        </Card>
      </section>
    </main>
  );
}
