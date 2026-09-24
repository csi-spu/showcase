import { Button, buttonVariants } from '@showcase/ui/button';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRightIcon,
  CircleCheckBigIcon,
  FileClockIcon,
  FilePlus2Icon,
  FolderKanbanIcon,
  MessageSquareWarningIcon,
  PencilLineIcon,
  ShieldCheckIcon,
  type LucideIcon,
  UserRoundPenIcon,
  UsersRoundIcon,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getStudentAuthPageState } from '@/lib/student-auth-page-state';
import { readStudentSessionToken } from '@/lib/student-auth-session';
import { getStudentServerEnvironment } from '@/lib/server-environment';
import { StudentWorksCoreClient } from '@/lib/student-works-core';
import { Separator } from '@/components/ui/separator';
import {
  changePasswordAction,
  clearExpiredSessionAction,
  loginAction,
  logoutAction,
} from './student-auth.actions';
import { AuthSuccessToast } from './auth-success-toast';
import { ChangePasswordForm, LoginForm, LogoutForm } from './student-auth-forms';
import { StudentWorkspaceShell } from './student-workspace-shell';
import { StudentAuthLayout } from './student-auth-layout';

interface HomeProps {
  searchParams: Promise<{ expired?: string; loggedIn?: string; passwordSet?: string }>;
}

export default async function Home({ searchParams }: HomeProps) {
  const { expired, loggedIn, passwordSet } = await searchParams;
  const [state, t, dashboardT, homeT] = await Promise.all([
    getStudentAuthPageState(expired === '1'),
    getTranslations('Auth'),
    getTranslations('Dashboard'),
    getTranslations('Home'),
  ]);

  let heading: string;
  let description: string;
  if (state.kind === 'active') {
    heading = t('active.heading');
    description = state.session.canUseStudentCapabilities ? '' : t('active.readOnlyDescription');
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
    const sessionToken = await readStudentSessionToken();
    if (sessionToken === null) redirect('/?expired=1');
    const summary = await new StudentWorksCoreClient(
      getStudentServerEnvironment(),
    ).getWorkspaceSummary(sessionToken);
    const canMutate = state.session.canUseStudentCapabilities && summary.canMutate;
    return (
      <StudentWorkspaceShell activePage="dashboard">
        <AuthSuccessToast
          message={
            loggedIn === '1'
              ? t('active.heading')
              : passwordSet === '1'
                ? t('change.success')
                : null
          }
          redirectTo="/"
        />
        <header className="relative isolate grid min-h-72 overflow-hidden rounded-surface border border-border/80 bg-card p-6 shadow-sm sm:p-8 lg:grid-cols-12 lg:items-center lg:p-10">
          <div className="relative z-10 grid gap-3 lg:col-span-7">
            <Badge variant="secondary">{dashboardT('eyebrow')}</Badge>
            <h1 className="max-w-3xl text-[clamp(2rem,4vw,3rem)] leading-[1.2] font-semibold tracking-tight text-balance">
              {dashboardT('title')}
            </h1>
            <p className="max-w-2xl text-muted-foreground">{dashboardT('description')}</p>
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[48%] lg:block">
            <div className="absolute inset-8 rounded-full bg-primary/10 blur-3xl" />
            <Image
              alt=""
              className="object-contain object-right-bottom"
              fill
              priority
              sizes="(max-width: 1024px) 0px, 48vw"
              src="/images/dashboard-students.png"
            />
          </div>
          {!canMutate ? (
            <p className="relative z-10 mt-4 border-l-2 border-primary pl-4 text-sm text-muted-foreground lg:col-span-7">
              {description}
            </p>
          ) : null}
        </header>
        <section
          aria-label={dashboardT('counts.heading')}
          className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          <DashboardCount
            icon={PencilLineIcon}
            label={dashboardT('counts.drafts')}
            value={summary.draftCount}
          />
          <DashboardCount
            icon={MessageSquareWarningIcon}
            label={dashboardT('counts.changeRequests')}
            value={summary.changeRequestCount}
          />
          <DashboardCount
            icon={FileClockIcon}
            label={dashboardT('counts.pendingReview')}
            value={summary.pendingReviewCount}
          />
          <DashboardCount
            icon={CircleCheckBigIcon}
            label={dashboardT('counts.published')}
            value={summary.publishedCount}
          />
        </section>
        <div className="mt-8 grid max-w-6xl items-stretch gap-6 xl:grid-cols-12">
          <Card className="h-full xl:col-span-5">
            <CardHeader className="gap-3">
              <FilePlus2Icon aria-hidden="true" className="size-6 text-primary" />
              <CardTitle>
                <h2 className="text-2xl font-semibold">{dashboardT('primary.title')}</h2>
              </CardTitle>
              <CardDescription>{dashboardT('primary.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              {canMutate ? (
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

          <Card className="h-full xl:col-span-7">
            <CardHeader>
              <CardTitle>
                <h2 className="text-xl font-semibold">{dashboardT('quick.title')}</h2>
              </CardTitle>
              <CardDescription>{dashboardT('quick.description')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-1">
              {canMutate ? (
                <>
                  <DashboardLink
                    href="/works/new"
                    icon={FilePlus2Icon}
                    label={dashboardT('quick.addWork')}
                  />
                  <Separator />
                </>
              ) : null}
              {!canMutate || summary.latestActionableDraftPublicId === null ? null : (
                <>
                  <DashboardLink
                    href={`/works/${summary.latestActionableDraftPublicId}`}
                    icon={ArrowRightIcon}
                    label={dashboardT('quick.continueLatest')}
                  />
                  <Separator />
                </>
              )}
              <DashboardLink
                href="/works"
                icon={FolderKanbanIcon}
                label={dashboardT('quick.manageWorks')}
              />
              <Separator />
              <DashboardLink
                href="/profile"
                icon={UserRoundPenIcon}
                label={dashboardT('quick.editProfile')}
              />
            </CardContent>
          </Card>
        </div>
      </StudentWorkspaceShell>
    );
  }

  return (
    <StudentAuthLayout
      eyebrow={t('kicker')}
      featureProfile={homeT('features.profile')}
      featurePublishing={homeT('features.publishing')}
      featureTracking={homeT('features.tracking')}
      headline={homeT('authHeadline')}
      headlineAccent={homeT('authHeadlineAccent')}
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
          <p>{t('securityNote')}</p>
        </div>
      )}

      {state.kind === 'login' ? (
        <p className="auth-account-help">
          <UsersRoundIcon aria-hidden="true" className="size-5 shrink-0" />
          {t('login.accountHelp')}
        </p>
      ) : null}
    </StudentAuthLayout>
  );
}

function DashboardLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: LucideIcon;
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

function DashboardCount({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
}) {
  return (
    <Card className="h-full min-h-36">
      <CardHeader className="h-full content-between gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <CardDescription className="min-h-10">{label}</CardDescription>
          <span className="grid size-9 shrink-0 place-items-center rounded-control bg-primary-soft text-primary">
            <Icon aria-hidden="true" className="size-4" />
          </span>
        </div>
        <CardTitle>
          <span className="text-3xl tabular-nums" data-testid="workspace-count">
            {value}
          </span>
        </CardTitle>
      </CardHeader>
    </Card>
  );
}
