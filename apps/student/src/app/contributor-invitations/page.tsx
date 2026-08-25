import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getStudentAuthPageState } from '@/lib/student-auth-page-state';
import { readStudentSessionToken } from '@/lib/student-auth-session';
import { getStudentServerEnvironment } from '@/lib/server-environment';
import { StudentWorksCoreClient } from '@/lib/student-works-core';
import { AccountInvitationResponseForm } from './invitation-forms';

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
    <main className="mx-auto min-h-svh w-full max-w-[1440px] bg-background">
      <header className="border-b border-border px-[clamp(1rem,4vw,3rem)] py-6">
        <nav aria-label={t('navigation')} className="flex items-center justify-between gap-4">
          <Link className="font-semibold tracking-[0.12em]" href="/">
            STUDENT SHOWCASE
          </Link>
          <Link className="text-sm font-medium text-primary underline" href="/">
            {t('back')}
          </Link>
        </nav>
      </header>
      <div className="grid gap-8 px-[clamp(1rem,4vw,3rem)] py-10 lg:grid-cols-12 lg:py-16">
        <header className="grid content-start gap-3 lg:col-span-4">
          <p className="text-sm font-semibold tracking-[0.16em] text-primary">ATTRIBUTION</p>
          <h1 className="text-3xl leading-[1.25] font-semibold tracking-tight sm:text-4xl">
            {t('inboxHeading')}
          </h1>
          <p className="text-muted-foreground">{t('inboxHelp')}</p>
        </header>
        <section className="grid gap-5 lg:col-span-8" aria-label={t('inboxHeading')}>
          {page.items.length === 0 ? (
            <p className="border-t border-border py-5 text-muted-foreground">{t('emptyInbox')}</p>
          ) : null}
          {page.items.map((invitation) => (
            <article
              className="grid gap-3 border border-border bg-card p-5 sm:p-6"
              key={invitation.publicId}
            >
              <p className="text-sm font-semibold text-primary">
                {t(`states.${invitation.state}`)}
              </p>
              <h2 className="text-xl font-semibold">{t('accountInvitation')}</h2>
              <AccountInvitationResponseForm invitation={invitation} />
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
