import { InboxIcon } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { buttonVariants } from '@showcase/ui/button';
import { CoreClientError } from '@showcase/core-client';
import { PageHeader } from '@/components/ui/page-header';
import { getInstructorAuthPageState } from '@/lib/instructor-auth-page-state';
import { readInstructorSessionToken } from '@/lib/instructor-auth-session';
import { InstructorCollectionFormsCoreClient } from '@/lib/instructor-collection-forms-core';
import { InstructorCollectionGroupsCoreClient } from '@/lib/instructor-collection-groups-core';
import { getInstructorServerEnvironment } from '@/lib/server-environment';
import { AppShell } from '@/app/app-shell';
import {
  closeCollectionFormAction,
  openCollectionFormAction,
  reopenCollectionFormAction,
  saveCollectionFormAsTemplateAction,
  updateCollectionFormAction,
  updateCollectionFormMetadataAction,
} from '@/app/collection-forms.actions';
import { FormBuilder } from '../form-builder';

interface FormPageProps {
  params: Promise<{ formId: string; groupId: string }>;
}

export default async function FormPage({ params }: FormPageProps) {
  const { formId, groupId } = await params;
  const state = await getInstructorAuthPageState();
  if (state.kind !== 'active') redirect(state.kind === 'expired' ? '/?expired=1' : '/');
  const sessionToken = await readInstructorSessionToken();
  if (sessionToken === null) redirect('/?expired=1');

  const t = await getTranslations('Forms');
  const groupsT = await getTranslations('Groups');
  const environment = getInstructorServerEnvironment();

  let detail;
  let forms;
  try {
    [detail, forms] = await Promise.all([
      new InstructorCollectionGroupsCoreClient(environment).getGroup(sessionToken, groupId),
      new InstructorCollectionFormsCoreClient(environment).list(sessionToken, groupId),
    ]);
  } catch (error: unknown) {
    if (error instanceof CoreClientError && error.code === 'GROUP_NOT_FOUND') notFound();
    throw error;
  }

  const form = forms.find((candidate) => candidate.id === formId);
  if (form === undefined) notFound();

  /*
   * Only a closed form can be reopened, so the preview is fetched only then.
   * A failure here must not take the page down: the dialog simply omits the
   * count rather than blocking a reopen the Instructor can still reason about.
   */
  const reopenNewlyAssignedCount =
    form.status === 'closed'
      ? await new InstructorCollectionFormsCoreClient(environment)
          .previewReopen(sessionToken, formId)
          .then((preview) => preview.newlyAssignedCount)
          .catch(() => null)
      : null;

  return (
    <AppShell
      trail={[
        { href: '/rounds', label: groupsT('round.pageTitle') },
        { href: `/groups/${groupId}`, label: detail.group.name },
        { label: form.title },
      ]}
    >
      <PageHeader
        action={
          /* A Draft has no submissions yet, so the queue only appears once the
           * form has been opened to Students. */
          form.status === 'draft' ? undefined : (
            <Link
              className={buttonVariants({ variant: 'outline' })}
              href={`/groups/${groupId}/forms/${formId}/submissions`}
            >
              <InboxIcon aria-hidden="true" data-icon="inline-start" />
              {t('review.openAction')}
            </Link>
          )
        }
        description={t('builder.pageDescription')}
        title={form.title}
      />
      <FormBuilder
        closeAction={closeCollectionFormAction.bind(null, groupId, formId)}
        form={form}
        openAction={openCollectionFormAction.bind(null, groupId, formId)}
        reopenAction={reopenCollectionFormAction.bind(null, groupId, formId)}
        reopenNewlyAssignedCount={reopenNewlyAssignedCount}
        saveMetadataAction={updateCollectionFormMetadataAction.bind(null, groupId, formId)}
        saveStructureAction={updateCollectionFormAction.bind(null, groupId, formId)}
        saveTemplateAction={saveCollectionFormAsTemplateAction.bind(null, formId)}
      />
    </AppShell>
  );
}
