'use client';

import { cn } from '@showcase/ui/cn';
import {
  CalendarRangeIcon,
  ChartColumnIcon,
  ClockIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  LayoutTemplateIcon,
  ListChecksIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  TableIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useSyncExternalStore } from 'react';

/*
 * Icons are resolved here, inside the client boundary. A Server Component
 * cannot pass a component across that boundary -- React can only serialize
 * plain data -- so a server-rendered shell sends this key instead and the
 * lookup below turns it back into the icon.
 */
const NAV_ICONS = {
  calendarRange: CalendarRangeIcon,
  chartColumn: ChartColumnIcon,
  clock: ClockIcon,
  fileSpreadsheet: FileSpreadsheetIcon,
  fileText: FileTextIcon,
  layoutDashboard: LayoutDashboardIcon,
  layoutTemplate: LayoutTemplateIcon,
  listChecks: ListChecksIcon,
  table: TableIcon,
  users: UsersIcon,
} satisfies Record<string, LucideIcon>;

export type NavIconName = keyof typeof NAV_ICONS;

export interface NavItem {
  /**
   * A count worth acting on, shown as a pill against the label. Only for
   * work that is waiting -- a badge on a number that never falls to zero is
   * decoration, and it stops meaning "you" the moment it is always lit.
   */
  badge?: number;
  /**
   * Pages nested under this one, revealed while it is the section being
   * worked on. A group's forms, tracking table and exports are real pages
   * that the sidebar previously never linked, so reaching them meant walking
   * down from the group page that showed none of them.
   */
  children?: NavItem[];
  exact?: boolean;
  href: string;
  icon: NavIconName;
  label: string;
}

/**
 * A heading with its own links, for the groups of the round being worked on.
 *
 * The sidebar listed only `/rounds` and `/templates`, so reaching a group --
 * where forms, the matrix and exports all live -- meant walking round, then
 * group, from a page that showed neither. Lifting the current round's groups
 * into the sidebar makes that one click, and gives the 17rem panel something
 * to hold.
 */
export interface NavSection {
  items: NavItem[];
  /** Shown in place of the links when the section has nothing to list. */
  emptyLabel?: string;
  /** Distinguishes sections in a list of them; falls back to the label. */
  key?: string;
  label: string;
}

/**
 * The signed-in instructor, as the sidebar shows them.
 *
 * `name` is already resolved by the shell -- Core returns it as nullable, and
 * the fallback wording belongs in `messages/` with everything else -- so this
 * boundary only ever receives a string to render.
 */
export interface NavAccount {
  name: string;
  /** `true` when `name` is the generic fallback, not a real person's name. */
  isFallback: boolean;
}

/** Wording the shell passes in, so every string stays in `messages/`. */
export interface NavLabels {
  /** Names the account block for screen readers. */
  account: string;
  collapse: string;
  expand: string;
  sidebarLabel: string;
}

const COLLAPSED_STORAGE_KEY = 'instructor.sidebar.collapsed';

/*
 * The collapse preference lives in `localStorage`, which is external state
 * React does not own, so it is subscribed to rather than copied into state.
 * `storage` fires in this tab's siblings; `listeners` covers this tab, whose
 * own writes that event deliberately skips.
 */
const collapsedListeners = new Set<() => void>();

function subscribeToCollapsed(onChange: () => void): () => void {
  collapsedListeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    collapsedListeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === 'true';
  } catch {
    /* Private-mode browsers throw on access; expanded is the safe default. */
    return false;
  }
}

/*
 * Rendered on the server there is no storage to read, so the sidebar starts
 * expanded and React reconciles to the stored value on hydration. Returning
 * anything else here would make the two markups disagree.
 */
function readCollapsedOnServer(): boolean {
  return false;
}

function writeCollapsed(next: boolean): void {
  try {
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
  } catch {
    /* The preference is not worth failing the interaction over. */
  }
  for (const listener of collapsedListeners) listener();
}

