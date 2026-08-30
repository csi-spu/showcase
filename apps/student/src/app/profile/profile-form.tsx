'use client';

import { Button } from '@showcase/ui/button';
import {
  CameraIcon,
  ExternalLinkIcon,
  GlobeIcon,
  LinkIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  UserRoundIcon,
} from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useActionState, useRef, useState } from 'react';
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
type FinalizePhotoUpload = (input: {
  expectedVersion: number;
  idempotencyKey: string;
  uploadId: string;
}) => Promise<
  { data: { photoId: string; status: 'ready'; version: number } } | { error: ProfileActionError }
>;
interface ProfileDraftState {
  bio: string;
  links: ProfileLinkDraft[];
}
interface ProfileLinkDraft {
  key: string;
  kind: 'custom' | 'preset';
  label: string;
  url: string;
}
type ProfileEditorKey = 'bio' | `link:${string}`;

const PROFILE_LINK_LIMIT = 5;
const PROFILE_BIO_EDIT_BUTTON_ID = 'profile-bio-edit-button';
const PROFILE_PHOTO_INPUT_ID = 'profile-photo';
const PRESET_LINKS = [
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'linkedin', label: 'LinkedIn' },
] as const;

export function ProfilePhotoButton({
  canEditProfile,
  hasPhoto,
  photoAlt,
  photoVersion,
}: {
  canEditProfile: boolean;
  hasPhoto: boolean;
  photoAlt: string;
  photoVersion: number;
}) {
  const t = useTranslations('Profile');
  const className = 'relative grid size-24 shrink-0 place-items-center rounded-full sm:size-32';
  const photo = hasPhoto ? (
    <Image
      alt={photoAlt}
      className="object-cover"
      fill
      sizes="(min-width: 640px) 128px, 96px"
      src={`/profile/photo?v=${photoVersion}`}
      unoptimized
    />
  ) : (
    <UserRoundIcon aria-hidden="true" className="size-10 sm:size-14" />
  );
  const photoMask = (
    <span className="absolute inset-0 grid place-items-center overflow-hidden rounded-full border-4 border-card bg-primary-soft text-primary shadow-sm">
      {photo}
    </span>
  );

  if (!canEditProfile) {
    return <div className={className}>{photoMask}</div>;
  }

  return (
    <button
      aria-label={t('editPhoto')}
      className={`${className} group focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring`}
      onClick={() => {
        const input = document.getElementById(PROFILE_PHOTO_INPUT_ID);
        if (input instanceof HTMLInputElement) input.click();
      }}
      type="button"
    >
      {photoMask}
      <span
        aria-hidden="true"
        className="absolute -right-1 -bottom-1 z-10 grid size-10 place-items-center rounded-full border-4 border-card bg-primary text-primary-foreground shadow-sm transition-transform group-hover:scale-105"
      >
        <CameraIcon className="size-4" />
      </span>
    </button>
  );
}

export function ProfileOverviewEditLink({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <a
      aria-label={label}
      className="block min-w-0 flex-1 rounded-control p-2 text-left transition-colors hover:bg-accent/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      href="#profile-bio"
      onClick={() => {
        const editButton = document.getElementById(PROFILE_BIO_EDIT_BUTTON_ID);
        if (editButton instanceof HTMLButtonElement) editButton.click();
      }}
    >
      {children}
    </a>
  );
}

