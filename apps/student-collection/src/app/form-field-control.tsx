'use client';

import { useTranslations } from 'next-intl';
import { Textarea } from '@showcase/ui/textarea';
import { Input } from '@/components/ui/input';
import type { CollectionAnswerValue } from './collection-answers';
import type { StudentCollectionField } from '@/lib/student-collection-forms-contract';

/**
 * Renders one answer control.
 *
 * Every field type the platform supports has a real control here, so a form the
 * Instructor can build is always a form the Student can answer.
 */
export function FormFieldControl({
  controlId,
  describedBy,
  field,
  isInvalid,
  isReadOnly,
  onChange,
  value,
}: {
  controlId: string;
  describedBy: string | undefined;
  field: StudentCollectionField;
  isInvalid: boolean;
  isReadOnly: boolean;
  onChange: (value: CollectionAnswerValue) => void;
  value: CollectionAnswerValue;
}) {
  const t = useTranslations('Forms');

  if (field.type === 'long_text') {
    return (
      <Textarea
        aria-describedby={describedBy}
        aria-invalid={isInvalid}
        disabled={isReadOnly}
        id={controlId}
        onChange={(event) => onChange(event.target.value)}
        value={typeof value === 'string' ? value : ''}
      />
    );
  }

  if (field.type === 'number') {
    return (
      <Input
        aria-describedby={describedBy}
        aria-invalid={isInvalid}
        disabled={isReadOnly}
        id={controlId}
        inputMode="decimal"
        onChange={(event) => {
          /* An empty box is "not answered yet", not the number zero. */
          const raw = event.target.value;
          onChange(raw === '' ? '' : Number(raw));
        }}
        type="number"
        value={typeof value === 'number' ? value : ''}
      />
    );
  }

  if (field.type === 'date') {
    return (
      <Input
        aria-describedby={describedBy}
        aria-invalid={isInvalid}
        disabled={isReadOnly}
        id={controlId}
        onChange={(event) => onChange(event.target.value)}
        type="date"
        value={typeof value === 'string' ? value : ''}
      />
    );
  }

  if (field.type === 'single_choice') {
    const options = field.options ?? [];
    return (
      <div aria-describedby={describedBy} className="flex flex-col gap-2" role="radiogroup">
        {options.map((option) => (
          <label className="flex items-center gap-2 text-sm" key={option}>
            <input
              checked={value === option}
              className="size-4 accent-primary"
              disabled={isReadOnly}
              name={controlId}
              onChange={() => onChange(option)}
              type="radio"
              value={option}
            />
            {option}
          </label>
        ))}
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('field.noOptions')}</p>
        ) : null}
      </div>
    );
  }

  if (field.type === 'multiple_choice') {
    const options = field.options ?? [];
    const selected = Array.isArray(value) ? value : [];
    return (
      <div aria-describedby={describedBy} className="flex flex-col gap-2">
        {options.map((option) => (
          <label className="flex items-center gap-2 text-sm" key={option}>
            <input
              checked={selected.includes(option)}
              className="size-4 rounded-sm accent-primary"
              disabled={isReadOnly}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? /* Keep the Instructor's order so the answer reads consistently. */
                      options.filter(
                        (candidate) => candidate === option || selected.includes(candidate),
                      )
                    : selected.filter((candidate) => candidate !== option),
                )
              }
              type="checkbox"
              value={option}
            />
            {option}
          </label>
        ))}
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('field.noOptions')}</p>
        ) : null}
      </div>
    );
  }

  return (
    <Input
      aria-describedby={describedBy}
      aria-invalid={isInvalid}
      disabled={isReadOnly}
      id={controlId}
      onChange={(event) => onChange(event.target.value)}
      value={typeof value === 'string' ? value : ''}
    />
  );
}