/** Whether the sidebar is collapsed, remembered across navigations. */
function useIsCollapsed(): [boolean, (next: boolean) => void] {
  const isCollapsed = useSyncExternalStore(
    subscribeToCollapsed,
    readCollapsed,
    readCollapsedOnServer,
  );
  return [isCollapsed, useCallback((next: boolean) => writeCollapsed(next), [])];
}

function useIsActive(item: NavItem): boolean {
  const pathname = usePathname();
  return item.exact === true ? pathname === item.href : pathname.startsWith(item.href);
}

function NavLink({ isCollapsed, item }: { isCollapsed: boolean; item: NavItem }) {
  const isActive = useIsActive(item);
  const Icon = NAV_ICONS[item.icon];

  return (
    <Link
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex items-center text-sm font-medium transition-colors motion-reduce:transition-none',
        /* Collapsed the target is the icon itself, so it becomes a square
           tap target rather than a full-width row with nothing in it. */
        isCollapsed
          ? 'size-11 justify-center self-center rounded-full'
          : 'gap-3 rounded-control px-3 py-2.5',
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
      href={item.href}
      /*
       * Collapsed, the label is gone from the page, so the icon alone has to
       * name the destination -- as a hover tooltip and, via `aria-label`, to a
       * screen reader. Expanded, the visible text does that job and repeating
       * it here would have it announced twice.
       */
      {...(isCollapsed ? { 'aria-label': item.label, title: item.label } : {})}
    >
      {/* Collapsed there is no room for the count, but losing it entirely
          would hide that work is waiting, so it becomes a marker on the
          icon. `aria-label` above still carries the label; the count itself
          is announced by the expanded panel and the page it links to. */}
      <span className="relative flex shrink-0">
        <Icon aria-hidden="true" className="size-4.5" />
        {isCollapsed && item.badge !== undefined && item.badge > 0 ? (
          <span
            aria-hidden="true"
            className={cn(
              'absolute -top-0.5 -right-1 size-2 rounded-full ring-2 ring-sidebar',
              isActive ? 'bg-primary-foreground' : 'bg-primary',
            )}
          />
        ) : null}
      </span>
      {isCollapsed ? null : (
        <>
          <span className="truncate">{item.label}</span>
          {item.badge === undefined || item.badge === 0 ? null : (
            /*
             * The count is part of the link's name, not a separate thing to
             * find: read as "คิวรอตรวจ, 8" rather than leaving a screen
             * reader with a bare number after the label.
             */
            <span
              className={cn(
                'ml-auto rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
                isActive
                  ? 'bg-primary-foreground/20 text-primary-foreground'
                  : 'bg-primary-soft text-accent-foreground',
              )}
            >
              {item.badge}
            </span>
          )}
        </>
      )}
    </Link>
  );
}

/**
 * A link with its own nested pages.
 *
 * The children are shown whenever the parent's section is the one being
 * worked on, rather than behind a separate click: the parent is already the
 * current page in that case, so hiding its pages would cost a click to reveal
 * what the person just navigated to. Collapsed there is no room to indent, so
 * only the parent icon shows and the children are reached from its page.
 */
