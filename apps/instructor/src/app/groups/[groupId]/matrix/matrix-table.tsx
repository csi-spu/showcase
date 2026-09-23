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
    <Table>
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
  );
}
