'use client';

import { Button } from '@showcase/ui/button';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Label } from '@/components/ui/label';
import type {
  AdminAttributionRemovalRequest,
  AdminRemovalRequest,
  AdminWorkRecovery,
} from '@/lib/admin-reviews-core';
import { initialRecoveryActionState, type RecoveryActionState } from './recovery-action-state';

type RecoveryAction = (
  previousState: RecoveryActionState,
  formData: FormData,
) => Promise<RecoveryActionState>;

export function WorkRecoveryPanel({
  action,
  idempotencyKey,
  state,
}: {
  action: RecoveryAction;
  idempotencyKey: string;
  state: AdminWorkRecovery;
}) {
  const t = useTranslations('Recovery');
  const operations = allowedOperations(state);
  return (
    <div className="grid gap-6">
      <section className="grid gap-2 rounded-surface border border-border bg-card p-6">
        <p className="text-sm font-semibold tracking-[0.16em] text-primary">WORK STATE</p>
        <h2 className="text-2xl font-semibold">{t(`states.${state.activityState}`)}</h2>
        <p className="text-muted-foreground">{t(`publication.${state.publicationState}`)}</p>
        <p className="text-sm text-muted-foreground">{t('version', { version: state.version })}</p>
      </section>
      {operations.map((operation, index) => (
        <TransitionForm
          action={action}
          idempotencyKey={index === 0 ? idempotencyKey : deriveKey(idempotencyKey, index)}
          key={operation}
          operation={operation}
          state={state}
        />
      ))}
    </div>
  );
}

export function RecoveryDecisionForm({
  action,
  idempotencyKey,
  request,
}: {
  action: RecoveryAction;
  idempotencyKey: string;
  request: AdminRemovalRequest;
}) {
  const t = useTranslations('Recovery');
  const [state, formAction, pending] = useActionState(
    action,
    initialRecoveryActionState(idempotencyKey),
  );
  return (
    <form
      action={formAction}
      className="grid gap-5 rounded-surface border border-border bg-card p-6"
    >
      <div className="grid gap-2">
        <h2 className="text-xl font-semibold">{request.title}</h2>
        <p className="whitespace-pre-wrap text-foreground">{request.reason}</p>
        <p className="text-sm text-muted-foreground">{t('requestRetained')}</p>
      </div>
      <input name="expectedVersion" type="hidden" value={request.version} />
      <input name="expectedWorkVersion" type="hidden" value={request.workVersion} />
      <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
      <div className="grid gap-2">
        <Label htmlFor={`decision-reason-${request.publicId}`}>{t('decisionReason')}</Label>
        <textarea
          className="min-h-28 rounded-control border border-input bg-background px-3 py-2 leading-7 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          id={`decision-reason-${request.publicId}`}
          maxLength={1_000}
          minLength={10}
          name="decisionReason"
        />
      </div>
      <Feedback state={state} />
      <div className="flex flex-wrap gap-3">
        <Button disabled={pending} name="decision" type="submit" value="approve">
          {t('approveRequest')}
        </Button>
        <Button disabled={pending} name="decision" type="submit" value="decline" variant="outline">
          {t('declineRequest')}
        </Button>
      </div>
    </form>
  );
}

