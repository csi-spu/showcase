'use client';

import { Button } from '@showcase/ui/button';
import { toast } from '@showcase/ui/toast';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useId, useMemo, useRef, useState, useTransition } from 'react';
import Image from 'next/image';
import {
  ExternalLinkIcon,
  FileTextIcon,
  ImagesIcon,
  SendIcon,
  TagsIcon,
  type LucideIcon,
  UserRoundIcon,
  UsersIcon,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type {
  WorkAuthoringContext,
  WorkContributor,
  WorkDraft,
  WorkDraftPatch,
} from '@/lib/student-works-core';
import {
  getWorkMediaStatusAction,
  saveWorkDraftAction,
  submitLatestWorkAction,
} from './work.actions';
import { WorkContributorEditor } from './work-contributor-editor';
import { WorkMediaUpload } from './work-media-upload';
import { WorkTagInput } from './work-tag-input';

const STEP_COUNT = 5;
const STEP_ICONS = [FileTextIcon, ImagesIcon, UsersIcon, TagsIcon, SendIcon] as const;
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
  initialStep = 0,
  initialWork,
}: {
  context: WorkAuthoringContext;
  initialStep?: number;
  initialWork: WorkDraft | null;
}) {
  const t = useTranslations('Work');
  const router = useRouter();
  const [step, setStep] = useState(initialStep);
  const [isPosterUploading, setIsPosterUploading] = useState(false);
  const [isGalleryUploading, setIsGalleryUploading] = useState(false);
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
  const [isOpeningSavedWork, setIsOpeningSavedWork] = useState(false);
  const [isSubmitting, startSubmission] = useTransition();
  const valuesRef = useRef(values);
  const lastSavedRef = useRef(values);
  const hasCanonicalWorkRouteRef = useRef(initialWork !== null);
  const conflictRef = useRef(false);
  const pendingAttemptRef = useRef<SaveAttempt | null>(null);
  const submissionIdempotencyKeyRef = useRef<string | null>(null);

  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  const saveDraft = async (targetStep: number): Promise<boolean> => {
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
      }
      const isCurrent = valuesRef.current === attempt.snapshot;
      setSaveState(isCurrent ? 'saved' : 'unsynced');
      if (isCurrent && !hasCanonicalWorkRouteRef.current) {
        hasCanonicalWorkRouteRef.current = true;
        // The saved Work's route remounts this form on the target step. Advancing
        // here would let the Student start an upload that the remount then drops.
        setIsOpeningSavedWork(true);
        router.replace(`/works/${result.publicId}?step=${targetStep + 1}`, { scroll: false });
        return false;
      }
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
  const hasUnreadyMedia =
    (effectiveWork?.media.some((item) => item.status !== 'ready') ?? false) ||
    isPosterUploading ||
    isGalleryUploading;
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
        const mappedError =
          result.error === 'conflict'
            ? 'conflict'
            : result.error === 'unavailable'
              ? 'unavailable'
              : 'invalid';
        setError(mappedError);
        toast.error(t(`draftSave.errors.${mappedError}.title`));
        return;
      }
      submissionIdempotencyKeyRef.current = null;
      router.push(`/works/${workPublicId}`);
      router.refresh();
      toast.success(t('review.submitted'));
    });
  };

  // UI-level guard only: Core still validates every draft save and the final
  // submission. This just stops a Student from walking past a step that cannot
  // pass Review yet — including a Poster whose upload has not produced a
  // preview, which leaves the Work without a usable Poster.
  const isStepComplete = !incompleteSteps.includes(step);
  const canGoNext = !isSaving && !isOpeningSavedWork && isStepComplete;

  const goNext = () => {
    if (!canGoNext) return;
    startSaving(async () => {
      const targetStep = Math.min(step + 1, STEP_COUNT - 1);
      if (await saveDraft(targetStep)) {
        setStep(targetStep);
      }
    });
  };

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6">
      <ol aria-label={t('wizard.label')} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {Array.from({ length: STEP_COUNT }, (_, index) => {
          const StepIcon = STEP_ICONS[index]!;
          return (
            <li className="h-full" key={index}>
              <span
                aria-current={step === index ? 'step' : undefined}
                className={`grid min-h-20 w-full content-center justify-items-center gap-2 rounded-control border px-3 py-3 text-center text-sm font-medium ${
                  step === index
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-muted-foreground'
                }`}
              >
                <StepIcon aria-hidden="true" className="size-5" />
                <span className="leading-tight">{t(`wizard.step${index + 1}`)}</span>
              </span>
            </li>
          );
        })}
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
      <section
        className="grid gap-6 rounded-surface border border-border bg-card p-5 shadow-sm sm:p-8"
        inert={isOpeningSavedWork}
      >
        <div className="grid gap-6">
          {step === 0 ? (
            <DetailsStep context={context} t={t} update={update} values={values} />
          ) : null}
          <div hidden={step !== 1}>
            <MediaStep
              media={effectiveWork?.media ?? []}
              onGalleryBusyChange={setIsGalleryUploading}
              onPosterBusyChange={setIsPosterUploading}
              onVersion={(next) => {
                applyMutationVersion(next);
                setSaveState('saved');
              }}
              publicId={workPublicId}
              t={t}
              version={version}
            />
          </div>
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
              publicId={workPublicId}
              t={t}
              values={values}
            />
          ) : null}
        </div>
        <div className="grid gap-3 border-t border-border pt-5">
          {step === STEP_COUNT - 1 || isStepComplete ? null : (
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {step === 1 && (isPosterUploading || isGalleryUploading)
                ? t('wizard.mediaBusyHint')
                : t('wizard.incompleteHint')}
            </p>
          )}
          <div className="flex justify-between gap-3">
            <Button
              disabled={step === 0}
              onClick={() => setStep((value) => value - 1)}
              type="button"
              variant="outline"
            >
              {t('wizard.previous')}
            </Button>
            {step === STEP_COUNT - 1 ? null : (
              <Button disabled={!canGoNext} onClick={goNext} type="button">
                {isSaving || isOpeningSavedWork ? t('draftSave.saving') : t('wizard.next')}
              </Button>
            )}
          </div>
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
      <StepHeading icon={FileTextIcon}>{t('wizard.step1')}</StepHeading>
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
  media,
  onPosterBusyChange,
  onGalleryBusyChange,
  onVersion,
  publicId,
  t,
  version,
}: {
  media: WorkDraft['media'];
  onGalleryBusyChange: (isBusy: boolean) => void;
  onPosterBusyChange: (isBusy: boolean) => void;
  onVersion: (version: number) => void;
  publicId: string | null;
  t: Translation;
  version: number | null;
}) {
  if (publicId === null || version === null) return <p>{t('media.saveFirst')}</p>;
  return (
    <>
      <StepHeading icon={ImagesIcon}>{t('wizard.step2')}</StepHeading>
      <div className="grid items-stretch gap-5 lg:grid-cols-2" data-slot="work-media-layout">
        <WorkMediaUpload
          expectedVersion={version}
          media={media.filter((item) => item.kind === 'poster')}
          mediaKind="poster"
          onBusyChange={onPosterBusyChange}
          onVersion={onVersion}
          publicId={publicId}
        />
        <WorkMediaUpload
          expectedVersion={version}
          media={media.filter((item) => item.kind === 'gallery')}
          mediaKind="gallery"
          onBusyChange={onGalleryBusyChange}
          onVersion={onVersion}
          publicId={publicId}
        />
      </div>
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
      <StepHeading icon={UsersIcon}>{t('wizard.step3')}</StepHeading>
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
      <StepHeading icon={TagsIcon}>{t('wizard.step4')}</StepHeading>
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
  publicId,
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
  publicId: string | null;
  t: Translation;
  values: DraftValues;
}) {
  const poster = media.find((item) => item.kind === 'poster');
  const gallery = media.filter((item) => item.kind === 'gallery');
  const links = [values.githubUrl, ...values.links.map((item) => item.url)].filter(Boolean);
  return (
    <>
      <StepHeading icon={SendIcon}>{t('wizard.step5')}</StepHeading>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(16rem,0.72fr)_minmax(0,1.28fr)]">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>
              <h3 className="flex items-center gap-2 text-lg">
                <ImagesIcon aria-hidden="true" className="size-5 text-primary" />
                {t('review.previewTitle')}
              </h3>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-2">
              <p className="font-medium">{t('review.poster')}</p>
              <div className="relative mx-auto aspect-[3/4] w-full max-w-64 overflow-hidden rounded-media border bg-muted">
                {poster?.status === 'ready' && publicId !== null ? (
                  <ReviewMediaImage
                    alt={t('media.posterPreview')}
                    item={poster}
                    publicId={publicId}
                    sizes="256px"
                  />
                ) : (
                  <div className="grid h-full place-items-center p-4 text-center text-sm text-muted-foreground">
                    {poster === undefined ? '—' : t(`review.mediaStatus.${poster.status}`)}
                  </div>
                )}
              </div>
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{t('review.gallery')}</p>
                <Badge variant="outline">
                  {t('review.galleryCount', { count: gallery.length })}
                </Badge>
              </div>
              {gallery.length === 0 || publicId === null ? (
                <div className="grid min-h-24 place-items-center rounded-media border border-dashed text-muted-foreground">
                  —
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {gallery.map((item) => (
                    <div
                      className="relative aspect-square overflow-hidden rounded-media border bg-muted"
                      key={item.assetId}
                    >
                      {item.status === 'ready' ? (
                        <ReviewMediaImage
                          alt={t('media.galleryPreview')}
                          item={item}
                          publicId={publicId}
                          sizes="96px"
                        />
                      ) : (
                        <span className="grid h-full place-items-center p-1 text-center text-xs text-muted-foreground">
                          {t(`review.mediaStatus.${item.status}`)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-5">
          <Card>
            <CardHeader className="gap-3">
              <div className="flex flex-wrap gap-2">
                <Badge>{values.category === '' ? '—' : t(`categories.${values.category}`)}</Badge>
                <Badge variant="outline">
                  {values.academicPeriod.year || '—'} ·{' '}
                  {values.academicPeriod.semester === 'summer'
                    ? t('summer')
                    : values.academicPeriod.semester || '—'}
                </Badge>
              </div>
              <CardTitle>
                <h3 className="text-2xl">{values.title || '—'}</h3>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5">
              <ReviewRow label={t('summary')} value={values.summary} />
              <ReviewRow label={t('description')} value={values.description} multiline />
              <dl className="grid gap-3 rounded-control bg-muted p-4 sm:grid-cols-3">
                <ReviewRow
                  label={t('category')}
                  value={values.category === '' ? '' : t(`categories.${values.category}`)}
                />
                <ReviewRow label={t('academicYear')} value={values.academicPeriod.year} />
                <ReviewRow
                  label={t('semester')}
                  value={
                    values.academicPeriod.semester === 'summer'
                      ? t('summer')
                      : values.academicPeriod.semester
                  }
                />
              </dl>
            </CardContent>
          </Card>

          <div className="grid items-stretch gap-5 md:grid-cols-2">
            <ReviewSection icon={UserRoundIcon} title={t('review.attributionTitle')}>
              <dl className="grid gap-4">
                <ReviewRow label={t('attribution.submitter')} value={attributionName} />
                <ReviewRow label={t('attribution.studyYear')} value={values.studyYear} />
                <ReviewRow
                  label={t('attribution.contributors')}
                  value={contributors
                    .map((item) => `${item.attributionName} (${item.contributionRole})`)
                    .join(', ')}
                />
              </dl>
            </ReviewSection>
            <ReviewSection icon={ExternalLinkIcon} title={t('review.discoveryTitle')}>
              <dl className="grid gap-4">
                <ReviewRow label={t('discovery.links')} value={links.join(', ')} />
                <ReviewRow
                  label={t('tags')}
                  value={values.tags.map((tag) => `#${tag}`).join(' · ')}
                />
                <ReviewRow label={t('videoLinks')} value={values.videoLinks} multiline />
              </dl>
            </ReviewSection>
          </div>
        </div>
      </div>
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
        <SendIcon aria-hidden="true" />
        {t('review.submit')}
      </Button>
    </>
  );
}

function StepHeading({ children, icon: Icon }: { children: string; icon: LucideIcon }) {
  return (
    <h2 className="flex items-center gap-3 text-2xl font-semibold">
      <span className="grid size-10 shrink-0 place-items-center rounded-control bg-primary-soft text-primary">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      {children}
    </h2>
  );
}

function ReviewMediaImage({
  alt,
  item,
  publicId,
  sizes,
}: {
  alt: string;
  item: WorkDraft['media'][number];
  publicId: string;
  sizes: string;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    let isCancelled = false;
    void getWorkMediaStatusAction({ assetId: item.assetId, publicId }).then((result) => {
      if (!isCancelled && !('error' in result) && result.preview !== null) {
        setPreviewUrl(result.preview.url);
      }
    });
    return () => {
      isCancelled = true;
    };
  }, [item.assetId, publicId]);

  return previewUrl === null ? (
    <span className="grid h-full place-items-center text-sm text-muted-foreground">…</span>
  ) : (
    <Image
      alt={alt}
      className="object-cover"
      fill
      loader={({ src }) => src}
      sizes={sizes}
      src={previewUrl}
      unoptimized
    />
  );
}

function ReviewSection({
  children,
  icon: Icon,
  title,
}: {
  children: ReactNode;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>
          <h3 className="flex items-center gap-2 text-lg">
            <Icon aria-hidden="true" className="size-5 text-primary" />
            {title}
          </h3>
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ReviewRow({
  label,
  multiline = false,
  value,
}: {
  label: string;
  multiline?: boolean;
  value: number | string | null;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className={multiline ? 'mt-1 whitespace-pre-wrap' : 'mt-1 break-words'}>
        {value || '—'}
      </dd>
    </div>
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
