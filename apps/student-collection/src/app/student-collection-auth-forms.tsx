'use client';

import { Button } from '@showcase/ui/button';
import { toast } from '@showcase/ui/toast';
import {
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  LockKeyholeIcon,
  LogInIcon,
  UserRoundIcon,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import type {
  AuthAction,
  AuthActionState,
  AuthErrorMessage,
} from './student-collection-auth-action-state';
import { INITIAL_AUTH_ACTION_STATE } from './student-collection-auth-action-state';

function useAuthActionWithErrorToast(action: AuthAction) {
  const t = useTranslations('Auth.errors');
  return useActionState(async (previousState: AuthActionState, formData: FormData) => {
    const nextState = await action(previousState, formData);
    if (nextState.error !== null) toast.error(t(nextState.error));
    return nextState;
  }, INITIAL_AUTH_ACTION_STATE);
}

export function LoginForm({ action }: { action: AuthAction }) {
  const t = useTranslations('Auth');
  const [state, formAction] = useAuthActionWithErrorToast(action);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  return (
    <form action={formAction} className="flex flex-col gap-4 [&_[data-slot=field-group]]:gap-4">
      <FieldSet aria-label={t('login.groupLabel')}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="student-id">{t('login.studentId')}</FieldLabel>
            <div className="auth-input-wrap">
              <UserRoundIcon aria-hidden="true" className="auth-input-icon" />
              <Input
                autoComplete="username"
                className="auth-input"
                id="student-id"
                inputMode="numeric"
                maxLength={8}
                minLength={8}
                name="studentId"
                pattern="\d{8}"
                placeholder={t('login.studentIdPlaceholder')}
                required
              />
            </div>
          </Field>
          <Field>
            <FieldLabel htmlFor="password">{t('login.password')}</FieldLabel>
            <div className="auth-input-wrap">
              <LockKeyholeIcon aria-hidden="true" className="auth-input-icon" />
              <Input
                autoComplete="current-password"
                className="auth-input auth-password-input"
                id="password"
                maxLength={128}
                name="password"
                placeholder={t('login.passwordPlaceholder')}
                required
                type={isPasswordVisible ? 'text' : 'password'}
              />
              <button
                aria-label={isPasswordVisible ? t('login.hidePassword') : t('login.showPassword')}
                aria-pressed={isPasswordVisible}
                className="auth-password-toggle"
                onClick={() => setIsPasswordVisible((isVisible) => !isVisible)}
                type="button"
              >
                {isPasswordVisible ? (
                  <EyeOffIcon aria-hidden="true" className="size-5" />
                ) : (
                  <EyeIcon aria-hidden="true" className="size-5" />
                )}
              </button>
            </div>
          </Field>
        </FieldGroup>
      </FieldSet>
      <ActionError error={state.error} />
      <SubmitButton icon={LogInIcon} label={t('login.submit')} pendingLabel={t('submitting')} />
    </form>
  );
}

export function ChangePasswordForm({ action }: { action: AuthAction }) {
  const t = useTranslations('Auth');
  const [state, formAction] = useAuthActionWithErrorToast(action);
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
      <SubmitButton icon={KeyRoundIcon} label={t('change.submit')} pendingLabel={t('submitting')} />
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
  icon: Icon,
  label,
  pendingLabel,
  variant = 'default',
}: {
  icon?: LucideIcon;
  label: string;
  pendingLabel: string;
  variant?: 'default' | 'outline';
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      className="auth-submit-button w-full"
      disabled={pending}
      size="lg"
      type="submit"
      variant={variant}
    >
      {pending ? (
        <Spinner aria-label={pendingLabel} data-icon="inline-start" />
      ) : Icon ? (
        <Icon aria-hidden="true" data-icon="inline-start" />
      ) : null}
      {pending ? pendingLabel : label}
    </Button>
  );
}