export function ProfileForm({
  canEditProfile,
  createPhotoUpload,
  finalizePhotoUpload,
  idempotencyKey,
  photoIdempotencyKey,
  profile,
  updateAction,
}: {
  canEditProfile: boolean;
  createPhotoUpload: CreatePhotoUpload;
  finalizePhotoUpload: FinalizePhotoUpload;
  idempotencyKey: string;
  photoIdempotencyKey: string;
  profile: PrivatePublicProfile | null;
  updateAction: ProfileAction;
}) {
  const t = useTranslations('Profile');
  const router = useRouter();
  const [draft, setDraft] = useState(() => createDraft(profile));
  const [photoId, setPhotoId] = useState(profile?.photoId ?? '');
  const [isUploading, setIsUploading] = useState(false);
  const [photoError, setPhotoError] = useState<ProfileActionError | null>(null);
  const [isPhotoSaved, setIsPhotoSaved] = useState(false);
  const [editingItem, setEditingItem] = useState<ProfileEditorKey | null>(null);
  const [hasDraftChanges, setHasDraftChanges] = useState(false);
  const [versionOverride, setVersionOverride] = useState<number | null>(null);
  const expectedVersion = versionOverride ?? profile?.version ?? 0;
  const [currentIdempotencyKey, setCurrentIdempotencyKey] = useState(idempotencyKey);
  const [currentPhotoIdempotencyKey, setCurrentPhotoIdempotencyKey] = useState(photoIdempotencyKey);
  const [state, formAction] = useActionState(
    async (previousState: ProfileActionState, formData: FormData) => {
      const nextState = await updateAction(previousState, formData);
      if (nextState.success) {
        setEditingItem(null);
        setHasDraftChanges(false);
        setVersionOverride(expectedVersion + 1);
        setCurrentIdempotencyKey(crypto.randomUUID());
      }
      return nextState;
    },
    INITIAL_PROFILE_ACTION_STATE,
  );
  const nextCustomLinkId = useRef(draft.links.length);

  async function uploadPhoto(file: File | undefined) {
    setPhotoError(null);
    setIsPhotoSaved(false);
    if (file === undefined) return;
    if (
      file.size <= 0 ||
      file.size > 2_097_152 ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    ) {
      setPhotoError('photo');
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
      const finalized = await finalizePhotoUpload({
        expectedVersion,
        idempotencyKey: currentPhotoIdempotencyKey,
        uploadId: authorization.data.uploadId,
      });
      if ('error' in finalized) {
        setPhotoError(finalized.error);
        return;
      }
      setPhotoId(finalized.data.photoId);
      setVersionOverride(finalized.data.version);
      setCurrentPhotoIdempotencyKey(crypto.randomUUID());
      setIsPhotoSaved(true);
      router.refresh();
    } catch {
      setPhotoError('network');
    } finally {
      setIsUploading(false);
    }
  }

  function addCustomLink() {
    const key = `custom-new-${nextCustomLinkId.current}`;
    nextCustomLinkId.current += 1;
    setDraft((current) =>
      current.links.length >= PROFILE_LINK_LIMIT
        ? current
        : {
            ...current,
            links: [...current.links, { key, kind: 'custom', label: '', url: '' }],
          },
    );
    setEditingItem(`link:${key}`);
    setHasDraftChanges(true);
  }

  function removeCustomLink(key: string) {
    setDraft((current) => ({
      ...current,
      links: current.links.filter((link) => link.key !== key),
    }));
    setEditingItem(null);
    setHasDraftChanges(true);
  }

  function toggleEditor(key: ProfileEditorKey) {
    setEditingItem((current) => (current === key ? null : key));
  }

  return (
    <form action={formAction} className="grid min-w-0 scroll-mt-24 gap-6" id="profile-editor">
      <input name="expectedVersion" type="hidden" value={expectedVersion} />
      <input name="idempotencyKey" type="hidden" value={currentIdempotencyKey} />
      <input name="photoId" type="hidden" value={photoId} />
      <input
        accept="image/jpeg,image/png,image/webp"
        aria-label={t('photo')}
        className="sr-only"
        disabled={!canEditProfile || isUploading}
        id={PROFILE_PHOTO_INPUT_ID}
        onChange={(event) => void uploadPhoto(event.currentTarget.files?.[0])}
        type="file"
      />

      {!canEditProfile ? (
        <Alert>
          <AlertDescription>{t('readOnly')}</AlertDescription>
        </Alert>
      ) : null}

      {isUploading ? (
        <p className="sr-only" aria-live="polite">
          {t('photoUploading')}
        </p>
      ) : null}
      {photoError ? (
        <p className="text-sm text-destructive" role="alert">
          {t(`errors.${photoError}`)}
        </p>
      ) : null}
      {isPhotoSaved ? (
        <p className="text-sm text-success" role="status">
          {t('photoSaved')}
        </p>
      ) : null}

      <div
        className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-3 rounded-surface border border-border/80 bg-card p-5 shadow-[0_1rem_2.5rem_-2rem_rgba(50,20,45,0.18)] sm:p-7 lg:p-8"
        id="profile-bio"
      >
        <PencilIcon aria-hidden="true" className="mt-0.5 size-5 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{t('bio')}</p>
          <p className="mt-1 text-sm leading-relaxed break-words text-foreground">
            {draft.bio || t('bioEmpty')}
          </p>
        </div>
        {canEditProfile ? (
          <EditIconButton
            controls="profile-bio-editor"
            id={PROFILE_BIO_EDIT_BUTTON_ID}
            isExpanded={editingItem === 'bio'}
            label={t('editBio')}
            onClick={() => toggleEditor('bio')}
          />
        ) : null}
        {editingItem === 'bio' ? (
          <Field className="col-span-full" id="profile-bio-editor">
            <FieldLabel htmlFor="bio">{t('bio')}</FieldLabel>
            <Textarea
              autoFocus
              className="min-h-32 resize-y"
              disabled={!canEditProfile}
              id="bio"
              maxLength={500}
              name="bio"
              onChange={(event) => {
                const bio = event.currentTarget.value;
                setDraft((current) => ({ ...current, bio }));
                setHasDraftChanges(true);
              }}
              value={draft.bio}
            />
            <FieldDescription>{t('bioHelp')}</FieldDescription>
          </Field>
        ) : (
          <input name="bio" type="hidden" value={draft.bio} />
        )}
      </div>

      <fieldset
        className="grid scroll-mt-24 gap-5 rounded-surface border border-border/80 bg-card p-5 sm:p-7 lg:p-8"
        id="profile-links"
      >
        <legend className="sr-only">{t('links')}</legend>
        <header className="grid gap-1 border-b border-border/80 pb-5">
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <LinkIcon aria-hidden="true" className="size-5 text-primary" />
            {t('links')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('linksHelp')}</p>
        </header>
        <div className="grid gap-4">
          {draft.links.map((link, index) => (
            <ProfileLinkRow
              canEditProfile={canEditProfile}
              index={index}
              isEditing={editingItem === `link:${link.key}`}
              key={link.key}
              link={link}
              onChange={(nextLink) => {
                setDraft((current) => ({
                  ...current,
                  links: current.links.map((currentLink) =>
                    currentLink.key === link.key ? nextLink : currentLink,
                  ),
                }));
                setHasDraftChanges(true);
              }}
              onEdit={() => toggleEditor(`link:${link.key}`)}
              onRemove={() => removeCustomLink(link.key)}
            />
          ))}
        </div>
        {canEditProfile && draft.links.length < PROFILE_LINK_LIMIT ? (
          <Button className="w-fit" onClick={addCustomLink} type="button" variant="outline">
            <PlusIcon aria-hidden="true" />
            {t('addLink')}
          </Button>
        ) : null}
      </fieldset>

      <ActionFeedback error={state.error} success={state.success} />
      {canEditProfile && (editingItem !== null || hasDraftChanges) ? (
        <div className="flex justify-end border-t border-border/80 pt-5">
          <SubmitButton label={t('save')} pendingLabel={t('saving')} />
        </div>
      ) : null}
    </form>
  );
}

