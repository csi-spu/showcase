import { Button } from '@showcase/ui/button';
import Image from 'next/image';
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
import { AdminBrand } from './admin-brand';
import { AdminDashboard } from './admin-dashboard';
import { AdminWorkspaceShell } from './admin-workspace-shell';
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
  const [state, authT, dashboardT, homeT] = await Promise.all([
    getAdminAuthPageState(expired === '1'),
    getTranslations('Auth'),
    getTranslations('Dashboard'),
    getTranslations('Home'),
  ]);

  if (state.kind === 'active') {
    return (
      <AdminWorkspaceShell activePage="dashboard">
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
    <main className="admin-canvas mx-auto grid min-h-svh w-full max-w-[1600px] overflow-hidden bg-background lg:grid-cols-[minmax(28rem,1.08fr)_minmax(28rem,0.92fr)]">
      <aside className="relative isolate flex min-h-64 flex-col justify-between overflow-hidden border-b border-primary/15 bg-primary-soft p-6 lg:min-h-svh lg:border-r lg:border-b-0 lg:p-10 xl:p-14">
        <div className="absolute -top-24 right-[-10%] size-[30rem] rounded-full bg-white/55 blur-3xl" />
        <div className="absolute bottom-[-12rem] left-[-8rem] size-[32rem] rounded-full border-[5rem] border-primary/5" />
        <AdminBrand className="relative z-10" />
        <div className="relative z-10 hidden max-w-xl gap-4 lg:grid">
          <p className="text-sm font-semibold tracking-[0.16em] text-primary">{authT('kicker')}</p>
          <h1 className="text-[clamp(2.25rem,5vw,4.5rem)] leading-[1.05] font-semibold tracking-[-0.045em] text-balance">
            {homeT('title')}
          </h1>
          <p className="max-w-[52ch] text-lg text-muted-foreground">{homeT('description')}</p>
        </div>
        <Image
          alt="คณะเทคโนโลยีสารสนเทศ"
          className="relative z-10 h-auto w-28"
          height={381}
          priority
          sizes="112px"
          src="/brand/sit-school-of-information-technology-color.webp"
          width={1280}
        />
      </aside>
      <AuthPanel state={state} t={authT} />
    </main>
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
    <section className="flex items-center justify-center p-4 sm:p-8 lg:p-10 xl:p-14">
      <Card className="w-full max-w-[38rem] border-white/80 bg-card/95 shadow-[0_1.5rem_4rem_-2rem_rgba(50,20,45,0.28)] backdrop-blur-sm">
        <CardHeader className="gap-3">
          <p className="text-sm font-semibold tracking-[0.16em] text-primary">{t('kicker')}</p>
          <CardTitle>
            <h2 className="text-3xl leading-[1.25] font-semibold tracking-tight sm:text-4xl">
              {heading}
            </h2>
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
