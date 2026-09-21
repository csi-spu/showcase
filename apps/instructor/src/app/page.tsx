import { Button } from '@showcase/ui/button';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@showcase/ui/card';
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
    redirect('/rounds');
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
    <main className="instructor-canvas mx-auto flex min-h-svh w-full max-w-2xl flex-col justify-center gap-8 px-4 py-10 sm:px-8">
      <div className="flex items-center gap-3">
        <Image
          alt="คณะเทคโนโลยีสารสนเทศ"
          className="h-10 w-auto"
          height={64}
          priority
          sizes="80px"
          src="/brand/sit-school-of-information-technology-color.webp"
          width={214}
        />
        <div>
          <p className="text-sm font-semibold tracking-[0.16em] text-primary">{authT('kicker')}</p>
          <p className="text-sm text-muted-foreground">{homeT('description')}</p>
        </div>
      </div>
      <Card className="w-full">
        <CardHeader className="gap-3">
          <CardTitle>
            <h1 className="text-2xl leading-[1.25] font-semibold tracking-tight sm:text-3xl">
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
        </CardContent>
        <CardFooter>
          {state.kind === 'password_change_required' ? (
            <LogoutForm action={logoutAction} />
          ) : (
            <p className="text-sm text-muted-foreground">{authT('login.privacy')}</p>
          )}
        </CardFooter>
      </Card>
    </main>
  );
}
