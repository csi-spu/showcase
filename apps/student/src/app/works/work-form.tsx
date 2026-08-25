'use client';

import { Button } from '@showcase/ui/button';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import type { WorkAuthoringContext, WorkDraft } from '@/lib/student-works-core';
import type { WorkField } from '@/lib/student-work-validation';
import { initialWorkActionState, type WorkActionState } from './work-action-state';
import { WorkMediaUpload } from './work-media-upload';

type WorkAction = (previousState: WorkActionState, formData: FormData) => Promise<WorkActionState>;

const CATEGORY_ITEMS = [
  { label: 'ผลงานรายวิชา', value: 'course_work' },
  { label: 'ผลงานประกวด', value: 'competition_entry' },
  { label: 'บทความวิชาการ', value: 'academic_article' },
] as const;
const SEMESTER_ITEMS = [
  { label: 'ภาคการศึกษาที่ 1', value: '1' },
  { label: 'ภาคการศึกษาที่ 2', value: '2' },
  { label: 'ภาคฤดูร้อน', value: 'summer' },
] as const;

export function WorkForm({
  action,
  context,
  idempotencyKey,
  mode,
  publicId,
  work,
}: {
  action: WorkAction;
  context: WorkAuthoringContext;
  idempotencyKey: string;
  mode: 'create' | 'edit';
  publicId?: string;
  work: WorkDraft | null;
}) {
  const t = useTranslations('Work');
  const [state, formAction] = useActionState(
    action,
    initialWorkActionState(idempotencyKey, work?.version ?? null),
  );
  const [draft, setDraft] = useState(() => createFormDraft(work, context));
  const isInvalid = (field: WorkField) => state.fieldErrors.includes(field);

  return (
    <form action={formAction} className="flex w-full max-w-[45rem] flex-col gap-8">
      <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
      {state.version === null ? null : (
        <input name="expectedVersion" type="hidden" value={state.version} />
      )}

      <FieldSet className="rounded-surface border border-border bg-card p-6 sm:p-8">
        <FieldLegend>{t('sections.content')}</FieldLegend>
        <FieldDescription>{t('sections.contentHelp')}</FieldDescription>
        <FieldGroup>
          <Field data-invalid={isInvalid('title') || undefined}>
            <FieldLabel htmlFor="work-title">{t('title')}</FieldLabel>
            <Input
              aria-invalid={isInvalid('title') || undefined}
              onChange={(event) =>
                setDraft((current) => ({ ...current, title: event.target.value }))
              }
              id="work-title"
              maxLength={150}
              name="title"
              required
              value={draft.title}
            />
            {isInvalid('title') ? <FieldError>{t('fieldErrors.title')}</FieldError> : null}
          </Field>
          <Field data-invalid={isInvalid('summary') || undefined}>
            <FieldLabel htmlFor="work-summary">{t('summary')}</FieldLabel>
            <Textarea
              aria-invalid={isInvalid('summary') || undefined}
              id="work-summary"
              maxLength={300}
              name="summary"
              onChange={(event) =>
                setDraft((current) => ({ ...current, summary: event.target.value }))
              }
              required
              rows={4}
              value={draft.summary}
            />
            <FieldDescription>{t('summaryHelp')}</FieldDescription>
            {isInvalid('summary') ? <FieldError>{t('fieldErrors.summary')}</FieldError> : null}
          </Field>
          <Field data-invalid={isInvalid('description') || undefined}>
            <FieldLabel htmlFor="work-description">{t('description')}</FieldLabel>
            <Textarea
              aria-invalid={isInvalid('description') || undefined}
              className="min-h-56 resize-y"
              id="work-description"
              maxLength={10_000}
              name="description"
              onChange={(event) =>
                setDraft((current) => ({ ...current, description: event.target.value }))
              }
              required
              rows={10}
              value={draft.description}
            />
            <FieldDescription>{t('descriptionHelp')}</FieldDescription>
            {isInvalid('description') ? (
              <FieldError>{t('fieldErrors.description')}</FieldError>
            ) : null}
          </Field>
        </FieldGroup>
      </FieldSet>

      {publicId === undefined || work === null ? null : (
        <>
          <WorkMediaUpload expectedVersion={work.version} mediaKind="poster" publicId={publicId} />
          <WorkMediaUpload expectedVersion={work.version} mediaKind="gallery" publicId={publicId} />
        </>
      )}

      <FieldSet className="rounded-surface border border-border bg-card p-6 sm:p-8">
        <FieldLegend>{t('sections.classification')}</FieldLegend>
        <FieldDescription>{t('sections.classificationHelp')}</FieldDescription>
        <FieldGroup>
          <Field data-invalid={isInvalid('category') || undefined}>
            <FieldLabel htmlFor="work-category">{t('category')}</FieldLabel>
            <Select
              items={CATEGORY_ITEMS}
              name="category"
              onValueChange={(value) => {
                if (value !== null) {
                  setDraft((current) => ({ ...current, category: value }));
                }
              }}
              value={draft.category}
            >
              <SelectTrigger
                aria-invalid={isInvalid('category') || undefined}
                className="w-full"
                id="work-category"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {CATEGORY_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {isInvalid('category') ? <FieldError>{t('fieldErrors.category')}</FieldError> : null}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field data-invalid={isInvalid('academicPeriod') || undefined}>
              <FieldLabel htmlFor="academic-year">{t('academicYear')}</FieldLabel>
              <Input
                aria-invalid={isInvalid('academicPeriod') || undefined}
                id="academic-year"
                max={context.currentAcademicYear}
                min={context.entryYear}
                name="academicYear"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, academicYear: event.target.value }))
                }
                required
                type="number"
                value={draft.academicYear}
              />
              <FieldDescription>
                {t('academicYearHelp', {
                  from: context.entryYear,
                  to: context.currentAcademicYear,
                })}
              </FieldDescription>
            </Field>
            <Field data-invalid={isInvalid('academicPeriod') || undefined}>
              <FieldLabel htmlFor="semester">{t('semester')}</FieldLabel>
              <Select
                items={SEMESTER_ITEMS}
                name="semester"
                onValueChange={(value) => {
                  if (value !== null) {
                    setDraft((current) => ({ ...current, semester: value }));
                  }
                }}
                value={draft.semester}
              >
                <SelectTrigger
                  aria-invalid={isInvalid('academicPeriod') || undefined}
                  className="w-full"
                  id="semester"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {SEMESTER_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </div>
          {isInvalid('academicPeriod') ? (
            <FieldError>{t('fieldErrors.academicPeriod')}</FieldError>
          ) : null}
        </FieldGroup>
      </FieldSet>

      <FieldSet className="rounded-surface border border-border bg-card p-6 sm:p-8">
        <FieldLegend>{t('sections.links')}</FieldLegend>
        <FieldDescription>{t('sections.linksHelp')}</FieldDescription>
        <FieldGroup>
          {Array.from({ length: 5 }, (_, index) => (
            <div className="grid gap-3 border-t border-border pt-5 sm:grid-cols-2" key={index}>
              <Field data-invalid={isInvalid('links') || undefined}>
                <FieldLabel htmlFor={`work-link-label-${index}`}>
                  {t('linkLabel', { number: index + 1 })}
                </FieldLabel>
                <Input
                  aria-invalid={isInvalid('links') || undefined}
                  id={`work-link-label-${index}`}
                  maxLength={50}
                  name={`linkLabel${index}`}
                  onChange={(event) => {
                    const label = event.target.value;
                    setDraft((current) => ({
                      ...current,
                      links: current.links.map((link, currentIndex) =>
                        currentIndex === index ? { ...link, label } : link,
                      ),
                    }));
                  }}
                  value={draft.links[index]?.label ?? ''}
                />
              </Field>
              <Field data-invalid={isInvalid('links') || undefined}>
                <FieldLabel htmlFor={`work-link-url-${index}`}>
                  {t('linkUrl', { number: index + 1 })}
                </FieldLabel>
                <Input
                  aria-invalid={isInvalid('links') || undefined}
                  id={`work-link-url-${index}`}
                  maxLength={2_048}
                  name={`linkUrl${index}`}
                  onChange={(event) => {
                    const url = event.target.value;
                    setDraft((current) => ({
                      ...current,
                      links: current.links.map((link, currentIndex) =>
                        currentIndex === index ? { ...link, url } : link,
                      ),
                    }));
                  }}
                  placeholder="https://"
                  type="url"
                  value={draft.links[index]?.url ?? ''}
                />
              </Field>
            </div>
          ))}
          {isInvalid('links') ? <FieldError>{t('fieldErrors.links')}</FieldError> : null}
        </FieldGroup>
      </FieldSet>

      <FieldSet className="rounded-surface border border-border bg-card p-6 sm:p-8">
        <FieldLegend>{t('sections.tags')}</FieldLegend>
        <FieldDescription>{t('sections.tagsHelp')}</FieldDescription>
        <FieldGroup>
          <div className="grid gap-5 sm:grid-cols-2">
            {Array.from({ length: 5 }, (_, index) => (
              <Field data-invalid={isInvalid('tags') || undefined} key={index}>
                <FieldLabel htmlFor={`work-tag-${index}`}>
                  {t('tag', { number: index + 1 })}
                </FieldLabel>
                <Input
                  aria-invalid={isInvalid('tags') || undefined}
                  id={`work-tag-${index}`}
                  maxLength={50}
                  name={`tag${index}`}
                  onChange={(event) => {
                    const tag = event.target.value;
                    setDraft((current) => ({
                      ...current,
                      tags: current.tags.map((currentTag, currentIndex) =>
                        currentIndex === index ? tag : currentTag,
                      ),
                    }));
                  }}
                  value={draft.tags[index] ?? ''}
                />
              </Field>
            ))}
          </div>
          {isInvalid('tags') ? <FieldError>{t('fieldErrors.tags')}</FieldError> : null}
        </FieldGroup>
      </FieldSet>

      <FieldSet className="rounded-surface border border-border bg-card p-6 sm:p-8">
        <FieldLegend>{t('sections.videos')}</FieldLegend>
        <FieldDescription>{t('sections.videosHelp')}</FieldDescription>
        <FieldGroup>
          {Array.from({ length: 3 }, (_, index) => (
            <Field data-invalid={isInvalid('videoLinks') || undefined} key={index}>
              <FieldLabel htmlFor={`work-video-link-${index}`}>
                {t('videoLink', { number: index + 1 })}
              </FieldLabel>
              <Input
                aria-invalid={isInvalid('videoLinks') || undefined}
                id={`work-video-link-${index}`}
                maxLength={2_048}
                name={`videoLink${index}`}
                onChange={(event) => {
                  const videoLink = event.target.value;
                  setDraft((current) => ({
                    ...current,
                    videoLinks: current.videoLinks.map((currentLink, currentIndex) =>
                      currentIndex === index ? videoLink : currentLink,
                    ),
                  }));
                }}
                placeholder="https://"
                type="url"
                value={draft.videoLinks[index] ?? ''}
              />
            </Field>
          ))}
          {isInvalid('videoLinks') ? <FieldError>{t('fieldErrors.videoLinks')}</FieldError> : null}
        </FieldGroup>
      </FieldSet>

      <ActionFeedback state={state} />
      <SubmitButton
        label={mode === 'create' ? t('create') : t('save')}
        pendingLabel={t('saving')}
      />
    </form>
  );
}