function NavBranch({ isCollapsed, item }: { isCollapsed: boolean; item: NavItem }) {
  const pathname = usePathname();
  const children = item.children ?? [];
  const isOpen = pathname.startsWith(item.href);

  if (isCollapsed || children.length === 0) {
    return <NavLink isCollapsed={isCollapsed} item={item} />;
  }

  return (
    <div className="flex flex-col gap-1">
      <NavLink isCollapsed={false} item={item} />
      {isOpen ? (
        /*
         * A nested list, not a run of siblings: the indent is visual, and
         * without the nesting a screen reader would read the children as
         * continuing the level above rather than belonging to this group.
         */
        <ul className="ml-[1.4rem] flex flex-col gap-0.5 border-l border-sidebar-border pl-2">
          {children.map((child) => (
            <li key={child.href}>
              <NavChildLink item={child} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function NavChildLink({ item }: { item: NavItem }) {
  const isActive = useIsActive(item);
  const Icon = NAV_ICONS[item.icon];

  return (
    <Link
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2.5 rounded-control px-2.5 py-2 text-sm transition-colors motion-reduce:transition-none',
        isActive
          ? 'bg-accent font-medium text-accent-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
      href={item.href}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/** A labelled run of links. The heading is dropped when only icons show. */
function NavGroup({
  emptyLabel,
  isCollapsed,
  items,
  label,
}: {
  emptyLabel: string | undefined;
  isCollapsed: boolean;
  items: NavItem[];
  label: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      {/*
       * A real heading, not a styled paragraph, so each run of links is a
       * labelled block a screen reader can jump to rather than one long list.
       * Collapsed there is no room for it, but the block must stay labelled,
       * so it becomes the group's accessible name instead of visible text.
       */}
      <h2
        className={cn(
          'px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase',
          isCollapsed && 'sr-only',
        )}
      >
        {label}
      </h2>
      {items.length === 0 ? (
        emptyLabel === undefined || isCollapsed ? null : (
          <p className="px-3 py-2 text-sm text-muted-foreground">{emptyLabel}</p>
        )
      ) : (
        <div className="flex flex-col gap-1">
          {items.map((item) => (
            <NavBranch isCollapsed={isCollapsed} item={item} key={item.href} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Desktop navigation: one floating sidebar panel with two widths.
 *
 * Collapsed it narrows to a strip of icons; expanded it shows the brand mark,
 * the group headings and every label. It is the same panel and the same links
 * throughout -- collapsing changes what is drawn, never what is reachable.
 *
 * Collapse lives here rather than in the server shell because the state is a
 * per-person preference read from storage, and because the whole panel -- the
 * brand mark and the sign-out foot the shell passes as children included --
 * has to narrow with it.
 */
/*
 * The signed-in instructor, above sign-out. Not a link: there is no account
 * page to open yet, and a control that looks clickable and does nothing is
 * worse than plain text.
 */
function NavAccountBlock({
  account,
  isCollapsed,
  label,
}: {
  account: NavAccount;
  isCollapsed: boolean;
  label: string;
}) {
  /*
   * Thai names have no Latin-style initials, so the avatar takes the first
   * character of the name -- which is the first letter of the given name once
   * an honorific is dropped. `Array.from`, because a Thai syllable can be
   * several code units and `[0]` would cut one in half.
   */
  const initial = Array.from(account.name)[0] ?? '';

  return (
    <div
      className={cn('flex items-center gap-2.5', isCollapsed && 'justify-center')}
      /* Collapsed the name is not rendered, so the avatar carries it. */
      {...(isCollapsed ? { title: account.name } : {})}
    >
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-accent-foreground"
      >
        {initial}
      </span>
      <span className={cn('flex min-w-0 flex-col', isCollapsed && 'sr-only')}>
        <span className="text-xs text-muted-foreground">{label}</span>
        {/* Two lines before ellipsis: Thai does not break on spaces, so one
            truncated line loses most of a full name. */}
        <span
          className={cn(
            'line-clamp-2 text-sm leading-snug font-medium',
            account.isFallback ? 'text-muted-foreground' : 'text-foreground',
          )}
        >
          {account.name}
        </span>
      </span>
    </div>
  );
}

export function AppNav({
  account,
  brand,
  callToAction,
  foot,
  labels,
  sections,
}: {
  /**
   * Who is signed in. The panel showed no identity at all, so on a shared
   * teaching machine there was nothing to check before acting as someone.
   */
  account: NavAccount;
  /** Brand variants rendered by the server shell, which owns the image. */
  brand: { collapsed: React.ReactNode; expanded: React.ReactNode };
  /**
   * The primary action, pinned above the account block. Passed as a node
   * because the shell owns the link and its wording.
   */
  callToAction?: React.ReactNode;
  /**
   * Sign-out, anchored to the bottom of the panel, in both widths.
   *
   * Two finished nodes rather than one function of the collapsed state: the
   * shell rendering these is a Server Component, and React can only serialize
   * plain data across that boundary -- a callback would throw. Collapse is
   * known only here, and the button has to drop its label to fit the narrow
   * panel, so the choice is made here from nodes built there.
   */
  foot: { collapsed: React.ReactNode; expanded: React.ReactNode };
  labels: NavLabels;
  /**
   * The menu, as titled runs of links, in the order they are drawn. A list
   * rather than a fixed pair, because the panel now carries several named
   * groups and the round/group shortcuts are just one more of them.
   */
  sections: NavSection[];
}) {
  const [isCollapsed, setCollapsed] = useIsCollapsed();

  return (
    <aside
      aria-label={labels.sidebarLabel}
      className={cn(
        'app-sidebar sticky top-[var(--app-shell-gap)] hidden h-[calc(100svh-var(--app-shell-gap)*2)] flex-col gap-5 overflow-hidden py-5 lg:flex',
        isCollapsed
          ? 'w-[var(--app-sidebar-collapsed-width)] px-3'
          : 'w-[var(--app-sidebar-width)] px-4',
      )}
    >
      {/* The compact state retains the product mark above the toggle. Expanded,
          the toggle occupies the opposite top corner without reducing the
          width available to the application name below it. */}
      <div className={cn('relative', isCollapsed && 'flex flex-col items-center gap-2')}>
        {isCollapsed ? brand.collapsed : <div className="min-w-0">{brand.expanded}</div>}
        <button
          aria-expanded={!isCollapsed}
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground motion-reduce:transition-none',
            !isCollapsed && 'absolute top-0 right-0',
          )}
          onClick={() => setCollapsed(!isCollapsed)}
          title={isCollapsed ? labels.expand : labels.collapse}
          type="button"
        >
          <span className="sr-only">{isCollapsed ? labels.expand : labels.collapse}</span>
          {isCollapsed ? (
            <PanelLeftOpenIcon aria-hidden="true" className="size-5" />
          ) : (
            <PanelLeftCloseIcon aria-hidden="true" className="size-5" />
          )}
        </button>
      </div>

      {/* Centred while the menu fits; when it grows past the available space,
          auto margins resolve to zero and this remains a normal top-to-bottom
          scroll region. The brand and account controls never move. */}
      <nav className="-mr-1 flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
        <div className="my-auto flex w-full shrink-0 flex-col gap-5 py-1">
          {sections.map((navSection) => (
            <NavGroup
              emptyLabel={navSection.emptyLabel}
              isCollapsed={isCollapsed}
              items={navSection.items}
              key={navSection.key ?? navSection.label}
              label={navSection.label}
            />
          ))}
        </div>
      </nav>

      {/*
       * Sign-out anchors the bottom of the panel. The sidebar is a full
       * viewport tall, so with every item packed against the top it read as
       * a mostly empty column; giving the foot its own content closes that
       * gap and moves a destructive-ish action out of the top bar, where it
       * sat beside the page title. It stays in the top bar below `lg`,
       * where there is no sidebar to hold it.
       */}
      <div className="mt-auto flex flex-col gap-3 border-t border-sidebar-border pt-3">
        {callToAction === undefined || isCollapsed ? null : callToAction}
        <NavAccountBlock account={account} isCollapsed={isCollapsed} label={labels.account} />
        {isCollapsed ? foot.collapsed : foot.expanded}
      </div>
    </aside>
  );
}

/** Mobile navigation: a compact bar under the top bar, same items and states. */
export function AppNavBar({ sections }: { sections: NavSection[] }) {
  /* Flattened: one scrolling strip has no room for headings, but every
     destination the sidebar offers must still be reachable here. */
  const items = sections.flatMap((section) => section.items);

  return (
    <nav className="flex gap-1 overflow-x-auto px-4 pb-2 lg:hidden">
      {items.map((item) => (
        <MobileNavLink item={item} key={item.href} />
      ))}
    </nav>
  );
}

function MobileNavLink({ item }: { item: NavItem }) {
  const isActive = useIsActive(item);
  const Icon = NAV_ICONS[item.icon];

  return (
    <Link
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors motion-reduce:transition-none',
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
      href={item.href}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {item.label}
    </Link>
  );
}
