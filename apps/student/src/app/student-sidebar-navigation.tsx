'use client';

import {
  BellIcon,
  FilePlus2Icon,
  FolderKanbanIcon,
  HouseIcon,
  ShieldCheckIcon,
  UserRoundPenIcon,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/animate-ui/components/radix/sidebar';

export type StudentWorkspacePage =
  'add-work' | 'dashboard' | 'edit-profile' | 'notifications' | 'profile-consent' | 'works';

export interface StudentSidebarItem {
  href: string;
  label: string;
  page: StudentWorkspacePage;
}

export interface StudentSidebarGroup {
  items: StudentSidebarItem[];
  label: string;
}

const PAGE_ICONS: Record<StudentWorkspacePage, LucideIcon> = {
  'add-work': FilePlus2Icon,
  dashboard: HouseIcon,
  'edit-profile': UserRoundPenIcon,
  notifications: BellIcon,
  'profile-consent': ShieldCheckIcon,
  works: FolderKanbanIcon,
};

export function StudentSidebarNavigation({
  activePage,
  groups,
}: {
  activePage: StudentWorkspacePage;
  groups: StudentSidebarGroup[];
}) {
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <nav aria-label="เมนูนักศึกษา">
      {groups.map((group) => (
        <SidebarGroup key={group.label}>
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map(({ href, label, page }) => {
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
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </nav>
  );
}
