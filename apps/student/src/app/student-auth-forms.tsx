'use client';

import { Button } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import { toast } from '@showcase/ui/toast';
import {
  EyeIcon,
  EyeOffIcon,
  LockKeyholeIcon,
  LogInIcon,
  UserRoundIcon,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useState, type ChangeEventHandler } from 'react';
import { useFormStatus } from 'react-dom';
import { PasswordStrength } from '@/components/password-strength';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { evaluateStudentPassword } from '@/lib/student-password-policy';
import type { AuthAction, AuthActionState, AuthErrorMessage } from './student-auth-action-state';
import { INITIAL_AUTH_ACTION_STATE } from './student-auth-action-state';

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

  return (
    <form action={formAction} className="flex flex-col gap-4 [&_[data-slot=field-group]]:gap-4">
      <FieldSet aria-label="ข้อมูลเข้าสู่ระบบ">
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
                name="studentId"
                pattern="[0-9]{8}"
                placeholder={t('login.studentIdPlaceholder')}
                required
              />
            </div>
          </Field>
          <Field>
            <FieldLabel htmlFor="password">{t('login.password')}</FieldLabel>
            <PasswordInput
              autoComplete="current-password"
              id="password"
              label={t('login.password')}
              name="password"
              placeholder={t('login.passwordPlaceholder')}
            />
          </Field>
        </FieldGroup>
      </FieldSet>
      <ActionError error={state.error} />
      <SubmitButton icon={LogInIcon} label={t('login.submit')} pendingLabel={t('submitting')} />
    </form>
  );
}

export function ChangePasswordForm({
  action,
  submitLabel,
}: {
  action: AuthAction;
  submitLabel?: string | undefined;
}) {
  const t = useTranslations('Auth');
  const [state, formAction] = useAuthActionWithErrorToast(action);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const passwordEvaluation = evaluateStudentPassword(newPassword);
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
      <FieldSet aria-label="ตั้งรหัสผ่านใหม่">
        <FieldGroup>
          <PasswordField
            autoComplete="current-password"
            id="current-password"
            label={t('change.currentPassword')}
            name="currentPassword"
            onChange={(event) => setCurrentPassword(event.currentTarget.value)}
          />
          <PasswordField
            ariaDescribedBy="new-password-strength"
            autoComplete="new-password"
            description={isSameAsCurrent ? t('change.sameAsCurrent') : undefined}
            descriptionId="new-password-description"
            id="new-password"
            isInvalid={isSameAsCurrent || (newPassword.length >= 12 && !passwordEvaluation.isValid)}
            label={t('change.newPassword')}
            name="newPassword"
            onChange={(event) => setNewPassword(event.currentTarget.value)}
          />
          <PasswordStrength password={newPassword} />
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
          />
        </FieldGroup>
      </FieldSet>
      <ActionError error={state.error} />
      <SubmitButton
        isDisabled={!canSubmit}
        label={submitLabel ?? t('change.submit')}
        pendingLabel={t('submitting')}
      />
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
  ariaDescribedBy,
  description,
  descriptionId,
  descriptionTone = 'default',
  id,
  isInvalid = false,
  label,
  name,
  onChange,
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
  onChange?: ChangeEventHandler<HTMLInputElement>;
}) {
  return (
    <Field data-invalid={isInvalid || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <PasswordInput
        ariaDescribedBy={
          description ? [ariaDescribedBy, descriptionId].filter(Boolean).join(' ') : ariaDescribedBy
        }
        autoComplete={autoComplete}
        id={id}
        isInvalid={isInvalid}
        label={label}
        minLength={name === 'currentPassword' ? undefined : 12}
        name={name}
        onChange={onChange}
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

function PasswordInput({
  ariaDescribedBy,
  autoComplete,
  id,
  isInvalid = false,
  label,
  minLength,
  name,
  onChange,
  placeholder,
}: {
  ariaDescribedBy?: string | undefined;
  autoComplete: 'current-password' | 'new-password';
  id: string;
  isInvalid?: boolean;
  label: string;
  minLength?: number | undefined;
  name: string;
  onChange?: ChangeEventHandler<HTMLInputElement> | undefined;
  placeholder?: string | undefined;
}) {
  const t = useTranslations('Auth.passwordVisibility');
  const [isVisible, setIsVisible] = useState(false);
  const visibilityLabel = t(isVisible ? 'hide' : 'show', { field: label });

  return (
    <div className="auth-input-wrap">
      <LockKeyholeIcon aria-hidden="true" className="auth-input-icon" />
      <Input
        aria-describedby={ariaDescribedBy}
        aria-invalid={isInvalid || undefined}
        autoComplete={autoComplete}
        className="auth-input auth-password-input pr-14"
        id={id}
        maxLength={128}
        minLength={minLength}
        name={name}
        onChange={onChange}
        placeholder={placeholder}
        required
        spellCheck={false}
        type={isVisible ? 'text' : 'password'}
      />
      <Button
        aria-controls={id}
        aria-label={visibilityLabel}
        aria-pressed={isVisible}
        className="absolute inset-y-0 right-0 z-10 h-full w-12 rounded-l-none text-muted-foreground hover:bg-primary-soft hover:text-primary"
        onClick={() => setIsVisible((current) => !current)}
        size="icon-sm"
        title={visibilityLabel}
        type="button"
        variant="ghost"
      >
        {isVisible ? <EyeOffIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
      </Button>
    </div>
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
        <Spinner aria-label={pendingLabel} />
      ) : Icon ? (
        <Icon aria-hidden="true" data-icon="inline-start" />
      ) : null}
      {pending ? pendingLabel : label}
    </Button>
  );
}
