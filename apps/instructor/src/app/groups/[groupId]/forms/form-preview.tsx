'use client';

import { useTranslations } from 'next-intl';
import { Textarea } from '@showcase/ui/textarea';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { StatusBadge } from '@/components/ui/status-badge';
import { isChoiceType, parseOptions, type DraftField } from '@/app/collection-forms-state';

/*
 * Renders the draft the way a Student will see it, using only client state.
 * Switching to the preview never calls the server, so presentation changes stay
 * free and the Instructor can iterate quickly.
 *
 * Inputs are disabled: this shows the shape of the form, it does not collect
 * answers.
 */
export function FormPreview({
  description,
  fields,
  title,
}: {
  description: string;
  fields: DraftField[];
  title: string;
}) {
  const t = useTranslations('Forms');

  return (
    <div className="rounded-surface border border-input bg-card p-5">
      <h3 className="text-lg font-semibold">{title || t('preview.untitled')}</h3>
      {description ? (
        <p className="mt-1 text-sm whitespace-pre-line text-muted-foreground">{description}</p>
      ) : null}

      <div className="mt-5 flex flex-col gap-5">
        {fields.map((field) => (
          <Field key={field.id}>
            <FieldLabel>
              {field.label || t('preview.untitledField')}
              {field.required ? (
                <span aria-hidden="true" className="text-destructive">
                  *
                </span>
              ) : null}
              {field.required ? (
                <span className="sr-only">{t('preview.requiredLabel')}</span>
              ) : null}
            </FieldLabel>
            {field.description ? (
              <FieldDescription className="whitespace-pre-line">
                {field.description}
              </FieldDescription>
            ) : null}
            <PreviewControl field={field} />
            {field.mappingKey ? (
              <StatusBadge tone="information">{t('preview.mapped')}</StatusBadge>
            ) : null}
          </Field>
        ))}
      </div>
    </div>
  );
}

function PreviewControl({ field }: { field: DraftField }) {
  const t = useTranslations('Forms');

  if (field.type === 'long_text') return <Textarea disabled />;
  if (field.type === 'number') return <Input disabled type="number" />;
  if (field.type === 'date') return <Input disabled type="date" />;
  if (isChoiceType(field.type)) {
    const options = parseOptions(field.optionsText);
    if (options.length === 0) {
      return <p className="text-sm text-muted-foreground">{t('preview.noOptions')}</p>;
    }
    return (
      <div className="flex flex-col gap-2">
        {options.map((option) => (
          <span className="flex items-center gap-2 text-sm" key={option}>
            <input
              className="size-4 accent-primary"
              disabled
              type={field.type === 'single_choice' ? 'radio' : 'checkbox'}
            />
            {option}
          </span>
        ))}
      </div>
    );
  }
  if (field.type === 'file_upload') {
    return (
      <p className="rounded-control border border-dashed border-input px-3 py-4 text-sm text-muted-foreground">
        {t('preview.fileHint', {
          count: field.fileMaxFiles,
          types: field.fileTypes.map((type) => t(`fileType.${type}`)).join(', '),
        })}
      </p>
    );
  }
  return <Input disabled />;
}
