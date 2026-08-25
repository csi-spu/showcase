'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@showcase/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AttributionInvitation } from '@/lib/student-works-core';
import {
  createAccountInvitationAction,
  createExternalInvitationAction,
  revokeInvitationAction,
} from '../../contributor-invitations/contributor-invitations.actions';
import { initialInvitationActionState } from '../../contributor-invitations/invitation-action-state';

export function ContributorInvitationsPanel({
  invitations,
  publicId,
}: {
  invitations: AttributionInvitation[];
  publicId: string;
}) {
  const t = useTranslations('ContributorInvitations');
  const [accountState, accountAction, accountPending] = useActionState(
    createAccountInvitationAction.bind(null, publicId),
    initialInvitationActionState(),
  );
  const [externalState, externalAction, externalPending] = useActionState(
    createExternalInvitationAction.bind(null, publicId),
    initialInvitationActionState(),
  );

  return (
    <section
      className="mt-10 grid gap-8 border-t border-border pt-10"
      aria-labelledby="contributors-heading"
    >
      <header className="grid gap-2">
        <p className="text-sm font-semibold tracking-[0.16em] text-primary">ATTRIBUTION</p>
        <h2 className="text-2xl font-semibold" id="contributors-heading">
          {t('manageHeading')}
        </h2>
        <p className="text-muted-foreground">{t('manageHelp')}</p>
      </header>
      <div className="grid gap-6 xl:grid-cols-2">
        <form
          action={accountAction}
          className="grid content-start gap-4 border border-border bg-card p-5"
        >
          <h3 className="text-lg font-semibold">{t('accountHeading')}</h3>
          <p className="text-sm text-muted-foreground">{t('accountHelp')}</p>
          <Label htmlFor="contributor-student-id">{t('studentId')}</Label>
          <Input
            autoComplete="off"
            id="contributor-student-id"
            inputMode="numeric"
            maxLength={8}
            minLength={8}
            name="studentId"
            pattern="[0-9]{8}"
            required
          />
          <Button disabled={accountPending} type="submit">
            {t('invite')}
          </Button>
          <Feedback error={accountState.error} success={accountState.success} />
        </form>
        <form
          action={externalAction}
          className="grid content-start gap-4 border border-border bg-card p-5"
        >
          <h3 className="text-lg font-semibold">{t('externalHeading')}</h3>
          <Label htmlFor="proposed-name">{t('attributionName')}</Label>
          <Input id="proposed-name" maxLength={100} name="attributionName" required />
          <Label htmlFor="proposed-role">{t('contributionRole')}</Label>
          <Input id="proposed-role" maxLength={100} name="contributionRole" required />
          <Label htmlFor="proposed-affiliation">{t('affiliation')}</Label>
          <Input id="proposed-affiliation" maxLength={150} name="affiliation" />
          <Button disabled={externalPending} type="submit">
            {t('createLink')}
          </Button>
          {externalState.invitationPath === undefined ? null : (
            <div
              aria-live="polite"
              className="grid gap-2 border border-warning/30 bg-warning/10 p-3 text-sm"
            >
              <strong>{t('copyOnce')}</strong>
              <InvitationLink path={externalState.invitationPath} />
            </div>
          )}
          <Feedback error={externalState.error} success={externalState.success} />
        </form>
      </div>
      <div className="grid gap-3">
        <h3 className="text-lg font-semibold">{t('history')}</h3>
        {invitations.length === 0 ? <p className="text-muted-foreground">{t('empty')}</p> : null}
        {invitations.map((invitation) => (
          <article
            className="grid gap-3 border-t border-border py-4 sm:grid-cols-[1fr_auto]"
            key={invitation.publicId}
          >
            <div>
              <p className="font-medium">
                {invitation.proposedAttributionName ??
                  invitation.attributionName ??
                  t('privateRecipient')}
              </p>
              <p className="text-sm text-muted-foreground">{t(`states.${invitation.state}`)}</p>
            </div>
            {invitation.state === 'pending' ? (
              <form
                action={revokeInvitationAction.bind(
                  null,
                  publicId,
                  invitation.publicId,
                  invitation.version,
                )}
              >
                <Button type="submit" variant="outline">
                  {t('revoke')}
                </Button>
              </form>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function InvitationLink({ path }: { path: string }) {
  return <code className="break-all">{path}</code>;
}

function Feedback({ error, success }: { error: string | null; success: boolean }) {
  const t = useTranslations('ContributorInvitations');
  return (
    <p aria-live="polite" className="text-sm text-muted-foreground">
      {success ? t('sentGeneric') : error === null ? '' : t('errors.unavailable')}
    </p>
  );
}
