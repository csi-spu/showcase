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

export function HeaderLogoutButton({ action }: { action: AuthAction }) {
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
      <SubmitButton label={t('active.logout')} pendingLabel={t('submitting')} />
    </form>
  );
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} size="sm" type="submit" variant="ghost">
      {pending ? (
        <Spinner aria-label={pendingLabel} data-icon="inline-start" />
      ) : (
        <LogOutIcon aria-hidden="true" data-icon="inline-start" />
      )}
      <span className="hidden sm:inline">{pending ? pendingLabel : label}</span>
    </Button>
  );
}
