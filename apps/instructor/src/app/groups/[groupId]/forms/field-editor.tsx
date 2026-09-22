'use client';

import { ChevronDownIcon, ChevronUpIcon, Trash2Icon } from 'lucide-react';
import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@showcase/ui/button';
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
  errorMessage: CollectionFormsErrorMessage | null;
  field: DraftField;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onChange: (id: string, patch: Partial<DraftField>) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
  totalCount: number;
}

export function FieldEditor({
  errorMessage,
  field,
  index,
  isFirst,
  isLast,
  onChange,
  onMove,
  onRemove,
  totalCount,
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
  const hasError = errorMessage !== null;

  return (
    <li
      aria-labelledby={labelId}
      className="rounded-surface border border-input bg-card p-4 data-[invalid=true]:border-destructive"
      data-invalid={hasError}
      id={`field-${field.id}`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">
          {t('builder.fieldPosition', { index: index + 1, total: totalCount })}
        </p>
        <div className="flex items-center gap-1">
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

      <div className="grid gap-4 sm:grid-cols-2">
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

        <Field orientation="horizontal">
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
              <legend className="mb-2 text-sm font-medium">{t('builder.allowedFileTypes')}</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {COLLECTION_FILE_TYPES.map((fileType) => (
                  <label className="flex items-center gap-2 text-sm" key={fileType}>
                    <input
                      checked={field.fileTypes.includes(fileType)}
                      className="size-4 rounded-sm accent-primary"
                      onChange={(event) =>
                        onChange(field.id, {
                          fileTypes: toggleFileType(field.fileTypes, fileType, event.target.checked),
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
      </div>

      {hasError ? (
        <p className="mt-3 text-sm font-medium text-destructive" id={errorId}>
          {errorT(errorMessage)}
        </p>
      ) : null}
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
