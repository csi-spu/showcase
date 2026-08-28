'use client';

import {
  BellIcon,
  FolderKanbanIcon,
  HouseIcon,
  MailIcon,
  PlusIcon,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/animate-ui/components/radix/sidebar';

export type StudentWorkspacePage =
  'create-work' | 'home' | 'invitations' | 'notifications' | 'profile' | 'work';

export interface StudentSidebarItem {
  href: string;
  label: string;
  page: Exclude<StudentWorkspacePage, 'profile'>;
}

const PAGE_ICONS: Record<StudentSidebarItem['page'], LucideIcon> = {
  'create-work': PlusIcon,
  home: HouseIcon,
  invitations: MailIcon,
  notifications: BellIcon,
  work: FolderKanbanIcon,
};

export function StudentSidebarNavigation({
  activePage,
  items,
}: {
  activePage: StudentWorkspacePage;
  items: StudentSidebarItem[];
}) {
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <nav aria-label="เมนูนักศึกษา">
      <SidebarMenu>
        {items.map(({ href, label, page }) => {
          const Icon = PAGE_ICONS[page];
          const isActive = activePage === page;

          return (
            <SidebarMenuItem key={page}>
              <SidebarMenuButton asChild isActive={isActive} size="lg" tooltip={label}>
                <Link
                  aria-current={isActive ? 'page' : undefined}
                  href={href}
                  onClick={() => {
                    if (isMobile) setOpenMobile(false);
                  }}
                >
                  <Icon aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </nav>
  );
}
