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
import { getAdminAuthPageState } from '@/lib/admin-auth-page-state';
import {
  changePasswordAction,
  clearExpiredSessionAction,
  loginAction,
  logoutAction,
} from './admin-auth.actions';
import { ChangePasswordForm, LoginForm, LogoutForm } from './admin-auth-forms';

interface HomeProps {
  searchParams: Promise<{ expired?: string }>;
}

export default async function Home({ searchParams }: HomeProps) {
  const { expired } = await searchParams;
  const [state, t] = await Promise.all([
    getAdminAuthPageState(expired === '1'),
    getTranslations('Auth'),
  ]);

  const heading =
    state.kind === 'active'
      ? t('active.heading')
      : state.kind === 'expired'
        ? t('expired.heading')
        : state.kind === 'password_change_required'
          ? t('change.heading')
          : t('login.heading');
  const description =
    state.kind === 'active'
      ? t('active.description')
      : state.kind === 'expired'
        ? t('expired.description')
        : state.kind === 'password_change_required'
          ? t('change.description')
          : t('login.description');

  return (
    <main className="mx-auto grid min-h-svh w-full max-w-[1440px] bg-background lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="flex min-h-28 flex-col justify-between border-b border-border bg-background p-6 text-foreground lg:min-h-svh lg:border-r lg:border-b-0 lg:p-8">
        <div className="flex flex-col gap-3">
          <span aria-hidden="true" className="h-1 w-12 bg-primary" />
          <p className="text-sm font-semibold tracking-[0.18em]">STUDENT SHOWCASE</p>
          <p className="text-sm text-muted-foreground">ADMIN WORKSPACE</p>
        </div>
        <p className="hidden max-w-48 text-sm text-muted-foreground lg:block">
          CS &amp; SOFTWARE DEVELOPMENT
        </p>
      </aside>

      <section className="flex items-center justify-center p-4 sm:p-8 lg:p-12">
        <Card className="w-full max-w-[45rem]">
          <CardHeader className="gap-3">
            <p className="text-sm font-semibold tracking-[0.16em] text-primary">{t('kicker')}</p>
            <CardTitle>
              <h1 className="text-3xl leading-[1.25] font-semibold tracking-tight sm:text-4xl">
                {heading}
              </h1>
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>

          <CardContent>
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
              <p className="text-sm text-muted-foreground">{t('login.privacy')}</p>
            )}
          </CardFooter>
        </Card>
      </section>
    </main>
  );
}
