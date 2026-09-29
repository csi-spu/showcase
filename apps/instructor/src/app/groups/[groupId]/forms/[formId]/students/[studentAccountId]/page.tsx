import { ArrowLeftIcon, CheckCircle2Icon, ClockIcon, PencilLineIcon } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { buttonVariants } from '@showcase/ui/button';
import { CoreClientError } from '@showcase/core-client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { getInstructorAuthPageState } from '@/lib/instructor-auth-page-state';
import { readInstructorSessionToken } from '@/lib/instructor-auth-session';
import type { InstructorReviewStudent } from '@/lib/instructor-collection-forms-contract';
import { InstructorCollectionFormsCoreClient } from '@/lib/instructor-collection-forms-core';
import { InstructorCollectionGroupsCoreClient } from '@/lib/instructor-collection-groups-core';
import { getInstructorServerEnvironment } from '@/lib/server-environment';
import { AppShell } from '@/app/app-shell';
import { checkCollectionSubmissionAction } from '@/app/collection-forms.actions';
import { formatAnswer } from '../../answer-format';
import { SubmittedFiles } from '../../submitted-files';
import {
  parseIndividualQuery,
  studentHref,
  submissionsHref,
  type SearchParams,
} from '../../submissions/responses-query';
import { toReviewOrder } from '../../submissions/review-queue-view';
import { STATUS_TONES } from '../../submissions/review-status';
import { decisionAvailability } from './decision-availability';
import { DecisionForm } from './decision-form';
import { jumpListStudents } from './jump-list';
import {
  StudentEntrance,
  StudentNavigator,
  VersionSelect,
  type StudentLink,
} from './student-navigator';

interface StudentPageProps {
  params: Promise<{ formId: string; groupId: string; studentAccountId: string }>;
  searchParams: Promise<SearchParams>;
}

function rosterName(student: InstructorReviewStudent): string {
  return `${student.rosterName.firstNameTh} ${student.rosterName.lastNameTh}`;
}

function parseVersion(value: string | string[] | undefined): number | null {
  const version = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(version) && version >= 1 ? version : null;
}

/**
 * One Student's response, read and decided in one place.
 *
 * Opens on the latest version; older versions stay readable exactly as they
 * were sent, so a decision can always be read against the work it was made
 * about. Only the latest version can be decided, and only while the round is
 * open and the Student is still a member.
 */
