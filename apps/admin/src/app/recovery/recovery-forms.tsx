'use client';

import { Button } from '@showcase/ui/button';
import { toast } from '@showcase/ui/toast';
import { ArrowLeftIcon, CheckIcon, XIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { ActionGroup } from '@/components/ui/action-group';
import { ActionTooltip } from '@/components/ui/action-tooltip';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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

function useRecoveryActionWithToast(action: RecoveryAction, idempotencyKey: string) {
  const t = useTranslations('Recovery');
  return useActionState(async (previousState: RecoveryActionState, formData: FormData) => {
    const nextState = await action(previousState, formData);
    if (nextState.error !== null) toast.error(t(`errors.${nextState.error}`));
    return nextState;
  }, initialRecoveryActionState(idempotencyKey));
}

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
        <p className="text-sm font-semibold tracking-wide text-primary">{t('stateKicker')}</p>
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
  compact = false,
  iconOnly = false,
  idempotencyKey,
  request,
}: {
  action: RecoveryAction;
  compact?: boolean;
  iconOnly?: boolean;
  idempotencyKey: string;
  request: AdminRemovalRequest;
}) {
  const t = useTranslations('Recovery');
  const [state, formAction, pending] = useRecoveryActionWithToast(action, idempotencyKey);
  const [isDeclining, setIsDeclining] = useState(false);
  return (
    <form
      action={formAction}
      className={
        iconOnly && !isDeclining
          ? 'flex min-w-max justify-end gap-2'
          : compact || iconOnly
            ? 'grid min-w-72 gap-3'
            : 'grid gap-5 rounded-surface border border-border bg-card p-6'
      }
    >
      {compact || iconOnly ? null : (
        <div className="grid gap-2">
          <h2 className="text-xl font-semibold">{request.title}</h2>
          <p className="whitespace-pre-wrap text-foreground">{request.reason}</p>
          <p className="text-sm text-muted-foreground">{t('requestRetained')}</p>
        </div>
      )}
      <input name="expectedVersion" type="hidden" value={request.version} />
      <input name="expectedWorkVersion" type="hidden" value={request.workVersion} />
      <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
      {isDeclining ? (
        <div className="grid gap-2">
          <Label htmlFor={`decision-reason-${request.publicId}`}>{t('decisionReason')}</Label>
          <Textarea
            className="min-h-28"
            id={`decision-reason-${request.publicId}`}
            maxLength={1_000}
            minLength={10}
            name="decisionReason"
            required
          />
        </div>
      ) : null}
      {iconOnly && !state.success && state.error === null ? null : <Feedback state={state} />}
      {isDeclining ? (
        iconOnly ? (
          <ActionGroup>
            <ActionTooltip label={t('cancelDecision')}>
              <Button
                aria-label={t('cancelDecision')}
                disabled={pending}
                onClick={() => setIsDeclining(false)}
                size="icon-sm"
                title={t('cancelDecision')}
                type="button"
                variant="ghost"
              >
                <ArrowLeftIcon aria-hidden="true" />
              </Button>
            </ActionTooltip>
            <ActionTooltip label={t('confirmDecline')}>
              <Button
                aria-label={t('confirmDecline')}
                disabled={pending}
                name="decision"
                size="icon-sm"
                title={t('confirmDecline')}
                type="submit"
                value="decline"
                variant="destructive"
              >
                <XIcon aria-hidden="true" />
              </Button>
            </ActionTooltip>
          </ActionGroup>
        ) : (
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              disabled={pending}
              onClick={() => setIsDeclining(false)}
              type="button"
              variant="ghost"
            >
              {t('cancelDecision')}
            </Button>
            <Button
              disabled={pending}
              name="decision"
              type="submit"
              value="decline"
              variant="outline"
            >
              {t('confirmDecline')}
            </Button>
          </div>
        )
      ) : iconOnly ? (
        <ActionGroup>
          <ActionTooltip label={t('approveRequest')}>
            <Button
              aria-label={t('approveRequest')}
              disabled={pending}
              name="decision"
              size="icon-sm"
              title={t('approveRequest')}
              type="submit"
              value="approve"
            >
              <CheckIcon aria-hidden="true" />
            </Button>
          </ActionTooltip>
          <ActionTooltip label={t('declineRequest')}>
            <Button
              aria-label={t('declineRequest')}
              disabled={pending}
              onClick={() => setIsDeclining(true)}
              size="icon-sm"
              title={t('declineRequest')}
              type="button"
              variant="outline"
            >
              <XIcon aria-hidden="true" />
            </Button>
          </ActionTooltip>
        </ActionGroup>
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          <Button disabled={pending} name="decision" type="submit" value="approve">
            {t('approveRequest')}
          </Button>
          <Button
            disabled={pending}
            onClick={() => setIsDeclining(true)}
            type="button"
            variant="outline"
          >
            {t('declineRequest')}
          </Button>
        </div>
      )}
    </form>
  );
}

