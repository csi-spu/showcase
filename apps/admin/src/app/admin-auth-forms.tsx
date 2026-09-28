'use client';

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  evaluatePassword,
} from '@showcase/password-policy';
import { Button } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import { PasswordStrength } from '@showcase/ui/password-strength';
import { toast } from '@showcase/ui/toast';
import {
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  LockKeyholeIcon,
  LogInIcon,
  LogOutIcon,
  UserRoundIcon,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useState, type ChangeEventHandler } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import type { AuthAction, AuthActionState, AuthErrorMessage } from './admin-auth-action-state';
import { INITIAL_AUTH_ACTION_STATE } from './admin-auth-action-state';

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
            <FieldLabel htmlFor="admin-login">{t('login.adminLogin')}</FieldLabel>
            <div className="auth-input-wrap">
              <UserRoundIcon aria-hidden="true" className="auth-input-icon" />
              <Input
                autoCapitalize="none"
                autoComplete="username"
                className="auth-input"
                id="admin-login"
                maxLength={64}
                minLength={3}
                name="adminLogin"
                pattern="[A-Za-z0-9][A-Za-z0-9._\-]{2,63}"
                placeholder={t('login.adminLoginPlaceholder')}
                required
                spellCheck={false}
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
  const tStrength = useTranslations('Auth.change.strength');
  const [state, formAction] = useAuthActionWithErrorToast(action);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const passwordEvaluation = evaluatePassword(newPassword);
  const isSameAsCurrent = newPassword.length > 0 && newPassword === currentPassword;
  const isConfirmationEntered = confirmPassword.length > 0;
  const isConfirmationMatching = isConfirmationEntered && confirmPassword === newPassword;
  const canSubmit =
    currentPassword.length > 0 &&
    passwordEvaluation.isValid &&
    !isSameAsCurrent &&
    isConfirmationMatching;
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <FieldSet aria-label={t('change.groupLabel')}>
        <FieldGroup>
          <PasswordField
            autoComplete="current-password"
            id="current-password"
            label={t('change.currentPassword')}
            name="currentPassword"
            onChange={(event) => setCurrentPassword(event.currentTarget.value)}
            value={currentPassword}
          />
          <PasswordField
            ariaDescribedBy="new-password-strength"
            autoComplete="new-password"
            description={isSameAsCurrent ? t('change.sameAsCurrent') : undefined}
            descriptionId="new-password-description"
            id="new-password"
            isInvalid={
              isSameAsCurrent ||
              (newPassword.length >= PASSWORD_MIN_LENGTH && !passwordEvaluation.isValid)
            }
            label={t('change.newPassword')}
            name="newPassword"
            onChange={(event) => setNewPassword(event.currentTarget.value)}
            value={newPassword}
          />
          <PasswordStrength
            id="new-password-strength"
            password={newPassword}
            translate={tStrength}
          />
          <PasswordField
            autoComplete="new-password"
            description={
              !isConfirmationEntered
                ? undefined
                : isConfirmationMatching
                  ? t('change.confirmationMatch')
                  : t('errors.passwordMismatch')
            }
            descriptionId="confirm-password-description"
            descriptionTone={isConfirmationMatching ? 'success' : 'default'}
            id="confirm-password"
            isInvalid={isConfirmationEntered && !isConfirmationMatching}
            label={t('change.confirmPassword')}
            name="confirmPassword"
            onChange={(event) => setConfirmPassword(event.currentTarget.value)}
            value={confirmPassword}
          />
        </FieldGroup>
      </FieldSet>
      <ActionError error={state.error} />
      <SubmitButton
        icon={KeyRoundIcon}
        isDisabled={!canSubmit}
        label={t('change.submit')}
        pendingLabel={t('submitting')}
      />
    </form>
  );
}

export function LogoutForm({ action, compact = false }: { action: AuthAction; compact?: boolean }) {
  const t = useTranslations('Auth');
  const [state, formAction] = useActionState(action, INITIAL_AUTH_ACTION_STATE);
  return (
    <form action={formAction} className="flex w-full flex-col gap-3">
      <ActionError error={state.error} />
      {compact ? (
        <CompactLogoutButton label={t('active.logout')} pendingLabel={t('submitting')} />
      ) : (
        <SubmitButton label={t('active.logout')} pendingLabel={t('submitting')} variant="outline" />
      )}
    </form>
  );
}

function CompactLogoutButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      aria-label={pending ? pendingLabel : label}
      disabled={pending}
      size="icon-sm"
      title={label}
      type="submit"
      variant="ghost"
    >
      {pending ? <Spinner aria-label={pendingLabel} /> : <LogOutIcon aria-hidden="true" />}
    </Button>
  );
}

function PasswordField({
  autoComplete,
  ariaDescribedBy,
  description,
  descriptionId,
  descriptionTone = 'default',
  id,
  isInvalid = false,
  label,
  name,
  onChange,
  value,
}: {
  autoComplete: 'current-password' | 'new-password';
  ariaDescribedBy?: string;
  description?: string | undefined;
  descriptionId?: string;
  descriptionTone?: 'default' | 'success';
  id: string;
  isInvalid?: boolean;
  label: string;
  name: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  value: string;
}) {
  return (
    <Field data-invalid={isInvalid || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        aria-describedby={
          description ? [ariaDescribedBy, descriptionId].filter(Boolean).join(' ') : ariaDescribedBy
        }
        aria-invalid={isInvalid || undefined}
        autoComplete={autoComplete}
        id={id}
        maxLength={PASSWORD_MAX_LENGTH}
        minLength={name === 'currentPassword' ? undefined : PASSWORD_MIN_LENGTH}
        name={name}
        onChange={onChange}
        required
        type="password"
        value={value}
      />
      {description ? (
        <FieldDescription
          className={cn(
            isInvalid && 'text-destructive',
            descriptionTone === 'success' && 'text-success',
          )}
          id={descriptionId}
        >
          {description}
        </FieldDescription>
      ) : null}
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
  isDisabled = false,
  label,
  pendingLabel,
  variant = 'default',
}: {
  icon?: LucideIcon;
  isDisabled?: boolean;
  label: string;
  pendingLabel: string;
  variant?: 'default' | 'outline';
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      className="auth-submit-button w-full"
      disabled={pending || isDisabled}
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
