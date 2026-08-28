'use client';

import { Button } from '@showcase/ui/button';
import { CircleAlertIcon, LightbulbIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
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
  const [currentStep, setCurrentStep] = useState(0);
  const [state, formAction] = useActionState(
    async (previousState: WorkActionState, formData: FormData) => {
      const nextState = await action(previousState, formData);
      if (nextState.fieldErrors.length > 0) {
        const errorStep = firstErrorStep(nextState.fieldErrors);
        setCurrentStep(errorStep);
      }
      return nextState;
    },
    initialWorkActionState(idempotencyKey, work?.version ?? null),
  );
  const [draft, setDraft] = useState(() => createFormDraft(work, context));
  const [visibleLinkCount, setVisibleLinkCount] = useState(() =>
    initialCollectionFieldCount(work?.draft.links.length ?? 0, 5),
  );
  const [visibleTagCount, setVisibleTagCount] = useState(() =>
    initialCollectionFieldCount(work?.draft.tags.length ?? 0, 5),
  );
  const [visibleVideoCount, setVisibleVideoCount] = useState(() =>
    initialCollectionFieldCount(work?.draft.videoLinks.length ?? 0, 3),
  );
  const [clientFieldErrors, setClientFieldErrors] = useState<WorkField[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const currentWorkVersion =
    work === null ? null : Math.max(work.version, state.version ?? work.version);
  const isInvalid = (field: WorkField) =>
    clientFieldErrors.includes(field) || state.fieldErrors.includes(field);

  const showNextStep = () => {
    const requiredFieldErrors = findRequiredFieldErrors(draft).filter(
      (field) => firstErrorStep([field]) === currentStep,
    );
    if (requiredFieldErrors.length > 0) {
      showClientErrors(requiredFieldErrors);
      return;
    }
    const form = formRef.current;
    const panel = form?.querySelector<HTMLElement>(`[data-step-panel="${currentStep}"]`);
    const invalidControl = panel
      ? Array.from(
          panel.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
            'input, textarea, select',
          ),
        ).find((control) => !control.checkValidity())
      : undefined;
    if (invalidControl) {
      invalidControl.reportValidity();
      invalidControl.focus();
      return;
    }
    setClientFieldErrors([]);
    const nextStep = Math.min(currentStep + 1, 2);
    setCurrentStep(nextStep);
  };

  const showClientErrors = (fieldErrors: WorkField[]) => {
    setClientFieldErrors(fieldErrors);
    const errorStep = firstErrorStep(fieldErrors);
    setCurrentStep(errorStep);
    focusFirstError(formRef.current, fieldErrors[0]);
    requestAnimationFrame(() => focusFirstError(formRef.current, fieldErrors[0]));
  };

  const clearClientFieldError = (field: WorkField) => {
    setClientFieldErrors((current) => current.filter((candidate) => candidate !== field));
  };

  return (
    <>
      <form
        action={formAction}
        className="grid w-full gap-6"
        onSubmit={(event) => {
          const requiredFieldErrors = findRequiredFieldErrors(draft);
          if (requiredFieldErrors.length > 0) {
            event.preventDefault();
            showClientErrors(requiredFieldErrors);
          } else {
            setClientFieldErrors([]);
          }
        }}
        ref={formRef}
      >
        <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
        {state.version === null ? null : (
          <input name="expectedVersion" type="hidden" value={state.version} />
        )}

        <WorkWizardSteps currentStep={currentStep} onSelect={setCurrentStep} />

        <div className="min-w-0 rounded-surface border border-border bg-card p-5 sm:p-8 lg:p-10">
          {clientFieldErrors.length > 0 ? (
            <Alert className="mb-6" variant="destructive">
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>{t('errors.requiredHeading')}</AlertTitle>
              <AlertDescription>{t('errors.requiredDescription')}</AlertDescription>
            </Alert>
          ) : null}
          <FieldSet
            className="border-0 bg-transparent p-0"
            data-step-panel="0"
            hidden={currentStep !== 0}
          >
            <FieldLegend className="text-2xl tracking-tight">
              {t('wizard.steps.details.title')}
            </FieldLegend>
            <FieldDescription>{t('wizard.steps.details.help')}</FieldDescription>
            <Alert className="mx-auto w-full max-w-4xl">
              <LightbulbIcon aria-hidden="true" />
              <AlertTitle>{t('example.heading')}</AlertTitle>
              <AlertDescription>{t('example.description')}</AlertDescription>
            </Alert>
            <FieldGroup className="mx-auto max-w-4xl">
              <Field data-invalid={isInvalid('title') || undefined}>
                <FieldLabel htmlFor="work-title">
                  {t('title')} <RequirementLabel isRequired />
                </FieldLabel>
                <Input
                  aria-label={t('title')}
                  aria-invalid={isInvalid('title') || undefined}
                  id="work-title"
                  maxLength={150}
                  name="title"
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, title: event.target.value }));
                    clearClientFieldError('title');
                  }}
                  placeholder={t('placeholders.title')}
                  required
                  value={draft.title}
                />
                {isInvalid('title') ? <FieldError>{t('fieldErrors.title')}</FieldError> : null}
              </Field>
              <Field data-invalid={isInvalid('summary') || undefined}>
                <FieldLabel htmlFor="work-summary">
                  {t('summary')} <RequirementLabel isRequired />
                </FieldLabel>
                <Textarea
                  aria-label={t('summary')}
                  aria-invalid={isInvalid('summary') || undefined}
                  id="work-summary"
                  maxLength={300}
                  name="summary"
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, summary: event.target.value }));
                    clearClientFieldError('summary');
                  }}
                  placeholder={t('placeholders.summary')}
                  required
                  rows={4}
                  value={draft.summary}
                />
                <FieldDescription className="flex flex-wrap items-center justify-between gap-2">
                  <span>{t('summaryHelp')}</span>
                  <CharacterCount current={draft.summary.length} maximum={300} />
                </FieldDescription>
                {isInvalid('summary') ? <FieldError>{t('fieldErrors.summary')}</FieldError> : null}
              </Field>
              <Field data-invalid={isInvalid('description') || undefined}>
                <FieldLabel htmlFor="work-description">
                  {t('description')} <RequirementLabel isRequired />
                </FieldLabel>
                <Textarea
                  aria-label={t('description')}
                  aria-invalid={isInvalid('description') || undefined}
                  className="min-h-72 resize-y"
                  id="work-description"
                  maxLength={10_000}
                  name="description"
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, description: event.target.value }));
                    clearClientFieldError('description');
                  }}
                  placeholder={t('placeholders.description')}
                  required
                  rows={10}
                  value={draft.description}
                />
                <FieldDescription className="flex flex-wrap items-center justify-between gap-2">
                  <span>{t('descriptionHelp')}</span>
                  <CharacterCount current={draft.description.length} maximum={10_000} />
                </FieldDescription>
                {isInvalid('description') ? (
                  <FieldError>{t('fieldErrors.description')}</FieldError>
                ) : null}
              </Field>
            </FieldGroup>
          </FieldSet>

          <FieldSet
            className="border-0 bg-transparent p-0"
            data-step-panel="1"
            hidden={currentStep !== 1}
          >
            <FieldLegend className="text-2xl tracking-tight">
              {t('wizard.steps.classification.title')}
            </FieldLegend>
            <FieldDescription>{t('wizard.steps.classification.help')}</FieldDescription>
            <FieldGroup className="mx-auto max-w-5xl lg:grid lg:grid-cols-3 lg:gap-x-6">
              <Field data-invalid={isInvalid('category') || undefined}>
                <FieldLabel htmlFor="work-category">
                  {t('category')} <RequirementLabel isRequired />
                </FieldLabel>
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
                    aria-label={t('category')}
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
                {isInvalid('category') ? (
                  <FieldError>{t('fieldErrors.category')}</FieldError>
                ) : null}
              </Field>
              <Field data-invalid={isInvalid('academicPeriod') || undefined}>
                <FieldLabel htmlFor="academic-year">
                  {t('academicYear')} <RequirementLabel isRequired />
                </FieldLabel>
                <Input
                  aria-label={t('academicYear')}
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
                <FieldLabel htmlFor="semester">
                  {t('semester')} <RequirementLabel isRequired />
                </FieldLabel>
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
                    aria-label={t('semester')}
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
              {isInvalid('academicPeriod') ? (
                <FieldError className="lg:col-span-3">{t('fieldErrors.academicPeriod')}</FieldError>
              ) : null}
            </FieldGroup>
          </FieldSet>

          <section
            aria-labelledby="work-extras-heading"
            data-step-panel="2"
            hidden={currentStep !== 2}
          >
            <header className="mb-7 grid gap-2">
              <h2 className="text-2xl font-medium tracking-tight" id="work-extras-heading">
                {t('wizard.steps.extras.title')}
              </h2>
              <p className="max-w-[62ch] text-sm leading-relaxed text-muted-foreground">
                {t('wizard.steps.extras.help')}
              </p>
            </header>
            <FieldGroup className="mx-auto max-w-5xl gap-10">
              <FieldSet className="border-0 bg-transparent p-0">
                <FieldLegend className="flex items-center gap-2">
                  {t('sections.links')} <RequirementLabel />
                </FieldLegend>
                <FieldDescription>{t('sections.linksHelp')}</FieldDescription>
                <FieldGroup>
                  {Array.from({ length: visibleLinkCount }, (_, index) => (
                    <FieldGroup className="grid gap-3 sm:grid-cols-2" key={index}>
                      <Field data-invalid={isInvalid('links') || undefined}>
                        <FieldLabel htmlFor={`work-link-label-${index}`}>
                          {t('linkLabel', { number: index + 1 })}
                        </FieldLabel>
                        <Input
                          aria-label={t('linkLabel', { number: index + 1 })}
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
                          placeholder={t('placeholders.linkLabel')}
                          value={draft.links[index]?.label ?? ''}
                        />
                      </Field>
                      <Field data-invalid={isInvalid('links') || undefined}>
                        <FieldLabel htmlFor={`work-link-url-${index}`}>
                          {t('linkUrl', { number: index + 1 })}
                        </FieldLabel>
                        <Input
                          aria-label={t('linkUrl', { number: index + 1 })}
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
                          placeholder={t('placeholders.linkUrl')}
                          type="url"
                          value={draft.links[index]?.url ?? ''}
                        />
                      </Field>
                    </FieldGroup>
                  ))}
                  {visibleLinkCount < 5 ? (
                    <Button
                      className="w-fit"
                      onClick={() => setVisibleLinkCount((count) => Math.min(count + 1, 5))}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {t('wizard.addLink')}
                    </Button>
                  ) : null}
                  {isInvalid('links') ? <FieldError>{t('fieldErrors.links')}</FieldError> : null}
                </FieldGroup>
              </FieldSet>

              <FieldSeparator />
              <FieldGroup className="gap-10">
                <FieldSet className="border-0 bg-transparent p-0">
                  <FieldLegend className="flex items-center gap-2">
                    {t('sections.tags')} <RequirementLabel />
                  </FieldLegend>
                  <FieldDescription>{t('sections.tagsHelp')}</FieldDescription>
                  <FieldGroup>
                    <div className="grid gap-5 sm:grid-cols-2">
                      {Array.from({ length: visibleTagCount }, (_, index) => (
                        <Field data-invalid={isInvalid('tags') || undefined} key={index}>
                          <FieldLabel htmlFor={`work-tag-${index}`}>
                            {t('tag', { number: index + 1 })}
                          </FieldLabel>
                          <Input
                            aria-label={t('tag', { number: index + 1 })}
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
                            placeholder={t('placeholders.tag')}
                            value={draft.tags[index] ?? ''}
                          />
                        </Field>
                      ))}
                    </div>
                    {visibleTagCount < 5 ? (
                      <Button
                        className="w-fit"
                        onClick={() => setVisibleTagCount((count) => Math.min(count + 1, 5))}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        {t('wizard.addTag')}
                      </Button>
                    ) : null}
                    {isInvalid('tags') ? <FieldError>{t('fieldErrors.tags')}</FieldError> : null}
                  </FieldGroup>
                </FieldSet>

                <FieldSeparator />
                <FieldSet className="border-0 bg-transparent p-0">
                  <FieldLegend className="flex items-center gap-2">
                    {t('sections.videos')} <RequirementLabel />
                  </FieldLegend>
                  <FieldDescription>{t('sections.videosHelp')}</FieldDescription>
                  <FieldGroup>
                    {Array.from({ length: visibleVideoCount }, (_, index) => (
                      <Field data-invalid={isInvalid('videoLinks') || undefined} key={index}>
                        <FieldLabel htmlFor={`work-video-link-${index}`}>
                          {t('videoLink', { number: index + 1 })}
                        </FieldLabel>
                        <Input
                          aria-label={t('videoLink', { number: index + 1 })}
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
                          placeholder={t('placeholders.videoLink')}
                          type="url"
                          value={draft.videoLinks[index] ?? ''}
                        />
                      </Field>
                    ))}
                    {visibleVideoCount < 3 ? (
                      <Button
                        className="w-fit"
                        onClick={() => setVisibleVideoCount((count) => Math.min(count + 1, 3))}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        {t('wizard.addVideo')}
                      </Button>
                    ) : null}
                    {isInvalid('videoLinks') ? (
                      <FieldError>{t('fieldErrors.videoLinks')}</FieldError>
                    ) : null}
                  </FieldGroup>
                </FieldSet>
              </FieldGroup>
            </FieldGroup>
          </section>

          <ActionFeedback state={state} />
          <div className="mt-8 flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
            {currentStep > 0 ? (
              <Button
                onClick={() => setCurrentStep((step) => Math.max(step - 1, 0))}
                type="button"
                variant="outline"
              >
                {t('wizard.back')}
              </Button>
            ) : (
              <span aria-hidden="true" />
            )}
            {currentStep < 2 ? (
              <Button onClick={showNextStep} type="button">
                {t('wizard.next')}
              </Button>
            ) : (
              <SubmitButton
                label={t(mode === 'create' ? 'wizard.createAndAddMedia' : 'save')}
                pendingLabel={t('saving')}
              />
            )}
          </div>
        </div>
      </form>
      {publicId === undefined || work === null ? null : (
        <div className="grid gap-6 lg:grid-cols-2">
          <WorkMediaUpload
            expectedVersion={currentWorkVersion ?? work.version}
            mediaKind="poster"
            publicId={publicId}
          />
          <WorkMediaUpload
            expectedVersion={currentWorkVersion ?? work.version}
            mediaKind="gallery"
            publicId={publicId}
          />
        </div>
      )}
    </>
  );
}

