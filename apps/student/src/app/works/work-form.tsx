'use client';

import { Button } from '@showcase/ui/button';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useRef, useState, useTransition } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type {
  WorkAuthoringContext,
  WorkContributor,
  WorkDraft,
  WorkDraftPatch,
} from '@/lib/student-works-core';
import { saveWorkDraftAction, submitLatestWorkAction } from './work.actions';
import { WorkContributorEditor } from './work-contributor-editor';
import { WorkMediaUpload } from './work-media-upload';
import { WorkTagInput } from './work-tag-input';

const STEP_COUNT = 5;
const ACADEMIC_YEAR_MINIMUM = 2400;
type SaveState = 'saved' | 'saving' | 'unsynced';
type DraftValues = {
  academicPeriod: { semester: '1' | '2' | 'summer' | ''; year: string };
  category: 'course_work' | 'competition_entry' | 'academic_article' | '';
  description: string;
  githubUrl: string;
  links: Array<{ label: string; url: string }>;
  studyYear: '' | '1' | '2' | '3' | '4';
  summary: string;
  tags: string[];
  title: string;
  videoLinks: string;
};
type NormalizedValues = {
  academicPeriod: { semester: '1' | '2' | 'summer' | null; year: number | null };
  category: 'course_work' | 'competition_entry' | 'academic_article' | null;
  description: string | null;
  links: Array<{ label: string; url: string }>;
  submitterStudyYear: number | null;
  summary: string | null;
  tags: string[];
  title: string | null;
  videoLinks: string[];
};
type SaveAttempt = {
  expectedVersion: number | null;
  idempotencyKey: string;
  patch: WorkDraftPatch;
  publicId: string | null;
  snapshot: DraftValues;
};

