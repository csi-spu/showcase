import {
  CircleDashedIcon,
  DownloadIcon,
  FileArchiveIcon,
  FileSpreadsheetIcon,
  RefreshCwIcon,
} from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CoreClientError } from '@showcase/core-client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getInstructorAuthPageState } from '@/lib/instructor-auth-page-state';
import { readInstructorSessionToken } from '@/lib/instructor-auth-session';
import { InstructorCollectionFormsCoreClient } from '@/lib/instructor-collection-forms-core';
import { InstructorCollectionGroupsCoreClient } from '@/lib/instructor-collection-groups-core';
import { getInstructorServerEnvironment } from '@/lib/server-environment';
import { createCollectionExportAction } from '@/app/collection-forms.actions';
import { AppShell } from '../../../app-shell';
import { ExportRequestForm } from './export-request-form';
import type {
  InstructorExportJob,
  InstructorExportStatus,
} from '@/lib/instructor-collection-forms-contract';

/*
 * An export's state changes behind this page, so a cached render would show a
 * finished artifact as still building.
 */
export const dynamic = 'force-dynamic';

const STATUS_TONES: Record<InstructorExportStatus, StatusTone> = {
  building: 'information',
  expired: 'muted',
  failed: 'destructive',
  pending: 'muted',
  ready: 'success',
};

interface ExportsPageProps {
  params: Promise<{ groupId: string }>;
}

export default async function GroupExportsPage({ params }: ExportsPageProps) {
  const { groupId } = await params;
  const state = await getInstructorAuthPageState();
  if (state.kind !== 'active') redirect(state.kind === 'expired' ? '/?expired=1' : '/');
  const sessionToken = await readInstructorSessionToken();
  if (sessionToken === null) redirect('/?expired=1');

  const t = await getTranslations('Forms.exports');
  const groupsClient = new InstructorCollectionGroupsCoreClient(getInstructorServerEnvironment());
  const formsClient = new InstructorCollectionFormsCoreClient(getInstructorServerEnvironment());

  let detail;
  let forms;
  let exports;
  try {
    [detail, forms, exports] = await Promise.all([
      groupsClient.getGroup(sessionToken, groupId),
      formsClient.list(sessionToken, groupId),
      formsClient.listExports(sessionToken, groupId),
    ]);
  } catch (error: unknown) {
    if (error instanceof CoreClientError && error.code === 'GROUP_NOT_FOUND') notFound();
    throw error;
  }

  /*
   * A Draft has not been assigned to anyone, so exporting it would produce a
   * sheet of Students who were never asked for anything.
   */
  const exportableForms = forms
    .filter((form) => form.status !== 'draft')
    .map((form) => ({ id: form.id, title: form.title }));
  const groupHref = `/groups/${groupId}`;
  const isAnyBuilding = exports.some(
    (job) => job.status === 'pending' || job.status === 'building',
  );

  return (
    <AppShell
      trail={[
        { href: `/rounds/${detail.group.roundId}`, label: detail.group.name },
        { href: groupHref, label: t('backToGroup') },
        { label: t('pageTitle') },
      ]}
    >
      <PageHeader description={t('pageDescription')} title={t('pageTitle')} />

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">{t('requestHeading')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('requestDescription')}</p>
        </div>
        {exportableForms.length === 0 ? (
          <EmptyState
            description={t('noFormsDescription')}
            icon={CircleDashedIcon}
            title={t('noForms')}
          />
        ) : (
          <ExportRequestForm
            action={createCollectionExportAction.bind(null, groupId)}
            forms={exportableForms}
          />
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-foreground">{t('historyHeading')}</h2>
          {/*
           * A plain link rather than a poll: the page is cheap to re-render and
           * an Instructor who is not watching should not generate traffic.
           */}
          <Link
            className="inline-flex items-center gap-1.5 rounded-surface border border-input bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none motion-reduce:transition-none"
            href={`${groupHref}/exports`}
          >
            <RefreshCwIcon aria-hidden="true" className="size-4 shrink-0" />
            {t('refresh')}
          </Link>
        </div>

        {isAnyBuilding ? (
          <Alert variant="information">
            <AlertDescription>{t('buildingHint')}</AlertDescription>
          </Alert>
        ) : null}

        {exports.length === 0 ? (
          <EmptyState description={t('emptyDescription')} icon={DownloadIcon} title={t('empty')} />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('columnKind')}</TableHead>
                  <TableHead>{t('columnRequestedAt')}</TableHead>
                  <TableHead>{t('columnStatus')}</TableHead>
                  <TableHead>{t('columnSize')}</TableHead>
                  <TableHead>{t('columnExpiresAt')}</TableHead>
                  <TableHead>{t('columnAction')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exports.map((job) => (
                  <ExportRow job={job} key={job.id} />
                ))}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground">{t('expiryHint')}</p>
          </>
        )}
      </section>
    </AppShell>
  );
}

async function ExportRow({ job }: { job: InstructorExportJob }) {
  const t = await getTranslations('Forms.exports');
  const kindLabel = job.kind === 'excel' ? 'Excel' : 'ZIP';
  const KindIcon = job.kind === 'excel' ? FileSpreadsheetIcon : FileArchiveIcon;

  return (
    <TableRow>
      <TableCell>
        <span className="inline-flex items-center gap-1.5">
          <KindIcon aria-hidden="true" className="size-4 shrink-0" />
          {kindLabel}
        </span>
      </TableCell>
      <TableCell>{formatDateTime(job.requestedAt)}</TableCell>
      <TableCell>
        <StatusBadge tone={STATUS_TONES[job.status]}>
          {t(`status${job.status.charAt(0).toUpperCase()}${job.status.slice(1)}`)}
        </StatusBadge>
      </TableCell>
      <TableCell>{job.byteSize === null ? t('notAvailable') : formatBytes(job.byteSize)}</TableCell>
      <TableCell>
        {job.expiresAt === null ? t('notAvailable') : formatDateTime(job.expiresAt)}
      </TableCell>
      <TableCell>
        {job.status === 'ready' ? (
          <Link
            aria-label={t('downloadLabel', {
              kind: kindLabel,
              requestedAt: formatDateTime(job.requestedAt),
            })}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            href={`/exports/${job.id}/download`}
          >
            <DownloadIcon aria-hidden="true" className="size-4 shrink-0" />
            {t('download')}
          </Link>
        ) : (
          t('notAvailable')
        )}
      </TableCell>
    </TableRow>
  );
}

/* Stored in UTC, read in Bangkok: the Instructor reads local wall-clock time. */
function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  });
}

function formatBytes(byteSize: number): string {
  if (byteSize < 1_024) return `${byteSize} B`;
  if (byteSize < 1_024 * 1_024) return `${(byteSize / 1_024).toFixed(1)} KB`;
  return `${(byteSize / (1_024 * 1_024)).toFixed(1)} MB`;
}