function EditIconButton({
  controls,
  id,
  isExpanded,
  label,
  onClick,
}: {
  controls: string;
  id?: string;
  isExpanded: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      aria-controls={controls}
      aria-expanded={isExpanded}
      aria-label={label}
      id={id}
      onClick={onClick}
      size="icon-sm"
      type="button"
      variant="ghost"
    >
      <PencilIcon aria-hidden="true" />
    </Button>
  );
}

function createDraft(profile: PrivatePublicProfile | null): ProfileDraftState {
  const storedLinks = profile?.links ?? [];
  let availablePresetSlots = Math.max(0, PROFILE_LINK_LIMIT - storedLinks.length);
  const presetRows: ProfileLinkDraft[] = PRESET_LINKS.flatMap((preset) => {
    const storedLink = storedLinks.find((link) => isSameLinkLabel(preset.label, link.label));
    if (storedLink !== undefined) {
      return [{ key: `preset-${preset.key}`, kind: 'preset', ...storedLink }];
    }
    if (availablePresetSlots === 0) return [];
    availablePresetSlots -= 1;
    return [
      {
        key: `preset-${preset.key}`,
        kind: 'preset',
        label: preset.label,
        url: '',
      },
    ];
  });
  const customRows: ProfileLinkDraft[] = storedLinks.flatMap((link, index) => {
    if (PRESET_LINKS.some((preset) => isSameLinkLabel(preset.label, link.label))) return [];
    return [{ key: `custom-stored-${index}`, kind: 'custom', ...link }];
  });

  return {
    bio: profile?.bio ?? '',
    links: [...presetRows, ...customRows],
  };
}

