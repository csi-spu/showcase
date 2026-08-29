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
import { WorkspacePage } from '../workspace-page';

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

  return (
    <StudentWorkspaceShell
      activePage="edit-profile"
      canCreateWork={state.session.canUseStudentCapabilities}
      profile={response.profile}
    >
      <WorkspacePage
        description={t('description')}
        eyebrow="โปรไฟล์สาธารณะ"
        meta={response.profile ? t('entryYear', { year: response.profile.entryYear }) : undefined}
        title={t('heading')}
      >
        <div className="grid gap-8">
          <ProfileForm
            canEditProfile={response.canEditProfile}
            createPhotoUpload={createPhotoUploadAction}
            finalizePhotoUpload={finalizePhotoUploadAction}
            idempotencyKey={updateIdempotencyKey}
            profile={response.profile}
            updateAction={updateProfileAction}
          />
          <ConsentPanel
            grantAction={grantConsentAction}
            idempotencyKey={consentIdempotencyKey}
            profile={response.profile}
            publicProfileUrl={
              response.profile === null
                ? undefined
                : new URL(
                    `/people/${response.profile.publicId}`,
                    getStudentServerEnvironment().visitorUrl,
                  ).toString()
            }
            withdrawAction={withdrawConsentAction}
          />
        </div>
      </WorkspacePage>
    </StudentWorkspaceShell>
  );
}
