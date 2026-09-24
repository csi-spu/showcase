'use client';

import { Button } from '@showcase/ui/button';
import { toast } from '@showcase/ui/toast';
import { LogOutIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Spinner } from '@/components/ui/spinner';
import type { AuthAction, AuthActionState } from './instructor-auth-action-state';
import { INITIAL_AUTH_ACTION_STATE } from './instructor-auth-action-state';

export function HeaderLogoutButton({
  action,
  isIconOnly = false,
}: {
  action: AuthAction;
  /**
   * Drops the label, for the collapsed sidebar. That panel is barely wider
   * than the icon, so a label rendered there is clipped mid-word by the
   * panel's own `overflow-hidden` rather than wrapping or shrinking.
   */
  isIconOnly?: boolean;
}) {
  const t = useTranslations('Auth');
  const errorT = useTranslations('Auth.errors');
  const [, formAction] = useActionState(
    async (previousState: AuthActionState, formData: FormData) => {
      const nextState = await action(previousState, formData);
      if (nextState.error !== null) toast.error(errorT(nextState.error));
      return nextState;
    },
    INITIAL_AUTH_ACTION_STATE,
  );

  return (
    <form action={formAction} className="shrink-0">
      <SubmitButton
        isIconOnly={isIconOnly}
        label={t('active.logout')}
        pendingLabel={t('submitting')}
      />
    </form>
  );
}

function SubmitButton({
  isIconOnly,
  label,
  pendingLabel,
}: {
  isIconOnly: boolean;
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  const currentLabel = pending ? pendingLabel : label;

  return (
    <Button
      className={isIconOnly ? 'w-full justify-center px-0' : undefined}
      disabled={pending}
      size="sm"
      type="submit"
      /* Without visible text the icon has to carry the name itself. The
         spinner already announces `pendingLabel`, so labelling the button
         too would have it read out twice while submitting. */
      {...(isIconOnly && !pending ? { 'aria-label': label, title: label } : {})}
      variant="ghost"
    >
      {pending ? (
        <Spinner aria-label={pendingLabel} data-icon="inline-start" />
      ) : (
        <LogOutIcon aria-hidden="true" data-icon="inline-start" />
      )}
      {isIconOnly ? null : <span className="hidden sm:inline">{currentLabel}</span>}
    </Button>
  );
}
