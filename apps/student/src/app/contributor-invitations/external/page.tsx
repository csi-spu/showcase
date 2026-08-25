import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { readAttributionInvitationSession } from '@/lib/attribution-invitation-session';
import { getStudentServerEnvironment } from '@/lib/server-environment';
import { StudentWorksCoreClient } from '@/lib/student-works-core';
import { ExternalInvitationResponseForm } from '../invitation-forms';
import { InvitationExchange } from './invitation-exchange';

export const metadata = { referrer: 'no-referrer' };

export default async function ExternalContributorInvitationPage() {
  const session = await readAttributionInvitationSession();
  let invitation;
  try {
    if (session === null) throw new Error('INVITATION_SESSION_MISSING');
    invitation = await new StudentWorksCoreClient(
      getStudentServerEnvironment(),
    ).getExternalInvitation(session);
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
            <InvitationExchange />
          ) : (
            <ExternalInvitationResponseForm invitation={invitation} />
          )}
        </section>
      </div>
    </main>
  );
}
