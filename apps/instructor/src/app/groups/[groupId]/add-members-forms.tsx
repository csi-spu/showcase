'use client';

import { toast } from '@showcase/ui/toast';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { DisclosurePanel } from '@/components/ui/disclosure-panel';
import type { MemberSelectionReads } from '@/lib/member-selection-contract';
import type { AddMembersAction } from '../../collection-groups-state';
import { INITIAL_ADD_MEMBERS_STATE } from '../../collection-groups-state';
import { MemberSelection } from '../../member-selection/member-selection';

export function AddMembersPanel({
  action,
  groupId,
  openFormsCount,
  reads,
}: {
  action: AddMembersAction;
  groupId: string;
  openFormsCount: number;
  reads: MemberSelectionReads;
}) {
  const t = useTranslations('Groups');
  const router = useRouter();

  async function submit(formData: FormData) {
    const result = await action(INITIAL_ADD_MEMBERS_STATE, formData);
    if (result.error === null) {
      toast.success(
        t('members.addResult', { added: result.added, alreadyMember: result.alreadyMember }),
      );
      router.refresh();
    }
    return result;
  }

  return (
    <DisclosurePanel
      className="w-full"
      closeLabel={t('members.addClose')}
      openLabel={t('members.addOpen')}
      title={t('members.addTitle')}
    >
      <MemberSelection
        groupId={groupId}
        openFormsCount={openFormsCount}
        reads={reads}
        submit={submit}
        submitLabel={t('selection.addSubmit')}
      />
    </DisclosurePanel>
  );
}
