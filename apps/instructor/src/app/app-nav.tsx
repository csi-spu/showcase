'use client';

import { cn } from '@showcase/ui/cn';
import { CalendarRangeIcon, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/*
 * Icons are resolved here, inside the client boundary. A Server Component
 * cannot pass a component across that boundary -- React can only serialize
 * plain data -- so a server-rendered shell sends this key instead and the
 * lookup below turns it back into the icon.
 */
const NAV_ICONS = { calendarRange: CalendarRangeIcon } satisfies Record<string, LucideIcon>;

export type NavIconName = keyof typeof NAV_ICONS;

export interface NavItem {
  exact?: boolean;
  href: string;
  icon: NavIconName;
  label: string;
}

function useIsActive(item: NavItem): boolean {
  const pathname = usePathname();
  return item.exact === true ? pathname === item.href : pathname.startsWith(item.href);
}

function NavLink({ item }: { item: NavItem }) {
  const isActive = useIsActive(item);
  const Icon = NAV_ICONS[item.icon];

  return (
    <Link
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-medium transition-colors motion-reduce:transition-none',
        isActive
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
      href={item.href}
    >
      <Icon aria-hidden="true" className="size-4.5 shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/** Desktop sidebar navigation. */
export function AppNav({ items }: { items: NavItem[] }) {
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => (
        <NavLink item={item} key={item.href} />
      ))}
    </nav>
  );
}

/** Mobile navigation: a compact bar under the top bar, same items and states. */
export function AppNavBar({ items }: { items: NavItem[] }) {
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
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
      href={item.href}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {item.label}
    </Link>
  );
}
