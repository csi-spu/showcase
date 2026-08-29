'use client';

import { Button } from '@showcase/ui/button';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { TagSuggestion } from '@/lib/student-works-core';
import { suggestWorkTagsAction } from './work.actions';

const MAX_TAGS = 5;
const MAX_TAG_LENGTH = 50;
const SUGGESTION_DEBOUNCE_MS = 250;

export function WorkTagInput({
  onChange,
  value,
}: {
  onChange: (value: string[]) => void;
  value: string[];
}) {
  const t = useTranslations('Work');
  const inputId = useId();
  const listId = useId();
  const requestSequence = useRef(0);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isUnavailable, setIsUnavailable] = useState(false);
  const normalizedQuery = normalizeLabel(query);
  const hasComma = query.includes(',');
  const isAtLimit = value.length >= MAX_TAGS;
  const shouldSearch = normalizedQuery.length >= 2 && !hasComma && !isAtLimit;

  useEffect(() => {
    const sequence = ++requestSequence.current;
    if (!shouldSearch) return;
    const timer = window.setTimeout(async () => {
      const result = await suggestWorkTagsAction({ query: normalizedQuery });
      if (sequence !== requestSequence.current) return;
      setIsLoading(false);
      if (result.outcome === 'error') {
        setSuggestions([]);
        setIsUnavailable(result.error === 'unavailable');
        return;
      }
      const selected = new Set(value.map(normalizeIdentity));
      setSuggestions(
        result.suggestions.filter(
          (suggestion) => !selected.has(normalizeIdentity(suggestion.displayLabel)),
        ),
      );
    }, SUGGESTION_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [normalizedQuery, shouldSearch, value]);

  const addTag = (label: string) => {
    const normalized = normalizeLabel(label);
    if (
      isAtLimit ||
      normalized.length === 0 ||
      normalized.length > MAX_TAG_LENGTH ||
      normalized.includes(',') ||
      value.some((tag) => normalizeIdentity(tag) === normalizeIdentity(normalized))
    ) {
      return;
    }
    onChange([...value, normalized]);
    setQuery('');
    setSuggestions([]);
    setIsLoading(false);
    setIsOpen(false);
    setIsUnavailable(false);
  };

  const visibleSuggestions = shouldSearch ? suggestions : [];
  const hasOptions = visibleSuggestions.length > 0;
  const canCreate =
    (!shouldSearch || !isLoading) &&
    !isAtLimit &&
    !hasComma &&
    normalizedQuery.length > 0 &&
    normalizedQuery.length <= MAX_TAG_LENGTH &&
    !value.some((tag) => normalizeIdentity(tag) === normalizeIdentity(normalizedQuery));
  const activeOptionId = hasOptions
    ? `${listId}-${activeIndex}`
    : canCreate
      ? `${listId}-create`
      : undefined;

  return (
    <Field data-invalid={hasComma || undefined}>
      <FieldLabel htmlFor={inputId}>{t('tags')}</FieldLabel>
      <div aria-label={t('tagInput.selected')} className="flex flex-wrap gap-2">
        {value.map((tag) => (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm"
            key={normalizeIdentity(tag)}
          >
            #{tag}
            <Button
              aria-label={t('tagInput.remove', { tag })}
              className="h-6 min-h-0 px-1.5"
              onClick={() => onChange(value.filter((item) => item !== tag))}
              size="sm"
              type="button"
              variant="ghost"
            >
              ×
            </Button>
          </span>
        ))}
      </div>
      <div className="relative">
        <Input
          aria-activedescendant={isOpen ? activeOptionId : undefined}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={isOpen && (hasOptions || canCreate) && !isAtLimit}
          aria-label={t('tagInput.inputLabel')}
          aria-invalid={hasComma || undefined}
          disabled={isAtLimit}
          id={inputId}
          maxLength={MAX_TAG_LENGTH}
          onChange={(event) => {
            const nextQuery = event.target.value;
            const nextNormalized = normalizeLabel(nextQuery);
            const canSuggest = nextNormalized.length >= 2 && !nextQuery.includes(',') && !isAtLimit;
            setQuery(nextQuery);
            setActiveIndex(0);
            setIsLoading(canSuggest);
            setIsOpen(true);
            setIsUnavailable(false);
            setSuggestions([]);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' && hasOptions) {
              event.preventDefault();
              setIsOpen(true);
              setActiveIndex((index) => (index + 1) % visibleSuggestions.length);
              return;
            }
            if (event.key === 'ArrowUp' && hasOptions) {
              event.preventDefault();
              setIsOpen(true);
              setActiveIndex(
                (index) => (index - 1 + visibleSuggestions.length) % visibleSuggestions.length,
              );
              return;
            }
            if (event.key === 'Escape') {
              setIsOpen(false);
              return;
            }
            if (event.key === 'Backspace' && query === '' && value.length > 0) {
              onChange(value.slice(0, -1));
              return;
            }
            if (event.key !== 'Enter') return;
            event.preventDefault();
            if (isLoading) return;
            const suggestion = visibleSuggestions[activeIndex];
            if (suggestion !== undefined) addTag(suggestion.displayLabel);
            else if (canCreate) addTag(normalizedQuery);
          }}
          placeholder={t('placeholders.tag')}
          role="combobox"
          value={query}
        />
        {isOpen && (hasOptions || canCreate) && !isAtLimit ? (
          <ul
            aria-label={t('tagInput.suggestions')}
            className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-control border border-border bg-popover p-1 shadow-md"
            id={listId}
            role="listbox"
          >
            {visibleSuggestions.map((suggestion, index) => (
              <li
                aria-selected={index === activeIndex}
                className="cursor-pointer rounded-control px-3 py-2 text-sm aria-selected:bg-muted"
                id={`${listId}-${index}`}
                key={suggestion.publicId}
                onMouseDown={(event) => {
                  event.preventDefault();
                  addTag(suggestion.displayLabel);
                }}
                role="option"
              >
                #{suggestion.displayLabel}
              </li>
            ))}
            {!hasOptions && canCreate ? (
              <li
                aria-selected="true"
                className="cursor-pointer rounded-control bg-muted px-3 py-2 text-sm"
                id={`${listId}-create`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  addTag(normalizedQuery);
                }}
                role="option"
              >
                {t('tagInput.create', { tag: normalizedQuery })}
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
      <FieldDescription>{isAtLimit ? t('tagInput.limit') : t('tagInput.help')}</FieldDescription>
      {hasComma ? <FieldError>{t('tagInput.noComma')}</FieldError> : null}
      {isUnavailable ? <FieldError>{t('tagInput.unavailable')}</FieldError> : null}
    </Field>
  );
}

function normalizeLabel(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
}

function normalizeIdentity(value: string): string {
  return normalizeLabel(value).toLocaleLowerCase('th');
}
