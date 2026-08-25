'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@showcase/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AttributionInvitation } from '@/lib/student-works-core';
import {
  respondToAccountInvitationAction,
  respondToExternalInvitationAction,
} from './contributor-invitations.actions';
import { initialInvitationActionState } from './invitation-action-state';

export function AccountInvitationResponseForm({
  invitation,
}: {
  invitation: AttributionInvitation;
}) {
  const action = respondToAccountInvitationAction.bind(
    null,
    invitation.publicId,
    invitation.version,
  );
  const [state, formAction, pending] = useActionState(action, initialInvitationActionState());
  const t = useTranslations('ContributorInvitations');
  const isPending = invitation.state === 'pending';

  return (
    <form action={formAction} className="grid gap-4 border-t border-border pt-5">
      {isPending ? (
        <>
          <div className="grid gap-2">
            <Label htmlFor={`attribution-name-${invitation.publicId}`}>
              {t('attributionName')}
            </Label>
            <Input
              id={`attribution-name-${invitation.publicId}`}
              maxLength={100}
              name="attributionName"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`study-year-${invitation.publicId}`}>{t('studyYear')}</Label>
            <Input
              id={`study-year-${invitation.publicId}`}
              max={8}
              min={1}
              name="studyYear"
              required
              type="number"
            />
          </div>
          <label className="flex items-start gap-3 text-sm leading-6">
            <input className="mt-1 size-4" name="consent" required type="checkbox" />
            <span>{t('consent')}</span>
          </label>
          <div className="flex flex-wrap gap-3">
            <Button disabled={pending} name="action" type="submit" value="accept">
              {t('accept')}
            </Button>
            <Button disabled={pending} name="action" type="submit" value="reject" variant="outline">
              {t('reject')}
            </Button>
          </div>
        </>
      ) : invitation.state === 'accepted' ? (
        <Button disabled={pending} name="action" type="submit" value="withdraw" variant="outline">
          {t('withdraw')}
        </Button>
      ) : null}
      <ActionMessage state={state} />
    </form>
  );
}

export function ExternalInvitationResponseForm({
  invitation,
}: {
  invitation: AttributionInvitation;
}) {
  const action = respondToExternalInvitationAction.bind(null, invitation.version);
  const [state, formAction, pending] = useActionState(action, initialInvitationActionState());
  const t = useTranslations('ContributorInvitations');
  if (state.success) {
    return (
      <section aria-live="polite" className="grid gap-3 border border-success/30 bg-success/10 p-5">
        <h2 className="text-xl font-semibold">{t('completed')}</h2>
        {state.recoveryCode === undefined ? null : (
          <>
            <p>{t('recoveryHelp')}</p>
            <code className="break-all border border-border bg-background p-3 text-base">
              {state.recoveryCode}
            </code>
          </>
        )}
      </section>
    );
  }
  return (
    <form action={formAction} className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor="external-attribution-name">{t('attributionName')}</Label>
        <Input
          defaultValue={invitation.proposedAttributionName ?? ''}
          id="external-attribution-name"
          maxLength={100}
          name="attributionName"
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="external-role">{t('contributionRole')}</Label>
        <Input
          defaultValue={invitation.contributionRole ?? ''}
          id="external-role"
          maxLength={100}
          name="contributionRole"
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="external-affiliation">{t('affiliation')}</Label>
        <Input
          defaultValue={invitation.affiliation ?? ''}
          id="external-affiliation"
          maxLength={150}
          name="affiliation"
        />
      </div>
      <label className="flex items-start gap-3 text-sm leading-6">
        <input className="mt-1 size-4" name="consent" required type="checkbox" />
        <span>{t('consent')}</span>
      </label>
      <div className="flex flex-wrap gap-3">
        <Button disabled={pending} name="action" type="submit" value="accept">
          {t('accept')}
        </Button>
        <Button disabled={pending} name="action" type="submit" value="reject" variant="outline">
          {t('reject')}
        </Button>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}

function ActionMessage({ state }: { state: ReturnType<typeof initialInvitationActionState> }) {
  const t = useTranslations('ContributorInvitations');
  return (
    <p aria-live="polite" className="text-sm text-muted-foreground">
      {state.success ? t('saved') : state.error === null ? '' : t(`errors.${state.error}`)}
    </p>
  );
}
