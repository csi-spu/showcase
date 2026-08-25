import { Button } from '@showcase/ui/button';
import { FileSpreadsheetIcon, ListChecksIcon } from 'lucide-react';
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
import { getAdminRosterBatch } from '@/lib/admin-roster-page-state';
import {
  changePasswordAction,
  clearExpiredSessionAction,
  loginAction,
  logoutAction,
} from './admin-auth.actions';
import { ChangePasswordForm, LoginForm, LogoutForm } from './admin-auth-forms';
import { RosterBatchStatus } from './roster-batch-status';
import { RosterUploadForm } from './roster-upload-form';
import { uploadRosterAction } from './roster.actions';

interface HomeProps {
  searchParams: Promise<{ batchId?: string; expired?: string }>;
}

export default async function Home({ searchParams }: HomeProps) {
  const { batchId, expired } = await searchParams;
  const [state, t, rosterT] = await Promise.all([
    getAdminAuthPageState(expired === '1'),
    getTranslations('Auth'),
    getTranslations('Roster'),
  ]);
  const batch = state.kind === 'active' && batchId ? await getAdminRosterBatch(batchId) : null;

  return (
    <main className="mx-auto grid min-h-svh w-full max-w-[1440px] bg-background lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="flex min-h-28 flex-col justify-between border-b border-border bg-background p-6 text-foreground lg:min-h-svh lg:border-r lg:border-b-0 lg:p-8">
        <div className="flex flex-col gap-3">
          <span aria-hidden="true" className="h-1 w-12 bg-primary" />
          <p className="text-sm font-semibold tracking-[0.18em]">STUDENT SHOWCASE</p>
          <p className="text-sm text-muted-foreground">ADMIN WORKSPACE</p>
          {state.kind === 'active' ? (
            <nav aria-label="เมนูผู้ดูแล" className="mt-6">
              <p className="border-l-2 border-primary py-2 pl-3 text-sm font-medium">
                {rosterT('navigation')}
              </p>
            </nav>
          ) : null}
        </div>
        <div className="hidden flex-col gap-5 lg:flex">
          <p className="max-w-48 text-sm text-muted-foreground">CS &amp; SOFTWARE DEVELOPMENT</p>
          {state.kind === 'active' ? <LogoutForm action={logoutAction} /> : null}
        </div>
      </aside>

      {state.kind === 'active' ? (
        <section className="p-4 sm:p-8 lg:p-12">
          <header className="mb-8 flex max-w-4xl flex-col gap-3">
            <p className="text-sm font-medium text-muted-foreground">
              {rosterT('kicker')} / {rosterT('title')}
            </p>
            <h1 className="text-3xl leading-[1.25] font-semibold tracking-tight sm:text-4xl">
              {rosterT('title')}
            </h1>
            <p className="text-base leading-relaxed text-muted-foreground">
              {rosterT('description')}
            </p>
          </header>

          <div className="flex max-w-5xl flex-col gap-6">
            {batch || batchId ? (
              <Card>
                <CardHeader>
                  <CardTitle>{rosterT('status.title')}</CardTitle>
                </CardHeader>
                <CardContent>
                  {batch ? (
                    <RosterBatchStatus batch={batch} />
                  ) : (
                    <Alert variant="destructive">
                      <AlertTitle>{rosterT('status.title')}</AlertTitle>
                      <AlertDescription>{rosterT('status.unavailable')}</AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            ) : null}

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
              <Card className="xl:col-span-7">
                <CardHeader>
                  <FileSpreadsheetIcon aria-hidden="true" className="size-6 text-primary" />
                  <CardTitle>{rosterT('form.groupLabel')}</CardTitle>
                  <CardDescription>{rosterT('form.fileHelp')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <RosterUploadForm action={uploadRosterAction} />
                </CardContent>
              </Card>

              <Card className="xl:col-span-5">
                <CardHeader>
                  <ListChecksIcon aria-hidden="true" className="size-6 text-primary" />
                  <CardTitle>{rosterT('preparation.title')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="flex flex-col gap-5">
                    <PreparationStep index="1" text={rosterT('preparation.columns')} />
                    <PreparationStep index="2" text={rosterT('preparation.years')} />
                    <PreparationStep index="3" text={rosterT('preparation.limits')} />
                  </ol>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="mt-6 lg:hidden">
            <LogoutForm action={logoutAction} />
          </div>
        </section>
      ) : (
        <AuthPanel state={state} t={t} />
      )}
    </main>
  );
}

function PreparationStep({ index, text }: { index: string; text: string }) {
  return (
    <li className="grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-3 text-sm leading-relaxed">
      <span
        aria-hidden="true"
        className="flex size-8 items-center justify-center rounded-full border border-border bg-muted font-semibold"
      >
        {index}
      </span>
      <span className="pt-1.5 text-muted-foreground">{text}</span>
    </li>
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
  );
}