function createFormDraft(work: WorkDraft | null, context: WorkAuthoringContext) {
  return {
    academicYear: String(work?.draft.academicPeriod.year ?? context.currentAcademicYear),
    category: work?.draft.category ?? ('course_work' as const),
    description: work?.draft.description ?? '',
    links: Array.from({ length: 5 }, (_, index) => ({
      label: work?.draft.links[index]?.label ?? '',
      url: work?.draft.links[index]?.url ?? '',
    })),
    semester: work?.draft.academicPeriod.semester ?? ('1' as const),
    summary: work?.draft.summary ?? '',
    tags: Array.from({ length: 5 }, (_, index) => work?.draft.tags[index]?.displayLabel ?? ''),
    title: work?.draft.title ?? '',
    videoLinks: Array.from({ length: 3 }, (_, index) => work?.draft.videoLinks[index]?.url ?? ''),
  };
}

function ActionFeedback({ state }: { state: WorkActionState }) {
  const t = useTranslations('Work');
  if (state.error !== null) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t('errors.heading')}</AlertTitle>
        <AlertDescription>{t(`errors.${state.error}`)}</AlertDescription>
      </Alert>
    );
  }
  return state.success ? <p className="text-sm text-success">{t('saved')}</p> : null;
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} size="lg" type="submit">
      {pending ? <Spinner aria-label={pendingLabel} data-icon="inline-start" /> : null}
      {pending ? pendingLabel : label}
    </Button>
  );
}
