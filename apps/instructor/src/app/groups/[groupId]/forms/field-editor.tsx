'use client';

import { ChevronDownIcon, ChevronUpIcon, Trash2Icon } from 'lucide-react';
import { useId, type CSSProperties, type ReactNode, type Ref } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import { Textarea } from '@showcase/ui/textarea';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import {
  canMapType,
  isChoiceType,
  MAX_FILES_PER_FIELD,
  type CollectionFormsErrorMessage,
  type DraftField,
} from '@/app/collection-forms-state';
import {
  COLLECTION_FIELD_TYPES,
  COLLECTION_FILE_TYPES,
  type CollectionFieldType,
  type CollectionFileType,
} from '@/lib/instructor-collection-forms-contract';

const SELECT_CLASS =
  'h-11 w-full rounded-control border border-input bg-card px-3 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:text-sm';

interface FieldEditorProps {
  /** Rendered before the summary when the list is reordered by dragging. */
  dragHandle?: ReactNode;
  errorMessage: CollectionFormsErrorMessage | null;
  field: DraftField;
  index: number;
  isDragging?: boolean;
  isExpanded?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  onChange: (id: string, patch: Partial<DraftField>) => void;
  /** Up and down buttons, for a list that is not reordered by dragging. */
  onMove?: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
  onToggle?: (id: string) => void;
  ref?: Ref<HTMLLIElement>;
  style?: CSSProperties;
}

