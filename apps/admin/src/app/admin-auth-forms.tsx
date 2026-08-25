'use client';

import { Button } from '@showcase/ui/button';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import type { AuthAction, AuthErrorMessage } from './admin-auth-action-state';
import { INITIAL_AUTH_ACTION_STATE } from './admin-auth-action-state';

export function LoginForm({ action }: { action: AuthAction }) {
  const t = useTranslations('Auth');
  const [state, formAction] = useActionState(action, INITIAL_AUTH_ACTION_STATE);
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <FieldSet aria-label={t('login.groupLabel')}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="admin-login">{t('login.adminLogin')}</FieldLabel>
            <Input
              autoCapitalize="none"
              autoComplete="username"
              id="admin-login"
              maxLength={64}
              minLength={3}
              name="adminLogin"
              pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,63}"
              required
              spellCheck={false}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">{t('login.password')}</FieldLabel>
            <Input
              autoComplete="current-password"
              id="password"
              maxLength={128}
              name="password"
              required
              type="password"
            />
          </Field>
        </FieldGroup>
      </FieldSet>
      <ActionError error={state.error} />
      <SubmitButton label={t('login.submit')} pendingLabel={t('submitting')} />
    </form>
  );
}

export function ChangePasswordForm({ action }: { action: AuthAction }) {
  const t = useTranslations('Auth');
  const [state, formAction] = useActionState(action, INITIAL_AUTH_ACTION_STATE);
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <FieldSet aria-label={t('change.groupLabel')}>
        <FieldGroup>
          <PasswordField
            autoComplete="current-password"
            id="current-password"
            label={t('change.currentPassword')}
            name="currentPassword"
          />
          <PasswordField
            autoComplete="new-password"
            id="new-password"
            label={t('change.newPassword')}
            name="newPassword"
          />
          <PasswordField
            autoComplete="new-password"
            id="confirm-password"
            label={t('change.confirmPassword')}
            name="confirmPassword"
          />
          <FieldDescription>{t('change.requirements')}</FieldDescription>
        </FieldGroup>
      </FieldSet>
      <ActionError error={state.error} />
      <SubmitButton label={t('change.submit')} pendingLabel={t('submitting')} />
    </form>
  );
}

export function LogoutForm({ action }: { action: AuthAction }) {
  const t = useTranslations('Auth');
  const [state, formAction] = useActionState(action, INITIAL_AUTH_ACTION_STATE);
  return (
    <form action={formAction} className="flex w-full flex-col gap-3">
      <ActionError error={state.error} />
      <SubmitButton label={t('active.logout')} pendingLabel={t('submitting')} variant="outline" />
    </form>
  );
}

function PasswordField({
  autoComplete,
  id,
  label,
  name,
}: {
  autoComplete: 'current-password' | 'new-password';
  id: string;
  label: string;
  name: string;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        autoComplete={autoComplete}
        id={id}
        maxLength={128}
        minLength={name === 'currentPassword' ? undefined : 12}
        name={name}
        required
        type="password"
      />
    </Field>
  );
}

function ActionError({ error }: { error: AuthErrorMessage | null }) {
  const t = useTranslations('Auth.errors');
  return error === null ? null : (
    <Alert variant="destructive">
      <AlertDescription>{t(error)}</AlertDescription>
    </Alert>
  );
}

function SubmitButton({
  label,
  pendingLabel,
  variant = 'default',
}: {
  label: string;
  pendingLabel: string;
  variant?: 'default' | 'outline';
}) {
  const { pending } = useFormStatus();
  return (
    <Button className="w-full" disabled={pending} size="lg" type="submit" variant={variant}>
      {pending ? <Spinner aria-label={pendingLabel} data-icon="inline-start" /> : null}
      {pending ? pendingLabel : label}
    </Button>
  );
}
