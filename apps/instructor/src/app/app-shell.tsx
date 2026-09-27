import { cn } from '@showcase/ui/cn';
import { ChevronRightIcon, PlusIcon } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { GridPattern } from '@/components/ui/grid-pattern';
import { getInstructorAuthPageState } from '@/lib/instructor-auth-page-state';
import { readInstructorSessionToken } from '@/lib/instructor-auth-session';
import { InstructorCollectionGroupsCoreClient } from '@/lib/instructor-collection-groups-core';
import { getInstructorServerEnvironment } from '@/lib/server-environment';
import { AppNav, AppNavBar, type NavAccount, type NavLabels, type NavSection } from './app-nav';
import { HeaderLogoutButton } from './header-logout-button';
import { logoutAction } from './instructor-auth.actions';

export interface Breadcrumb {
  href?: string;
  label: string;
}

/**
 * The fixed menu, in the three runs the design groups it into.
 *
 * Only destinations that are real routes. The design also sketches a reports
 * and a settings entry; neither exists as a page, and a link that 404s costs
 * more than the symmetry it buys, so they are left out until they do.
 *
 * `pendingReview` badges the review queue when Core has a count for it. It is
 * the one number here that means "waiting on you", so it is the only one
 * badged -- a pill on every row would stop marking anything.
 */
async function getNavSections(pendingReview: number | undefined): Promise<NavSection[]> {
  const t = await getTranslations('Nav');

  return [
    {
      items: [{ href: '/dashboard', icon: 'layoutDashboard', label: t('dashboard') }],
      key: 'overview',
      label: t('overviewSection'),
    },
    {
      /*
       * Follow-up and review are one list until Core can filter it by status:
       * a separate review queue would either 404 or re-render the same rows
       * under a different name. The badge rides on the item that shows them.
       */
      items: [
        {
          ...(pendingReview === undefined ? {} : { badge: pendingReview }),
          href: '/students',
          icon: 'listChecks',
          label: t('students'),
        },
      ],
      key: 'tracking',
      label: t('trackingSection'),
    },
    {
      items: [
        { href: '/templates', icon: 'layoutTemplate', label: t('templates') },
        /*
         * `exact`, because the group pages are all `/rounds/...` and
         * `/groups/...`: without it the rounds link stays highlighted while a
         * group in the section below is the actual current page, so two items
         * claim to be current at once.
         */
        { exact: true, href: '/rounds', icon: 'calendarRange', label: t('rounds') },
      ],
      key: 'management',
      label: t('managementSection'),
    },
  ];
}

/**
 * The signed-in instructor, for the sidebar's account block.
 *
 * Core returns the name as nullable -- an account can exist before its person
 * record does -- and the page state is already resolved for every page behind
 * the shell, so this reuses it rather than making a second session call. A
 * failure is not worth taking the page down for: the generic label still says
 * a session is open.
 */
async function getNavAccount(): Promise<NavAccount> {
  const t = await getTranslations('Nav');

  try {
    const state = await getInstructorAuthPageState();
    const displayName = state.kind === 'active' ? state.session.displayName : null;
    if (displayName !== null) return { isFallback: false, name: displayName };
  } catch {
    /* Fall through to the generic label. */
  }

  return { isFallback: true, name: t('accountFallback') };
}

/**
 * The groups of the round currently being worked on.
 *
 * Only fetched when a page says which round it is on, so the sidebar costs one
 * extra call on group pages and nothing elsewhere. A failure here must never
 * take down the page around it: the section is a shortcut, and the same groups
 * remain reachable through `/rounds`.
 */
