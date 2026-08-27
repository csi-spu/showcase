'use client';

import { SearchIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { Field, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';

const SEARCH_DEBOUNCE_MILLISECONDS = 250;
const quickSearchResponseSchema = z
  .object({
    people: z.array(
      z.object({ entryYear: z.number().int(), name: z.string(), publicId: z.uuid() }).strict(),
    ),
    works: z.array(
      z.object({ attribution: z.string(), publicId: z.uuid(), title: z.string() }).strict(),
    ),
  })
  .strict();

export function CatalogSearchField({
  defaultValue,
  id,
  label,
  placeholder,
  scope,
}: {
  defaultValue: string;
  id: string;
  label: string;
  placeholder: string;
  scope: 'people' | 'works';
}) {
  const [query, setQuery] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const normalizedQuery = query.trim();
  const suggestionListId = `${id}-suggestions`;

  useEffect(() => {
    if (normalizedQuery.length < 2) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/quick-search?q=${encodeURIComponent(normalizedQuery)}`, {
          cache: 'no-store',
          headers: { accept: 'application/json' },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('CATALOG_SUGGESTIONS_UNAVAILABLE');
        const result = quickSearchResponseSchema.parse(await response.json());
        if (controller.signal.aborted) return;
        const values =
          scope === 'works'
            ? result.works.map((work) => work.title)
            : result.people.map((person) => person.name);
        setSuggestions([...new Set(values)]);
      } catch {
        if (!controller.signal.aborted) setSuggestions([]);
      }
    }, SEARCH_DEBOUNCE_MILLISECONDS);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [normalizedQuery, scope]);

  const handleQueryChange = (nextQuery: string) => {
    setQuery(nextQuery);
    setSuggestions([]);
  };

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup className="h-12 bg-card">
        <InputGroupAddon>
          <SearchIcon aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          autoComplete="off"
          id={id}
          list={suggestionListId}
          maxLength={100}
          minLength={2}
          name="q"
          onChange={(event) => handleQueryChange(event.currentTarget.value)}
          placeholder={placeholder}
          type="search"
          value={query}
        />
      </InputGroup>
      <datalist id={suggestionListId}>
        {suggestions.map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
    </Field>
  );
}