export default async function StudentPage({ params, searchParams }: StudentPageProps) {
  const { formId, groupId, studentAccountId } = await params;
  const search = await searchParams;
  const individual = parseIndividualQuery(search);
  const { pageSize, sort, status } = individual;
  const requestedVersion = parseVersion(search.version);
  const state = await getInstructorAuthPageState();
  if (state.kind !== 'active') redirect(state.kind === 'expired' ? '/?expired=1' : '/');
  const sessionToken = await readInstructorSessionToken();
  if (sessionToken === null) redirect('/?expired=1');

  const t = await getTranslations('Forms');
  const groupsT = await getTranslations('Groups');
  const format = await getFormatter();
  const environment = getInstructorServerEnvironment();
  const groupsClient = new InstructorCollectionGroupsCoreClient(environment);
  const formsClient = new InstructorCollectionFormsCoreClient(environment);

  let detail;
  let history;
  let place;
  let rounds;
  try {
    [detail, history, place, rounds] = await Promise.all([
      groupsClient.getGroup(sessionToken, groupId),
      formsClient.listHistory(sessionToken, formId, studentAccountId),
      /* Core places the Student however large the group, under the table's filter and order. */
      formsClient.reviewPosition(sessionToken, formId, studentAccountId, toReviewOrder(individual)),
      groupsClient.listRounds(sessionToken),
    ]);
  } catch (error: unknown) {
    /*
     * Core answers the same way for a form that does not exist and one this
     * Student was never assigned, so this page cannot distinguish them either.
     */
    if (
      error instanceof CoreClientError &&
      ['FORM_NOT_FOUND', 'GROUP_NOT_FOUND', 'OBLIGATION_NOT_FOUND'].includes(error.code)
    ) {
      notFound();
    }
    throw error;
  }

  const { entry } = place;
  const name = rosterName(entry);
  const formatDate = (value: string) =>
    format.dateTime(new Date(value), { dateStyle: 'medium', timeStyle: 'short' });

  const linkTo = (target: InstructorReviewStudent): StudentLink => ({
    href: studentHref(groupId, formId, target.studentAccountId, { pageSize, sort, status }),
    id: target.studentAccountId,
    name: rosterName(target),
  });
  const students = jumpListStudents(place).map(linkTo);
  /* Back to the table page holding this Student, under the same filter and order. */
  const listHref = submissionsHref(groupId, formId, {
    page: place.page,
    pageSize,
    sort,
    status,
    view: 'individual',
  });

  const isRoundClosed =
    rounds.find((round) => round.id === detail.group.roundId)?.status === 'closed';
  const latest = history.entries[0];
  const shown =
    history.entries.find((candidate) => candidate.version === requestedVersion) ?? latest;
  const isLatest = shown !== undefined && shown.id === latest?.id;
  const availability = decisionAvailability({ isLatest, isRoundClosed, status: history.status });
  const currentFieldIds = new Set(history.form.fields.map((field) => field.id));

  return (
    <AppShell
      trail={[
        { href: '/rounds', label: groupsT('round.pageTitle') },
        { href: `/groups/${groupId}`, label: detail.group.name },
        { href: `/groups/${groupId}/forms/${formId}`, label: history.form.title },
        { href: listHref, label: t('review.pageTitle') },
        { label: name },
      ]}
      roundId={detail.group.roundId}
    >
      <PageHeader
        action={
          <Link className={buttonVariants({ variant: 'outline' })} href={listHref}>
            <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
            {t('responses.individual.backToList')}
          </Link>
        }
        description={t('responses.individual.pageDescription')}
        eyebrow={history.form.title}
        title={name}
      />

      <div className="flex flex-col gap-5">
        <StudentNavigator
          currentId={studentAccountId}
          next={place.next === null ? null : linkTo(place.next)}
          position={place.position}
          previous={place.previous === null ? null : linkTo(place.previous)}
          students={students}
          total={place.total}
        />

        <StudentEntrance>
          {shown === undefined ? (
            <EmptyState
              description={t('history.emptyDescription')}
              icon={ClockIcon}
              title={t('history.empty')}
            />
          ) : (
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <section className="flex flex-col gap-4 rounded-surface border border-input bg-card p-4 sm:p-6">
                <VersionSelect
                  current={shown.version}
                  versions={history.entries.map((candidate, index) => {
                    const lastEvent = candidate.checkingEvents.at(-1);
                    return {
                      href: studentHref(groupId, formId, studentAccountId, {
                        pageSize,
                        sort,
                        status,
                        /* The latest version is the default, so its link carries none. */
                        version: index === 0 ? undefined : candidate.version,
                      }),
                      label: t('responses.individual.versionOption', {
                        date: formatDate(candidate.submittedAt),
                        outcome: t(
                          `responses.individual.versionOutcome.${lastEvent?.decision ?? 'pending'}`,
                        ),
                        version: candidate.version,
                      }),
                      version: candidate.version,
                    };
                  })}
                />

                {isLatest ? null : (
                  <Alert variant="information">
                    <AlertDescription>
                      {t('responses.individual.olderVersionNote')}{' '}
                      <Link
                        className="font-medium underline underline-offset-4"
                        href={studentHref(groupId, formId, studentAccountId, {
                          pageSize,
                          sort,
                          status,
                        })}
                      >
                        {t('responses.individual.showLatest')}
                      </Link>
                    </AlertDescription>
                  </Alert>
                )}

                <h2 className="text-base font-semibold">{t('review.answersHeading')}</h2>
                <dl className="flex flex-col divide-y divide-border">
                  {shown.fields.map((field) => (
                    <div className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0" key={field.id}>
                      <dt className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {field.label}
                        {currentFieldIds.has(field.id) ? null : (
                          <StatusBadge tone="muted">
                            {t('responses.individual.removedField')}
                          </StatusBadge>
                        )}
                      </dt>
                      <dd className="text-sm break-words whitespace-pre-wrap text-muted-foreground">
                        {field.type === 'file_upload' ? (
                          <SubmittedFiles files={shown.files[field.id] ?? []} />
                        ) : (
                          formatAnswer(shown.answers[field.id], t('review.noAnswer'))
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>

              <aside
                aria-labelledby="student-panel-heading"
                className="flex flex-col gap-4 rounded-surface border border-input bg-card p-4 sm:p-6 lg:sticky lg:top-20"
              >
                <h2 className="text-base font-semibold" id="student-panel-heading">
                  {t('responses.individual.panelHeading')}
                </h2>
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge tone={STATUS_TONES[history.status]}>
                    {t(`obligationStatus.${history.status}`)}
                  </StatusBadge>
                  {history.isLate ? (
                    <StatusBadge tone="destructive">{t('review.late')}</StatusBadge>
                  ) : null}
                </div>
                {history.firstSubmittedAt === null ? null : (
                  <p className="text-sm text-muted-foreground">
                    {t('history.firstSubmittedAt', { date: formatDate(history.firstSubmittedAt) })}
                    {' · '}
                    {history.isLate ? t('history.late') : t('history.onTime')}
                  </p>
                )}
                {entry.latestCheckingReason === null ? null : (
                  <Alert variant="warning">
                    <AlertDescription>
                      <span className="font-medium">{t('review.latestReason')}: </span>
                      {entry.latestCheckingReason}
                    </AlertDescription>
                  </Alert>
                )}

                <section className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold">
                    {t('history.checkingHeading')}
                    {' · '}
                    {t('history.versionHeading', { version: shown.version })}
                  </h3>
                  {shown.checkingEvents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('history.notCheckedYet')}</p>
                  ) : (
                    <ul className="flex list-none flex-col gap-3 p-0">
                      {shown.checkingEvents.map((event) => (
                        <li
                          className="flex flex-col gap-1"
                          key={`${event.occurredAt}-${event.decision}`}
                        >
                          <StatusBadge
                            icon={event.decision === 'passed' ? CheckCircle2Icon : PencilLineIcon}
                            tone={event.decision === 'passed' ? 'success' : 'warning'}
                          >
                            {event.decision === 'passed'
                              ? t('history.decisionPassed')
                              : t('history.decisionChangesRequired')}
                          </StatusBadge>
                          <p className="text-sm text-muted-foreground">
                            {t('history.decisionBy', {
                              date: formatDate(event.occurredAt),
                              name: event.instructorName,
                            })}
                          </p>
                          {event.reason === null ? null : (
                            <p className="text-sm whitespace-pre-wrap text-foreground">
                              {event.reason}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* An older or decided version needs no note: the version note or the decision above says why. */}
                {availability === 'available' ? (
                  <DecisionForm
                    checkAction={checkCollectionSubmissionAction.bind(
                      null,
                      groupId,
                      formId,
                      studentAccountId,
                    )}
                    key={shown.id}
                    submissionId={shown.id}
                  />
                ) : availability === 'roundClosed' || availability === 'withdrawn' ? (
                  <Alert>
                    <AlertDescription>{t(`responses.individual.${availability}`)}</AlertDescription>
                  </Alert>
                ) : null}
              </aside>
            </div>
          )}
        </StudentEntrance>
      </div>
    </AppShell>
  );
}
