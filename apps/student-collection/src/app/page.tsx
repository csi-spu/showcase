import { Button, buttonVariants } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import {
  BellIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  ClipboardListIcon,
  ClockIcon,
  FilePenLineIcon,
  HistoryIcon,
  InboxIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
  UserRoundCheckIcon,
} from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AuthLayout } from '@/components/ui/auth-layout';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { getStudentCollectionAuthPageState } from '@/lib/student-collection-auth-page-state';
import { readStudentCollectionSessionToken } from '@/lib/student-collection-auth-session';
import { StudentCollectionFormsCoreClient } from '@/lib/student-collection-forms-core';
import type { StudentCollectionObligation } from '@/lib/student-collection-forms-core';
import { getStudentCollectionServerEnvironment } from '@/lib/server-environment';
import type { StudentCollectionAuthPageState } from '@/lib/student-collection-auth-page-state-policy';
import { parseStudentCollectionReturnTo } from '@/lib/student-collection-return-to';
import { AppShell } from './app-shell';
import { NotificationsPanel } from './notifications-panel';
import { markNotificationsReadAction } from './collection-forms.actions';
import {
  changePasswordAction,
  clearExpiredSessionAction,
  loginAction,
  logoutAction,
} from './student-collection-auth.actions';
import { ChangePasswordForm, LoginForm, LogoutForm } from './student-collection-auth-forms';

/** How many recently-submitted forms the history panel shows before its own page. */
const RECENT_HISTORY_LIMIT = 3;
/** How many upcoming deadlines the panel shows; the rest stay reachable from the list below. */
const UPCOMING_DEADLINE_LIMIT = 3;

interface HomeProps {
  searchParams: Promise<{ expired?: string; passwordSet?: string; returnTo?: string }>;
}

type HomeTranslator = Awaited<ReturnType<typeof getTranslations<'Home'>>>;
type AuthTranslator = Awaited<ReturnType<typeof getTranslations<'Auth'>>>;

function formatBangkokDate(value: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value));
}

