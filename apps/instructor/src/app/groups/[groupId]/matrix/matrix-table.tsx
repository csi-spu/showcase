import {
  CircleDashedIcon,
  CircleSlashIcon,
  ClockIcon,
  CheckCircle2Icon,
  MinusIcon,
  PencilLineIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { StatusBadge } from '@/components/ui/status-badge';
import type { StatusTone } from '@/components/ui/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  InstructorMatrixCellStatus,
  InstructorMatrixPage,
  InstructorMatrixRow,
} from '@/lib/instructor-collection-forms-core';

/*
 * Tone and icon both carry the meaning, and every cell also states its status in
 * text: colour alone never distinguishes "not submitted" from "not required",
 * which is the one confusion this view exists to prevent.
 */
const CELL_TONES: Record<InstructorMatrixCellStatus, StatusTone> = {
  awaiting_checking: 'information',
  changes_required: 'warning',
  not_required: 'muted',
  not_submitted: 'muted',
  passed: 'success',
  withdrawn: 'muted',
};

const CELL_ICONS: Record<InstructorMatrixCellStatus, LucideIcon> = {
  awaiting_checking: ClockIcon,
  changes_required: PencilLineIcon,
  not_required: MinusIcon,
  not_submitted: CircleDashedIcon,
  passed: CheckCircle2Icon,
  withdrawn: CircleSlashIcon,
};

export async function MatrixTable({ page }: { page: InstructorMatrixPage }) {
  const t = await getTranslations('Forms');

  return (
    <>
      {/*
       * Two renderings of one dataset, because a matrix cannot degrade the way
       * an ordinary table does. Every column here is a form, so nothing can be
       * dropped on a narrow screen without hiding a form's results entirely;
       * and left to scroll sideways the name column leaves the viewport, which
       * strands a row of badges with no indication of whose row it is. Below
       * `lg` each Student therefore becomes a card that keeps their name
       * attached to their own statuses. Both are hidden with `display`, never
       * `aria-hidden`: whichever one the viewport hides is dropped from the
       * accessibility tree with it, so the data is announced exactly once and
       * the visible rendering is always the one that is read.
       */}
      <div className="flex flex-col gap-3 lg:hidden">
        {page.rows.map((row) => (
          <MatrixCard forms={page.forms} key={row.studentAccountId} row={row} t={t} />
        ))}
      </div>

      <div className="hidden lg:block">
        <Table label={t('matrix.pageTitle')}>
          <TableHeader>
            <TableRow>
              <TableHead>{t('matrix.columnName')}</TableHead>
              {page.forms.map((form) => (
                <TableHead key={form.id}>
                  <span className="flex flex-col gap-0.5">
                    <span className="truncate font-semibold text-foreground">{form.title}</span>
                    <span className="font-normal">{t(`status.${form.status}`)}</span>
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.rows.map((row) => {
              const name = `${row.rosterName.firstNameTh} ${row.rosterName.lastNameTh}`;
              return (
                <TableRow key={row.studentAccountId}>
                  {/*
                   * A real row header, so a screen reader announces each cell with
                   * the Student it belongs to. `TableHead` is column-scoped, so this
                   * stays a plain `th` rather than widening a shared component.
                   */}
                  <th
                    className="px-4 py-3.5 text-left align-middle font-normal text-foreground"
                    scope="row"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium text-foreground">{name}</span>
                      {row.isWithdrawn ? (
                        <span className="text-xs text-muted-foreground">
                          {t('matrix.withdrawnRow')}
                        </span>
                      ) : null}
                    </span>
                  </th>
                  {row.cells.map((cell) => {
                    const label = t(`obligationStatus.${cell.status}`);
                    const Icon = CELL_ICONS[cell.status];
                    return (
                      <TableCell key={cell.formId}>
                        <span className="flex flex-col items-start gap-1">
                          <StatusBadge icon={Icon} tone={CELL_TONES[cell.status]}>
                            {label}
                          </StatusBadge>
                          {cell.isLate ? (
                            <StatusBadge tone="destructive">
                              <span className="sr-only">{t('matrix.lateLabel')}</span>
                              <span aria-hidden="true">{t('matrix.late')}</span>
                            </StatusBadge>
                          ) : null}
                        </span>
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

/**
 * One Student's row of the matrix, for screens too narrow to hold the table.
 *
 * The form title moves beside each status rather than sitting in a header far
 * to the left, so a status is never read without knowing which form it belongs
 * to.
 */
function MatrixCard({
  forms,
  row,
  t,
}: {
  forms: InstructorMatrixPage['forms'];
  row: InstructorMatrixRow;
  t: Awaited<ReturnType<typeof getTranslations<'Forms'>>>;
}) {
  const name = `${row.rosterName.firstNameTh} ${row.rosterName.lastNameTh}`;
  const titles = new Map(forms.map((form) => [form.id, form.title]));

  return (
    <div className="flex flex-col gap-3 rounded-surface border border-border/80 bg-card p-4">
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium text-foreground">{name}</span>
        {row.isWithdrawn ? (
          <span className="text-xs text-muted-foreground">{t('matrix.withdrawnRow')}</span>
        ) : null}
      </div>
      <dl className="flex flex-col gap-2">
        {row.cells.map((cell) => {
          const Icon = CELL_ICONS[cell.status];
          return (
            <div
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border/60 pt-2 first:border-t-0 first:pt-0"
              key={cell.formId}
            >
              <dt className="min-w-0 text-sm text-muted-foreground">
                {titles.get(cell.formId) ?? cell.formId}
              </dt>
              <dd className="flex shrink-0 items-center gap-1.5">
                <StatusBadge icon={Icon} tone={CELL_TONES[cell.status]}>
                  {t(`obligationStatus.${cell.status}`)}
                </StatusBadge>
                {cell.isLate ? (
                  <StatusBadge tone="destructive">
                    <span className="sr-only">{t('matrix.lateLabel')}</span>
                    <span aria-hidden="true">{t('matrix.late')}</span>
                  </StatusBadge>
                ) : null}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
