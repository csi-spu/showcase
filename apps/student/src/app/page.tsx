import { Button, buttonVariants } from '@showcase/ui/button';
import Link from 'next/link';
import {
  ArrowRightIcon,
  BellIcon,
  FilePlus2Icon,
  MailIcon,
  ShieldCheckIcon,
  UserRoundIcon,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getStudentAuthPageState } from '@/lib/student-auth-page-state';
import { Separator } from '@/components/ui/separator';
import {
  changePasswordAction,
  clearExpiredSessionAction,
  loginAction,
  logoutAction,
} from './student-auth.actions';
import { ChangePasswordForm, LoginForm, LogoutForm } from './student-auth-forms';
import { StudentWorkspaceShell } from './student-workspace-shell';

interface HomeProps {
  searchParams: Promise<{ expired?: string }>;
}

export default async function Home({ searchParams }: HomeProps) {
  const { expired } = await searchParams;
  const [state, t, dashboardT] = await Promise.all([
    getStudentAuthPageState(expired === '1'),
    getTranslations('Auth'),
    getTranslations('Dashboard'),
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

  if (state.kind === 'active') {
    return (
      <StudentWorkspaceShell
        activePage="home"
        canCreateWork={state.session.canUseStudentCapabilities}
      >
        <header className="grid gap-4 lg:grid-cols-12 lg:items-end">
          <div className="grid gap-3 lg:col-span-8">
            <Badge variant="secondary">{dashboardT('eyebrow')}</Badge>
            <h1 className="max-w-3xl text-[clamp(2rem,4vw,3rem)] leading-[1.2] font-semibold tracking-tight text-balance">
              {dashboardT('title')}
            </h1>
            <p className="max-w-2xl text-muted-foreground">{dashboardT('description')}</p>
          </div>
          <p className="border-l-2 border-primary pl-4 text-sm text-muted-foreground lg:col-span-3 lg:col-start-10">
            {description}
          </p>
        </header>
        <div className="mt-10 grid max-w-5xl gap-6 xl:grid-cols-12">
          <Card className="xl:col-span-7">
            <CardHeader className="gap-3">
              <FilePlus2Icon aria-hidden="true" className="size-6 text-primary" />
              <CardTitle>
                <h2 className="text-2xl font-semibold">{dashboardT('primary.title')}</h2>
              </CardTitle>
              <CardDescription>{dashboardT('primary.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              {state.session.canUseStudentCapabilities ? (
                <Link className={buttonVariants({ size: 'lg' })} href="/works/new">
                  {t('active.createWork')}
                  <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
                </Link>
              ) : (
                <Alert>
                  <ShieldCheckIcon aria-hidden="true" />
                  <AlertTitle>{heading}</AlertTitle>
                  <AlertDescription>{description}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card className="xl:col-span-5">
            <CardHeader>
              <CardTitle>
                <h2 className="text-xl font-semibold">{dashboardT('quick.title')}</h2>
              </CardTitle>
              <CardDescription>{dashboardT('quick.description')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-1">
              <DashboardLink href="/profile" icon={UserRoundIcon} label={t('active.profile')} />
              <Separator />
              <DashboardLink
                href="/contributor-invitations"
                icon={MailIcon}
                label={t('active.invitations')}
              />
              <Separator />
              <DashboardLink
                href="/notifications"
                icon={BellIcon}
                label={t('active.notifications')}
              />
            </CardContent>
          </Card>
        </div>
      </StudentWorkspaceShell>
    );
  }

  return (
    <main className="mx-auto grid min-h-svh w-full max-w-[1440px] bg-background lg:grid-cols-[14rem_minmax(0,1fr)]">
      <aside className="flex min-h-28 flex-col justify-between border-b border-border bg-background p-6 text-foreground lg:min-h-svh lg:border-r lg:border-b-0 lg:p-8">
        <div className="flex flex-col gap-3">
          <span aria-hidden="true" className="h-1 w-12 bg-primary" />
          <p className="text-sm font-semibold tracking-[0.18em]">STUDENT SHOWCASE</p>
        </div>
        <p className="hidden max-w-44 text-sm text-muted-foreground lg:block">
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
            {state.kind === 'expired' ? (
              <form action={clearExpiredSessionAction}>
                <Button className="w-full" size="lg" type="submit">
                  {t('expired.action')}
                </Button>
              </form>
            ) : null}
          </CardContent>

          <CardFooter>
            {state.kind === 'password_change_required' ? (
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

function DashboardLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof UserRoundIcon;
  label: string;
}) {
  return (
    <Link
      className="group flex min-h-12 items-center gap-3 rounded-control px-2 font-medium transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
      href={href}
    >
      <Icon aria-hidden="true" className="size-5 text-muted-foreground group-hover:text-primary" />
      <span className="min-w-0 flex-1">{label}</span>
      <ArrowRightIcon aria-hidden="true" className="size-4 text-muted-foreground" />
    </Link>
  );
}
