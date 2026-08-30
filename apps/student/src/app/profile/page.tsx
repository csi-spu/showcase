import { randomUUID } from 'node:crypto';
import { ExternalLinkIcon, GraduationCapIcon, LinkIcon, UserRoundIcon } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getStudentAuthPageState } from '@/lib/student-auth-page-state';
import { readStudentSessionToken } from '@/lib/student-auth-session';
import { getStudentServerEnvironment } from '@/lib/server-environment';
import { StudentProfileCoreClient, StudentProfileCoreError } from '@/lib/student-profile-core';
import {
  createPhotoUploadAction,
  finalizePhotoUploadAction,
  grantConsentAction,
  updateProfileAction,
  withdrawConsentAction,
} from './profile.actions';
import {
  ConsentPanel,
  ProfileForm,
  ProfileOverviewEditLink,
  ProfilePhotoButton,
} from './profile-form';
import { ProfileSecurityPanel } from './profile-security-panel';
import { StudentWorkspaceShell } from '../student-workspace-shell';

interface ProfilePageProps {
  searchParams: Promise<{ passwordChanged?: string }>;
}

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const { passwordChanged } = await searchParams;
  const state = await getStudentAuthPageState();
  if (state.kind !== 'active') redirect('/');
  const sessionToken = await readStudentSessionToken();
  if (sessionToken === null) redirect('/?expired=1');

  let response;
  try {
    response = await new StudentProfileCoreClient(getStudentServerEnvironment()).getProfile(
      sessionToken,
    );
  } catch (error: unknown) {
    if (
      error instanceof StudentProfileCoreError &&
      ['SESSION_EXPIRED', 'UNAUTHENTICATED'].includes(error.code)
    ) {
      redirect('/?expired=1');
    }
    throw error;
  }
  const [t, updateIdempotencyKey, photoIdempotencyKey, consentIdempotencyKey] = await Promise.all([
    getTranslations('ProfilePage'),
    Promise.resolve(randomUUID()),
    Promise.resolve(randomUUID()),
    Promise.resolve(randomUUID()),
  ]);
  const rosterName = response.person
    ? `${response.person.firstName} ${response.person.lastName}`
    : t('nameUnavailable');
  const publicProfileUrl =
    response.profile === null
      ? undefined
      : new URL(
          `/people/${response.profile.publicId}`,
          getStudentServerEnvironment().visitorUrl,
        ).toString();
  const profileHeading = (
    <div className="grid min-w-0 gap-1">
      <h1 className="text-balance break-words text-[clamp(1.5rem,4vw,2.6rem)] leading-tight font-semibold tracking-[-0.035em]">
        {rosterName}
      </h1>
      <p className="max-w-[60ch] text-pretty text-muted-foreground">
        {response.profile?.bio || t('bioFallback')}
      </p>
      {response.person ? (
        <p className="mt-1 flex items-center gap-2 text-sm font-medium text-foreground/80">
          <GraduationCapIcon aria-hidden="true" className="size-4 text-primary" />
          {t('entryYear', { year: response.person.entryYear })}
        </p>
      ) : null}
    </div>
  );

  return (
    <StudentWorkspaceShell
      activePage="edit-profile"
      profile={
        response.person === null
          ? null
          : {
              ...response.person,
              photo: response.profile?.photo ?? null,
              photoVersion: response.profile?.version ?? 0,
            }
      }
    >
      <main className="mx-auto grid max-w-[78rem] gap-6">
        <header className="rounded-surface border border-border/80 bg-card shadow-[0_1.5rem_4rem_-3rem_rgba(50,20,45,0.18)]">
          <div className="flex items-center gap-4 rounded-surface px-5 py-6 sm:gap-6 sm:px-7 lg:px-9 lg:py-8">
            <ProfilePhotoButton
              canEditProfile={response.canEditProfile}
              hasPhoto={response.profile?.photo !== null && response.profile?.photo !== undefined}
              photoAlt={t('photoAlt', { name: rosterName })}
              photoVersion={response.profile?.version ?? 0}
            />
            {response.canEditProfile ? (
              <ProfileOverviewEditLink label={t('edit')}>{profileHeading}</ProfileOverviewEditLink>
            ) : (
              <div className="min-w-0 flex-1 p-2">{profileHeading}</div>
            )}
          </div>
        </header>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(16rem,0.72fr)_minmax(0,1.65fr)]">
          <aside className="grid scroll-mt-24 gap-6 lg:sticky lg:top-24" id="profile-overview">
            <section className="grid gap-5 rounded-surface border border-border/80 bg-card p-5 sm:p-6">
              <header className="grid gap-1">
                <h2 className="text-lg font-semibold tracking-tight">{t('summaryHeading')}</h2>
                <p className="text-sm text-muted-foreground">{t('summaryHelp')}</p>
              </header>
              <dl className="grid gap-4 border-t border-border/80 pt-5 text-sm">
                <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-3">
                  <UserRoundIcon
                    aria-hidden="true"
                    className="mt-0.5 size-5 text-muted-foreground"
                  />
                  <div>
                    <dt className="text-xs text-muted-foreground">{t('rosterName')}</dt>
                    <dd className="mt-0.5 font-medium">{rosterName}</dd>
                  </div>
                </div>
                {response.person ? (
                  <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-3">
                    <GraduationCapIcon
                      aria-hidden="true"
                      className="mt-0.5 size-5 text-muted-foreground"
                    />
                    <div>
                      <dt className="text-xs text-muted-foreground">{t('entryYearLabel')}</dt>
                      <dd className="mt-0.5 font-medium">{response.person.entryYear}</dd>
                    </div>
                  </div>
                ) : null}
                <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-3">
                  <LinkIcon aria-hidden="true" className="mt-0.5 size-5 text-muted-foreground" />
                  <div>
                    <dt className="text-xs text-muted-foreground">{t('linksLabel')}</dt>
                    <dd className="mt-0.5 font-medium">
                      {t('linkCount', { count: response.profile?.links.length ?? 0 })}
                    </dd>
                  </div>
                </div>
              </dl>
              {response.profile?.consent && publicProfileUrl ? (
                <a
                  className="inline-flex w-fit items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                  href={publicProfileUrl}
                >
                  {t('viewPublic')}
                  <ExternalLinkIcon aria-hidden="true" className="size-4" />
                </a>
              ) : null}
            </section>

            <ConsentPanel
              grantAction={grantConsentAction}
              idempotencyKey={consentIdempotencyKey}
              key={response.profile?.version ?? 0}
              profile={response.profile}
              publicProfileUrl={publicProfileUrl}
              withdrawAction={withdrawConsentAction}
            />
          </aside>

          <div className="grid min-w-0 gap-6" id="profile-editor-column">
            <ProfileForm
              canEditProfile={response.canEditProfile}
              createPhotoUpload={createPhotoUploadAction}
              finalizePhotoUpload={finalizePhotoUploadAction}
              idempotencyKey={updateIdempotencyKey}
              photoIdempotencyKey={photoIdempotencyKey}
              profile={response.profile}
              updateAction={updateProfileAction}
            />
            <ProfileSecurityPanel
              actionLabel={t('security.action')}
              description={t('security.description')}
              heading={t('security.heading')}
              isPasswordChanged={passwordChanged === '1'}
              successMessage={t('security.success')}
            />
          </div>
        </div>
      </main>
    </StudentWorkspaceShell>
  );
}