async function getGroupsSection(roundId: string | undefined): Promise<NavSection | undefined> {
  const t = await getTranslations('Nav');
  const sessionToken = await readInstructorSessionToken();
  if (sessionToken === null) return undefined;
  const client = new InstructorCollectionGroupsCoreClient(getInstructorServerEnvironment());

  try {
    /*
     * Off a round -- on the rounds list or templates -- the same slot lists the
     * rounds themselves, so the panel is never a pair of links above an empty
     * column, and switching round is one click from anywhere.
     */
    if (roundId === undefined) {
      const rounds = await client.listRounds(sessionToken);
      return {
        emptyLabel: t('roundsEmpty'),
        items: rounds.map((round) => ({
          href: `/rounds/${round.id}`,
          icon: 'calendarRange' as const,
          label: round.name,
        })),
        label: t('roundsSection'),
      };
    }

    const groups = await client.listGroups(sessionToken, roundId);
    return {
      emptyLabel: t('groupsEmpty'),
      /*
       * Each group carries the pages that live under it. They are real routes
       * the sidebar never linked, so reaching the tracking table or an export
       * meant opening the group first and hunting for the link there.
       */
      items: groups.map((group) => ({
        /*
         * Only the pages that are genuinely their own route. The roster and
         * the forms list are sections of the group page itself, so they are
         * reached by the parent link above -- repeating them here would be
         * two links to one page. `/groups/<id>/forms` is not a route at all:
         * only `forms/[formId]` exists beneath it.
         */
        children: [
          {
            href: `/groups/${group.id}/matrix`,
            icon: 'table' as const,
            label: t('groupMatrix'),
          },
          {
            href: `/groups/${group.id}/exports`,
            icon: 'fileSpreadsheet' as const,
            label: t('groupExports'),
          },
        ],
        href: `/groups/${group.id}`,
        icon: 'users' as const,
        label: group.name,
      })),
      label: t('groups'),
    };
  } catch {
    return undefined;
  }
}

/*
 * CSI is the lead mark on every signed-in screen. SIT is paired with it on the
 * sign-in page, where there is room; here the shell is only 17rem wide, so
 * carrying both marks would truncate the app name beside them.
 */
/**
 * The CSI mark with the application name.
 *
 * The full CSI lockup leads the expanded sidebar and top bar. Only the
 * collapsed rail substitutes the compact mark, because the wordmark cannot
 * remain legible inside its 44px content width.
 */
function BrandMark({
  isIconOnly = false,
  isSidebar = false,
  label,
  subtitle,
}: {
  isIconOnly?: boolean;
  isSidebar?: boolean;
  label: string;
  /** The owning faculty, under the app name. Dropped in the narrow top bar. */
  subtitle?: string;
}) {
  const mark = isIconOnly ? (
    <Image
      alt=""
      className="size-9 shrink-0 object-contain"
      height={512}
      priority
      sizes="36px"
      src="/brand/csi-compact-mark.png"
      width={512}
    />
  ) : (
    <Image
      alt=""
      className={cn('h-auto shrink-0', isSidebar ? 'w-40' : 'w-20')}
      height={363}
      priority
      sizes={isSidebar ? '160px' : '80px'}
      src="/brand/csi-computer-science-software-development-innovation.png"
      width={1280}
    />
  );

  if (isIconOnly) {
    return (
      <Link
        aria-label={label}
        className="flex size-11 items-center justify-center rounded-full"
        href="/rounds"
      >
        {mark}
      </Link>
    );
  }

  return (
    <Link
      className={cn(
        'flex min-w-0',
        isSidebar ? 'flex-col items-start gap-3' : 'items-center gap-2.5',
      )}
      href="/rounds"
    >
      {mark}
      <span className="flex min-w-0 flex-col">
        <span
          className={cn(
            'font-semibold tracking-tight text-foreground',
            isSidebar ? 'line-clamp-2 text-base leading-snug' : 'truncate text-sm',
          )}
        >
          {label}
        </span>
        {isSidebar && subtitle !== undefined ? (
          <span className="text-pretty text-xs leading-snug text-muted-foreground">{subtitle}</span>
        ) : null}
      </span>
    </Link>
  );
}

/*
 * The primary action, above the account block. It names the Instructor's goal
 * (creating a Form) while `/rounds` progressively asks for the existing Round
 * and Group, offering their creation only when either prerequisite is absent.
 */
function SidebarCallToAction({ description, label }: { description: string; label: string }) {
  return (
    <Link
      className="group flex items-center gap-3 rounded-surface bg-primary-soft px-3 py-2.5 transition-colors hover:bg-primary-soft/70 motion-reduce:transition-none"
      href="/rounds?createForm=1"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <PlusIcon aria-hidden="true" className="size-4.5" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium text-foreground">{label}</span>
        <span className="truncate text-xs text-muted-foreground">{description}</span>
      </span>
      <ChevronRightIcon
        aria-hidden="true"
        className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
      />
    </Link>
  );
}

