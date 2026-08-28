import { Button } from '@showcase/ui/button';
import { getTranslations } from 'next-intl/server';
import { BlurFade } from '@/components/ui/blur-fade';
import { Card, CardContent } from '@/components/ui/card';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { readAttributionInvitationSession } from '@/lib/attribution-invitation-session';
import { getStudentServerEnvironment } from '@/lib/server-environment';
import { StudentWorksCoreClient } from '@/lib/student-works-core';
import { ExternalInvitationResponseForm } from '../invitation-forms';
import { InvitationExchange } from './invitation-exchange';
import {
  createAttributionRemovalRequestAction,
  exchangeExternalRecoveryCodeAction,
} from '../contributor-invitations.actions';
import { StudentBrand } from '../../student-brand';
import { WorkspacePage } from '../../workspace-page';

export const metadata = { referrer: 'no-referrer' };

export default async function ExternalContributorInvitationPage() {
  const session = await readAttributionInvitationSession();
  let invitation;
  let removalRequest = null;
  try {
    if (session === null) throw new Error('INVITATION_SESSION_MISSING');
    invitation = await new StudentWorksCoreClient(
      getStudentServerEnvironment(),
    ).getExternalInvitation(session);
    if (invitation.state === 'accepted') {
      removalRequest = await new StudentWorksCoreClient(
        getStudentServerEnvironment(),
      ).getAttributionRemovalRequest(session);
    }
  } catch {
    invitation = null;
  }
  const t = await getTranslations('ContributorInvitations');
  return (
    <main className="student-canvas mx-auto min-h-svh w-full max-w-[1600px] bg-background">
      <header className="border-b border-border/80 bg-background/90 px-[clamp(1rem,4vw,3rem)] py-5 backdrop-blur">
        <StudentBrand showSit />
      </header>
      <BlurFade className="px-[clamp(1rem,4vw,3rem)] py-10 lg:py-16" offset={8}>
        <WorkspacePage
          description={t('externalAcceptHelp')}
          eyebrow="การยืนยันชื่อผู้ร่วมผลงาน"
          title={t('externalAcceptHeading')}
        >
          <Card>
            <CardContent className="p-6 sm:p-8">
              {invitation === null ? (
                <div className="grid gap-8">
                  <InvitationExchange />
                  <form action={exchangeExternalRecoveryCodeAction}>
                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="recoveryCode">รหัสกู้คืนผู้ร่วมผลงาน</FieldLabel>
                        <Input id="recoveryCode" name="recoveryCode" required />
                      </Field>
                      <Button className="w-fit" type="submit">
                        ยืนยันรหัสกู้คืน
                      </Button>
                    </FieldGroup>
                  </form>
                </div>
              ) : invitation.state === 'accepted' ? (
                removalRequest === null ? (
                  <form action={createAttributionRemovalRequestAction}>
                    <FieldGroup>
                      <Field>
                        <p className="font-medium">
                          ขอถอนชื่อ {invitation.attributionName} จากผลงาน
                        </p>
                        <FieldDescription>
                          ผู้ดูแลจะตรวจคำขอและเผยแพร่ฉบับแก้ไขก่อนนำชื่อออก
                        </FieldDescription>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="removalReason">เหตุผล</FieldLabel>
                        <Textarea
                          id="removalReason"
                          minLength={10}
                          maxLength={1000}
                          name="reason"
                          required
                        />
                      </Field>
                      <Button className="w-fit" type="submit">
                        ส่งคำขอถอนชื่อ
                      </Button>
                    </FieldGroup>
                  </form>
                ) : (
                  <div className="grid gap-2">
                    <p className="font-medium">ส่งคำขอถอนชื่อแล้ว</p>
                    <p className="text-muted-foreground">{removalRequest.reason}</p>
                  </div>
                )
              ) : (
                <ExternalInvitationResponseForm invitation={invitation} />
              )}
            </CardContent>
          </Card>
        </WorkspacePage>
      </BlurFade>
    </main>
  );
}