/* A titled card with an optional "see all" link, matching Instructor's dashboard panels. */
function Panel({
  action,
  children,
  icon: Icon,
  title,
}: {
  action?: { href: string; label: string };
  children: React.ReactNode;
  icon: typeof ClipboardListIcon;
  title: string;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-surface border border-border/80 bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Icon aria-hidden="true" className="size-5 shrink-0 text-primary" />
          <h2 className="font-semibold tracking-tight text-foreground">{title}</h2>
        </div>
        {action === undefined ? null : (
          <Link
            className="group flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
            href={action.href}
          >
            {action.label}
            <ChevronRightIcon
              aria-hidden="true"
              className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
            />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/* The forms still owed, nearest deadline first; undated forms sort last. */
function UpcomingPanel({ t, todo }: { t: HomeTranslator; todo: StudentCollectionObligation[] }) {
  const items = todo
    .map((obligation) => ({ deadlineAt: obligation.form.deadlineAt, obligation }))
    .filter(
      (entry): entry is { deadlineAt: string; obligation: StudentCollectionObligation } =>
        entry.deadlineAt !== null,
    )
    .sort((a, b) => new Date(a.deadlineAt).getTime() - new Date(b.deadlineAt).getTime())
    .slice(0, UPCOMING_DEADLINE_LIMIT);

  return (
    <Panel icon={CalendarClockIcon} title={t('upcomingTitle')}>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('upcomingEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map(({ deadlineAt, obligation }) => (
            <li className="flex items-start justify-between gap-3" key={obligation.form.id}>
              <span className="min-w-0 truncate text-sm font-medium text-foreground">
                {obligation.form.title}
              </span>
              <StatusBadge
                icon={ClockIcon}
                tone={obligation.hasDeadlinePassed ? 'destructive' : 'muted'}
              >
                {formatBangkokDate(deadlineAt)}
              </StatusBadge>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

type FormsStatusTranslator = Awaited<ReturnType<typeof getTranslations<'Forms.status'>>>;

/* Recently-submitted forms, newest first; the full record stays at each form's own history page. */
function RecentHistoryPanel({
  obligations,
  statusT,
  t,
}: {
  obligations: StudentCollectionObligation[];
  statusT: FormsStatusTranslator;
  t: HomeTranslator;
}) {
  const items = obligations
    .map((obligation) => ({ obligation, submittedAt: obligation.latestSubmission?.submittedAt }))
    .filter(
      (entry): entry is { obligation: StudentCollectionObligation; submittedAt: string } =>
        entry.submittedAt !== undefined,
    )
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
    .slice(0, RECENT_HISTORY_LIMIT);

  return (
    <Panel icon={HistoryIcon} title={t('recentHistoryTitle')}>
      {items.length === 0 ? (
        <EmptyState icon={HistoryIcon} title={t('recentHistoryEmpty')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map(({ obligation, submittedAt }) => (
            <li key={obligation.form.id}>
              <Link
                className="group flex flex-wrap items-center gap-x-4 gap-y-2 rounded-surface border border-border/80 px-3.5 py-3 transition-colors hover:border-primary/40 hover:bg-primary-soft/40 motion-reduce:transition-none"
                href={`/history/${obligation.form.id}`}
              >
                <span className="flex min-w-[10rem] flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium text-foreground">
                    {obligation.form.title}
                  </span>
                  <span className="truncate text-sm text-muted-foreground">
                    {formatBangkokDate(submittedAt)}
                  </span>
                </span>
                <StatusBadge tone={statusTone(obligation.status)}>
                  {statusT(obligation.status)}
                </StatusBadge>
                <ChevronRightIcon
                  aria-hidden="true"
                  className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary motion-reduce:transition-none"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function statusTone(status: StudentCollectionObligation['status']) {
  switch (status) {
    case 'awaiting_checking':
      return 'information' as const;
    case 'changes_required':
      return 'warning' as const;
    case 'passed':
      return 'success' as const;
    default:
      return 'muted' as const;
  }
}

/*
 * One clickable row per obligation, opening the answer page at its own route
 * rather than expanding the form inline -- the dashboard's job is to show
 * what is owed, not to be the form itself. The still-owed list additionally
 * surfaces a "start filling" button, since that section is the working
 * surface the Student is expected to act on immediately.
 */
function ObligationListRow({
  obligation,
  showStartAction = false,
  statusT,
  t,
}: {
  obligation: StudentCollectionObligation;
  showStartAction?: boolean;
  statusT: FormsStatusTranslator;
  t: HomeTranslator;
}) {
  const deadline = obligation.form.deadlineAt;
  return (
    <li>
      <Link
        className="group flex flex-wrap items-center gap-x-4 gap-y-3 rounded-surface border border-border/80 bg-card px-3.5 py-3.5 transition-colors hover:border-primary/40 hover:bg-primary-soft/40 motion-reduce:transition-none"
        href={`/forms/${obligation.form.id}`}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-accent-foreground">
          <ClipboardListIcon aria-hidden="true" className="size-4.5" />
        </span>
        <span className="flex min-w-[10rem] flex-1 flex-col gap-0.5">
          <span className="truncate font-medium text-foreground">{obligation.form.title}</span>
          <span className="flex items-center gap-1 truncate text-sm text-muted-foreground">
            <CalendarClockIcon aria-hidden="true" className="size-3.5 shrink-0" />
            {deadline === null
              ? t('noDeadline')
              : t('deadlineLabel', { date: formatBangkokDate(deadline) })}
            {obligation.hasDeadlinePassed ? ` · ${t('deadlinePassed')}` : ''}
          </span>
        </span>
        <StatusBadge tone={statusTone(obligation.status)}>{statusT(obligation.status)}</StatusBadge>
        {showStartAction ? (
          <span className={cn(buttonVariants({ size: 'sm' }), 'pointer-events-none gap-1.5')}>
            <FilePenLineIcon aria-hidden="true" className="size-4" />
            {t('startFilling')}
          </span>
        ) : null}
        <ChevronRightIcon
          aria-hidden="true"
          className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary motion-reduce:transition-none"
        />
      </Link>
    </li>
  );
}

export default async function Home({ searchParams }: HomeProps) {
  const { expired, returnTo: rawReturnTo } = await searchParams;
  const returnTo = parseStudentCollectionReturnTo(rawReturnTo);
  const [state, authT, homeT, statusT] = await Promise.all([
    getStudentCollectionAuthPageState(expired === '1'),
    getTranslations('Auth'),
    getTranslations('Home'),
    getTranslations('Forms.status'),
  ]);

  /*
   * Signed in: the Student gets their real obligations, each rendered as a form
   * they can answer, with its own status, deadline and checking feedback.
   */
  if (state.kind === 'active') {
    const token = await readStudentCollectionSessionToken();
    if (token === null) redirect('/?expired=1');
    /*
     * Already signed in but still carrying a deeplink's return path -- this
     * page was only ever a stop on the way there, so send them straight on
     * rather than showing the dashboard first.
     */
    if (returnTo !== null) redirect(returnTo);

    const client = new StudentCollectionFormsCoreClient(getStudentCollectionServerEnvironment());
    const [obligations, feed] = await Promise.all([
      client.list(token),
      client.readNotifications(token),
    ]);
    /*
     * Bound at the server action, not the button: the ids shown are the ids
     * marked, so a stale page cannot ask Core to mark anything newer.
     */
    const markShownRead = markNotificationsReadAction.bind(
      null,
      feed.notifications
        .filter((notification) => !notification.isRead)
        .map((notification) => notification.id),
    );

    /*
     * "Still owed" groups by the same predicate the form-answer page itself
     * uses to decide whether prefills apply, so the dashboard cannot show a
     * form as outstanding while that page treats it as finished.
     */
    const answerable = obligations.filter(
      (obligation) =>
        obligation.status === 'not_submitted' || obligation.status === 'changes_required',
    );
    const answerableIds = new Set(answerable.map((obligation) => obligation.form.id));
    const todo = obligations.filter((obligation) => answerableIds.has(obligation.form.id));
    const done = obligations.filter((obligation) => !answerableIds.has(obligation.form.id));
    const passedCount = obligations.filter((obligation) => obligation.status === 'passed').length;
    const awaitingCheckingCount = obligations.filter(
      (obligation) => obligation.status === 'awaiting_checking',
    ).length;
    /*
     * The header names the signed-in Student by their Roster name, never by
     * Student ID: Core keeps only a keyed hash of it, so no read path can
     * return one to show here (see AGENTS.md, ADR 0013 and ADR 0018). A
     * Student with no obligations yet has no roster row to read a name from,
     * so the chip is simply left out rather than shown empty.
     */
    const studentName =
      obligations[0] === undefined
        ? undefined
        : `${obligations[0].rosterName.firstNameTh} ${obligations[0].rosterName.lastNameTh}`;

    return (
      <AppShell
        unreadNotificationCount={feed.unreadCount}
        {...(studentName === undefined ? {} : { studentName })}
      >
        <section className="relative flex flex-wrap items-center justify-between gap-6 overflow-hidden rounded-surface border border-primary/15 bg-primary-soft px-5 py-6 sm:px-8 sm:py-8">
          <div className="flex min-w-0 max-w-xl flex-col gap-3">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-card px-3 py-1 text-xs font-medium text-primary">
              <ClipboardListIcon aria-hidden="true" className="size-3.5" />
              {homeT('dashboardEyebrow')}
            </span>
            <h1 className="text-2xl leading-tight font-semibold tracking-tight text-balance text-foreground sm:text-3xl">
              {homeT('dashboardTitle')}
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
              {homeT('dashboardDescription')}
            </p>
          </div>
          <div
            aria-hidden="true"
            className="relative hidden h-32 w-32 shrink-0 items-center justify-center sm:flex"
          >
            <span className="absolute inset-0 -rotate-6 rounded-surface bg-card/70" />
            <span className="absolute inset-0 translate-x-3 translate-y-1 rotate-3 rounded-surface bg-card" />
            <ClipboardListIcon className="relative size-12 text-primary" strokeWidth={1.5} />
            <span className="absolute -right-1 -bottom-1 flex size-9 items-center justify-center rounded-full bg-success text-white">
              <CheckCircle2Icon aria-hidden="true" className="size-5" />
            </span>
          </div>
        </section>

        {obligations.length === 0 ? (
          <EmptyState
            description={homeT('placeholderDescription')}
            icon={InboxIcon}
            title={homeT('placeholderTitle')}
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={ClipboardListIcon}
                label={homeT('statTodo')}
                tone="primary"
                value={todo.length}
              />
              <StatCard
                icon={ClockIcon}
                label={homeT('statAwaitingChecking')}
                tone="information"
                value={awaitingCheckingCount}
              />
              <StatCard
                icon={CheckCircle2Icon}
                label={homeT('statPassed')}
                tone="success"
                value={passedCount}
              />
              <StatCard
                icon={BellIcon}
                label={homeT('statUnreadNotifications')}
                tone="primary"
                value={feed.unreadCount}
              />
            </div>

            {/* The work still owed is the working surface, so it takes the
                wide column; notifications and deadlines beside it are reference. */}
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <div className="flex min-w-0 flex-col gap-6">
                {todo.length === 0 ? (
                  <Alert variant="success">
                    <CheckCircle2Icon aria-hidden="true" />
                    <AlertTitle>{homeT('allDone')}</AlertTitle>
                  </Alert>
                ) : (
                  <section aria-labelledby="todo-heading" className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                      <h2 className="text-lg font-semibold text-foreground" id="todo-heading">
                        {homeT('todoHeading')}
                      </h2>
                      <p className="text-sm text-muted-foreground">{homeT('todoDescription')}</p>
                    </div>
                    <Alert variant="warning">
                      <TriangleAlertIcon aria-hidden="true" />
                      <AlertTitle>{homeT('todoAlertTitle', { count: todo.length })}</AlertTitle>
                      <AlertDescription>{homeT('todoAlertDescription')}</AlertDescription>
                    </Alert>
                    <ul className="flex flex-col gap-2">
                      {todo.map((obligation) => (
                        <ObligationListRow
                          key={obligation.form.id}
                          obligation={obligation}
                          showStartAction
                          statusT={statusT}
                          t={homeT}
                        />
                      ))}
                    </ul>
                  </section>
                )}

                {done.length === 0 ? null : (
                  <section aria-labelledby="done-heading" className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                      <h2 className="text-lg font-semibold text-foreground" id="done-heading">
                        {homeT('doneHeading')}
                      </h2>
                      <p className="text-sm text-muted-foreground">{homeT('doneDescription')}</p>
                    </div>
                    <ul className="flex flex-col gap-2">
                      {done.map((obligation) => (
                        <ObligationListRow
                          key={obligation.form.id}
                          obligation={obligation}
                          statusT={statusT}
                          t={homeT}
                        />
                      ))}
                    </ul>
                  </section>
                )}

                <RecentHistoryPanel obligations={obligations} statusT={statusT} t={homeT} />
              </div>

              <div className="flex min-w-0 flex-col gap-4">
                <NotificationsPanel
                  markReadAction={markShownRead}
                  notifications={feed.notifications}
                  unreadCount={feed.unreadCount}
                />
                <UpcomingPanel t={homeT} todo={todo} />
              </div>
            </div>
          </>
        )}
      </AppShell>
    );
  }

  const authCard = <AuthCard authT={authT} returnTo={returnTo} state={state} />;

  /*
   * A deeplink brought a signed-out Student here, so login reads as a popup
   * interrupting their trip to that page, not as a fresh visit to "/" -- the
   * same auth background sits behind it either way, since Core has nothing
   * to show pre-login regardless of which page was requested.
   */
  if (returnTo !== null) {
    return (
      <AuthLayout
        eyebrow={authT('kicker')}
        featureAssigned={homeT('features.assigned')}
        featureDrafts={homeT('features.drafts')}
        featureTracking={homeT('features.tracking')}
        headline={homeT('headline')}
        headlineAccent={homeT('headlineAccent')}
        tagline={homeT('description')}
      >
        <Dialog open>
          <DialogContent>
            <DialogTitle className="sr-only">{authT('deeplink.heading')}</DialogTitle>
            <DialogDescription className="sr-only">
              {authT('deeplink.description')}
            </DialogDescription>
            {authCard}
          </DialogContent>
        </Dialog>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow={authT('kicker')}
      featureAssigned={homeT('features.assigned')}
      featureDrafts={homeT('features.drafts')}
      featureTracking={homeT('features.tracking')}
      headline={homeT('headline')}
      headlineAccent={homeT('headlineAccent')}
      tagline={homeT('description')}
    >
      {authCard}
    </AuthLayout>
  );
}

function AuthCard({
  authT,
  returnTo,
  state,
}: {
  authT: AuthTranslator;
  returnTo: string | null;
  state: StudentCollectionAuthPageState;
}) {
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
              <AlertTitle>{authT('errors.unavailable')}</AlertTitle>
              <AlertDescription>{authT('errors.network')}</AlertDescription>
            </Alert>
          ) : null}
          <LoginForm action={loginAction.bind(null, returnTo)} />
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
          <UserRoundCheckIcon aria-hidden="true" className="size-5 shrink-0" />
          {authT('login.accountHelp')}
        </p>
      ) : null}
    </>
  );
}