function Breadcrumbs({ label, trail }: { label: string; trail: Breadcrumb[] }) {
  if (trail.length === 0) return null;

  return (
    <nav aria-label={label} className="flex min-w-0 items-center gap-1 text-sm">
      {trail.map((crumb, index) => (
        <span
          className="flex min-w-0 items-center gap-1"
          key={`${crumb.label}-${crumb.href ?? ''}`}
        >
          {index === 0 ? null : (
            <ChevronRightIcon
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground"
            />
          )}
          {crumb.href ? (
            <Link
              className="truncate text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none"
              href={crumb.href}
            >
              {crumb.label}
            </Link>
          ) : (
            <span aria-current="page" className="truncate font-medium text-foreground">
              {crumb.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

/*
 * The dashboard frame: a persistent sidebar on desktop, a top bar plus a
 * scrollable nav strip on small screens. Pages only supply their breadcrumb
 * trail and content, so navigation never differs between screens.
 */
export async function AppShell({
  children,
  pendingReview,
  roundId,
  trail = [],
  width = 'default',
}: {
  children: ReactNode;
  /**
   * The round this page belongs to, if any. Supplying it lists that round's
   * groups in the sidebar, so the work inside a round is one click away
   * instead of three.
   */
  /**
   * Submissions waiting to be checked, badged on the review-queue link. Only
   * pages that already load this pass it, so the shell never makes an extra
   * call of its own to decorate a link.
   */
  pendingReview?: number;
  roundId?: string;
  trail?: Breadcrumb[];
  /**
   * `wide` for pages whose content is genuinely two-dimensional -- the form
   * builder beside its preview, the matrix -- which `default` would squeeze.
   * Reading pages stay `default`, because a roster or a text column set to the
   * full window width is harder to scan, not easier.
   */
  width?: 'default' | 'wide';
}) {
  const [t, navAccount, navSections, groupsSection] = await Promise.all([
    getTranslations('Nav'),
    getNavAccount(),
    getNavSections(pendingReview),
    getGroupsSection(roundId),
  ]);

  /* The round/group shortcuts are one more titled run, appended after the
     fixed menu rather than handled as a special case beside it. */
  const sections = groupsSection === undefined ? navSections : [...navSections, groupsSection];

  const navLabels: NavLabels = {
    account: t('account'),
    collapse: t('collapseSidebar'),
    expand: t('expandSidebar'),
    sidebarLabel: t('sidebarLabel'),
  };

  return (
    <div className="app-canvas relative isolate flex min-h-svh gap-[var(--app-shell-gap)] lg:p-[var(--app-shell-gap)]">
      {/*
       * Decoration only. The mask fades the grid out below the fold so it
       * never competes with the tables and cards further down the page. A
       * phone has no margin to spare, so the grid is dropped there rather than
       * drawn across the page heading.
       */}
      <GridPattern className="fixed hidden sm:block [mask-image:radial-gradient(56rem_36rem_at_70%_0%,black,transparent)]" />
      {/*
       * The sidebar and its collapse state are one client unit: the whole
       * panel narrows together, so the brand mark and the sign-out foot are
       * handed down as children rather than rendered around it here.
       */}
      <AppNav
        account={navAccount}
        brand={{
          collapsed: <BrandMark isIconOnly label={t('brand')} />,
          expanded: <BrandMark isSidebar label={t('brand')} subtitle={t('brandSubtitle')} />,
        }}
        callToAction={
          <SidebarCallToAction description={t('createFormHint')} label={t('createForm')} />
        }
        foot={{
          collapsed: <HeaderLogoutButton action={logoutAction} isIconOnly />,
          expanded: <HeaderLogoutButton action={logoutAction} />,
        }}
        labels={navLabels}
        sections={sections}
      />

      <div className="app-panel relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden max-lg:rounded-none max-lg:border-0 max-lg:bg-transparent max-lg:shadow-none">
        <header className="app-topbar sticky top-0 z-10 border-b border-border/70">
          <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <span className="lg:hidden">
                <BrandMark label={t('brand')} />
              </span>
              <span className="hidden min-w-0 lg:block">
                <Breadcrumbs label={t('breadcrumbLabel')} trail={trail} />
              </span>
            </div>
            {/* Moved into the sidebar foot at `lg`; kept here below it. */}
            <span className="lg:hidden">
              <HeaderLogoutButton action={logoutAction} />
            </span>
          </div>
          <AppNavBar sections={sections} />
          {trail.length === 0 ? null : (
            <div className="border-t border-border/60 px-4 py-2 sm:px-6 lg:hidden">
              <Breadcrumbs label={t('breadcrumbLabel')} trail={trail} />
            </div>
          )}
        </header>

        <main
          className={`mx-auto flex w-full flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8 ${
            width === 'wide' ? 'max-w-7xl' : 'max-w-5xl'
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
