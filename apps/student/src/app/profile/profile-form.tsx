'use client';

import { Button } from '@showcase/ui/button';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import type { PrivatePublicProfile } from '@/lib/student-profile-core';
import {
  INITIAL_PROFILE_ACTION_STATE,
  type ProfileActionError,
  type ProfileActionState,
} from './profile-action-state';

type ProfileAction = (
  previousState: ProfileActionState,
  formData: FormData,
) => Promise<ProfileActionState>;
type CreatePhotoUpload = (input: {
  byteSize: number;
  contentType: string;
}) => Promise<
  | { data: { headers: { 'content-type': string }; uploadId: string; uploadUrl: string } }
  | { error: ProfileActionError }
>;
type FinalizePhotoUpload = (
  uploadId: string,
) => Promise<{ data: { photoId: string; status: 'ready' } } | { error: ProfileActionError }>;
interface ProfileDraftState {
  bio: string;
  displayName: string;
  links: Array<{ label: string; url: string }>;
}

export function ProfileForm({
  canEditProfile,
  createPhotoUpload,
  finalizePhotoUpload,
  idempotencyKey,
  profile,
  updateAction,
}: {
  canEditProfile: boolean;
  createPhotoUpload: CreatePhotoUpload;
  finalizePhotoUpload: FinalizePhotoUpload;
  idempotencyKey: string;
  profile: PrivatePublicProfile | null;
  updateAction: ProfileAction;
}) {
  const t = useTranslations('Profile');
  const [state, formAction] = useActionState(updateAction, INITIAL_PROFILE_ACTION_STATE);
  const [draft, setDraft] = useState(() => createDraft(profile));
  const [photoId, setPhotoId] = useState(profile?.photoId ?? '');
  const [isUploading, setIsUploading] = useState(false);
  const [photoError, setPhotoError] = useState(false);

  async function uploadPhoto(file: File | undefined) {
    setPhotoError(false);
    if (file === undefined) return;
    if (
      file.size <= 0 ||
      file.size > 2_097_152 ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    ) {
      setPhotoError(true);
      return;
    }
    setIsUploading(true);
    try {
      const authorization = await createPhotoUpload({
        byteSize: file.size,
        contentType: file.type,
      });
      if ('error' in authorization) throw new Error(authorization.error);
      const upload = await fetch(authorization.data.uploadUrl, {
        body: file,
        credentials: 'omit',
        headers: authorization.data.headers,
        method: 'PUT',
      });
      if (!upload.ok) throw new Error('upload_failed');
      const finalized = await finalizePhotoUpload(authorization.data.uploadId);
      if ('error' in finalized) throw new Error(finalized.error);
      setPhotoId(finalized.data.photoId);
    } catch {
      setPhotoError(true);
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <form action={formAction} className="flex max-w-[45rem] flex-col gap-8">
      <input name="expectedVersion" type="hidden" value={profile?.version ?? 0} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <input name="photoId" type="hidden" value={photoId} />

      {!canEditProfile ? (
        <Alert>
          <AlertDescription>{t('readOnly')}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 rounded-surface border border-border/80 bg-card p-6 shadow-[0_1rem_2.5rem_-2rem_rgba(50,20,45,0.22)] sm:p-8">
        <Field>
          <FieldLabel htmlFor="display-name">{t('displayName')}</FieldLabel>
          <Input
            disabled={!canEditProfile}
            id="display-name"
            maxLength={100}
            name="displayName"
            onChange={(event) => {
              const displayName = event.currentTarget.value;
              setDraft((current) => ({ ...current, displayName }));
            }}
            required
            value={draft.displayName}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="bio">{t('bio')}</FieldLabel>
          <Textarea
            className="min-h-32 resize-y"
            disabled={!canEditProfile}
            id="bio"
            maxLength={500}
            name="bio"
            onChange={(event) => {
              const bio = event.currentTarget.value;
              setDraft((current) => ({ ...current, bio }));
            }}
            value={draft.bio}
          />
          <FieldDescription>{t('bioHelp')}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="profile-photo">{t('photo')}</FieldLabel>
          <Input
            accept="image/jpeg,image/png,image/webp"
            disabled={!canEditProfile || isUploading}
            id="profile-photo"
            onChange={(event) => void uploadPhoto(event.currentTarget.files?.[0])}
            type="file"
          />
          <FieldDescription>{t('photoHelp')}</FieldDescription>
          {isUploading ? <p aria-live="polite">{t('photoUploading')}</p> : null}
          {photoId ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-success">{t('photoReady')}</p>
              {canEditProfile ? (
                <Button
                  disabled={isUploading}
                  onClick={() => setPhotoId('')}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {t('photoRemove')}
                </Button>
              ) : null}
            </div>
          ) : null}
          {photoError ? (
            <p className="text-sm text-destructive" role="alert">
              {t('errors.photo')}
            </p>
          ) : null}
        </Field>
      </div>

      <fieldset className="grid gap-5 rounded-surface border border-border bg-card p-6 sm:p-8">
        <legend className="px-2 text-lg font-semibold">{t('links')}</legend>
        <p className="text-sm text-muted-foreground">{t('linksHelp')}</p>
        {Array.from({ length: 5 }, (_, index) => {
          const link = draft.links[index];
          return (
            <div className="grid gap-3 border-t border-border pt-5 sm:grid-cols-2" key={index}>
              <Field>
                <FieldLabel htmlFor={`link-label-${index}`}>
                  {t('linkLabel', { number: index + 1 })}
                </FieldLabel>
                <Input
                  disabled={!canEditProfile}
                  id={`link-label-${index}`}
                  maxLength={50}
                  name={`linkLabel${index}`}
                  onChange={(event) => {
                    const label = event.currentTarget.value;
                    setDraft((current) => ({
                      ...current,
                      links: current.links.map((currentLink, currentIndex) =>
                        currentIndex === index ? { ...currentLink, label } : currentLink,
                      ),
                    }));
                  }}
                  value={link?.label ?? ''}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`link-url-${index}`}>
                  {t('linkUrl', { number: index + 1 })}
                </FieldLabel>
                <Input
                  disabled={!canEditProfile}
                  id={`link-url-${index}`}
                  maxLength={2048}
                  name={`linkUrl${index}`}
                  onChange={(event) => {
                    const url = event.currentTarget.value;
                    setDraft((current) => ({
                      ...current,
                      links: current.links.map((currentLink, currentIndex) =>
                        currentIndex === index ? { ...currentLink, url } : currentLink,
                      ),
                    }));
                  }}
                  placeholder="https://"
                  type="url"
                  value={link?.url ?? ''}
                />
              </Field>
            </div>
          );
        })}
      </fieldset>

      <ActionFeedback error={state.error} success={state.success} />
      {canEditProfile ? <SubmitButton label={t('save')} pendingLabel={t('saving')} /> : null}
    </form>
  );
}

function createDraft(profile: PrivatePublicProfile | null): ProfileDraftState {
  return {
    bio: profile?.bio ?? '',
    displayName: profile?.displayName ?? '',
    links: Array.from({ length: 5 }, (_, index) => ({
      label: profile?.links[index]?.label ?? '',
      url: profile?.links[index]?.url ?? '',
    })),
  };
}

export function ConsentPanel({
  grantAction,
  idempotencyKey,
  profile,
  publicProfileUrl,
  withdrawAction,
}: {
  grantAction: ProfileAction;
  idempotencyKey: string;
  profile: PrivatePublicProfile | null;
  publicProfileUrl?: string | undefined;
  withdrawAction: ProfileAction;
}) {
  const t = useTranslations('Profile');
  const isGranted = profile !== null && profile.consent !== null;
  const action = isGranted ? withdrawAction : grantAction;
  const [state, formAction] = useActionState(action, INITIAL_PROFILE_ACTION_STATE);

  return (
    <section className="grid max-w-[45rem] gap-2 rounded-surface border border-border bg-muted/30 px-4 py-3">
      <form action={formAction} className="grid gap-2">
        <input name="expectedVersion" type="hidden" value={profile?.version ?? 0} />
        <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
        <ConsentCheckbox
          checked={isGranted}
          disabled={profile === null}
          label={t('consent.grant')}
          pendingLabel={t('saving')}
        />
        <p className="pl-7 text-xs text-muted-foreground">
          {profile === null
            ? t('consent.profileRequired')
            : isGranted
              ? t('consent.public')
              : t('consent.private')}
        </p>
        <ActionFeedback error={state.error} success={state.success} />
      </form>
      {isGranted && publicProfileUrl ? (
        <a className="pl-7 text-sm font-medium text-primary underline" href={publicProfileUrl}>
          {t('consent.viewPublic')}
        </a>
      ) : null}
    </section>
  );
}

function ConsentCheckbox({
  checked,
  disabled,
  label,
  pendingLabel,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-medium">
      <input
        checked={checked}
        className="size-4 rounded border-input accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled || pending}
        onChange={(event) => {
          event.currentTarget.form?.requestSubmit();
        }}
        type="checkbox"
      />
      <span>{label}</span>
      {pending ? <Spinner aria-label={pendingLabel} className="size-4" /> : null}
    </label>
  );
}

function ActionFeedback({
  error,
  success,
}: {
  error: ProfileActionError | null;
  success: boolean;
}) {
  const t = useTranslations('Profile');
  if (error !== null) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
      </Alert>
    );
  }
  return success ? <p className="text-sm text-success">{t('saved')}</p> : null;
}

function SubmitButton({
  label,
  pendingLabel,
  variant = 'default',
}: {
  label: string;
  pendingLabel: string;
  variant?: 'default' | 'destructive';
}) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} size="lg" type="submit" variant={variant}>
      {pending ? <Spinner aria-label={pendingLabel} /> : null}
      {pending ? pendingLabel : label}
    </Button>
  );
}
