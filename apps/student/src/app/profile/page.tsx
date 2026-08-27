import { randomUUID } from 'node:crypto';
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
import { ConsentPanel, ProfileForm } from './profile-form';
import { StudentWorkspaceShell } from '../student-workspace-shell';

export default async function ProfilePage() {
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
  const [t, updateIdempotencyKey, consentIdempotencyKey] = await Promise.all([
    getTranslations('ProfilePage'),
    Promise.resolve(randomUUID()),
    Promise.resolve(randomUUID()),
  ]);
  const publicProfileUrl = response.profile
    ? new URL(
        `/people/${response.profile.publicId}`,
        getStudentServerEnvironment().visitorUrl,
      ).toString()
    : undefined;

  return (
    <StudentWorkspaceShell
      activePage="profile"
      canCreateWork={state.session.canUseStudentCapabilities}
    >
      <div className="grid gap-10 lg:grid-cols-12">
        <header className="grid content-start gap-4 lg:col-span-4">
          <p className="text-sm font-semibold tracking-[0.16em] text-primary">PUBLIC PROFILE</p>
          <h1 className="text-3xl leading-[1.25] font-semibold tracking-tight sm:text-4xl">
            {t('heading')}
          </h1>
          <p className="text-muted-foreground">{t('description')}</p>
          {response.profile ? (
            <p className="text-sm text-muted-foreground">
              {t('entryYear', { year: response.profile.entryYear })}
            </p>
          ) : null}
        </header>
        <div className="grid gap-10 lg:col-span-8">
          <ProfileForm
            canEditProfile={response.canEditProfile}
            createPhotoUpload={createPhotoUploadAction}
            finalizePhotoUpload={finalizePhotoUploadAction}
            idempotencyKey={updateIdempotencyKey}
            profile={response.profile}
            updateAction={updateProfileAction}
          />
          {response.profile ? (
            <ConsentPanel
              grantAction={grantConsentAction}
              idempotencyKey={consentIdempotencyKey}
              profile={response.profile}
              publicProfileUrl={publicProfileUrl}
              withdrawAction={withdrawConsentAction}
            />
          ) : null}
        </div>
      </div>
    </StudentWorkspaceShell>
  );
}
