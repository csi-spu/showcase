'use client';

import { Button } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import { toast } from '@showcase/ui/toast';
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  FolderPlusIcon,
  PlusIcon,
  SearchIcon,
  UsersIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useActionState, useId, useMemo, useState, type FormEvent } from 'react';
import { useFormStatus } from 'react-dom';
import {
  createDraftField,
  INITIAL_FORM_ACTION_STATE,
  toFieldPayload,
  type CollectionFormActionState,
} from '../collection-forms-state';
import {
  INITIAL_CREATE_FORM_GROUP_STATE,
  type CreateFormGroupAction,
} from '../collection-groups-state';
import { MemberSelection } from '../member-selection/member-selection';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import type { MemberSelectionReads } from '@/lib/member-selection-contract';

interface RoundOption {
  id: string;
  name: string;
}

interface GroupOption {
  id: string;
  name: string;
  roundId: string;
}

interface SelectedGroup extends GroupOption {
  roundName: string;
}

/* The new group's names, kept while its members are chosen. */
interface GroupDraft {
  groupName: string;
  roundName: string;
}

type CreateFormAction = (
  groupId: string,
  state: CollectionFormActionState,
  formData: FormData,
) => Promise<CollectionFormActionState>;

export function CreateFormFlow({
  createFormAction,
  defaultOpen,
  groups,
  reads,
  rounds,
  setupAction,
}: {
  createFormAction: CreateFormAction;
  defaultOpen: boolean;
  groups: GroupOption[];
  reads: MemberSelectionReads;
  rounds: RoundOption[];
  setupAction: CreateFormGroupAction;
}) {
  const t = useTranslations('Forms');
  const formErrorT = useTranslations('Forms.errors');
  const router = useRouter();
  const titleId = useId();
  const roundNameId = useId();
  const groupNameId = useId();
  const searchId = useId();
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [step, setStep] = useState<'form' | 'group' | 'members'>('group');
  const [groupDraft, setGroupDraft] = useState<GroupDraft | null>(null);
  const [availableGroups, setAvailableGroups] = useState(groups);
  const [availableRounds, setAvailableRounds] = useState(rounds);
  const [selectedGroup, setSelectedGroup] = useState<SelectedGroup | null>(null);
  const [isCreatingGroup, setIsCreatingGroup] = useState(groups.length === 0);
  const [roundChoice, setRoundChoice] = useState(rounds[0]?.id ?? 'new');
  const [query, setQuery] = useState('');

  const filteredGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('th');
    if (normalizedQuery.length === 0) return availableGroups;
    return availableGroups.filter((group) => {
      const roundName = availableRounds.find((round) => round.id === group.roundId)?.name ?? '';
      return `${group.name} ${roundName}`.toLocaleLowerCase('th').includes(normalizedQuery);
    });
  }, [availableGroups, availableRounds, query]);

  // The group and its members are created together once the selection is confirmed.
  async function createGroup(formData: FormData) {
    const nextState = await setupAction(INITIAL_CREATE_FORM_GROUP_STATE, formData);
    if (nextState.error !== null || nextState.group === null) return nextState;

    const createdGroup = nextState.group;
    const round =
      nextState.round ?? availableRounds.find((item) => item.id === createdGroup.roundId);
    if (round === undefined) return { ...nextState, error: 'roundNotFound' as const };

    if (nextState.round !== null) {
      const createdRound = nextState.round;
      setAvailableRounds((current) => [createdRound, ...current]);
      setRoundChoice(createdRound.id);
    }
    setAvailableGroups((current) => [createdGroup, ...current]);
    setSelectedGroup({ ...createdGroup, roundName: round.name });
    setGroupDraft(null);
    setStep('form');
    return nextState;
  }

  const totalSteps = isCreatingGroup ? 3 : 2;
  const currentStep = step === 'group' ? 1 : step === 'members' ? 2 : totalSteps;

  function saveGroupDraft(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setGroupDraft({
      groupName: String(formData.get('groupName') ?? ''),
      roundName: String(formData.get('roundName') ?? ''),
    });
    setStep('members');
  }

  const [formState, createForm] = useActionState(
    async (
      previousState: CollectionFormActionState,
      formData: FormData,
    ): Promise<CollectionFormActionState> => {
      if (selectedGroup === null) {
        return { ...INITIAL_FORM_ACTION_STATE, error: 'groupNotFound', submitted: true };
      }
      const nextState = await createFormAction(selectedGroup.id, previousState, formData);
      if (nextState.error !== null) toast.error(formErrorT(nextState.error));
      return nextState;
    },
    INITIAL_FORM_ACTION_STATE,
  );

  const starterFields = useMemo(
    () =>
      JSON.stringify([
        toFieldPayload({
          ...createDraftField('field-1'),
          label: t('list.starterFieldLabel'),
        }),
      ]),
    [t],
  );

  function selectGroup(group: GroupOption): void {
    const round = availableRounds.find((item) => item.id === group.roundId);
    if (round === undefined) return;
    setSelectedGroup({ ...group, roundName: round.name });
  }

  function handleOpenChange(nextOpen: boolean): void {
    setIsOpen(nextOpen);
    if (!nextOpen) {
      setStep('group');
      setGroupDraft(null);
      setSelectedGroup(null);
      setIsCreatingGroup(availableGroups.length === 0);
      if (defaultOpen) router.replace('/rounds', { scroll: false });
    }
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={isOpen}>
      <DialogTrigger
        render={
          <Button type="button">
            <PlusIcon aria-hidden="true" data-icon="inline-start" />
            {t('createFlow.title')}
          </Button>
        }
      />
      <DialogContent
        className={cn(
          'max-h-[calc(100dvh-2rem)] overflow-y-auto p-0',
          step === 'members' ? 'max-w-4xl' : 'max-w-2xl',
        )}
      >
        <div className="flex flex-col gap-1 border-b border-border px-5 pt-5 pb-4">
          <span className="text-xs font-medium tracking-wide text-primary uppercase">
            {t('createFlow.step', { current: currentStep, total: totalSteps })}
          </span>
          <DialogTitle>{t('createFlow.title')}</DialogTitle>
          <DialogDescription>
            {step === 'group'
              ? t('createFlow.description')
              : step === 'members'
                ? t('createFlow.membersDescription')
                : t('createFlow.formDescription')}
          </DialogDescription>
        </div>

        {groupDraft !== null ? (
          // Kept mounted behind the group step so renaming does not lose the selection.
          <div className="px-5 pb-5" hidden={step !== 'members'}>
            <MemberSelection
              back={{ label: t('createFlow.back'), onClick: () => setStep('group') }}
              groupId={null}
              hiddenFields={
                <>
                  <input
                    name="mode"
                    type="hidden"
                    value={roundChoice === 'new' ? 'new-round' : 'existing-round'}
                  />
                  {roundChoice === 'new' ? (
                    <input name="roundName" type="hidden" value={groupDraft.roundName} />
                  ) : (
                    <input name="roundId" type="hidden" value={roundChoice} />
                  )}
                  <input name="groupName" type="hidden" value={groupDraft.groupName} />
                </>
              }
              reads={reads}
              submit={createGroup}
              submitLabel={t('createFlow.createGroupSubmit')}
            />
          </div>
        ) : null}

        {step === 'group' ? (
          <div className="flex flex-col gap-5 px-5 pb-5">
            {availableGroups.length > 0 && !isCreatingGroup ? (
              <>
                <div className="flex flex-col gap-3">
                  <h2 className="font-medium text-foreground">{t('createFlow.chooseGroup')}</h2>
                  <div className="relative">
                    <SearchIcon
                      aria-hidden="true"
                      className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      className="pl-9"
                      id={searchId}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={t('createFlow.search')}
                      value={query}
                    />
                    <label className="sr-only" htmlFor={searchId}>
                      {t('createFlow.search')}
                    </label>
                  </div>
                  <div className="grid max-h-64 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                    {filteredGroups.map((group) => {
                      const roundName =
                        availableRounds.find((round) => round.id === group.roundId)?.name ?? '';
                      const isSelected = selectedGroup?.id === group.id;
                      return (
                        <button
                          aria-pressed={isSelected}
                          className={cn(
                            'flex min-h-20 items-start gap-3 rounded-surface border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                            isSelected
                              ? 'border-primary bg-primary-soft'
                              : 'border-border bg-card hover:border-primary/40 hover:bg-accent',
                          )}
                          key={group.id}
                          onClick={() => selectGroup(group)}
                          type="button"
                        >
                          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                            <UsersIcon aria-hidden="true" className="size-4" />
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="font-medium text-foreground">{group.name}</span>
                            <span className="text-xs text-muted-foreground">{roundName}</span>
                          </span>
                          {isSelected ? (
                            <CheckIcon
                              aria-hidden="true"
                              className="size-4 shrink-0 text-primary"
                            />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4">
                  <Button onClick={() => setIsCreatingGroup(true)} type="button" variant="ghost">
                    <FolderPlusIcon aria-hidden="true" data-icon="inline-start" />
                    {t('createFlow.createGroup')}
                  </Button>
                  <Button
                    disabled={selectedGroup === null}
                    onClick={() => setStep('form')}
                    type="button"
                  >
                    {t('createFlow.continue')}
                  </Button>
                </div>
              </>
            ) : (
              <form className="flex flex-col gap-4" onSubmit={saveGroupDraft}>
                {availableGroups.length === 0 ? (
                  <div className="rounded-surface bg-muted px-4 py-3 text-sm text-muted-foreground">
                    {t('createFlow.noGroups')}
                  </div>
                ) : null}
                <Field>
                  <FieldLabel htmlFor={`${roundNameId}-select`}>{t('createFlow.round')}</FieldLabel>
                  <div className="relative">
                    <select
                      className="h-10 w-full appearance-none rounded-surface border border-input bg-background px-3 pr-9 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      id={`${roundNameId}-select`}
                      onChange={(event) => setRoundChoice(event.target.value)}
                      value={roundChoice}
                    >
                      {availableRounds.map((round) => (
                        <option key={round.id} value={round.id}>
                          {round.name}
                        </option>
                      ))}
                      <option value="new">{t('createFlow.newRound')}</option>
                    </select>
                    <ChevronDownIcon
                      aria-hidden="true"
                      className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                  </div>
                </Field>
                {roundChoice === 'new' ? (
                  <Field>
                    <FieldLabel htmlFor={roundNameId}>{t('createFlow.roundName')}</FieldLabel>
                    <Input
                      defaultValue={groupDraft?.roundName}
                      id={roundNameId}
                      maxLength={200}
                      name="roundName"
                      pattern=".*\S.*"
                      required
                    />
                  </Field>
                ) : null}
                <Field>
                  <FieldLabel htmlFor={groupNameId}>{t('createFlow.groupName')}</FieldLabel>
                  <Input
                    defaultValue={groupDraft?.groupName}
                    id={groupNameId}
                    maxLength={200}
                    name="groupName"
                    pattern=".*\S.*"
                    required
                  />
                </Field>
                <DialogFooter>
                  {availableGroups.length > 0 ? (
                    <Button
                      onClick={() => setIsCreatingGroup(false)}
                      type="button"
                      variant="outline"
                    >
                      {t('createFlow.hideCreateGroup')}
                    </Button>
                  ) : (
                    <DialogClose
                      render={
                        <Button type="button" variant="outline">
                          {t('builder.cancel')}
                        </Button>
                      }
                    />
                  )}
                  <Button type="submit">{t('createFlow.createGroupConfirm')}</Button>
                </DialogFooter>
              </form>
            )}
          </div>
        ) : step === 'form' && selectedGroup !== null ? (
          <form action={createForm} className="flex flex-col gap-4 px-5 pb-5">
            <div className="flex items-center gap-3 rounded-surface bg-primary-soft px-4 py-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <UsersIcon aria-hidden="true" className="size-4" />
              </span>
              <span className="font-medium text-foreground">
                {t('createFlow.selectedContext', {
                  group: selectedGroup.name,
                  round: selectedGroup.roundName,
                })}
              </span>
            </div>
            <input name="description" type="hidden" value="" />
            <input name="deadlineAt" type="hidden" value="" />
            <input name="fields" type="hidden" value={starterFields} />
            <Field>
              <FieldLabel htmlFor={titleId}>{t('builder.title')}</FieldLabel>
              <Input autoFocus id={titleId} maxLength={200} name="title" required />
            </Field>
            {formState.error !== null ? (
              <FieldDescription className="text-destructive">
                {formErrorT(formState.error)}
              </FieldDescription>
            ) : null}
            <DialogFooter className="justify-between">
              <Button
                onClick={() => {
                  setIsCreatingGroup(false);
                  setStep('group');
                }}
                type="button"
                variant="ghost"
              >
                <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
                {t('createFlow.back')}
              </Button>
              <div className="flex gap-2">
                <DialogClose
                  render={
                    <Button type="button" variant="outline">
                      {t('builder.cancel')}
                    </Button>
                  }
                />
                <PendingButton label={t('list.createConfirm')} />
              </div>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PendingButton({ label }: { label: string }) {
  const t = useTranslations('Groups');
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} type="submit">
      {pending ? (
        <Spinner aria-label={t('saving')} data-icon="inline-start" />
      ) : (
        <PlusIcon aria-hidden="true" data-icon="inline-start" />
      )}
      {pending ? t('saving') : label}
    </Button>
  );
}