export function AttributionRemovalDecisionForm({
  action,
  compact = false,
  iconOnly = false,
  idempotencyKey,
  request,
}: {
  action: RecoveryAction;
  compact?: boolean;
  iconOnly?: boolean;
  idempotencyKey: string;
  request: AdminAttributionRemovalRequest;
}) {
  const t = useTranslations('Recovery');
  const [state, formAction, pending] = useRecoveryActionWithToast(action, idempotencyKey);
  const [isDeclining, setIsDeclining] = useState(false);
  return (
    <form
      action={formAction}
      className={
        iconOnly && !isDeclining
          ? 'flex min-w-max justify-end gap-2'
          : compact || iconOnly
            ? 'grid min-w-72 gap-3'
            : 'grid gap-5 rounded-surface border border-border bg-card p-6'
      }
    >
      {compact || iconOnly ? null : (
        <div className="grid gap-2">
          <h2 className="text-xl font-semibold">{request.workTitle}</h2>
          <p className="font-medium">{request.attributionName}</p>
          <p className="whitespace-pre-wrap">{request.reason}</p>
          <p className="text-sm text-muted-foreground">{t('attribution.approveHelp')}</p>
        </div>
      )}
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
      {isDeclining ? (
        <div className="grid gap-2">
          <Label htmlFor={`attribution-decision-${request.publicId}`}>{t('decisionReason')}</Label>
          <Textarea
            className="min-h-28"
            id={`attribution-decision-${request.publicId}`}
            maxLength={1000}
            minLength={10}
            name="decisionReason"
            required
          />
        </div>
      ) : null}
      {iconOnly && !state.success && state.error === null ? null : <Feedback state={state} />}
      {isDeclining ? (
        iconOnly ? (
          <ActionGroup>
            <ActionTooltip label={t('cancelDecision')}>
              <Button
                aria-label={t('cancelDecision')}
                disabled={pending}
                onClick={() => setIsDeclining(false)}
                size="icon-sm"
                title={t('cancelDecision')}
                type="button"
                variant="ghost"
              >
                <ArrowLeftIcon aria-hidden="true" />
              </Button>
            </ActionTooltip>
            <ActionTooltip label={t('confirmDecline')}>
              <Button
                aria-label={t('confirmDecline')}
                disabled={pending}
                name="decision"
                size="icon-sm"
                title={t('confirmDecline')}
                type="submit"
                value="decline"
                variant="destructive"
              >
                <XIcon aria-hidden="true" />
              </Button>
            </ActionTooltip>
          </ActionGroup>
        ) : (
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              disabled={pending}
              onClick={() => setIsDeclining(false)}
              type="button"
              variant="ghost"
            >
              {t('cancelDecision')}
            </Button>
            <Button
              disabled={pending}
              name="decision"
              type="submit"
              value="decline"
              variant="outline"
            >
              {t('confirmDecline')}
            </Button>
          </div>
        )
      ) : iconOnly ? (
        <ActionGroup>
          <ActionTooltip label={t('attribution.approve')}>
            <Button
              aria-label={t('attribution.approve')}
              disabled={pending}
              name="decision"
              size="icon-sm"
              title={t('attribution.approve')}
              type="submit"
              value="approve"
            >
              <CheckIcon aria-hidden="true" />
            </Button>
          </ActionTooltip>
          <ActionTooltip label={t('attribution.decline')}>
            <Button
              aria-label={t('attribution.decline')}
              disabled={pending}
              onClick={() => setIsDeclining(true)}
              size="icon-sm"
              title={t('attribution.decline')}
              type="button"
              variant="outline"
            >
              <XIcon aria-hidden="true" />
            </Button>
          </ActionTooltip>
        </ActionGroup>
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          <Button disabled={pending} name="decision" type="submit" value="approve">
            {t('attribution.approve')}
          </Button>
          <Button
            disabled={pending}
            onClick={() => setIsDeclining(true)}
            type="button"
            variant="outline"
          >
            {t('attribution.decline')}
          </Button>
        </div>
      )}
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
  const [state, formAction, pending] = useRecoveryActionWithToast(action, idempotencyKey);
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
        <Textarea
          className="min-h-28"
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
