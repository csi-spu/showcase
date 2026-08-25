import { CheckCircle2Icon, Clock3Icon, TriangleAlertIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { AdminRosterBatch } from '@/lib/admin-roster-core';
import { RosterBatchAutoRefresh } from './roster-batch-auto-refresh';

export async function RosterBatchStatus({ batch }: { batch: AdminRosterBatch }) {
  const t = await getTranslations('Roster');
  return (
    <RosterBatchStatusView
      batch={batch}
      labels={{
        created: t('counts.created'),
        entryYears: t('status.entryYears', { years: batch.entryYears.join(', ') }),
        failed: t('counts.failed'),
        liveStatus: t(
          batch.status === 'pending' || batch.status === 'processing'
            ? 'status.autoUpdating'
            : 'status.latest',
        ),
        progress: t('progress.label'),
        status: t(`status.${batch.status}`),
        unchanged: t('counts.unchanged'),
        uploadedAt: t('status.uploadedAt', {
          value: new Intl.DateTimeFormat('th-TH', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: 'Asia/Bangkok',
          }).format(new Date(batch.uploadedAt)),
        }),
      }}
    />
  );
}

interface RosterBatchStatusLabels {
  created: string;
  entryYears: string;
  failed: string;
  liveStatus: string;
  progress: string;
  status: string;
  unchanged: string;
  uploadedAt: string;
}

export function RosterBatchStatusView({
  batch,
  labels,
}: {
  batch: AdminRosterBatch;
  labels: RosterBatchStatusLabels;
}) {
  const isComplete = batch.status === 'completed';
  const hasErrors = batch.status === 'completed_with_errors';
  const isActive = batch.status === 'pending' || batch.status === 'processing';
  const StatusIcon = isComplete ? CheckCircle2Icon : hasErrors ? TriangleAlertIcon : Clock3Icon;
  const statusClass = isComplete
    ? 'bg-success-background text-success'
    : hasErrors
      ? 'bg-warning-background text-warning'
      : 'bg-information-background text-information';
  return (
    <section aria-labelledby="roster-status-title" className="flex flex-col gap-6">
      <div className={`flex items-start gap-3 rounded-card p-4 ${statusClass}`}>
        <StatusIcon aria-hidden="true" className="mt-0.5 size-5" />
        <div>
          <h3 className="font-semibold" id="roster-status-title">
            {labels.status}
          </h3>
          <p className="text-sm">{labels.entryYears}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex justify-between gap-4 text-sm">
          <span>{labels.progress}</span>
          <span>
            {batch.processedRowCount}/{batch.totalRowCount}
          </span>
        </div>
        <progress
          aria-label={labels.progress}
          className="h-3 w-full accent-primary"
          max={batch.totalRowCount || 1}
          value={batch.processedRowCount}
        />
      </div>

      <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-3">
        <Count label={labels.created} value={batch.createdCount} />
        <Count label={labels.unchanged} value={batch.unchangedCount} />
        <Count label={labels.failed} value={batch.failedCount} />
      </dl>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">{labels.uploadedAt}</p>
        {isActive ? (
          <RosterBatchAutoRefresh label={labels.liveStatus} />
        ) : (
          <p className="text-sm text-muted-foreground">{labels.liveStatus}</p>
        )}
      </div>
    </section>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold">{value}</dd>
      <span className="sr-only">{`${label} ${value} รายการ`}</span>
    </div>
  );
}
