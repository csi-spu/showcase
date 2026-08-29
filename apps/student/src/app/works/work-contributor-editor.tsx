'use client';

import { Button } from '@showcase/ui/button';
import { LockKeyholeIcon, UserPlusIcon, UserRoundIcon, XIcon } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState<ContributorCandidate | null>(null);
  const [candidates, setCandidates] = useState<ContributorCandidate[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isEditorOpen || selectedCandidate !== null) return;
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
  }, [isEditorOpen, name, publicId, selectedCandidate, t]);

  const resetEditor = () => {
    requestSequenceRef.current += 1;
    setName('');
    setRole('');
    setSelectedCandidate(null);
    setCandidates([]);
    setMessage(null);
  };

  const closeEditor = () => {
    setIsEditorOpen(false);
    resetEditor();
  };

  const openEditor = () => {
    resetEditor();
    setIsEditorOpen(true);
  };

  const selectCandidate = (candidate: ContributorCandidate) => {
    requestSequenceRef.current += 1;
    setSelectedCandidate(candidate);
    setName(`${candidate.firstName} ${candidate.lastName}`);
    setCandidates([]);
    setMessage(null);
  };

  const clearSelectedCandidate = () => {
    requestSequenceRef.current += 1;
    setSelectedCandidate(null);
    setName('');
    setRole('');
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
    closeEditor();
    return true;
  };

  const addContributor = () => {
    startTransition(async () => {
      const common = {
        contributionRole: role,
        expectedVersion: version,
        idempotencyKey: crypto.randomUUID(),
        publicId,
      };
      const result =
        selectedCandidate !== null
          ? await addAccountContributorAction({
              ...common,
              candidateReference: selectedCandidate.candidateReference,
            })
          : await addExternalContributorAction({ ...common, attributionName: name });
      applyMutation(result);
    });
  };

  return (
    <div className="grid gap-5">
      <h3 className="text-lg font-semibold">{t('attribution.contributors')}</h3>
      <ul className="grid gap-2">
        {contributors.map((item) => (
          <li
            className="flex items-center gap-3 rounded-control border bg-card p-3"
            key={item.publicId}
          >
            <span
              aria-hidden="true"
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
            >
              <UserRoundIcon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{item.attributionName}</span>
              <span className="block truncate text-sm text-muted-foreground">
                {item.contributionRole}
              </span>
            </span>
            <Button
              aria-label={`${t('attribution.remove')} ${item.attributionName}`}
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
              size="icon-sm"
              variant="ghost"
            >
              <XIcon aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>

      <div>
        <Button disabled={isPending} onClick={openEditor} type="button">
          <UserPlusIcon aria-hidden="true" data-icon="inline-start" />
          {t('attribution.add')}
        </Button>
      </div>

      <Sheet
        onOpenChange={(isOpen) => {
          if (!isOpen) closeEditor();
        }}
        open={isEditorOpen}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader className="border-b border-border p-5 pr-14">
            <SheetTitle>{t('attribution.dialogTitle')}</SheetTitle>
            <SheetDescription>{t('attribution.dialogHelp')}</SheetDescription>
          </SheetHeader>
          <div className="grid gap-5 p-5">
            {selectedCandidate === null ? (
              <ContributorCandidateSearch
                activeIndex={activeIndex}
                candidates={candidates}
                listboxId={listboxId}
                name={name}
                onActiveIndex={setActiveIndex}
                onCandidates={setCandidates}
                onMessage={setMessage}
                onName={setName}
                onSelect={selectCandidate}
                t={t}
              />
            ) : (
              <SelectedCandidateCard
                candidate={selectedCandidate}
                isPending={isPending}
                onClear={clearSelectedCandidate}
                t={t}
              />
            )}
            <RoleField onRole={setRole} role={role} t={t} />
            {message === null ? null : <FieldError aria-live="polite">{message}</FieldError>}
          </div>
          <SheetFooter className="mt-auto flex-row justify-end border-t border-border p-5">
            <Button disabled={isPending} onClick={closeEditor} type="button" variant="outline">
              {t('attribution.cancel')}
            </Button>
            <Button
              disabled={isPending || role.trim() === '' || name.trim() === ''}
              onClick={addContributor}
              type="button"
            >
              {t('attribution.add')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ContributorCandidateSearch({
  activeIndex,
  candidates,
  listboxId,
  name,
  onActiveIndex,
  onCandidates,
  onMessage,
  onName,
  onSelect,
  t,
}: {
  activeIndex: number;
  candidates: ContributorCandidate[];
  listboxId: string;
  name: string;
  onActiveIndex: (index: number | ((current: number) => number)) => void;
  onCandidates: (candidates: ContributorCandidate[]) => void;
  onMessage: (message: string | null) => void;
  onName: (name: string) => void;
  onSelect: (candidate: ContributorCandidate) => void;
  t: Translation;
}) {
  return (
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
          onName(event.target.value);
          onCandidates([]);
          onMessage(null);
        }}
        onKeyDown={(event) => {
          if (candidates.length === 0) return;
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            onActiveIndex((current) => (current + 1) % candidates.length);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            onActiveIndex((current) => (current - 1 + candidates.length) % candidates.length);
          } else if (event.key === 'Enter') {
            event.preventDefault();
            onSelect(candidates[activeIndex]!);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            onCandidates([]);
          }
        }}
        role="combobox"
        value={name}
      />
      <p className="text-sm text-muted-foreground">{t('attribution.candidateHelp')}</p>
      {candidates.length === 0 ? null : (
        <ul
          aria-label={t('attribution.suggestions')}
          className="absolute top-full z-20 mt-1 max-h-72 w-full overflow-auto rounded-control border bg-popover p-1 shadow-lg"
          id={listboxId}
          role="listbox"
        >
          {candidates.map((candidate, index) => {
            const fullName = `${candidate.firstName} ${candidate.lastName}`;
            return (
              <li
                aria-selected={index === activeIndex}
                className="flex cursor-pointer items-center gap-3 rounded-sm px-3 py-2.5 aria-selected:bg-accent"
                id={`${listboxId}-option-${index}`}
                key={candidate.candidateReference}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onSelect(candidate);
                }}
                role="option"
              >
                <ContributorAvatar candidate={candidate} fullName={fullName} />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{fullName}</span>
                  <span className="block text-sm text-muted-foreground">
                    {candidateMetadata(candidate, t)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SelectedCandidateCard({
  candidate,
  isPending,
  onClear,
  t,
}: {
  candidate: ContributorCandidate;
  isPending: boolean;
  onClear: () => void;
  t: Translation;
}) {
  return (
    <div
      className="grid gap-4 rounded-control border border-primary/30 bg-primary/5 p-4"
      data-testid="selected-contributor-card"
    >
      <div className="flex items-start gap-3">
        <ContributorAvatar
          candidate={candidate}
          fullName={`${candidate.firstName} ${candidate.lastName}`}
          size="large"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold">
              {candidate.firstName} {candidate.lastName}
            </p>
            <Badge variant="secondary">
              <LockKeyholeIcon aria-hidden="true" data-icon="inline-start" />
              {t('attribution.selected')}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{candidateMetadata(candidate, t)}</p>
        </div>
        <Button
          aria-label={t('attribution.removeSelection')}
          disabled={isPending}
          onClick={onClear}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <XIcon aria-hidden="true" />
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{t('attribution.selectedAccount')}</p>
    </div>
  );
}

type Translation = ReturnType<typeof useTranslations<'Work'>>;

function RoleField({
  onRole,
  role,
  t,
}: {
  onRole: (value: string) => void;
  role: string;
  t: Translation;
}) {
  return (
    <label className="grid gap-2 font-medium">
      {t('attribution.role')}
      <Input maxLength={100} onChange={(event) => onRole(event.target.value)} value={role} />
    </label>
  );
}

function ContributorAvatar({
  candidate,
  fullName,
  size = 'default',
}: {
  candidate: ContributorCandidate;
  fullName: string;
  size?: 'default' | 'large';
}) {
  const t = useTranslations('Work');
  const [hasImageFailed, setHasImageFailed] = useState(false);
  const dimension = size === 'large' ? 56 : 44;
  const className =
    size === 'large' ? 'size-14 rounded-full object-cover' : 'size-11 rounded-full object-cover';
  if (candidate.publicProfile?.hasPhoto === true && !hasImageFailed) {
    return (
      <Image
        alt={t('attribution.profileImage', { name: fullName })}
        className={`${className} shrink-0 bg-muted`}
        height={dimension}
        onError={() => setHasImageFailed(true)}
        sizes={`${dimension}px`}
        src={`/people/${candidate.publicProfile.publicId}/photo`}
        unoptimized
        width={dimension}
      />
    );
  }
  return (
    <span
      aria-label={t('attribution.profileImage', { name: fullName })}
      className={`${className} flex shrink-0 items-center justify-center bg-muted text-muted-foreground`}
      data-testid="contributor-avatar-fallback"
      role="img"
    >
      <UserRoundIcon aria-hidden="true" className="size-1/2" />
    </span>
  );
}

function candidateMetadata(candidate: ContributorCandidate, t: Translation): string {
  return candidate.publicProfile === null
    ? t('attribution.rosterCandidate')
    : t('attribution.entryYear', { year: candidate.publicProfile.entryYear });
}
