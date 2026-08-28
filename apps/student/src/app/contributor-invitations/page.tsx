import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getStudentAuthPageState } from '@/lib/student-auth-page-state';
import { readStudentSessionToken } from '@/lib/student-auth-session';
import { getStudentServerEnvironment } from '@/lib/server-environment';
import { StudentWorksCoreClient } from '@/lib/student-works-core';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AccountInvitationResponseForm } from './invitation-forms';
import { StudentWorkspaceShell } from '../student-workspace-shell';
import { WorkspacePage } from '../workspace-page';

export default async function ContributorInvitationsPage() {
  const auth = await getStudentAuthPageState();
  if (auth.kind !== 'active') redirect('/?expired=1');
  const session = await readStudentSessionToken();
  if (session === null) redirect('/?expired=1');
  const [page, t] = await Promise.all([
    new StudentWorksCoreClient(getStudentServerEnvironment()).listReceivedInvitations(session),
    getTranslations('ContributorInvitations'),
  ]);
  return (
    <StudentWorkspaceShell
      activePage="invitations"
      canCreateWork={auth.session.canUseStudentCapabilities}
    >
      <WorkspacePage
        description={t('inboxHelp')}
        eyebrow="การยืนยันชื่อผู้ร่วมผลงาน"
        title={t('inboxHeading')}
      >
        <section className="grid gap-5" aria-label={t('inboxHeading')}>
          {page.items.length === 0 ? (
            <p className="rounded-surface border border-dashed border-border bg-card/70 p-10 text-center text-muted-foreground">
              {t('emptyInbox')}
            </p>
          ) : null}
          {page.items.map((invitation) => (
            <Card key={invitation.publicId}>
              <CardHeader>
                <Badge className="w-fit" variant="secondary">
                  {t(`states.${invitation.state}`)}
                </Badge>
                <CardTitle>{t('accountInvitation')}</CardTitle>
              </CardHeader>
              <CardContent>
                <AccountInvitationResponseForm invitation={invitation} />
              </CardContent>
            </Card>
          ))}
        </section>
      </WorkspacePage>
    </StudentWorkspaceShell>
  );
}