export function WorkForm({
  context,
  initialWork,
}: {
  context: WorkAuthoringContext;
  initialWork: WorkDraft | null;
}) {
  const t = useTranslations('Work');
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState(() => valuesFromWork(initialWork));
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [error, setError] = useState<
    null | 'conflict' | 'forbidden' | 'invalid' | 'unauthenticated' | 'unavailable'
  >(null);
  const [workPublicId, setWorkPublicId] = useState(initialWork?.publicId ?? null);
  const [version, setVersion] = useState(initialWork?.version ?? null);
  const [contributors, setContributors] = useState(initialWork?.contributors ?? []);
  const [serverWork, setServerWork] = useState(initialWork);
  const [isSaving, startSaving] = useTransition();
  const [isSubmitting, startSubmission] = useTransition();
  const valuesRef = useRef(values);
  const lastSavedRef = useRef(values);
  const conflictRef = useRef(false);
  const pendingAttemptRef = useRef<SaveAttempt | null>(null);
  const submissionIdempotencyKeyRef = useRef<string | null>(null);

  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  const saveDraft = async (): Promise<boolean> => {
    if (conflictRef.current) return false;
    const snapshot = valuesRef.current;
    const currentPublicId = workPublicId;
    const patch = createPatch(lastSavedRef.current, snapshot, currentPublicId !== null);
    if (pendingAttemptRef.current === null && patch === null) {
      if (currentPublicId === null && !hasMeaningfulValue(snapshot)) {
        setError('invalid');
        setSaveState('unsynced');
        return false;
      }
      setSaveState('saved');
      return true;
    }
    const attempt = pendingAttemptRef.current ?? {
      expectedVersion: version,
      idempotencyKey: crypto.randomUUID(),
      patch: patch!,
      publicId: currentPublicId,
      snapshot,
    };
    pendingAttemptRef.current = attempt;
    setSaveState('saving');
    setError(null);
    const result = await saveWorkDraftAction({
      expectedVersion: attempt.expectedVersion,
      idempotencyKey: attempt.idempotencyKey,
      patch: attempt.patch,
      publicId: attempt.publicId,
    });
    if (result.outcome === 'saved') {
      pendingAttemptRef.current = null;
      lastSavedRef.current = attempt.snapshot;
      setVersion(result.version);
      setServerWork(result.work);
      setContributors(result.work.contributors);
      if (attempt.publicId === null) {
        setWorkPublicId(result.publicId);
        router.replace(`/works/${result.publicId}`, { scroll: false });
      }
      const isCurrent = valuesRef.current === attempt.snapshot;
      setSaveState(isCurrent ? 'saved' : 'unsynced');
      return isCurrent;
    }
    setError(result.error);
    setSaveState('unsynced');
    if (result.error === 'conflict') {
      conflictRef.current = true;
      return false;
    }
    if (result.error !== 'unavailable') {
      pendingAttemptRef.current = null;
    }
    return false;
  };

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (saveState !== 'saved') event.preventDefault();
    };
    const guardLinks = (event: MouseEvent) => {
      if (saveState === 'saved') return;
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (target !== null && !window.confirm(t('draftSave.leaveWarning'))) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', guardLinks, true);
    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('click', guardLinks, true);
    };
  }, [saveState, t]);

  const update = <K extends keyof DraftValues>(key: K, value: DraftValues[K]) => {
    submissionIdempotencyKeyRef.current = null;
    setError((current) => (current === 'conflict' ? current : null));
    setSaveState('unsynced');
    setValues((current) => ({ ...current, [key]: value }));
  };
  const applyMutationVersion = (nextVersion: number) => {
    submissionIdempotencyKeyRef.current = null;
    setVersion(nextVersion);
  };
  const effectiveWork =
    initialWork !== null && (serverWork === null || initialWork.version >= serverWork.version)
      ? initialWork
      : serverWork;
  const hasReadyPoster =
    effectiveWork?.media.some((item) => item.kind === 'poster' && item.status === 'ready') ?? false;
  const hasUnreadyMedia = effectiveWork?.media.some((item) => item.status !== 'ready') ?? false;
  const isStale =
    effectiveWork !== null &&
    effectiveWork.basePublishedRevisionId !== effectiveWork.publishedRevisionId;
  const incompleteSteps = useMemo(
    () =>
      findIncompleteSteps(
        values,
        hasReadyPoster,
        hasUnreadyMedia,
        effectiveWork?.submitterAttributionName ?? null,
      ),
    [effectiveWork?.submitterAttributionName, hasReadyPoster, hasUnreadyMedia, values],
  );
  const canSubmit =
    workPublicId !== null &&
    version !== null &&
    saveState === 'saved' &&
    !hasUnreadyMedia &&
    !isStale &&
    incompleteSteps.length === 0 &&
    !isSubmitting;

  const submit = () => {
    if (!canSubmit || workPublicId === null || version === null) return;
    startSubmission(async () => {
      const idempotencyKey = submissionIdempotencyKeyRef.current ?? crypto.randomUUID();
      submissionIdempotencyKeyRef.current = idempotencyKey;
      const result = await submitLatestWorkAction({
        draft: completeDraft(values),
        expectedBasePublishedRevisionId: effectiveWork?.basePublishedRevisionId ?? null,
        expectedDraftVersion: version,
        idempotencyKey,
        publicId: workPublicId,
        studyYear: Number(values.studyYear),
      });
      if ('error' in result) {
        if (result.error !== 'unavailable') submissionIdempotencyKeyRef.current = null;
        setError(
          result.error === 'conflict'
            ? 'conflict'
            : result.error === 'unavailable'
              ? 'unavailable'
              : 'invalid',
        );
        return;
      }
      submissionIdempotencyKeyRef.current = null;
      router.push(`/works/${workPublicId}`);
      router.refresh();
    });
  };

  const goNext = () => {
    if (isSaving) return;
    startSaving(async () => {
      if (await saveDraft()) {
        setStep((value) => Math.min(value + 1, STEP_COUNT - 1));
      }
    });
  };

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6">
      <ol aria-label={t('wizard.label')} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {Array.from({ length: STEP_COUNT }, (_, index) => (
          <li key={index}>
            <span
              aria-current={step === index ? 'step' : undefined}
              className={`flex min-h-11 w-full items-center justify-center rounded-control border px-3 text-center text-sm font-medium ${
                step === index
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground'
              }`}
            >
              {t(`wizard.step${index + 1}`)}
            </span>
          </li>
        ))}
      </ol>
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {t(`draftSave.${saveState}`)}
      </p>
      {error === null ? null : (
        <Alert variant="destructive">
          <AlertTitle>{t(`draftSave.errors.${error}.title`)}</AlertTitle>
          <AlertDescription>
            {t(`draftSave.errors.${error}.description`)}
            {error === 'conflict' ? (
              <Button
                className="mt-3"
                onClick={() => window.location.reload()}
                type="button"
                variant="outline"
              >
                {t('draftSave.loadLatest')}
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      )}
      <section className="grid gap-6 rounded-surface border border-border bg-card p-5 shadow-sm sm:p-8">
        <div className="grid gap-6">
          {step === 0 ? (
            <DetailsStep context={context} t={t} update={update} values={values} />
          ) : null}
          {step === 1 ? (
            <MediaStep
              onVersion={(next) => {
                applyMutationVersion(next);
                setSaveState('saved');
              }}
              publicId={workPublicId}
              t={t}
              version={version}
            />
          ) : null}
          {step === 2 ? (
            <AttributionStep
              attributionName={effectiveWork?.submitterAttributionName ?? null}
              contributors={contributors}
              onContributors={setContributors}
              onVersion={applyMutationVersion}
              publicId={workPublicId}
              studyYear={values.studyYear}
              t={t}
              updateStudyYear={(next) => update('studyYear', next)}
              version={version}
            />
          ) : null}
          {step === 3 ? <DiscoveryStep t={t} update={update} values={values} /> : null}
          {step === 4 ? (
            <ReviewStep
              attributionName={effectiveWork?.submitterAttributionName ?? null}
              canSubmit={canSubmit}
              contributors={contributors}
              incompleteSteps={incompleteSteps}
              media={effectiveWork?.media ?? []}
              onEdit={setStep}
              onSubmit={submit}
              t={t}
              values={values}
            />
          ) : null}
        </div>
        <div className="flex justify-between gap-3 border-t border-border pt-5">
          <Button
            disabled={step === 0}
            onClick={() => setStep((value) => value - 1)}
            type="button"
            variant="outline"
          >
            {t('wizard.previous')}
          </Button>
          {step === STEP_COUNT - 1 ? null : (
            <Button disabled={isSaving} onClick={goNext} type="button">
              {isSaving ? t('draftSave.saving') : t('wizard.next')}
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}

type Translation = ReturnType<typeof useTranslations<'Work'>>;
type Update = <K extends keyof DraftValues>(key: K, value: DraftValues[K]) => void;

function DetailsStep({
  context,
  t,
  update,
  values,
}: {
  context: WorkAuthoringContext;
  t: Translation;
  update: Update;
  values: DraftValues;
}) {
  return (
    <>
      <h2 className="text-2xl font-semibold">{t('wizard.step1')}</h2>
      <TextField
        label={t('title')}
        maxLength={150}
        onChange={(value) => update('title', value)}
        placeholder={t('placeholders.title')}
        required
        value={values.title}
      />
      <TextAreaField
        label={t('summary')}
        maxLength={300}
        onChange={(value) => update('summary', value)}
        placeholder={t('placeholders.summary')}
        rows={3}
        value={values.summary}
      />
      <TextAreaField
        label={t('description')}
        maxLength={10_000}
        onChange={(value) => update('description', value)}
        placeholder={t('placeholders.description')}
        rows={6}
        value={values.description}
      />
      <FieldSet className="border-t border-border pt-6">
        <FieldLegend>{t('sections.classification')}</FieldLegend>
        <FieldDescription>{t('sections.classificationHelp')}</FieldDescription>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="work-category">{t('category')}</FieldLabel>
            <select
              className="h-11 w-full rounded-control border bg-background px-3"
              id="work-category"
              onChange={(event) =>
                update('category', event.target.value as DraftValues['category'])
              }
              value={values.category}
            >
              <option value="">{t('select')}</option>
              <option value="course_work">{t('categories.course_work')}</option>
              <option value="competition_entry">{t('categories.competition_entry')}</option>
              <option value="academic_article">{t('categories.academic_article')}</option>
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="work-year">{t('academicYear')}</FieldLabel>
            <select
              className="h-11 w-full rounded-control border bg-background px-3"
              id="work-year"
              onChange={(event) =>
                update('academicPeriod', { ...values.academicPeriod, year: event.target.value })
              }
              value={values.academicPeriod.year}
            >
              <option value="">{t('select')}</option>
              {Array.from(
                { length: context.currentAcademicYear - ACADEMIC_YEAR_MINIMUM + 1 },
                (_, index) => context.currentAcademicYear - index,
              ).map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <FieldDescription>{t('academicYearHelp')}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="work-semester">{t('semester')}</FieldLabel>
            <select
              className="h-11 w-full rounded-control border bg-background px-3"
              id="work-semester"
              onChange={(event) =>
                update('academicPeriod', {
                  ...values.academicPeriod,
                  semester: event.target.value as DraftValues['academicPeriod']['semester'],
                })
              }
              value={values.academicPeriod.semester}
            >
              <option value="">{t('select')}</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="summer">{t('summer')}</option>
            </select>
          </Field>
        </div>
      </FieldSet>
    </>
  );
}

function MediaStep({
  onVersion,
  publicId,
  t,
  version,
}: {
  onVersion: (version: number) => void;
  publicId: string | null;
  t: Translation;
  version: number | null;
}) {
  if (publicId === null || version === null) return <p>{t('media.saveFirst')}</p>;
  return (
    <>
      <h2 className="text-2xl font-semibold">{t('wizard.step2')}</h2>
      <WorkMediaUpload
        expectedVersion={version}
        mediaKind="poster"
        onVersion={onVersion}
        publicId={publicId}
      />
      <WorkMediaUpload
        expectedVersion={version}
        mediaKind="gallery"
        onVersion={onVersion}
        publicId={publicId}
      />
    </>
  );
}

function AttributionStep({
  attributionName,
  contributors,
  onContributors,
  onVersion,
  publicId,
  studyYear,
  t,
  updateStudyYear,
  version,
}: {
  attributionName: string | null;
  contributors: WorkContributor[];
  onContributors: (items: WorkContributor[]) => void;
  onVersion: (version: number) => void;
  publicId: string | null;
  studyYear: DraftValues['studyYear'];
  t: Translation;
  updateStudyYear: (value: DraftValues['studyYear']) => void;
  version: number | null;
}) {
  return (
    <>
      <h2 className="text-2xl font-semibold">{t('wizard.step3')}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel>{t('attribution.submitter')}</FieldLabel>
          <Input readOnly value={attributionName ?? t('attribution.rosterNameUnavailable')} />
        </Field>
        <Field>
          <FieldLabel htmlFor="study-year">{t('attribution.studyYear')}</FieldLabel>
          <select
            className="h-11 w-full rounded-control border bg-background px-3"
            id="study-year"
            onChange={(event) => updateStudyYear(event.target.value as DraftValues['studyYear'])}
            value={studyYear}
          >
            <option value="">{t('select')}</option>
            {[1, 2, 3, 4].map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {publicId === null || version === null ? (
        <p>{t('attribution.saveFirst')}</p>
      ) : (
        <WorkContributorEditor
          contributors={contributors}
          onContributors={onContributors}
          onVersion={onVersion}
          publicId={publicId}
          version={version}
        />
      )}
    </>
  );
}

function DiscoveryStep({
  t,
  update,
  values,
}: {
  t: Translation;
  update: Update;
  values: DraftValues;
}) {
  return (
    <>
      <h2 className="text-2xl font-semibold">{t('wizard.step4')}</h2>
      <TextField
        label="GitHub"
        maxLength={2_048}
        onChange={(value) => update('githubUrl', value)}
        placeholder="https://github.com/..."
        value={values.githubUrl}
      />
      <FieldDescription>{t('discovery.githubHelp')}</FieldDescription>
      {values.links.map((link, index) => (
        <div className="grid gap-3 sm:grid-cols-2" key={index}>
          <TextField
            label={t('discovery.linkLabel')}
            maxLength={50}
            onChange={(label) =>
              update(
                'links',
                values.links.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, label } : item,
                ),
              )
            }
            placeholder={t('placeholders.linkLabel')}
            value={link.label}
          />
          <TextField
            label={t('discovery.linkUrl')}
            maxLength={2_048}
            onChange={(url) =>
              update(
                'links',
                values.links.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, url } : item,
                ),
              )
            }
            placeholder={t('placeholders.linkUrl')}
            value={link.url}
          />
        </div>
      ))}
      {values.links.length < 4 ? (
        <Button
          onClick={() => update('links', [...values.links, { label: '', url: '' }])}
          type="button"
          variant="outline"
        >
          {t('discovery.addLink')}
        </Button>
      ) : null}
      <WorkTagInput onChange={(value) => update('tags', value)} value={values.tags} />
      <TextAreaField
        label={t('videoLinks')}
        maxLength={6_200}
        onChange={(value) => update('videoLinks', value)}
        placeholder={t('placeholders.videoLink')}
        rows={4}
        value={values.videoLinks}
      />
    </>
  );
}

function ReviewStep({
  attributionName,
  canSubmit,
  contributors,
  incompleteSteps,
  media,
  onEdit,
  onSubmit,
  t,
  values,
}: {
  attributionName: string | null;
  canSubmit: boolean;
  contributors: WorkContributor[];
  incompleteSteps: number[];
  media: WorkDraft['media'];
  onEdit: (step: number) => void;
  onSubmit: () => void;
  t: Translation;
  values: DraftValues;
}) {
  const poster = media.find((item) => item.kind === 'poster');
  return (
    <>
      <h2 className="text-2xl font-semibold">{t('wizard.step5')}</h2>
      <dl className="grid gap-3">
        <div>
          <dt className="font-medium">{t('title')}</dt>
          <dd>{values.title || '—'}</dd>
        </div>
        <div>
          <dt className="font-medium">{t('summary')}</dt>
          <dd>{values.summary || '—'}</dd>
        </div>
        <div>
          <dt className="font-medium">{t('description')}</dt>
          <dd className="whitespace-pre-wrap">{values.description || '—'}</dd>
        </div>
        <div>
          <dt className="font-medium">{t('category')}</dt>
          <dd>{values.category === '' ? '—' : t(`categories.${values.category}`)}</dd>
        </div>
        <div>
          <dt className="font-medium">{t('academicYear')}</dt>
          <dd>{values.academicPeriod.year || '—'}</dd>
        </div>
        <div>
          <dt className="font-medium">{t('semester')}</dt>
          <dd>
            {values.academicPeriod.semester === 'summer'
              ? t('summer')
              : values.academicPeriod.semester || '—'}
          </dd>
        </div>
        <div>
          <dt className="font-medium">{t('review.poster')}</dt>
          <dd>{poster === undefined ? '—' : t(`review.mediaStatus.${poster.status}`)}</dd>
        </div>
        <div>
          <dt className="font-medium">{t('review.gallery')}</dt>
          <dd>
            {t('review.galleryCount', {
              count: media.filter((item) => item.kind === 'gallery').length,
            })}
          </dd>
        </div>
        <div>
          <dt className="font-medium">{t('attribution.submitter')}</dt>
          <dd>{attributionName ?? '—'}</dd>
        </div>
        <div>
          <dt className="font-medium">{t('attribution.studyYear')}</dt>
          <dd>{values.studyYear || '—'}</dd>
        </div>
        <div>
          <dt className="font-medium">{t('attribution.contributors')}</dt>
          <dd>
            {contributors
              .map((item) => `${item.attributionName} (${item.contributionRole})`)
              .join(', ') || '—'}
          </dd>
        </div>
        <div>
          <dt className="font-medium">{t('discovery.links')}</dt>
          <dd>
            {[values.githubUrl, ...values.links.map((item) => item.url)]
              .filter(Boolean)
              .join(', ') || '—'}
          </dd>
        </div>
        <div>
          <dt className="font-medium">{t('tags')}</dt>
          <dd>{values.tags.map((tag) => `#${tag}`).join(' · ') || '—'}</dd>
        </div>
        <div>
          <dt className="font-medium">{t('videoLinks')}</dt>
          <dd className="whitespace-pre-wrap">{values.videoLinks || '—'}</dd>
        </div>
      </dl>
      {incompleteSteps.length === 0 ? null : (
        <Alert variant="destructive">
          <AlertTitle>{t('review.incomplete')}</AlertTitle>
          <AlertDescription>
            <ul>
              {incompleteSteps.map((item) => (
                <li key={item}>
                  <button className="underline" onClick={() => onEdit(item)} type="button">
                    {t('review.editStep', { step: item + 1 })}
                  </button>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      <Button disabled={!canSubmit} onClick={onSubmit} type="button">
        {t('review.submit')}
      </Button>
    </>
  );
}

function TextField({
  label,
  maxLength,
  onChange,
  placeholder,
  required = false,
  value,
}: {
  label: string;
  maxLength: number;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  value: string;
}) {
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        value={value}
      />
    </Field>
  );
}
function TextAreaField({
  label,
  maxLength,
  onChange,
  placeholder,
  rows,
  value,
}: {
  label: string;
  maxLength: number;
  onChange: (value: string) => void;
  placeholder?: string;
  rows: number;
  value: string;
}) {
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea
        className="field-sizing-fixed resize-y"
        id={id}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        value={value}
      />
    </Field>
  );
}

function emptyValues(): DraftValues {
  return {
    academicPeriod: { semester: '', year: '' },
    category: '',
    description: '',
    githubUrl: '',
    links: [],
    studyYear: '',
    summary: '',
    tags: [],
    title: '',
    videoLinks: '',
  };
}
function valuesFromWork(work: WorkDraft | null): DraftValues {
  const draft = work?.draft;
  const github = draft?.links.find((link) => link.label === 'GitHub');
  return {
    academicPeriod: {
      semester: draft?.academicPeriod.semester ?? '',
      year: draft?.academicPeriod.year?.toString() ?? '',
    },
    category: draft?.category ?? '',
    description: draft?.description ?? '',
    githubUrl: github?.url ?? '',
    links: draft?.links.filter((link) => link.label !== 'GitHub') ?? [],
    studyYear:
      (draft?.submitterStudyYear?.toString() as DraftValues['studyYear'] | undefined) ?? '',
    summary: draft?.summary ?? '',
    tags: draft?.tags.map((tag) => tag.displayLabel) ?? [],
    title: draft?.title ?? '',
    videoLinks: draft?.videoLinks.map((link) => link.url).join('\n') ?? '',
  };
}
function normalized(values: DraftValues): NormalizedValues {
  const links = [
    ...(values.githubUrl.trim() === '' ? [] : [{ label: 'GitHub', url: values.githubUrl.trim() }]),
    ...values.links
      .filter((link) => link.label.trim() !== '' || link.url.trim() !== '')
      .map((link) => ({ label: link.label.trim(), url: link.url.trim() })),
  ];
  return {
    academicPeriod: {
      semester: values.academicPeriod.semester || null,
      year: values.academicPeriod.year === '' ? null : Number(values.academicPeriod.year),
    },
    category: values.category || null,
    description: values.description.trim() || null,
    links,
    submitterStudyYear: values.studyYear === '' ? null : Number(values.studyYear),
    summary: values.summary.trim() || null,
    tags: values.tags,
    title: values.title.trim() || null,
    videoLinks: values.videoLinks
      .split(/\r?\n/u)
      .map((link) => link.trim())
      .filter(Boolean),
  };
}
function createPatch(
  previous: DraftValues,
  current: DraftValues,
  isPersisted: boolean,
): WorkDraftPatch | null {
  const before = normalized(previous);
  const after = normalized(current);
  const empty = normalized(emptyValues());
  const patch: WorkDraftPatch = {};
  for (const key of Object.keys(after) as Array<keyof WorkDraftPatch>) {
    if (!isPersisted && JSON.stringify(after[key]) === JSON.stringify(empty[key])) continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      Object.assign(patch, { [key]: after[key] });
  }
  return Object.keys(patch).length === 0 ? null : patch;
}
function hasMeaningfulValue(values: DraftValues) {
  const value = normalized(values);
  return Object.values(value).some(
    (item) =>
      item !== null &&
      (Array.isArray(item)
        ? item.length > 0
        : typeof item === 'object'
          ? Object.values(item).some((part) => part !== null)
          : true),
  );
}
function completeDraft(values: DraftValues) {
  const value = normalized(values);
  return {
    academicPeriod: { semester: value.academicPeriod.semester!, year: value.academicPeriod.year! },
    category: value.category!,
    description: value.description!,
    links: value.links,
    summary: value.summary!,
    tags: value.tags,
    title: value.title!,
    videoLinks: value.videoLinks,
  };
}
function findIncompleteSteps(
  values: DraftValues,
  hasReadyPoster: boolean,
  hasUnreadyMedia: boolean,
  attributionName: string | null,
) {
  const steps = new Set<number>();
  const value = normalized(values);
  if (
    value.title === null ||
    value.summary === null ||
    value.description === null ||
    value.category === null ||
    value.academicPeriod.semester === null ||
    value.academicPeriod.year === null
  )
    steps.add(0);
  if (!hasReadyPoster || hasUnreadyMedia) steps.add(1);
  if (attributionName === null || value.submitterStudyYear === null) steps.add(2);
  if (!isDiscoveryValid(values)) steps.add(3);
  return [...steps];
}

function isDiscoveryValid(values: DraftValues): boolean {
  const links = normalized(values).links;
  if (links.length > 5) return false;
  const normalizedUrls = new Set<string>();
  for (const link of links) {
    if (link.label.trim() === '') return false;
    const url = safeUrl(link.url);
    if (url === null || url.protocol !== 'https:') return false;
    if (
      link.label === 'GitHub' &&
      url.hostname !== 'github.com' &&
      !url.hostname.endsWith('.github.com')
    )
      return false;
    if (normalizedUrls.has(url.toString())) return false;
    normalizedUrls.add(url.toString());
  }
  const tags = normalized(values).tags;
  if (tags.length > 5) return false;
  const videos = normalized(values).videoLinks;
  if (videos.length > 3) return false;
  return videos.every((value) => {
    const url = safeUrl(value);
    if (url === null || url.protocol !== 'https:') return false;
    return ['youtube.com', 'youtu.be', 'tiktok.com'].some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
    );
  });
}

function safeUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