function isSameLinkLabel(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0;
}

function ProfileLinkRow({
  canEditProfile,
  index,
  isEditing,
  link,
  onChange,
  onEdit,
  onRemove,
}: {
  canEditProfile: boolean;
  index: number;
  isEditing: boolean;
  link: ProfileLinkDraft;
  onChange: (link: ProfileLinkDraft) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations('Profile');
  const editorId = `link-editor-${index}`;
  const urlInputId = `link-url-${index}`;
  const Icon =
    link.kind === 'preset' && !isSameLinkLabel(link.label, 'LinkedIn') ? GlobeIcon : LinkIcon;
  const editLabel = t('editLink', { label: link.label || t('newLink') });
  const submittedLabel = link.url.trim().length > 0 ? link.label : '';

  return (
    <div className="grid gap-3 border-b border-border/70 pb-4 last:border-b-0 last:pb-0">
      <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3">
        <span className="grid size-9 place-items-center rounded-control bg-muted text-muted-foreground">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="font-medium break-words">{link.label || t('newLink')}</p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {link.url || t('linkEmpty')}
          </p>
        </div>
        {canEditProfile ? (
          <EditIconButton
            controls={editorId}
            isExpanded={isEditing}
            label={editLabel}
            onClick={onEdit}
          />
        ) : null}
      </div>

      {isEditing ? (
        <div
          className="grid gap-3 rounded-control bg-muted/50 p-4 sm:grid-cols-[minmax(8rem,0.7fr)_minmax(0,1.3fr)_auto] sm:items-end"
          id={editorId}
        >
          {link.kind === 'custom' ? (
            <Field>
              <FieldLabel htmlFor={`link-label-${index}`}>
                {t('linkLabel', { number: index + 1 })}
              </FieldLabel>
              <Input
                autoFocus
                disabled={!canEditProfile}
                id={`link-label-${index}`}
                maxLength={50}
                name={`linkLabel${index}`}
                onChange={(event) => onChange({ ...link, label: event.currentTarget.value })}
                value={link.label}
              />
            </Field>
          ) : (
            <input name={`linkLabel${index}`} type="hidden" value={submittedLabel} />
          )}
          <Field className={link.kind === 'preset' ? 'sm:col-span-2' : undefined}>
            <FieldLabel htmlFor={urlInputId}>{t('linkUrl', { number: index + 1 })}</FieldLabel>
            <Input
              autoFocus={link.kind === 'preset'}
              disabled={!canEditProfile}
              id={urlInputId}
              maxLength={2048}
              name={`linkUrl${index}`}
              onChange={(event) => onChange({ ...link, url: event.currentTarget.value })}
              placeholder="https://"
              type="url"
              value={link.url}
            />
          </Field>
          {link.kind === 'custom' ? (
            <Button
              aria-label={t('removeLink', { number: index + 1 })}
              onClick={onRemove}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Trash2Icon aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <input name={`linkLabel${index}`} type="hidden" value={submittedLabel} />
          <input name={`linkUrl${index}`} type="hidden" value={link.url} />
        </>
      )}
    </div>
  );
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
  const router = useRouter();
  const isServerGranted = profile !== null && profile.consent !== null;
  const [isGranted, setIsGranted] = useState(isServerGranted);
  const consentFormRef = useRef<HTMLFormElement>(null);
  const consentIntentRef = useRef<HTMLInputElement>(null);
  const [state, formAction, isPending] = useActionState(
    async (previousState: ProfileActionState, formData: FormData) => {
      const nextIsGranted = formData.get('isGranted') === 'true';
      const nextState = await (nextIsGranted ? grantAction : withdrawAction)(
        previousState,
        formData,
      );
      if (!nextState.success) {
        setIsGranted(isServerGranted);
        return nextState;
      }
      router.refresh();
      return nextState;
    },
    INITIAL_PROFILE_ACTION_STATE,
  );

  return (
    <section className="grid gap-5 rounded-surface border border-border/80 bg-card p-5 shadow-[0_1rem_2rem_-2rem_rgba(50,20,45,0.18)] sm:p-6">
      <header className="grid gap-1">
        <h2 className="text-lg font-semibold tracking-tight">{t('consent.heading')}</h2>
        <p className="text-sm text-pretty text-muted-foreground">{t('consent.help')}</p>
      </header>
      <div className="grid gap-3 border-y border-border/80 py-4">
        <form action={formAction} className="hidden" ref={consentFormRef}>
          <input name="expectedVersion" type="hidden" value={profile?.version ?? 0} />
          <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
          <input
            defaultValue={String(isGranted)}
            name="isGranted"
            ref={consentIntentRef}
            type="hidden"
          />
        </form>
        <ConsentCheckbox
          checked={isGranted}
          disabled={profile === null}
          isPending={isPending}
          label={t('consent.grant')}
          onCheckedChange={(isChecked) => {
            setIsGranted(isChecked);
            if (consentIntentRef.current !== null) {
              consentIntentRef.current.value = String(isChecked);
            }
            consentFormRef.current?.requestSubmit();
          }}
          pendingLabel={t('saving')}
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          {profile === null
            ? t('consent.profileRequired')
            : isGranted
              ? t('consent.public')
              : t('consent.private')}
        </p>
        <ActionFeedback error={state.error} success={state.success} />
      </div>
      {isGranted && publicProfileUrl ? (
        <a
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          href={publicProfileUrl}
        >
          {t('consent.viewPublic')}
          <ExternalLinkIcon aria-hidden="true" className="size-4" />
        </a>
      ) : null}
    </section>
  );
}

function ConsentCheckbox({
  checked,
  disabled,
  isPending,
  label,
  onCheckedChange,
  pendingLabel,
}: {
  checked: boolean;
  disabled: boolean;
  isPending: boolean;
  label: string;
  onCheckedChange: (isChecked: boolean) => void;
  pendingLabel: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 text-sm font-medium has-[:disabled]:cursor-not-allowed">
      <span>{label}</span>
      <input
        checked={checked}
        className="peer sr-only"
        disabled={disabled || isPending}
        onChange={(event) => {
          onCheckedChange(event.currentTarget.checked);
        }}
        type="checkbox"
      />
      <span className="relative h-7 w-12 rounded-full border border-input bg-muted transition-colors peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background peer-disabled:cursor-not-allowed peer-disabled:opacity-50 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-background after:shadow-sm after:transition-transform peer-checked:after:translate-x-5">
        {isPending ? (
          <Spinner
            aria-label={pendingLabel}
            className="absolute top-1/2 left-1/2 size-4 -translate-x-1/2 -translate-y-1/2"
          />
        ) : null}
      </span>
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
