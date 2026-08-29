'use client';

import { Button } from '@showcase/ui/button';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { ContributorCandidate, WorkContributor } from '@/lib/student-works-core';
import {
  addAccountContributorAction,
  addExternalContributorAction,
  removeContributorAction,
  searchContributorCandidatesAction,
} from './work.actions';

const SEARCH_DEBOUNCE_MS = 300;

export function WorkContributorEditor({
  contributors,
  onContributors,
  onVersion,
  publicId,
  version,
}: {
  contributors: WorkContributor[];
  onContributors: (items: WorkContributor[]) => void;
  onVersion: (version: number) => void;
  publicId: string;
  version: number;
}) {
  const t = useTranslations('Work');
  const listboxId = useId();
  const requestSequenceRef = useRef(0);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState<ContributorCandidate | null>(null);
  const [candidates, setCandidates] = useState<ContributorCandidate[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (selectedCandidate !== null) return;
    const query = name.trim();
    const isNumeric = /^[0-9]+$/u.test(query);
    const canSearch = isNumeric ? /^[0-9]{8}$/u.test(query) : [...query].length >= 2;
    if (!canSearch) {
      requestSequenceRef.current += 1;
      return;
    }

    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    const timeout = window.setTimeout(async () => {
      const result = await searchContributorCandidatesAction({ publicId, query });
      if (requestSequenceRef.current !== requestSequence) return;
      if ('error' in result) {
        setCandidates([]);
        setMessage(t(`attribution.errors.${result.error}`));
        return;
      }
      setCandidates(result.candidates);
      setActiveIndex(0);
      setMessage(null);
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [name, publicId, selectedCandidate, t]);

  const selectCandidate = (candidate: ContributorCandidate) => {
    requestSequenceRef.current += 1;
    setSelectedCandidate(candidate);
    setName(`${candidate.firstName} ${candidate.lastName}`);
    setCandidates([]);
    setMessage(null);
  };

  const applyMutation = (result: {
    contributors?: WorkContributor[];
    error?: string;
    version?: number;
  }) => {
    if (result.error !== undefined) {
      setMessage(t(`attribution.errors.${result.error}`));
      return false;
    }
    if (result.contributors === undefined || result.version === undefined) return false;
    onContributors(result.contributors);
    onVersion(result.version);
    setName('');
    setRole('');
    setSelectedCandidate(null);
    setCandidates([]);
    setMessage(null);
    return true;
  };

  return (
    <div className="grid gap-5">
      <h3 className="text-lg font-semibold">{t('attribution.contributors')}</h3>
      <ul className="grid gap-2">
        {contributors.map((item) => (
          <li
            className="flex items-center justify-between rounded-control border p-3"
            key={item.publicId}
          >
            <span>
              {item.attributionName} · {item.contributionRole}
            </span>
            <Button
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  applyMutation(
                    await removeContributorAction({
                      contributorPublicId: item.publicId,
                      expectedVersion: version,
                      idempotencyKey: crypto.randomUUID(),
                      publicId,
                    }),
                  );
                })
              }
              type="button"
              variant="outline"
            >
              {t('attribution.remove')}
            </Button>
          </li>
        ))}
      </ul>

      <div className="grid gap-3 rounded-control border p-4">
        <div className="relative grid gap-2">
          <label className="font-medium" htmlFor={`${listboxId}-input`}>
            {t('attribution.candidateInput')}
          </label>
          <Input
            aria-activedescendant={
              candidates.length === 0 ? undefined : `${listboxId}-option-${activeIndex}`
            }
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded={candidates.length > 0}
            autoComplete="off"
            id={`${listboxId}-input`}
            maxLength={100}
            onChange={(event) => {
              setName(event.target.value);
              setSelectedCandidate(null);
              setCandidates([]);
              setMessage(null);
            }}
            onKeyDown={(event) => {
              if (candidates.length === 0) return;
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveIndex((current) => (current + 1) % candidates.length);
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex((current) => (current - 1 + candidates.length) % candidates.length);
              } else if (event.key === 'Enter') {
                event.preventDefault();
                selectCandidate(candidates[activeIndex]!);
              } else if (event.key === 'Escape') {
                event.preventDefault();
                setCandidates([]);
              }
            }}
            role="combobox"
            value={name}
          />
          <p className="text-sm text-muted-foreground">{t('attribution.candidateHelp')}</p>
          {candidates.length === 0 ? null : (
            <ul
              aria-label={t('attribution.suggestions')}
              className="absolute top-full z-10 mt-1 max-h-60 w-full overflow-auto rounded-control border bg-popover p-1 shadow-md"
              id={listboxId}
              role="listbox"
            >
              {candidates.map((candidate, index) => {
                const fullName = `${candidate.firstName} ${candidate.lastName}`;
                return (
                  <li
                    aria-selected={index === activeIndex}
                    className="cursor-pointer rounded-sm px-3 py-2 aria-selected:bg-accent"
                    id={`${listboxId}-option-${index}`}
                    key={candidate.candidateReference}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      selectCandidate(candidate);
                    }}
                    role="option"
                  >
                    {fullName}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <label className="grid gap-2 font-medium">
          {t('attribution.role')}
          <Input maxLength={100} onChange={(event) => setRole(event.target.value)} value={role} />
        </label>
        {selectedCandidate === null ? null : (
          <p className="text-sm text-muted-foreground">{t('attribution.selectedAccount')}</p>
        )}
        {message === null ? null : <FieldError aria-live="polite">{message}</FieldError>}
        <Button
          disabled={isPending || name.trim() === '' || role.trim() === ''}
          onClick={() =>
            startTransition(async () => {
              const common = {
                contributionRole: role,
                expectedVersion: version,
                idempotencyKey: crypto.randomUUID(),
                publicId,
              };
              const result =
                selectedCandidate === null
                  ? await addExternalContributorAction({ ...common, attributionName: name })
                  : await addAccountContributorAction({
                      ...common,
                      candidateReference: selectedCandidate.candidateReference,
                    });
              applyMutation(result);
            })
          }
          type="button"
        >
          {t('attribution.add')}
        </Button>
      </div>
    </div>
  );
}