const WORK_WIZARD_STEPS = ['details', 'classification', 'extras'] as const;
const STEP_PROGRESS_CLASSES = ['w-1/3', 'w-2/3', 'w-full'] as const;

function WorkWizardSteps({
  currentStep,
  onSelect,
}: {
  currentStep: number;
  onSelect: (step: number) => void;
}) {
  const t = useTranslations('Work.wizard');

  return (
    <nav aria-label={t('label')} className="border-b border-border/80 pb-5">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-semibold text-primary tabular-nums">
          {t('progress', { current: currentStep + 1, total: WORK_WIZARD_STEPS.length })}
        </p>
        <div className="h-1 w-24 overflow-hidden rounded-full bg-muted sm:w-40">
          <span
            aria-hidden="true"
            className={`block h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none ${STEP_PROGRESS_CLASSES[currentStep]}`}
          />
        </div>
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-3">
        {WORK_WIZARD_STEPS.map((step, index) => {
          const isCurrent = index === currentStep;
          return (
            <li key={step}>
              <button
                aria-label={`${index + 1}. ${t(`steps.${step}.title`)}`}
                aria-current={isCurrent ? 'step' : undefined}
                className="group flex w-full min-w-0 items-center gap-3 rounded-control border border-transparent p-2.5 text-left transition-colors hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent sm:p-3"
                disabled={index >= currentStep}
                onClick={() => onSelect(index)}
                type="button"
              >
                <span
                  className={`grid size-8 shrink-0 place-items-center rounded-control border text-sm font-semibold tabular-nums ${
                    isCurrent
                      ? 'border-primary bg-primary text-primary-foreground'
                      : index < currentStep
                        ? 'border-primary/30 bg-primary-soft text-primary'
                        : 'border-border bg-background text-muted-foreground'
                  }`}
                >
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    {t(`steps.${step}.title`)}
                  </span>
                  <span className="mt-0.5 hidden text-xs leading-relaxed text-muted-foreground lg:block">
                    {t(`steps.${step}.shortHelp`)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function firstErrorStep(fields: WorkField[]): number {
  if (fields.some((field) => ['description', 'summary', 'title'].includes(field))) return 0;
  if (fields.some((field) => ['academicPeriod', 'category'].includes(field))) return 1;
  return 2;
}

function focusFirstError(form: HTMLFormElement | null, field: WorkField | undefined) {
  const selectorByField: Partial<Record<WorkField, string>> = {
    academicPeriod: '[name="academicYear"]',
    category: '[name="category"]',
    description: '[name="description"]',
    links: '[name^="linkLabel"], [name^="linkUrl"]',
    summary: '[name="summary"]',
    tags: '[name^="tag"]',
    title: '[name="title"]',
    videoLinks: '[name^="videoLink"]',
  };
  if (!field) return;
  form?.querySelector<HTMLElement>(selectorByField[field] ?? '')?.focus();
}

function RequirementLabel({ isRequired = false }: { isRequired?: boolean }) {
  const t = useTranslations('Work.requirement');
  return (
    <Badge aria-hidden="true" variant={isRequired ? 'destructive' : 'outline'}>
      {t(isRequired ? 'required' : 'optional')}
    </Badge>
  );
}

function CharacterCount({ current, maximum }: { current: number; maximum: number }) {
  return (
    <span aria-live="polite" className="shrink-0 font-medium tabular-nums text-foreground">
      {current.toLocaleString('en-US')} / {maximum.toLocaleString('en-US')}
    </span>
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

function findRequiredFieldErrors(draft: ReturnType<typeof createFormDraft>): WorkField[] {
  const errors: WorkField[] = [];
  if (draft.title.trim().length === 0) errors.push('title');
  if (draft.summary.trim().length === 0) errors.push('summary');
  if (draft.description.trim().length === 0) errors.push('description');
  return errors;
}

function initialCollectionFieldCount(populatedFieldCount: number, maximum: number): number {
  return Math.min(maximum, Math.max(1, populatedFieldCount + 1));
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