export function AttributionRemovalDecisionForm({
  action,
  idempotencyKey,
  request,
}: {
  action: RecoveryAction;
  idempotencyKey: string;
  request: AdminAttributionRemovalRequest;
}) {
  const t = useTranslations('Recovery');
  const [state, formAction, pending] = useActionState(
    action,
    initialRecoveryActionState(idempotencyKey),
  );
  return (
    <form
      action={formAction}
      className="grid gap-5 rounded-surface border border-border bg-card p-6"
    >
      <div className="grid gap-2">
        <h2 className="text-xl font-semibold">{request.workTitle}</h2>
        <p className="font-medium">{request.attributionName}</p>
        <p className="whitespace-pre-wrap">{request.reason}</p>
        <p className="text-sm text-muted-foreground">{t('attribution.approveHelp')}</p>
      </div>
      <input name="expectedRequestVersion" type="hidden" value={request.version} />
      <input
        name="expectedPublishedRevisionPublicId"
        type="hidden"
        value={request.currentPublishedRevisionPublicId ?? ''}
      />
      <input
        name="expectedPublishedRevisionVersion"
        type="hidden"
        value={request.currentPublishedRevisionVersion ?? ''}
      />
      <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
      <div className="grid gap-2">
        <Label htmlFor={`attribution-decision-${request.publicId}`}>{t('decisionReason')}</Label>
        <textarea
          className="min-h-28 rounded-control border border-input bg-background px-3 py-2"
          id={`attribution-decision-${request.publicId}`}
          maxLength={1000}
          minLength={10}
          name="decisionReason"
        />
      </div>
      <Feedback state={state} />
      <div className="flex gap-3">
        <Button disabled={pending} name="decision" type="submit" value="approve">
          {t('attribution.approve')}
        </Button>
        <Button disabled={pending} name="decision" type="submit" value="decline" variant="outline">
          {t('attribution.decline')}
        </Button>
      </div>
    </form>
  );
}

function TransitionForm({
  action,
  idempotencyKey,
  operation,
  state: work,
}: {
  action: RecoveryAction;
  idempotencyKey: string;
  operation: 'archive' | 'restore_active' | 'restore_publication' | 'unpublish';
  state: AdminWorkRecovery;
}) {
  const t = useTranslations('Recovery');
  const [state, formAction, pending] = useActionState(
    action,
    initialRecoveryActionState(idempotencyKey),
  );
  return (
    <form
      action={formAction}
      className="grid gap-4 rounded-surface border border-border bg-card p-6"
    >
      <div className="grid gap-2">
        <h3 className="text-xl font-semibold">{t(`operations.${operation}.heading`)}</h3>
        <p className="text-sm leading-6 text-muted-foreground">
          {t(`operations.${operation}.help`)} {t('historyRetained')}
        </p>
      </div>
      <input name="expectedVersion" type="hidden" value={work.version} />
      <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
      <input name="operation" type="hidden" value={operation} />
      <div className="grid gap-2">
        <Label htmlFor={`recovery-reason-${operation}`}>{t('reason')}</Label>
        <textarea
          className="min-h-28 rounded-control border border-input bg-background px-3 py-2 leading-7 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          id={`recovery-reason-${operation}`}
          maxLength={1_000}
          minLength={10}
          name="reason"
          required
        />
      </div>
      <Feedback state={state} />
      <Button className="w-full sm:w-fit" disabled={pending} type="submit" variant="outline">
        {t(`operations.${operation}.submit`)}
      </Button>
    </form>
  );
}

function Feedback({ state }: { state: RecoveryActionState }) {
  const t = useTranslations('Recovery');
  return (
    <p aria-live="polite" className="text-sm text-muted-foreground">
      {state.success ? t('saved') : state.error === null ? '' : t(`errors.${state.error}`)}
    </p>
  );
}

function allowedOperations(state: AdminWorkRecovery) {
  if (state.activityState === 'archived') return ['restore_active'] as const;
  if (state.publicationState === 'published') return ['unpublish', 'archive'] as const;
  if (state.publicationState === 'unpublished' && state.publishedRevisionId !== null) {
    return ['restore_publication', 'archive'] as const;
  }
  return ['archive'] as const;
}

function deriveKey(idempotencyKey: string, offset: number): string {
  const hex = '0123456789abcdef';
  const index = hex.indexOf(idempotencyKey.at(-1)?.toLowerCase() ?? '0');
  return `${idempotencyKey.slice(0, -1)}${hex[(Math.max(index, 0) + offset) % hex.length]}`;
}
