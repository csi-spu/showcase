'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { DisclosurePanel } from '@/components/ui/disclosure-panel';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { MemberSelectionReads } from '@/lib/member-selection-contract';
import type { CreateGroupAction } from '../../collection-groups-state';
import { INITIAL_CREATE_GROUP_STATE } from '../../collection-groups-state';
import { MemberSelection } from '../../member-selection/member-selection';

export function CreateGroupPanel({
  action,
  reads,
}: {
  action: CreateGroupAction;
  reads: MemberSelectionReads;
}) {
  const t = useTranslations('Groups');

  return (
    <DisclosurePanel
      closeLabel={t('group.createClose')}
      openLabel={t('group.create')}
      title={t('group.createTitle')}
    >
      <CreateGroupForm action={action} reads={reads} />
    </DisclosurePanel>
  );
}

/* A group is created with its first members; success opens the new group. */
function CreateGroupForm({
  action,
  reads,
}: {
  action: CreateGroupAction;
  reads: MemberSelectionReads;
}) {
  const t = useTranslations('Groups');
  const [name, setName] = useState('');

  return (
    <div className="flex flex-col gap-5">
      <Field>
        <FieldLabel htmlFor="group-name">{t('group.name')}</FieldLabel>
        <Input
          id="group-name"
          maxLength={200}
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
        <FieldDescription>{t('group.createDescription')}</FieldDescription>
      </Field>
      <MemberSelection
        canReview={name.trim().length > 0}
        groupId={null}
        hiddenFields={<input name="name" type="hidden" value={name} />}
        reads={reads}
        submit={(formData) => action(INITIAL_CREATE_GROUP_STATE, formData)}
        submitLabel={t('selection.createSubmit')}
      />
    </div>
  );
}
