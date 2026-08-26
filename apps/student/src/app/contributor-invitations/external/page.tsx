import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { readAttributionInvitationSession } from '@/lib/attribution-invitation-session';
import { getStudentServerEnvironment } from '@/lib/server-environment';
import { StudentWorksCoreClient } from '@/lib/student-works-core';
import { ExternalInvitationResponseForm } from '../invitation-forms';
import { InvitationExchange } from './invitation-exchange';
import {
  createAttributionRemovalRequestAction,
  exchangeExternalRecoveryCodeAction,
} from '../contributor-invitations.actions';

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
    <main className="mx-auto min-h-svh w-full max-w-[1440px] bg-background">
      <header className="border-b border-border px-[clamp(1rem,4vw,3rem)] py-6">
        <Link className="font-semibold tracking-[0.12em]" href="/">
          STUDENT SHOWCASE
        </Link>
      </header>
      <div className="grid gap-8 px-[clamp(1rem,4vw,3rem)] py-10 lg:grid-cols-12 lg:py-16">
        <header className="grid content-start gap-3 lg:col-span-4">
          <p className="text-sm font-semibold tracking-[0.16em] text-primary">PUBLIC ATTRIBUTION</p>
          <h1 className="text-3xl leading-[1.25] font-semibold tracking-tight sm:text-4xl">
            {t('externalAcceptHeading')}
          </h1>
          <p className="text-muted-foreground">{t('externalAcceptHelp')}</p>
        </header>
        <section className="border border-border bg-card p-6 lg:col-span-8">
          {invitation === null ? (
            <div className="grid gap-8">
              <InvitationExchange />
              <form action={exchangeExternalRecoveryCodeAction} className="grid gap-3">
                <label className="font-medium" htmlFor="recoveryCode">
                  รหัสกู้คืนผู้ร่วมผลงาน
                </label>
                <input
                  className="min-h-11 rounded-control border border-input bg-background px-3"
                  id="recoveryCode"
                  name="recoveryCode"
                  required
                />
                <button
                  className="min-h-11 w-fit rounded-control bg-primary px-5 font-medium text-primary-foreground"
                  type="submit"
                >
                  ยืนยันรหัสกู้คืน
                </button>
              </form>
            </div>
          ) : invitation.state === 'accepted' ? (
            removalRequest === null ? (
              <form action={createAttributionRemovalRequestAction} className="grid gap-3">
                <p className="font-medium">ขอถอนชื่อ {invitation.attributionName} จากผลงาน</p>
                <p className="text-sm text-muted-foreground">
                  คำขอจะไม่เปลี่ยนหน้าสาธารณะทันที ผู้ดูแลระบบจะสร้าง Revision แก้ไขเพื่อเข้าสู่
                  Review
                </p>
                <label className="font-medium" htmlFor="removalReason">
                  เหตุผล
                </label>
                <textarea
                  className="min-h-32 rounded-control border border-input bg-background p-3"
                  id="removalReason"
                  minLength={10}
                  maxLength={1000}
                  name="reason"
                  required
                />
                <button
                  className="min-h-11 w-fit rounded-control bg-primary px-5 font-medium text-primary-foreground"
                  type="submit"
                >
                  ส่งคำขอถอนชื่อ
                </button>
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
        </section>
      </div>
    </main>
  );
}
