'use client';

import { useTranslations } from 'next-intl';
import { Textarea } from '@showcase/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
      <RadioGroup
        aria-describedby={describedBy}
        aria-invalid={isInvalid}
        className="gap-0"
        disabled={isReadOnly}
        id={controlId}
        onValueChange={(next) => onChange(String(next))}
        value={value === undefined ? null : String(value)}
      >
        {options.map((option) => (
          <FieldLabel
            className="cursor-pointer rounded-control px-2 py-2 font-normal has-[[data-checked]]:bg-primary-soft has-disabled:cursor-not-allowed has-disabled:opacity-50"
            key={option}
          >
            <RadioGroupItem value={option} />
            {option}
          </FieldLabel>
        ))}
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('field.noOptions')}</p>
        ) : null}
      </RadioGroup>
    );
  }

  if (field.type === 'multiple_choice') {
    const options = field.options ?? [];
    const selected = Array.isArray(value) ? value : [];
    return (
      <div aria-describedby={describedBy} aria-invalid={isInvalid} className="grid w-full gap-0">
        {options.map((option) => (
          <FieldLabel
            className="cursor-pointer rounded-control px-2 py-2 font-normal has-[[data-checked]]:bg-primary-soft has-disabled:cursor-not-allowed has-disabled:opacity-50"
            key={option}
          >
            <Checkbox
              checked={selected.includes(option)}
              disabled={isReadOnly}
              onCheckedChange={(checked) =>
                onChange(
                  checked === true
                    ? /* Keep the Instructor's order so the answer reads consistently. */
                      options.filter(
                        (candidate) => candidate === option || selected.includes(candidate),
                      )
                    : selected.filter((candidate) => candidate !== option),
                )
              }
            />
            {option}
          </FieldLabel>
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
