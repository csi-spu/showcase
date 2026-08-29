import { UserRoundIcon } from 'lucide-react';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/animate-ui/components/radix/sidebar';
import { Badge } from '@/components/ui/badge';
import { BlurFade } from '@/components/ui/blur-fade';
import { getStudentServerEnvironment } from '@/lib/server-environment';
import { readStudentSessionToken } from '@/lib/student-auth-session';
import { StudentProfileCoreClient, StudentProfileCoreError } from '@/lib/student-profile-core';
import { logoutAction } from './student-auth.actions';
import { LogoutForm } from './student-auth-forms';
import { StudentBrand } from './student-brand';
import {
  StudentSidebarNavigation,
  type StudentSidebarGroup,
  type StudentWorkspacePage,
} from './student-sidebar-navigation';

export type { StudentWorkspacePage } from './student-sidebar-navigation';

interface StudentSidebarProfile {
  entryYear: number;
  firstName: string;
  lastName: string;
  photo: { height: number; url: string; width: number } | null;
}

export async function StudentWorkspaceShell({
  activePage,
  canCreateWork,
  children,
  profile,
}: {
  activePage: StudentWorkspacePage;
  canCreateWork: boolean;
  children: ReactNode;
  profile?: StudentSidebarProfile | null;
}) {
  const [t, sidebarProfile] = await Promise.all([
    getTranslations('Workspace'),
    profile === undefined ? loadStudentSidebarProfile() : Promise.resolve(profile),
  ]);
  const groups: StudentSidebarGroup[] = [
    {
      items: [
        { href: '/', label: t('navigation.dashboard'), page: 'dashboard' },
        { href: '/notifications', label: t('navigation.notifications'), page: 'notifications' },
      ],
      label: t('navigation.overviewGroup'),
    },
    {
      items: [
        { href: '/works', label: t('navigation.allWorks'), page: 'works' },
        { href: '/works/new', label: t('navigation.addWork'), page: 'add-work' },
      ],
      label: t('navigation.workGroup'),
    },
    {
      items: [{ href: '/profile', label: t('navigation.editProfile'), page: 'edit-profile' }],
      label: t('navigation.profileGroup'),
    },
  ];
  const activeLabel = groups
    .flatMap((group) => group.items)
    .find((item) => item.page === activePage)?.label;
  const statusLabel = canCreateWork ? t('status.active') : t('status.readOnly');
  const rosterName = sidebarProfile
    ? `${sidebarProfile.firstName} ${sidebarProfile.lastName}`
    : t('profile.fallback');

  return (
    <SidebarProvider className="student-canvas mx-auto max-w-[1600px]">
      <Sidebar
        animateOnHover
        className="border-border/80 bg-sidebar/95 backdrop-blur"
        collapsible="icon"
        role="complementary"
      >
        <SidebarHeader className="gap-3 p-5 group-data-[collapsible=icon]:p-2">
          <StudentBrand className="group-data-[collapsible=icon]:hidden" />
          <div className="hidden size-8 place-items-center rounded-control bg-primary text-xs font-semibold text-primary-foreground group-data-[collapsible=icon]:grid">
            CSI
          </div>
          <p className="text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">
            {t('workspace')}
          </p>
        </SidebarHeader>
        <SidebarContent>
          <StudentSidebarNavigation activePage={activePage} groups={groups} />
        </SidebarContent>
        <SidebarFooter className="gap-3 p-4 group-data-[collapsible=icon]:p-2">
          <Link
            className="flex min-w-0 items-center gap-3 rounded-control border border-sidebar-border bg-background/70 p-2 transition-colors hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0"
            href="/profile"
          >
            <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-primary-soft text-primary group-data-[collapsible=icon]:size-8">
              {sidebarProfile?.photo ? (
                <Image
                  alt={t('profile.photoAlt', { name: rosterName })}
                  className="object-cover"
                  fill
                  sizes="40px"
                  src="/profile/photo"
                  unoptimized
                />
              ) : (
                <UserRoundIcon aria-hidden="true" className="size-5" />
              )}
            </span>
            <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <span className="block truncate text-sm font-semibold">{rosterName}</span>
              {sidebarProfile ? (
                <span className="block truncate text-xs text-muted-foreground">
                  {t('profile.entryYear', { year: sidebarProfile.entryYear })}
                </span>
              ) : null}
            </span>
          </Link>
          <div className="flex flex-wrap items-center gap-2 group-data-[collapsible=icon]:hidden">
            <Badge className="w-fit" variant="secondary">
              {statusLabel}
            </Badge>
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {t('department')}
            </span>
          </div>
          <div className="group-data-[collapsible=icon]:hidden">
            <LogoutForm action={logoutAction} />
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-w-0 bg-transparent">
        <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-4 border-b border-border/80 bg-background px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <SidebarTrigger
              aria-label={t('navigation.openMenu')}
              title={t('navigation.openMenu')}
            />
            <StudentBrand className="md:hidden" />
            <div className="hidden min-w-0 items-center gap-3 text-sm md:flex">
              <span className="text-muted-foreground">{t('workspace')}</span>
              <span aria-hidden="true" className="text-border">
                /
              </span>
              <span className="truncate font-medium">{activeLabel}</span>
            </div>
          </div>
          <Badge className="hidden sm:flex" variant="outline">
            {statusLabel}
          </Badge>
        </header>
        <section className="p-4 pb-12 sm:p-8 sm:pb-16 lg:p-12 lg:pb-20">
          <BlurFade offset={8}>{children}</BlurFade>
        </section>
      </SidebarInset>
    </SidebarProvider>
  );
}

async function loadStudentSidebarProfile(): Promise<StudentSidebarProfile | null> {
  const sessionToken = await readStudentSessionToken();
  if (sessionToken === null) return null;

  try {
    const response = await new StudentProfileCoreClient(getStudentServerEnvironment()).getProfile(
      sessionToken,
    );
    return response.person === null
      ? null
      : { ...response.person, photo: response.profile?.photo ?? null };
  } catch (error: unknown) {
    if (
      error instanceof StudentProfileCoreError &&
      ['AUTH_SERVICE_UNAVAILABLE', 'SESSION_EXPIRED', 'UNAUTHENTICATED'].includes(error.code)
    ) {
      return null;
    }
    throw error;
  }
}
