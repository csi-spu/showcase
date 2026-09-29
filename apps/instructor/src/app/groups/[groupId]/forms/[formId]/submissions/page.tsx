import { AlertCircleIcon } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { CoreClientError } from '@showcase/core-client';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { getInstructorAuthPageState } from '@/lib/instructor-auth-page-state';
import { readInstructorSessionToken } from '@/lib/instructor-auth-session';
import type { FieldAnswersReadResult } from '@/lib/instructor-collection-forms-contract';
import { InstructorCollectionFormsCoreClient } from '@/lib/instructor-collection-forms-core';
import { InstructorCollectionGroupsCoreClient } from '@/lib/instructor-collection-groups-core';
import { getInstructorServerEnvironment } from '@/lib/server-environment';
import { AppShell } from '@/app/app-shell';
import { isExpired } from '@/app/collection-groups-action-policy';
import { QuestionView } from './question-view';
import { ResponseViewSwitch } from './response-view-switch';
import {
  RESPONSE_VIEWS,
  parseResponsesQuery,
  submissionsHref,
  type SearchParams,
} from './responses-query';
import { ReviewQueue } from './review-queue';
import { toReviewOrder } from './review-queue-view';
import { SummaryView } from './summary-view';

interface SubmissionsPageProps {
  params: Promise<{ formId: string; groupId: string }>;
  searchParams: Promise<SearchParams>;
}

const NOT_FOUND_CODES = ['FORM_NOT_FOUND', 'GROUP_NOT_FOUND'];

/**
 * Reads one of the responses area's aggregates.
 *
 * A missing form is a 404 and an ended session goes back to sign-in, as on
 * every page. Any other failure is shown in place, so the Individual list
 * stays reachable when only an aggregate cannot be read.
 */
async function readAggregate<Value>(read: () => Promise<Value>): Promise<Value | null> {
  try {
    return await read();
  } catch (error: unknown) {
    if (error instanceof CoreClientError && NOT_FOUND_CODES.includes(error.code)) notFound();
    if (isExpired(error)) redirect('/?expired=1');
    return null;
  }
}

export default async function SubmissionsPage({ params, searchParams }: SubmissionsPageProps) {
  const { formId, groupId } = await params;
  const query = parseResponsesQuery(await searchParams);
  const state = await getInstructorAuthPageState();
  if (state.kind !== 'active') redirect(state.kind === 'expired' ? '/?expired=1' : '/');
  const sessionToken = await readInstructorSessionToken();
  if (sessionToken === null) redirect('/?expired=1');

  const t = await getTranslations('Forms');
  const groupsT = await getTranslations('Groups');
  const environment = getInstructorServerEnvironment();
  const formsClient = new InstructorCollectionFormsCoreClient(environment);

  let detail;
  let queue;
  try {
    [detail, queue] = await Promise.all([
      new InstructorCollectionGroupsCoreClient(environment).getGroup(sessionToken, groupId),
      /* The form and the Individual page the URL asks for, in one bounded read. */
      formsClient.listSubmissions(sessionToken, formId, {
        ...toReviewOrder(query.individual),
        page: query.individual.page,
      }),
    ]);
  } catch (error: unknown) {
    if (error instanceof CoreClientError && NOT_FOUND_CODES.includes(error.code)) notFound();
    throw error;
  }

  const fields = queue.form.fields;
  /* A form without questions has nothing to show one question at a time. */
  const views = RESPONSE_VIEWS.filter((view) => view !== 'question' || fields.length > 0);
  const view = views.includes(query.view) ? query.view : 'individual';
  const loadFailed = (
    <EmptyState
      description={t('responses.loadFailedDescription')}
      icon={AlertCircleIcon}
      title={t('responses.loadFailed')}
    />
  );

  let content: ReactNode;
  if (view === 'summary') {
    const summary = await readAggregate(() => formsClient.responseSummary(sessionToken, formId));
    content =
      summary === null ? (
        loadFailed
      ) : (
        <SummaryView formId={formId} groupId={groupId} summary={summary} />
      );
  } else if (view === 'question') {
    const fieldId = fields.find((field) => field.id === query.fieldId)?.id ?? fields[0]?.id ?? null;
    if (fieldId === null) notFound();
    const page = await readAggregate(() =>
      formsClient.fieldAnswers(sessionToken, formId, fieldId, { cursor: null, mode: 'question' }),
    );
    const result: FieldAnswersReadResult = page === null ? { ok: false } : { ok: true, page };
    content = (
      <QuestionView
        fieldId={fieldId}
        fields={fields}
        formId={formId}
        groupId={groupId}
        key={fieldId}
        option={query.option}
        result={result}
      />
    );
  } else {
    const { entries, page, statusCounts, total } = queue;
    content = (
      <ReviewQueue
        formId={formId}
        groupId={groupId}
        initialQuery={query.individual}
        initialQueue={{ entries, page, statusCounts, total }}
      />
    );
  }

  return (
    <AppShell
      trail={[
        { href: '/rounds', label: groupsT('round.pageTitle') },
        { href: `/groups/${groupId}`, label: detail.group.name },
        { href: `/groups/${groupId}/forms/${formId}`, label: queue.form.title },
        { label: t('review.pageTitle') },
      ]}
      roundId={detail.group.roundId}
    >
      <PageHeader description={t('review.pageDescription')} title={queue.form.title} />
      <div className="flex flex-col gap-5">
        <ResponseViewSwitch
          current={view}
          views={views.map((item) => ({
            href: submissionsHref(groupId, formId, { view: item }),
            view: item,
          }))}
        />
        {/* Keyed on the view, so switching views replays a short crossfade. */}
        <div
          className="animate-in duration-200 fade-in slide-in-from-bottom-1 motion-reduce:animate-none"
          key={view}
        >
          {content}
        </div>
      </div>
    </AppShell>
  );
}