export function FieldEditor({
  dragHandle,
  errorMessage,
  field,
  index,
  isDragging = false,
  isExpanded = true,
  isFirst = false,
  isLast = false,
  onChange,
  onMove,
  onRemove,
  onToggle,
  ref,
  style,
}: FieldEditorProps) {
  const t = useTranslations('Forms');
  const errorT = useTranslations('Forms.errors');
  const baseId = useId();
  const labelId = `${baseId}-label`;
  const descriptionId = `${baseId}-description`;
  const typeId = `${baseId}-type`;
  const optionsId = `${baseId}-options`;
  const mappingId = `${baseId}-mapping`;
  const filesId = `${baseId}-files`;
  const errorId = `${baseId}-error`;
  const editorId = `${baseId}-editor`;
  const summaryId = `${baseId}-summary`;
  const hasError = errorMessage !== null;
  const fieldLabel = field.label.trim() || t('preview.untitledField');
  const summary = (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold tabular-nums text-primary">
        {index + 1}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-medium text-foreground">{fieldLabel}</span>
        <span className="text-xs text-muted-foreground">{t(`fieldType.${field.type}`)}</span>
      </span>
      {onToggle === undefined ? null : (
        <ChevronDownIcon
          aria-hidden="true"
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
            isExpanded && 'rotate-180',
          )}
        />
      )}
    </>
  );

  return (
    <li
      aria-labelledby={summaryId}
      className={cn(
        'relative animate-in rounded-surface border bg-card fade-in slide-in-from-top-1 transition-[border-color,box-shadow,transform] duration-200 motion-reduce:transform-none motion-reduce:animate-none motion-reduce:transition-none! focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none data-[dragging=true]:z-10 data-[dragging=true]:shadow-lg data-[invalid=true]:border-destructive',
        onToggle === undefined
          ? 'border-border/80'
          : isExpanded
            ? 'border-primary/45 shadow-[0_0.75rem_2rem_-1.5rem_color-mix(in_oklch,var(--primary),transparent_65%)]'
            : 'border-border/80 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm',
      )}
      data-dragging={isDragging}
      data-invalid={hasError}
      id={`field-${field.id}`}
      /*
       * Focusable only while it is the field that failed validation, so the
       * builder can move focus here instead of merely scrolling. It never joins
       * the tab order: a valid field stays unfocusable, and tabbing through the
       * builder still walks the controls rather than the cards around them.
       */
      ref={ref}
      style={style}
      tabIndex={hasError ? -1 : undefined}
    >
      <div className="flex items-center gap-2 p-3 sm:p-4">
        {dragHandle}
        {onToggle === undefined ? (
          <div className="flex min-w-0 flex-1 items-center gap-3" id={summaryId}>
            {summary}
          </div>
        ) : (
          <button
            aria-controls={editorId}
            aria-expanded={isExpanded}
            aria-label={
              isExpanded
                ? t('builder.collapseField', { index: index + 1 })
                : t('builder.expandField', { index: index + 1, label: fieldLabel })
            }
            className="group flex min-w-0 flex-1 items-center gap-3 rounded-control text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            id={summaryId}
            onClick={() => onToggle(field.id)}
            type="button"
          >
            {summary}
          </button>
        )}
        <div className="flex shrink-0 items-center gap-0.5">
          {onMove === undefined ? null : (
            <>
              <Button
                aria-label={t('builder.moveUp', { label: field.label || String(index + 1) })}
                disabled={isFirst}
                onClick={() => onMove(field.id, -1)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <ChevronUpIcon />
              </Button>
              <Button
                aria-label={t('builder.moveDown', { label: field.label || String(index + 1) })}
                disabled={isLast}
                onClick={() => onMove(field.id, 1)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <ChevronDownIcon />
              </Button>
            </>
          )}
          <Button
            aria-label={t('builder.removeField', { label: field.label || String(index + 1) })}
            onClick={() => onRemove(field.id)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <Trash2Icon />
          </Button>
        </div>
      </div>

      <div
        aria-hidden={!isExpanded}
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
          isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
        data-slot="field-editor-content"
        id={editorId}
        inert={isExpanded ? undefined : true}
      >
        <div className="overflow-hidden">
          <div className="grid gap-4 border-t border-border/70 p-4 pt-5 sm:grid-cols-2 sm:p-5">
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor={labelId}>{t('builder.fieldLabel')}</FieldLabel>
              <Input
                aria-describedby={hasError ? errorId : undefined}
                aria-invalid={hasError}
                id={labelId}
                onChange={(event) => onChange(field.id, { label: event.target.value })}
                value={field.label}
              />
            </Field>

            <Field className="sm:col-span-2">
              <FieldLabel htmlFor={descriptionId}>{t('builder.fieldDescription')}</FieldLabel>
              <Textarea
                className="min-h-16"
                id={descriptionId}
                onChange={(event) => onChange(field.id, { description: event.target.value })}
                value={field.description}
              />
              <FieldDescription>{t('builder.fieldDescriptionHint')}</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor={typeId}>{t('builder.fieldType')}</FieldLabel>
              <select
                className={SELECT_CLASS}
                id={typeId}
                onChange={(event) =>
                  onChange(field.id, { type: event.target.value as CollectionFieldType })
                }
                value={field.type}
              >
                {COLLECTION_FIELD_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`fieldType.${type}`)}
                  </option>
                ))}
              </select>
            </Field>

            <Field className="self-end pb-3" orientation="horizontal">
              <input
                checked={field.required}
                className="size-4 rounded-sm accent-primary"
                id={`${baseId}-required`}
                onChange={(event) => onChange(field.id, { required: event.target.checked })}
                type="checkbox"
              />
              <FieldLabel htmlFor={`${baseId}-required`}>{t('builder.required')}</FieldLabel>
            </Field>

            {isChoiceType(field.type) ? (
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor={optionsId}>{t('builder.options')}</FieldLabel>
                <Textarea
                  aria-describedby={`${optionsId}-hint`}
                  id={optionsId}
                  onChange={(event) => onChange(field.id, { optionsText: event.target.value })}
                  value={field.optionsText}
                />
                <FieldDescription id={`${optionsId}-hint`}>
                  {t('builder.optionsHint')}
                </FieldDescription>
              </Field>
            ) : null}

            {field.type === 'file_upload' ? (
              <>
                <fieldset className="sm:col-span-2">
                  <legend className="mb-2 text-sm font-medium">
                    {t('builder.allowedFileTypes')}
                  </legend>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {COLLECTION_FILE_TYPES.map((fileType) => (
                      <label className="flex items-center gap-2 text-sm" key={fileType}>
                        <input
                          checked={field.fileTypes.includes(fileType)}
                          className="size-4 rounded-sm accent-primary"
                          onChange={(event) =>
                            onChange(field.id, {
                              fileTypes: toggleFileType(
                                field.fileTypes,
                                fileType,
                                event.target.checked,
                              ),
                            })
                          }
                          type="checkbox"
                        />
                        {t(`fileType.${fileType}`)}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <Field>
                  <FieldLabel htmlFor={filesId}>{t('builder.maxFiles')}</FieldLabel>
                  <Input
                    id={filesId}
                    inputMode="numeric"
                    max={MAX_FILES_PER_FIELD}
                    min={1}
                    onChange={(event) =>
                      onChange(field.id, { fileMaxFiles: Number(event.target.value) })
                    }
                    type="number"
                    value={field.fileMaxFiles}
                  />
                  <FieldDescription>
                    {t('builder.maxFilesHint', { max: MAX_FILES_PER_FIELD })}
                  </FieldDescription>
                </Field>
              </>
            ) : null}

            {canMapType(field.type) ? (
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor={mappingId}>{t('builder.mappingKey')}</FieldLabel>
                <Input
                  aria-describedby={`${mappingId}-hint`}
                  id={mappingId}
                  onChange={(event) => onChange(field.id, { mappingKey: event.target.value })}
                  placeholder={t('builder.mappingKeyPlaceholder')}
                  value={field.mappingKey}
                />
                <FieldDescription id={`${mappingId}-hint`}>
                  {t('builder.mappingKeyHint')}
                </FieldDescription>
              </Field>
            ) : null}

            {hasError ? (
              <p className="text-sm font-medium text-destructive sm:col-span-2" id={errorId}>
                {errorT(errorMessage)}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}

function toggleFileType(
  current: CollectionFileType[],
  fileType: CollectionFileType,
  isChecked: boolean,
): CollectionFileType[] {
  if (!isChecked) return current.filter((value) => value !== fileType);
  if (current.includes(fileType)) return current;
  /* Keep the declared order so the summary reads the same regardless of click order. */
  return COLLECTION_FILE_TYPES.filter(
    (value) => value === fileType || current.includes(value),
  ) as CollectionFileType[];
}
