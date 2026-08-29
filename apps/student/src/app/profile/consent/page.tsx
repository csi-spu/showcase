import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getStudentAuthPageState } from '@/lib/student-auth-page-state';
import { readStudentSessionToken } from '@/lib/student-auth-session';
import { getStudentServerEnvironment } from '@/lib/server-environment';
import { StudentProfileCoreClient, StudentProfileCoreError } from '@/lib/student-profile-core';
import { StudentWorkspaceShell } from '../../student-workspace-shell';
import { WorkspacePage } from '../../workspace-page';
import { grantConsentAction, withdrawConsentAction } from '../profile.actions';
import { ConsentPanel } from '../profile-form';

export default async function ProfileConsentPage() {
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
  const t = await getTranslations('ProfilePage');
  const profile = response.profile;
  return (
    <StudentWorkspaceShell
      activePage="profile-consent"
      canCreateWork={state.session.canUseStudentCapabilities}
      profile={profile}
    >
      <WorkspacePage
        description={t('consent.description')}
        eyebrow={t('consent.kicker')}
        title={t('consent.heading')}
      >
        {profile === null ? (
          <p className="rounded-surface border border-border bg-muted p-5 text-muted-foreground">
            {t('consent.profileRequired')}
          </p>
        ) : (
          <ConsentPanel
            grantAction={grantConsentAction}
            idempotencyKey={randomUUID()}
            profile={profile}
            publicProfileUrl={new URL(
              `/people/${profile.publicId}`,
              getStudentServerEnvironment().visitorUrl,
            ).toString()}
            withdrawAction={withdrawConsentAction}
          />
        )}
      </WorkspacePage>
    </StudentWorkspaceShell>
  );
}
