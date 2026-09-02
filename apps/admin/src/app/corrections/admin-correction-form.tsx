'use client';

import { Button } from '@showcase/ui/button';
import { toast } from '@showcase/ui/toast';
import { CheckCircle2Icon } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { AdminCorrectionBase } from '@/lib/admin-reviews-core';

export interface AdminCorrectionActionState {
  error: 'invalid' | 'network' | 'stale' | 'unavailable' | null;
  idempotencyKey: string;
  revisionPublicId: string | null;
}

export type AdminCorrectionAction = (
  previousState: AdminCorrectionActionState,
  formData: FormData,
) => Promise<AdminCorrectionActionState>;

export function AdminCorrectionForm({
  action,
  base,
  idempotencyKey,
}: {
  action: AdminCorrectionAction;
  base: AdminCorrectionBase;
  idempotencyKey: string;
}) {
  const t = useTranslations('Correction');
  const [state, formAction] = useActionState(
    async (previousState: AdminCorrectionActionState, formData: FormData) => {
      const nextState = await action(previousState, formData);
      if (nextState.error !== null) toast.error(t(`errors.${nextState.error}`));
      return nextState;
    },
    {
      error: null,
      idempotencyKey,
      revisionPublicId: null,
    },
  );
  const [values, setValues] = useState(() => ({
    academicYear: String(base.content.academicPeriod.year),
    category: base.content.category,
    description: base.content.description,
    reason: '',
    semester: base.content.academicPeriod.semester,
    summary: base.content.summary,
    title: base.content.title,
  }));
  const [links, setLinks] = useState(() => base.content.links.map((link) => ({ ...link })));
  const [tags, setTags] = useState(() => base.content.tags.map((tag) => tag.displayLabel));
  const [videoLinks, setVideoLinks] = useState(() =>
    base.content.videoLinks.map((link) => link.url),
  );
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.error !== null) errorRef.current?.focus();
  }, [state.error]);

  if (state.revisionPublicId !== null) {
    return (
      <Alert variant="success">
        <CheckCircle2Icon aria-hidden="true" />
        <AlertTitle>{t('success')}</AlertTitle>
        <AlertDescription className="grid gap-3">
          <span>{t('successHelp')}</span>
          <Link className="font-medium underline" href={`/reviews/${state.revisionPublicId}`}>
            {t('openReview')}
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  const update = (field: keyof typeof values, value: string) =>
    setValues((current) => ({ ...current, [field]: value }));
  const changedFields = [
    values.title !== base.content.title ? t('fields.title') : null,
    values.summary !== base.content.summary ? t('fields.summary') : null,
    values.description !== base.content.description ? t('fields.description') : null,
    values.category !== base.content.category ? t('fields.category') : null,
    values.academicYear !== String(base.content.academicPeriod.year)
      ? t('fields.academicYear')
      : null,
    values.semester !== base.content.academicPeriod.semester ? t('fields.semester') : null,
    JSON.stringify(links) !== JSON.stringify(base.content.links) ? t('fields.links') : null,
    JSON.stringify(tags) !== JSON.stringify(base.content.tags.map((tag) => tag.displayLabel))
      ? t('fields.tags')
      : null,
    JSON.stringify(videoLinks) !== JSON.stringify(base.content.videoLinks.map((link) => link.url))
      ? t('fields.videoLinks')
      : null,
  ].filter((value): value is string => value !== null);

  return (
    <form
      action={formAction}
      className="grid gap-5"
      onInvalid={(event) =>
        (event.target as HTMLElement).closest('details')?.setAttribute('open', '')
      }
    >
      <input name="expectedPublishedRevisionId" type="hidden" value={base.publicId} />
      <input name="expectedRevisionVersion" type="hidden" value={base.version} />
      <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
      <details className="group rounded-surface border border-border bg-card p-4">
        <summary className="cursor-pointer font-medium marker:text-primary">
          {t('editContent')}
        </summary>
        <div className="mt-5 grid gap-5 border-t border-border pt-5">
          <Field>
            <FieldLabel htmlFor="correction-title">{t('fields.title')}</FieldLabel>
            <Input
              id="correction-title"
              maxLength={150}
              name="title"
              onChange={(event) => update('title', event.target.value)}
              required
              value={values.title}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="correction-summary">{t('fields.summary')}</FieldLabel>
            <Textarea
              className="min-h-28"
              id="correction-summary"
              maxLength={300}
              name="summary"
              onChange={(event) => update('summary', event.target.value)}
              required
              value={values.summary}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="correction-description">{t('fields.description')}</FieldLabel>
            <Textarea
              className="min-h-56"
              id="correction-description"
              maxLength={10_000}
              name="description"
              onChange={(event) => update('description', event.target.value)}
              required
              value={values.description}
            />
          </Field>
          <div className="grid gap-5 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="correction-category">{t('fields.category')}</FieldLabel>
              <select
                className="min-h-11 rounded-control border border-input bg-card px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:text-sm"
                id="correction-category"
                name="category"
                onChange={(event) => update('category', event.target.value)}
                value={values.category}
              >
                {(['course_work', 'competition_entry', 'academic_article'] as const).map(
                  (category) => (
                    <option key={category} value={category}>
                      {t(`categories.${category}`)}
                    </option>
                  ),
                )}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="correction-year">{t('fields.academicYear')}</FieldLabel>
              <Input
                id="correction-year"
                max={2700}
                min={2400}
                name="academicYear"
                onChange={(event) => update('academicYear', event.target.value)}
                required
                type="number"
                value={values.academicYear}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="correction-semester">{t('fields.semester')}</FieldLabel>
              <select
                className="min-h-11 rounded-control border border-input bg-card px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:text-sm"
                id="correction-semester"
                name="semester"
                onChange={(event) => update('semester', event.target.value)}
                value={values.semester}
              >
                {(['1', '2', 'summer'] as const).map((semester) => (
                  <option key={semester} value={semester}>
                    {t(`semesters.${semester}`)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      </details>
      <details className="group rounded-surface border border-border bg-card p-4">
        <summary className="cursor-pointer font-medium marker:text-primary">
          {t('editReferences')}
        </summary>
        <div className="mt-5 grid gap-5 border-t border-border pt-5">
          <Field>
            <FieldLabel>{t('fields.links')}</FieldLabel>
            {links.map((link, index) => (
              <div className="grid gap-3 rounded-control border border-border p-3" key={index}>
                <Input
                  aria-label={t('fields.linkLabel', { number: index + 1 })}
                  maxLength={50}
                  name="linkLabel"
                  onChange={(event) =>
                    setLinks((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, label: event.target.value } : item,
                      ),
                    )
                  }
                  required
                  value={link.label}
                />
                <Input
                  aria-label={t('fields.linkUrl', { number: index + 1 })}
                  maxLength={2_048}
                  name="linkUrl"
                  onChange={(event) =>
                    setLinks((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, url: event.target.value } : item,
                      ),
                    )
                  }
                  required
                  type="url"
                  value={link.url}
                />
                <Button
                  className="w-fit"
                  onClick={() =>
                    setLinks((current) => current.filter((_, itemIndex) => itemIndex !== index))
                  }
                  type="button"
                  variant="ghost"
                >
                  {t('remove')}
                </Button>
              </div>
            ))}
            <FieldDescription>{t('fields.linksHelp')}</FieldDescription>
            <Button
              className="w-fit"
              disabled={links.length >= 5}
              onClick={() => setLinks((current) => [...current, { label: '', url: '' }])}
              type="button"
              variant="outline"
            >
              {t('fields.addLink')}
            </Button>
          </Field>
          <Field>
            <FieldLabel>{t('fields.tags')}</FieldLabel>
            {tags.map((tag, index) => (
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3" key={index}>
                <Input
                  aria-label={t('fields.tag', { number: index + 1 })}
                  maxLength={50}
                  name="tag"
                  onChange={(event) =>
                    setTags((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? event.target.value : item,
                      ),
                    )
                  }
                  required
                  value={tag}
                />
                <Button
                  aria-label={t('fields.removeTag', { number: index + 1 })}
                  onClick={() =>
                    setTags((current) => current.filter((_, itemIndex) => itemIndex !== index))
                  }
                  type="button"
                  variant="ghost"
                >
                  {t('remove')}
                </Button>
              </div>
            ))}
            <FieldDescription>{t('fields.tagsHelp')}</FieldDescription>
            <Button
              className="w-fit"
              disabled={tags.length >= 5}
              onClick={() => setTags((current) => [...current, ''])}
              type="button"
              variant="outline"
            >
              {t('fields.addTag')}
            </Button>
          </Field>
          <Field>
            <FieldLabel>{t('fields.videoLinks')}</FieldLabel>
            {videoLinks.map((videoLink, index) => (
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3" key={index}>
                <Input
                  aria-label={t('fields.videoLink', { number: index + 1 })}
                  maxLength={2_048}
                  name="videoLink"
                  onChange={(event) =>
                    setVideoLinks((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? event.target.value : item,
                      ),
                    )
                  }
                  required
                  type="url"
                  value={videoLink}
                />
                <Button
                  aria-label={t('fields.removeVideoLink', { number: index + 1 })}
                  onClick={() =>
                    setVideoLinks((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                  type="button"
                  variant="ghost"
                >
                  {t('remove')}
                </Button>
              </div>
            ))}
            <FieldDescription>{t('fields.videoLinksHelp')}</FieldDescription>
            <Button
              className="w-fit"
              disabled={videoLinks.length >= 3}
              onClick={() => setVideoLinks((current) => [...current, ''])}
              type="button"
              variant="outline"
            >
              {t('fields.addVideoLink')}
            </Button>
          </Field>
        </div>
      </details>
      <section
        aria-label={t('changesHeading')}
        className="rounded-surface border border-border bg-muted p-4"
        role="status"
      >
        <h3 className="font-medium">{t('changesHeading')}</h3>
        {changedFields.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t('noChanges')}</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {changedFields.map((label) => (
              <li className="rounded-full bg-card px-3 py-1 text-sm" key={label}>
                {label}
              </li>
            ))}
          </ul>
        )}
      </section>
      <Field>
        <FieldLabel htmlFor="correction-reason">{t('fields.reason')}</FieldLabel>
        <Textarea
          className="min-h-32"
          id="correction-reason"
          maxLength={1_000}
          minLength={10}
          name="reason"
          onChange={(event) => update('reason', event.target.value)}
          required
          value={values.reason}
        />
        <FieldDescription>{t('fields.reasonHelp')}</FieldDescription>
      </Field>
      <p className="rounded-control bg-information-background p-4 text-sm leading-6 text-information">
        {t('separationWarning')}
      </p>
      {state.error === null ? null : (
        <Alert ref={errorRef} role="alert" tabIndex={-1} variant="destructive">
          <AlertTitle>{t('errorHeading')}</AlertTitle>
          <AlertDescription>{t(`errors.${state.error}`)}</AlertDescription>
        </Alert>
      )}
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const t = useTranslations('Correction');
  const { pending } = useFormStatus();
  return (
    <Button className="min-h-11 w-full sm:w-fit" disabled={pending} type="submit">
      {pending ? t('submitting') : t('submit')}
    </Button>
  );
}
