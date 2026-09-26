import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../auth/infrastructure/database.client';
import {
  findAnswerError,
  findFieldTransitionError,
  reconcileDraftAnswers,
} from '../application/collection-field';
import { findSubmissionFileError } from '../application/collection-files';
import { hasDeadlinePassed, isFirstSubmissionLate } from '../application/collection-lifecycle';
import {
  MAX_MATRIX_FORMS,
  buildMatrixRows,
  summarizeMatrix,
  type CollectionMatrixCellStatus,
} from '../application/collection-matrix';
import { CollectionExportTooLargeError } from '../application/collection-exports';
import { REMINDER_LEAD_DAYS } from '../application/collection-notifications';
import type {
  CollectionAnswers,
  CollectionExportJob,
  CollectionExportKind,
  CollectionExportStatus,
  CollectionField,
  CollectionFile,
  CollectionFileStatus,
  CollectionForm,
  CollectionFormTemplate,
  CollectionFormsRepository,
  CollectionMatrixPage,
  CollectionNotificationFeed,
  CollectionNotificationKind,
  CollectionReviewEntry,
  CollectionSubmissionHistory,
  CollectionSubmissionHistoryEntry,
  DraftFileSelection,
  PendingNotification,
  RoundPendingWork,
  StudentObligation,
} from '../application/collection-forms.ports';
import type { ReusableValueCandidate } from '../application/reusable-values';

const MAX_FILES_PER_FIELD = 5;

interface ExportRow {
  byte_size: string | number | null;
  error_code: string | null;
  expires_at: Date | null;
  group_id: string;
  id: string;
  kind: string;
  ready_at: Date | null;
  requested_at: Date;
  requested_by_account_id: string;
  status: string;
}

interface ExportEntryRow {
  form_id: string;
  is_late: boolean;
  obligation_status: string;
  position: number;
  student_account_id: string;
  student_display_name: string;
  submission_id: string | null;
  submission_fields: unknown;
  submitted_at: Date | null;
}

/* `byte_size` is a bigint, which the driver returns as a string. */
function mapExportRow(row: ExportRow): CollectionExportJob {
  return {
    byteSize: row.byte_size === null ? null : Number(row.byte_size),
    errorCode: row.error_code,
    expiresAt: row.expires_at,
    groupId: row.group_id,
    id: row.id,
    kind: row.kind as CollectionExportKind,
    readyAt: row.ready_at,
    requestedAt: row.requested_at,
    requestedByAccountId: row.requested_by_account_id,
    status: row.status as CollectionExportStatus,
  };
}

interface FormRow {
  created_from_template_id: string | null;
  deadline_at: Date | null;
  description: string;
  fields: unknown;
  group_id: string;
  id: string;
  status: 'closed' | 'draft' | 'open';
  title: string;
  version: number;
}

interface TemplateRow {
  created_at: Date;
  description: string;
  fields: unknown;
  id: string;
  name: string;
  updated_at: Date;
  version: number;
}

interface FileRow {
  byte_size: string | number;
  created_at: Date;
  declared_content_type: string;
  detected_content_type: string | null;
  field_id: string;
  form_id: string;
  id: string;
  inspection_error_code: string | null;
  original_filename: string;
  status: CollectionFileStatus;
  student_account_id: string;
}

interface ReviewRow {
  answers: unknown;
  checking_reason: string | null;
  first_submitted_at: Date | null;
  first_name_th: string;
  last_name_th: string;
  obligation_status: CollectionReviewEntry['status'];
  student_account_id: string;
  submission_id: string | null;
  submission_fields: unknown;
  submission_form_version: number | null;
  submission_version: number | null;
  submitted_at: Date | null;
}

interface ObligationRow extends FormRow {
  answers: unknown;
  checking_reason: string | null;
  first_submitted_at: Date | null;
  draft_answers: unknown;
  draft_updated_at: Date | null;
  draft_version: number | null;
  first_name_th: string;
  last_name_th: string;
  membership_status: string;
  obligation_status: StudentObligation['status'];
  round_status: string;
  submission_id: string | null;
  submission_fields: unknown;
  submission_form_version: number | null;
  submission_version: number | null;
  submitted_at: Date | null;
}

interface ResponseWriteState {
  form_status: string;
  membership_status: string;
  round_status: string;
  status: StudentObligation['status'];
}

/**
 * Whether the Student may write this response right now.
 *
 * Three separate gates, deliberately not collapsed:
 *
 * - A closed *round* stops everything. It is read-only by definition.
 * - A closed *form* still accepts a requested correction. Closing a form stops
 *   first submissions; it does not abandon the Students already asked to fix
 *   something, which is why `changes_required` is allowed through here.
 * - Withdrawn membership is read-only even where the form would allow a write.
 *
 * Callers must have locked every row they read here, the round included. The
 * round is a different row from the form and the obligation, so locking only
 * the nearer one lets a closure commit between this check and the write it
 * guards, and the write lands in a closed round.
 */
function isResponseWritable(state: ResponseWriteState): boolean {
  if (state.round_status === 'closed') return false;
  if (state.membership_status !== 'current') return false;
  if (state.status === 'changes_required') return state.form_status !== 'draft';
  return state.status === 'not_submitted' && state.form_status === 'open';
}

@Injectable()
export class PostgresCollectionFormsRepository implements CollectionFormsRepository {
  constructor(private readonly database: DatabaseClient) {}

  async createForm(input: {
    actorAccountId: string;
    createdFromTemplateId: string | null;
    deadlineAt: Date | null;
    description: string;
    fields: CollectionField[];
    groupId: string;
    now: Date;
    title: string;
  }): Promise<CollectionForm | null> {
    const rows = await this.database.sql<FormRow[]>`
      insert into public.collection_forms
        (group_id, title, description, fields, deadline_at, created_by_account_id, created_at,
          created_from_template_id)
      select ${input.groupId}, ${input.title}, ${input.description}, ${this.database.sql.json(input.fields)},
        ${input.deadlineAt}, ${input.actorAccountId}, ${input.now}, ${input.createdFromTemplateId}
      where exists (select 1 from public.collection_groups where id = ${input.groupId})
      returning id, group_id, title, description, status, fields, deadline_at, version,
        created_from_template_id
    `;
    return rows[0] === undefined ? null : this.mapForm(rows[0]);
  }

  async getForm(formId: string): Promise<CollectionForm | null> {
    const rows = await this.database.sql<FormRow[]>`
      select id, group_id, title, description, status, fields, deadline_at, version,
        created_from_template_id
      from public.collection_forms where id = ${formId}
    `;
    return rows[0] === undefined ? null : this.mapForm(rows[0]);
  }

  async listGroupForms(groupId: string): Promise<CollectionForm[]> {
    const rows = await this.database.sql<FormRow[]>`
      select id, group_id, title, description, status, fields, deadline_at, version,
        created_from_template_id
      from public.collection_forms where group_id = ${groupId}
      order by created_at desc limit 200
    `;
    return rows.map((row) => this.mapForm(row));
  }

  /** Replaces the live definition while retaining submitted schema snapshots. */
  async updateFormStructure(input: {
    actorAccountId: string;
    expectedVersion: number;
    fields: CollectionField[];
    formId: string;
    now: Date;
  }) {
    return this.database.sql.begin(async (transaction) => {
      const rows = await transaction<
        { fields: unknown; round_status: string; status: string; version: number }[]
      >`
        select form.status, form.fields, form.version, round.status as round_status
        from public.collection_forms as form
        join public.collection_groups as collection_group on collection_group.id = form.group_id
        join public.collection_rounds as round on round.id = collection_group.round_id
        where form.id = ${input.formId}
        for update of form, round
      `;
      const row = rows[0];
      if (row === undefined) return 'not_found' as const;
      if (row.round_status === 'closed') return 'round_closed' as const;
      if (row.version !== input.expectedVersion) return 'stale' as const;
      const transitionError = findFieldTransitionError(this.fields(row.fields), input.fields);
      if (transitionError !== null) {
        return { ...transitionError, outcome: 'invalid_transition' as const };
      }

      const updated = await transaction<FormRow[]>`
        update public.collection_forms
        set fields = ${transaction.json(input.fields)}, version = version + 1
        where id = ${input.formId}
        returning id, group_id, title, description, status, fields, deadline_at, version,
        created_from_template_id
      `;
      await transaction`
        insert into private.collection_form_structure_events
          (form_id, actor_account_id, previous_version, next_version, previous_fields,
            next_fields, occurred_at)
        values (${input.formId}, ${input.actorAccountId}, ${row.version}, ${row.version + 1},
          ${transaction.json(row.fields)}, ${transaction.json(input.fields)}, ${input.now})
      `;
      const activeFileFieldIds = input.fields
        .filter((field) => field.type === 'file_upload')
        .map((field) => field.id);
      await transaction`
        delete from private.collection_draft_files
        where form_id = ${input.formId}
          and not (field_id = any(${activeFileFieldIds}::text[]))
      `;
      return this.mapForm(updated[0]!);
    });
  }

  /**
   * Applies the metadata edits that stay permitted after a form is opened.
   *
   * A deadline may be extended but never pulled earlier, because Students may
   * already be working against the announced one. Each changed value is audited.
   */
  async updateFormMetadata(input: {
    actorAccountId: string;
    deadlineAt: Date | null;
    description: string;
    formId: string;
    now: Date;
    title: string;
  }) {
    return this.database.sql.begin(async (transaction) => {
      const rows = await transaction<(FormRow & { round_status: string })[]>`
        select form.id, form.group_id, form.title, form.description, form.status, form.fields,
          form.deadline_at, form.version, form.created_from_template_id, round.status as round_status
        from public.collection_forms as form
        join public.collection_groups as collection_group on collection_group.id = form.group_id
        join public.collection_rounds as round on round.id = collection_group.round_id
        where form.id = ${input.formId}
        for update of form, round
      `;
      const current = rows[0];
      if (current === undefined) return 'not_found' as const;
      if (current.round_status === 'closed') return 'round_closed' as const;
      if (
        current.deadline_at !== null &&
        (input.deadlineAt === null || input.deadlineAt.getTime() < current.deadline_at.getTime())
      ) {
        return 'deadline_earlier' as const;
      }

      const updated = await transaction<FormRow[]>`
        update public.collection_forms
        set title = ${input.title}, description = ${input.description},
          deadline_at = ${input.deadlineAt}, version = version + 1
        where id = ${input.formId}
        returning id, group_id, title, description, status, fields, deadline_at, version,
        created_from_template_id
      `;

      const changes: {
        kind: 'title' | 'description' | 'deadline';
        next: string | null;
        previous: string | null;
      }[] = [];
      if (current.title !== input.title) {
        changes.push({ kind: 'title', next: input.title, previous: current.title });
      }
      if (current.description !== input.description) {
        changes.push({
          kind: 'description',
          next: input.description,
          previous: current.description,
        });
      }
      const previousDeadline = current.deadline_at?.toISOString() ?? null;
      const nextDeadline = input.deadlineAt?.toISOString() ?? null;
      if (previousDeadline !== nextDeadline) {
        changes.push({ kind: 'deadline', next: nextDeadline, previous: previousDeadline });
      }
      for (const change of changes) {
        await transaction`
          insert into private.collection_form_metadata_events
            (form_id, actor_account_id, change_kind, previous_value, next_value, occurred_at)
          values (${input.formId}, ${input.actorAccountId}, ${change.kind}, ${change.previous},
            ${change.next}, ${input.now})
        `;
      }
      return this.mapForm(updated[0]!);
    });
  }

  async createTemplate(input: {
    actorAccountId: string;
    description: string;
    fields: CollectionField[];
    name: string;
    now: Date;
  }): Promise<CollectionFormTemplate> {
    const rows = await this.database.sql<TemplateRow[]>`
      insert into public.collection_form_templates
        (name, description, fields, created_by_account_id, created_at, updated_at)
      values (${input.name}, ${input.description}, ${this.database.sql.json(input.fields)},
        ${input.actorAccountId}, ${input.now}, ${input.now})
      returning id, name, description, fields, created_at, updated_at, version
    `;
    return this.mapTemplate(rows[0]!);
  }

  async updateTemplate(input: {
    description: string;
    fields: CollectionField[];
    name: string;
    now: Date;
    templateId: string;
  }): Promise<CollectionFormTemplate | null> {
    const rows = await this.database.sql<TemplateRow[]>`
      update public.collection_form_templates
      set name = ${input.name}, description = ${input.description},
        fields = ${this.database.sql.json(input.fields)}, updated_at = ${input.now},
        version = version + 1
      where id = ${input.templateId}
      returning id, name, description, fields, created_at, updated_at, version
    `;
    return rows[0] === undefined ? null : this.mapTemplate(rows[0]);
  }

  async getTemplate(templateId: string): Promise<CollectionFormTemplate | null> {
    const rows = await this.database.sql<TemplateRow[]>`
      select id, name, description, fields, created_at, updated_at, version
      from public.collection_form_templates where id = ${templateId}
    `;
    return rows[0] === undefined ? null : this.mapTemplate(rows[0]);
  }

  async listTemplates(): Promise<CollectionFormTemplate[]> {
    const rows = await this.database.sql<TemplateRow[]>`
      select id, name, description, fields, created_at, updated_at, version
      from public.collection_form_templates
      order by created_at desc limit 200
    `;
    return rows.map((row) => this.mapTemplate(row));
  }

  async openForm(input: { actorAccountId: string; formId: string; now: Date }) {
    return this.database.sql.begin(async (transaction) => {
      const rows = await transaction<(FormRow & { round_status: string })[]>`
        select form.id, form.group_id, form.title, form.description, form.status, form.fields,
          form.deadline_at, form.version, form.created_from_template_id, round.status as round_status
        from public.collection_forms as form
        join public.collection_groups as collection_group on collection_group.id = form.group_id
        join public.collection_rounds as round on round.id = collection_group.round_id
        where form.id = ${input.formId}
        for update of form, round
      `;
      const row = rows[0];
      if (row === undefined) return 'not_found' as const;
      if (row.round_status === 'closed') return 'round_closed' as const;
      if (row.status !== 'draft') return 'not_draft' as const;
      await transaction`
        update public.collection_forms set status = 'open', opened_at = ${input.now}, version = version + 1
        where id = ${input.formId}
      `;
      const assigned = await transaction<{ student_account_id: string }[]>`
        insert into public.collection_obligations (form_id, student_account_id, assigned_at)
        select ${input.formId}, student_account_id, ${input.now}
        from public.collection_group_memberships
        where group_id = ${row.group_id} and status = 'current'
        on conflict do nothing
        returning student_account_id
      `;
      /*
       * Notified in the same transaction as the obligation, so the two cannot
       * disagree: a Student is never told about work that was rolled back, and
       * never assigned work in silence.
       */
      await this.insertNotifications(transaction, {
        formId: input.formId,
        kind: 'obligation_assigned',
        now: input.now,
        studentAccountIds: assigned.map((obligation) => obligation.student_account_id),
        subjectKey: 'opened',
      });
      return this.mapForm({ ...row, status: 'open', version: row.version + 1 });
    });
  }

  /**
   * Stops first submissions on an open form.
   *
   * Obligations are untouched: a Student holding a returned response still has
   * corrections to make, and checking continues. Only the door for new first
   * submissions closes, which `submit` enforces by requiring form status `open`.
   */
  async closeForm(input: { actorAccountId: string; formId: string; now: Date; reason: string }) {
    return this.database.sql.begin(async (transaction) => {
      const rows = await transaction<(FormRow & { round_status: string })[]>`
        select form.id, form.group_id, form.title, form.description, form.status, form.fields,
          form.deadline_at, form.version, form.created_from_template_id, round.status as round_status
        from public.collection_forms as form
        join public.collection_groups as collection_group on collection_group.id = form.group_id
        join public.collection_rounds as round on round.id = collection_group.round_id
        where form.id = ${input.formId}
        for update of form, round
      `;
      const row = rows[0];
      if (row === undefined) return 'not_found' as const;
      if (row.round_status === 'closed') return 'round_closed' as const;
      if (row.status !== 'open') return 'not_open' as const;

      await transaction`
        update public.collection_forms
        set status = 'closed', closed_at = ${input.now}, version = version + 1
        where id = ${input.formId}
      `;
      await transaction`
        insert into private.collection_form_metadata_events
          (form_id, actor_account_id, change_kind, previous_value, next_value, reason, occurred_at)
        values (${input.formId}, ${input.actorAccountId}, 'closed', 'open', 'closed',
          ${input.reason}, ${input.now})
      `;
      return this.mapForm({ ...row, status: 'closed', version: row.version + 1 });
    });
  }

  async previewFormReopen(formId: string) {
    const rows = await this.database.sql<{ newly_assigned: number; status: string }[]>`
      select form.status, (
        select count(*)::int
        from public.collection_group_memberships as membership
        where membership.group_id = form.group_id
          and membership.status = 'current'
          and not exists (
            select 1 from public.collection_obligations as obligation
            where obligation.form_id = form.id
              and obligation.student_account_id = membership.student_account_id
          )
      ) as newly_assigned
      from public.collection_forms as form
      where form.id = ${formId}
    `;
    const row = rows[0];
    if (row === undefined) return 'not_found' as const;
    if (row.status !== 'closed') return 'not_closed' as const;
    return { newlyAssignedCount: row.newly_assigned };
  }

  /**
   * Reopens a closed form to first submissions.
   *
   * Only current members without an obligation gain one, so people who already
   * submitted are untouched and those who joined while it was closed are picked
   * up. `on conflict do nothing` is what preserves existing progress: an
   * obligation already carrying submissions and outcomes is never rewritten.
   */
  async reopenForm(input: { actorAccountId: string; formId: string; now: Date; reason: string }) {
    return this.database.sql.begin(async (transaction) => {
      const rows = await transaction<(FormRow & { round_status: string })[]>`
        select form.id, form.group_id, form.title, form.description, form.status, form.fields,
          form.deadline_at, form.version, form.created_from_template_id, round.status as round_status
        from public.collection_forms as form
        join public.collection_groups as collection_group on collection_group.id = form.group_id
        join public.collection_rounds as round on round.id = collection_group.round_id
        where form.id = ${input.formId}
        for update of form, round
      `;
      const row = rows[0];
      if (row === undefined) return 'not_found' as const;
      if (row.round_status === 'closed') return 'round_closed' as const;
      if (row.status !== 'closed') return 'not_closed' as const;

      await transaction`
        update public.collection_forms
        set status = 'open', closed_at = null, version = version + 1
        where id = ${input.formId}
      `;
      const assigned = await transaction<{ student_account_id: string }[]>`
        insert into public.collection_obligations (form_id, student_account_id, assigned_at)
        select ${input.formId}, membership.student_account_id, ${input.now}
        from public.collection_group_memberships as membership
        where membership.group_id = ${row.group_id} and membership.status = 'current'
        on conflict do nothing
        returning student_account_id
      `;
      await transaction`
        insert into private.collection_form_metadata_events
          (form_id, actor_account_id, change_kind, previous_value, next_value, reason,
            assigned_count, occurred_at)
        values (${input.formId}, ${input.actorAccountId}, 'reopened', 'closed', 'open',
          ${input.reason}, ${assigned.length}, ${input.now})
      `;
      /* Only the newly assigned are told. Reopening is not a nudge to everyone. */
      await this.insertNotifications(transaction, {
        formId: input.formId,
        kind: 'obligation_assigned',
        now: input.now,
        studentAccountIds: assigned.map((obligation) => obligation.student_account_id),
        subjectKey: 'reopened',
      });
      return {
        form: this.mapForm({ ...row, status: 'open', version: row.version + 1 }),
        newlyAssignedCount: assigned.length,
      };
    });
  }

  /**
   * Unfinished obligations across every form in a round.
   *
   * Withdrawn obligations are excluded because a withdrawn member owes nothing;
   * they are not outstanding work an Instructor could act on.
   */
  async getRoundPendingWork(roundId: string): Promise<RoundPendingWork | null> {
    const rounds = await this.database.sql<{ id: string }[]>`
      select id from public.collection_rounds where id = ${roundId}
    `;
    if (rounds[0] === undefined) return null;
    return this.readRoundPendingWork(this.database.sql, roundId);
  }

  /**
   * One bounded page of the group matrix.
   *
   * Three separate reads rather than one wide join, because they answer three
   * differently-shaped questions and joining them would multiply members by
   * forms in the database before the page is even cut:
   *
   * - the forms that make up the columns, capped;
   * - one cursor page of members, ordered so paging is stable;
   * - the obligations for exactly those members and those forms.
   *
   * A member with no obligation on a form simply has no row in the third read,
   * which is what `buildMatrixRows` turns into `not_required`.
   */
  async readGroupMatrix(input: {
    afterStudentAccountId: string | null;
    groupId: string;
    limit: number;
  }): Promise<CollectionMatrixPage | null> {
    const groups = await this.database.sql<{ id: string }[]>`
      select id from public.collection_groups where id = ${input.groupId}
    `;
    if (groups[0] === undefined) return null;

    const formRows = await this.database.sql<
      { deadline_at: Date | null; id: string; status: CollectionForm['status']; title: string }[]
    >`
      select id, title, status, deadline_at
      from public.collection_forms
      where group_id = ${input.groupId} and status <> 'draft'
      order by created_at, id
      limit ${MAX_MATRIX_FORMS}
    `;

    /*
     * Ordered by name then account id: the name is what an Instructor scans,
     * and the id breaks ties so the cursor cannot skip or repeat a member whose
     * name is shared. The cursor is the account id of the last row shown.
     */
    const memberRows = await this.database.sql<
      {
        first_name_th: string;
        last_name_th: string;
        status: string;
        student_account_id: string;
      }[]
    >`
      select membership.student_account_id, membership.status,
        person_name.first_name_th, person_name.last_name_th
      from public.collection_group_memberships as membership
      join public.accounts as account on account.id = membership.student_account_id
      join private.person_names as person_name on person_name.person_id = account.person_id
      where membership.group_id = ${input.groupId}
        and (
          ${input.afterStudentAccountId}::uuid is null
          or (person_name.first_name_th, person_name.last_name_th, membership.student_account_id) > (
            select cursor_name.first_name_th, cursor_name.last_name_th, ${input.afterStudentAccountId}::uuid
            from public.accounts as cursor_account
            join private.person_names as cursor_name on cursor_name.person_id = cursor_account.person_id
            where cursor_account.id = ${input.afterStudentAccountId}::uuid
          )
        )
      order by person_name.first_name_th, person_name.last_name_th, membership.student_account_id
      limit ${input.limit + 1}
    `;

    /* One row beyond the page proves there is a next page without counting. */
    const hasMore = memberRows.length > input.limit;
    const pageRows = hasMore ? memberRows.slice(0, input.limit) : memberRows;

    const totals = await this.database.sql<{ total: number }[]>`
      select count(*)::int as total
      from public.collection_group_memberships
      where group_id = ${input.groupId}
    `;

    const studentAccountIds = pageRows.map((row) => row.student_account_id);
    const formIds = formRows.map((row) => row.id);
    const obligationRows =
      studentAccountIds.length === 0 || formIds.length === 0
        ? []
        : await this.database.sql<
            {
              deadline_at: Date | null;
              first_submitted_at: Date | null;
              form_id: string;
              status: Exclude<CollectionMatrixCellStatus, 'not_required'>;
              student_account_id: string;
            }[]
          >`
            select obligation.form_id, obligation.student_account_id, obligation.status,
              obligation.first_submitted_at, form.deadline_at
            from public.collection_obligations as obligation
            join public.collection_forms as form on form.id = obligation.form_id
            where obligation.form_id = any(${formIds}::uuid[])
              and obligation.student_account_id = any(${studentAccountIds}::uuid[])
          `;

    const rows = buildMatrixRows({
      formIds,
      members: pageRows.map((row) => ({
        isWithdrawn: row.status === 'withdrawn',
        rosterName: { firstNameTh: row.first_name_th, lastNameTh: row.last_name_th },
        studentAccountId: row.student_account_id,
      })),
      obligations: obligationRows.map((row) => ({
        deadlineAt: row.deadline_at,
        firstSubmittedAt: row.first_submitted_at,
        formId: row.form_id,
        status: row.status,
        studentAccountId: row.student_account_id,
      })),
    });

    return {
      forms: formRows.map((row) => ({
        deadlineAt: row.deadline_at,
        id: row.id,
        status: row.status,
        title: row.title,
      })),
      nextCursor: hasMore ? (pageRows.at(-1)?.student_account_id ?? null) : null,
      rows,
      summary: summarizeMatrix(rows),
      totalMembers: totals[0]?.total ?? 0,
    };
  }

  /**
   * Flips a round between active and closed, recording the outstanding counts
   * the actor decided against.
   *
   * `expectedStatus` makes this a compare-and-set: two Instructors closing at
   * once produce one transition and one audit row, not two.
   */
  /**
   * Records notifications that survive an eligibility recheck.
   *
   * The recheck is the insert's own `where`, not a prior read: a round that
   * closed or a membership that was withdrawn between queueing and dispatch
   * silently drops the row. The unique index makes a retry a no-op, so the same
   * reminder never reaches a Student twice.
   */
  async recordNotifications(input: {
    notifications: PendingNotification[];
    now: Date;
  }): Promise<number> {
    if (input.notifications.length === 0) return 0;
    const formIds = input.notifications.map((notification) => notification.formId);
    const studentAccountIds = input.notifications.map(
      (notification) => notification.studentAccountId,
    );
    const kinds = input.notifications.map((notification) => notification.kind);
    const subjectKeys = input.notifications.map((notification) => notification.subjectKey);

    const inserted = await this.database.sql<{ id: string }[]>`
      insert into private.collection_notifications
        (form_id, student_account_id, kind, subject_key, created_at)
      select intent.form_id, intent.student_account_id, intent.kind, intent.subject_key, ${input.now}
      from unnest(
        ${formIds}::uuid[], ${studentAccountIds}::uuid[], ${kinds}::text[], ${subjectKeys}::text[]
      ) as intent(form_id, student_account_id, kind, subject_key)
      join public.collection_obligations as obligation
        on obligation.form_id = intent.form_id
        and obligation.student_account_id = intent.student_account_id
      join public.collection_forms as form on form.id = obligation.form_id
      join public.collection_groups as collection_group on collection_group.id = form.group_id
      join public.collection_rounds as round on round.id = collection_group.round_id
      join public.collection_group_memberships as membership
        on membership.group_id = collection_group.id
        and membership.student_account_id = obligation.student_account_id
      where round.status <> 'closed' and membership.status = 'current'
      on conflict do nothing
      returning id
    `;
    return inserted.length;
  }

  /**
   * Obligations whose deadline reminders have come due.
   *
   * Bounded, and narrowed in the database rather than in the worker: only open
   * forms with a deadline, in open rounds, for current members who have not
   * submitted, and only where that lead time has not already been delivered.
   */
  async findDueReminders(input: { limit: number; now: Date }): Promise<PendingNotification[]> {
    const leadDays = [...REMINDER_LEAD_DAYS];
    const rows = await this.database.sql<
      { form_id: string; lead_days: number; student_account_id: string }[]
    >`
      select obligation.form_id, obligation.student_account_id, lead.days as lead_days
      from public.collection_obligations as obligation
      join public.collection_forms as form on form.id = obligation.form_id
      join public.collection_groups as collection_group on collection_group.id = form.group_id
      join public.collection_rounds as round on round.id = collection_group.round_id
      join public.collection_group_memberships as membership
        on membership.group_id = collection_group.id
        and membership.student_account_id = obligation.student_account_id
      cross join unnest(${leadDays}::int[]) as lead(days)
      where form.deadline_at is not null
        and form.status = 'open'
        and round.status <> 'closed'
        and membership.status = 'current'
        and obligation.status = 'not_submitted'
        and obligation.first_submitted_at is null
        /* Due once the lead time is reached, and pointless after the deadline. */
        and ${input.now} >= form.deadline_at - make_interval(days => lead.days)
        and ${input.now} < form.deadline_at
        and not exists (
          select 1 from private.collection_notifications as sent
          where sent.form_id = obligation.form_id
            and sent.student_account_id = obligation.student_account_id
            and sent.kind = 'deadline_reminder'
            and sent.subject_key = lead.days::text
        )
      order by form.deadline_at, obligation.form_id, obligation.student_account_id
      limit ${input.limit}
    `;
    return rows.map((row) => ({
      formId: row.form_id,
      kind: 'deadline_reminder' as const,
      studentAccountId: row.student_account_id,
      subjectKey: String(row.lead_days),
    }));
  }

  /**
   * One Student's notifications, newest first.
   *
   * Scoped to the reader throughout: the feed is keyed by their account id, so
   * there is no filter to get wrong and no way to read another Student's rows.
   */
  async readNotificationFeed(input: {
    limit: number;
    studentAccountId: string;
  }): Promise<CollectionNotificationFeed> {
    const rows = await this.database.sql<
      {
        created_at: Date;
        deadline_at: Date | null;
        form_id: string;
        group_id: string;
        id: string;
        kind: CollectionNotificationKind;
        read_at: Date | null;
        title: string;
      }[]
    >`
      select notification.id, notification.form_id, notification.kind,
        notification.created_at, notification.read_at,
        form.title, form.deadline_at, form.group_id
      from private.collection_notifications as notification
      join public.collection_forms as form on form.id = notification.form_id
      where notification.student_account_id = ${input.studentAccountId}
      order by notification.created_at desc, notification.id desc
      limit ${input.limit}
    `;
    /* Counted across every notification, so a full page never hides the rest. */
    const unread = await this.database.sql<{ total: number }[]>`
      select count(*)::int as total
      from private.collection_notifications
      where student_account_id = ${input.studentAccountId} and read_at is null
    `;
    return {
      notifications: rows.map((row) => ({
        createdAt: row.created_at,
        deadlineAt: row.deadline_at,
        formId: row.form_id,
        formTitle: row.title,
        groupId: row.group_id,
        id: row.id,
        isRead: row.read_at !== null,
        kind: row.kind,
      })),
      unreadCount: unread[0]?.total ?? 0,
    };
  }

  /** Marks rows read. The account id is part of the predicate, not a check after. */
  async markNotificationsRead(input: {
    notificationIds: string[];
    now: Date;
    studentAccountId: string;
  }): Promise<number> {
    if (input.notificationIds.length === 0) return 0;
    const updated = await this.database.sql<{ id: string }[]>`
      update private.collection_notifications
      set read_at = ${input.now}
      where student_account_id = ${input.studentAccountId}
        and id = any(${input.notificationIds}::uuid[])
        and read_at is null
      returning id
    `;
    return updated.length;
  }

  /**
   * Creates an export and freezes its snapshot in one transaction.
   *
   * The whole point of this method is what happens in a single write: the
   * selected forms, their titles and field definitions, every Student in scope
   * with their display name, and the exact submission each had at this instant.
   * Everything the artifact will contain is decided here, so a submission made
   * a second later, a renamed form, or a corrected name cannot change what a
   * retry produces.
   */
  async createExport(input: {
    formIds: string[];
    groupId: string;
    kind: 'excel' | 'zip';
    maxForms: number;
    maxStudents: number;
    now: Date;
    requestedByAccountId: string;
  }) {
    return this.database.sql.begin(async (transaction) => {
      /*
       * Locked for the duration: the snapshot must not be taken across a
       * concurrent submission that would leave half the rows on each side.
       */
      const groups = await transaction<{ id: string }[]>`
        select id from public.collection_groups where id = ${input.groupId} for share
      `;
      if (groups[0] === undefined) return null;

      const forms = await transaction<{ fields: unknown; id: string; title: string }[]>`
        select id, title, fields
        from public.collection_forms
        where group_id = ${input.groupId}
          and id = any(${input.formIds}::uuid[])
          /* A draft form has no submissions to export. */
          and status <> 'draft'
        order by created_at, id
        limit ${input.maxForms}
      `;
      if (forms.length === 0) return null;

      const exported = await transaction<{ id: string; requested_at: Date }[]>`
        insert into private.collection_exports
          (group_id, kind, requested_by_account_id, requested_at)
        values (${input.groupId}, ${input.kind}, ${input.requestedByAccountId}, ${input.now})
        returning id, requested_at
      `;
      const job = exported[0];
      /* The insert above returns exactly one row or throws; this narrows it. */
      if (job === undefined) throw new Error('COLLECTION_EXPORT_NOT_CREATED');

      await transaction`
        insert into private.collection_export_forms (export_id, form_id, position, title, fields)
        select ${job.id}, form.form_id, form.position, form.title, form.fields
        from unnest(
          ${forms.map((form) => form.id)}::uuid[],
          ${forms.map((_form, index) => index)}::int[],
          ${forms.map((form) => form.title)}::text[],
          ${forms.map((form) => JSON.stringify(form.fields))}::jsonb[]
        ) as form(form_id, position, title, fields)
      `;

      /*
       * One row per obligation in scope, including Students who submitted
       * nothing: the tracking sheet has to show the gaps, and the archive has
       * to be able to say a folder is legitimately empty.
       *
       * Withdrawn members are excluded from the scope but their retained
       * submissions are not deleted; a later export of an active membership
       * still sees them.
       */
      await transaction`
        insert into private.collection_export_entries
          (export_id, form_id, student_account_id, student_display_name, position,
           obligation_status, submission_id, submission_fields, submitted_at, is_late)
        select ${job.id}, obligation.form_id, obligation.student_account_id,
          btrim(person_name.first_name_th || ' ' || person_name.last_name_th),
          dense_rank() over (
            order by person_name.first_name_th, person_name.last_name_th,
              obligation.student_account_id
          )::int - 1,
          obligation.status, submission.id, submission.form_fields, submission.submitted_at,
          coalesce(
            form.deadline_at is not null
              and obligation.first_submitted_at is not null
              and obligation.first_submitted_at > form.deadline_at,
            false
          )
        from private.collection_export_forms as scope
        join public.collection_obligations as obligation on obligation.form_id = scope.form_id
        join public.collection_forms as form on form.id = obligation.form_id
        join public.collection_group_memberships as membership
          on membership.group_id = ${input.groupId}
          and membership.student_account_id = obligation.student_account_id
          and membership.status = 'current'
        join public.accounts as account on account.id = obligation.student_account_id
        join private.person_names as person_name on person_name.person_id = account.person_id
        /*
         * The latest submitted version, which is what the specification means
         * by "latest submitted versions, never drafts". A draft lives in a
         * different table and can never be selected here.
         */
        left join private.collection_submissions as submission
          on submission.id = obligation.latest_submission_id
        where scope.export_id = ${job.id}
      `;

      /*
       * Bounded after the fact rather than by a LIMIT, because a partial
       * snapshot would silently omit Students from a tracking sheet. Too large
       * is a refusal, not a truncation.
       */
      const counted = await transaction<{ students: number }[]>`
        select count(distinct student_account_id)::int as students
        from private.collection_export_entries where export_id = ${job.id}
      `;
      if ((counted[0]?.students ?? 0) > input.maxStudents) {
        throw new CollectionExportTooLargeError();
      }

      return {
        byteSize: null,
        errorCode: null,
        expiresAt: null,
        groupId: input.groupId,
        id: job.id,
        kind: input.kind,
        readyAt: null,
        requestedAt: job.requested_at,
        requestedByAccountId: input.requestedByAccountId,
        status: 'pending' as const,
      };
    });
  }

  async getExport(exportId: string) {
    const rows = await this.database.sql<ExportRow[]>`
      select id, group_id, kind, status, requested_by_account_id, requested_at,
        ready_at, expires_at, byte_size, error_code
      from private.collection_exports where id = ${exportId}
    `;
    const row = rows[0];
    return row === undefined ? null : mapExportRow(row);
  }

  async readSubmissionAnswers(submissionId: string) {
    const rows = await this.database.sql<{ answers: unknown }[]>`
      select answers from private.collection_submissions where id = ${submissionId}
    `;
    const row = rows[0];
    return row === undefined ? null : (row.answers as CollectionAnswers);
  }

  async listGroupExports(input: { groupId: string; limit: number }) {
    const rows = await this.database.sql<ExportRow[]>`
      select id, group_id, kind, status, requested_by_account_id, requested_at,
        ready_at, expires_at, byte_size, error_code
      from private.collection_exports
      where group_id = ${input.groupId}
      order by requested_at desc, id desc
      limit ${input.limit}
    `;
    return rows.map(mapExportRow);
  }

  /**
   * Claims the oldest unfinished export.
   *
   * `for update skip locked` is what lets several workers run without two of
   * them building the same archive, and the lapsed-lease branch is what lets a
   * job whose worker died be retried rather than stranded in `building`.
   */
  async claimExportForBuilding(input: { leaseSeconds: number; maxAttempts: number; now: Date }) {
    const claimed = await this.database.sql<
      { attempt_count: number; group_id: string; id: string; kind: string; lease_id: string }[]
    >`
      with candidate as (
        select id from private.collection_exports
        where (status = 'pending' or (status = 'building' and lease_expires_at <= ${input.now}))
          and attempt_count < ${input.maxAttempts}
        order by requested_at
        limit 1
        for update skip locked
      )
      update private.collection_exports as job
      set status = 'building', attempt_count = job.attempt_count + 1,
        lease_id = gen_random_uuid(),
        lease_expires_at = ${input.now} + make_interval(secs => ${input.leaseSeconds})
      from candidate
      where job.id = candidate.id
      returning job.id, job.group_id, job.kind, job.lease_id, job.attempt_count
    `;
    const job = claimed[0];
    if (job === undefined) return null;

    const forms = await this.database.sql<
      { fields: unknown; form_id: string; position: number; title: string }[]
    >`
      select form_id, position, title, fields
      from private.collection_export_forms
      where export_id = ${job.id}
      order by position
    `;
    const entries = await this.database.sql<ExportEntryRow[]>`
      select form_id, student_account_id, student_display_name, position,
        obligation_status, submission_id, submission_fields, submitted_at, is_late
      from private.collection_export_entries
      where export_id = ${job.id}
      order by position, form_id
    `;

    return {
      attemptCount: job.attempt_count,
      entries: entries.map((entry) => ({
        fields: entry.submission_fields === null ? null : this.fields(entry.submission_fields),
        formId: entry.form_id,
        isLate: entry.is_late,
        obligationStatus: entry.obligation_status,
        position: entry.position,
        studentAccountId: entry.student_account_id,
        studentDisplayName: entry.student_display_name,
        submissionId: entry.submission_id,
        submittedAt: entry.submitted_at,
      })),
      forms: forms.map((form) => ({
        fields: form.fields as CollectionField[],
        formId: form.form_id,
        position: form.position,
        title: form.title,
      })),
      groupId: job.group_id,
      id: job.id,
      kind: job.kind as 'excel' | 'zip',
      leaseId: job.lease_id,
    };
  }

  /**
   * Documents of one frozen submission.
   *
   * Only files that passed inspection are exported: a quarantined or rejected
   * upload is not a document the platform vouches for.
   */
  async listExportDocuments(submissionId: string) {
    const rows = await this.database.sql<
      { field_id: string; original_filename: string; position: number; storage_key: string }[]
    >`
      select submission_file.field_id, submission_file.position,
        file.storage_key, file.original_filename
      from private.collection_submission_files as submission_file
      join private.collection_files as file on file.id = submission_file.file_id
      where submission_file.submission_id = ${submissionId} and file.status = 'ready'
      order by submission_file.field_id, submission_file.position
    `;
    return rows.map((row) => ({
      fieldId: row.field_id,
      originalFilename: row.original_filename,
      position: row.position,
      storageKey: row.storage_key,
    }));
  }

  /**
   * Marks an export ready.
   *
   * The lease is part of the `where`, so a worker whose claim lapsed while it
   * was building cannot overwrite the result of the worker that retried it.
   */
  async completeExport(input: {
    byteSize: number;
    exportId: string;
    expiresAt: Date;
    leaseId: string;
    now: Date;
    storageKey: string;
  }) {
    const updated = await this.database.sql<{ id: string }[]>`
      update private.collection_exports
      set status = 'ready', ready_at = ${input.now}, expires_at = ${input.expiresAt},
        storage_key = ${input.storageKey}, byte_size = ${input.byteSize},
        error_code = null, lease_id = null, lease_expires_at = null
      where id = ${input.exportId} and lease_id = ${input.leaseId} and status = 'building'
      returning id
    `;
    return updated.length === 1;
  }

  /**
   * Records a failed attempt.
   *
   * Below the limit the job returns to `pending` and will be claimed again,
   * rebuilding from the same frozen snapshot. At the limit it fails for good,
   * because an Instructor waiting forever is worse than an Instructor told to
   * retry.
   */
  async failExportAttempt(input: {
    errorCode: string;
    exportId: string;
    leaseId: string;
    maxAttempts: number;
    now: Date;
  }) {
    const updated = await this.database.sql<{ id: string }[]>`
      update private.collection_exports
      set status = case when attempt_count >= ${input.maxAttempts} then 'failed' else 'pending' end,
        error_code = ${input.errorCode}, lease_id = null, lease_expires_at = null
      where id = ${input.exportId} and lease_id = ${input.leaseId} and status = 'building'
      returning id
    `;
    void input.now;
    return updated.length === 1;
  }

  /**
   * Claims one expired artifact for cleanup.
   *
   * `cleanup_attempted_at` is what makes the sweep retryable without spinning:
   * a storage failure leaves the row expired and claimable again on a later
   * pass rather than being retried immediately forever.
   */
  async claimExpiredExport(input: { now: Date }) {
    const claimed = await this.database.sql<{ id: string; storage_key: string }[]>`
      with candidate as (
        select id from private.collection_exports
        where status = 'ready' and expires_at <= ${input.now} and storage_key is not null
          and (cleanup_attempted_at is null or cleanup_attempted_at <= ${input.now} - interval '5 minutes')
        order by expires_at
        limit 1
        for update skip locked
      )
      update private.collection_exports as job
      set cleanup_attempted_at = ${input.now}
      from candidate
      where job.id = candidate.id
      returning job.id, job.storage_key
    `;
    const row = claimed[0];
    if (row === undefined || row.storage_key === null) return null;
    return { id: row.id, storageKey: row.storage_key };
  }

  /**
   * Marks an expired artifact gone.
   *
   * Clears the storage key so nothing can attempt to serve bytes that are no
   * longer there. The snapshot rows stay: they are the record of what was
   * exported, and they name no file content.
   */
  async markExportExpired(input: { exportId: string; now: Date }) {
    await this.database.sql`
      update private.collection_exports
      set status = 'expired', storage_key = null, cleanup_attempted_at = ${input.now}
      where id = ${input.exportId} and status = 'ready'
    `;
  }

  async setRoundStatus(input: {
    actorAccountId: string;
    expectedStatus: 'active' | 'closed';
    nextStatus: 'active' | 'closed';
    now: Date;
    reason: string;
    roundId: string;
  }) {
    return this.database.sql.begin(async (transaction) => {
      const rounds = await transaction<{ status: 'active' | 'closed' }[]>`
        select status from public.collection_rounds where id = ${input.roundId} for update
      `;
      const round = rounds[0];
      if (round === undefined) return 'not_found' as const;
      if (round.status !== input.expectedStatus) return 'already_in_state' as const;

      const pendingWork = await this.readRoundPendingWork(transaction, input.roundId);
      await transaction`
        update public.collection_rounds set status = ${input.nextStatus}
        where id = ${input.roundId}
      `;
      await transaction`
        insert into private.collection_round_lifecycle_events
          (round_id, actor_account_id, action, reason, pending_not_submitted,
            pending_awaiting_checking, pending_changes_required, occurred_at)
        values (${input.roundId}, ${input.actorAccountId},
          ${input.nextStatus === 'closed' ? 'closed' : 'reopened'}, ${input.reason},
          ${pendingWork.notSubmitted}, ${pendingWork.awaitingChecking},
          ${pendingWork.changesRequired}, ${input.now})
      `;
      return { pendingWork };
    });
  }

  /**
   * Every retained version of one response, with the decisions against each.
   *
   * Authorization is the `where` clause: a Student reads only their own
   * obligation, and an Instructor any obligation, so the caller cannot widen
   * the scope. Drafts are never joined -- unsent work stays the Student's.
   */
  async getSubmissionHistory(input: {
    actorAccountId: string;
    formId: string;
    isInstructor: boolean;
    studentAccountId: string;
  }): Promise<CollectionSubmissionHistory | null> {
    const obligations = await this.database.sql<
      (FormRow & {
        first_submitted_at: Date | null;
        obligation_status: StudentObligation['status'];
      })[]
    >`
      select form.id, form.group_id, form.title, form.description, form.status, form.fields,
        form.deadline_at, form.version, form.created_from_template_id,
        obligation.status as obligation_status, obligation.first_submitted_at
      from public.collection_obligations as obligation
      join public.collection_forms as form on form.id = obligation.form_id
      where obligation.form_id = ${input.formId}
        and obligation.student_account_id = ${input.studentAccountId}
        and (${input.isInstructor} or obligation.student_account_id = ${input.actorAccountId})
    `;
    const obligation = obligations[0];
    if (obligation === undefined) return null;

    const rows = await this.database.sql<
      {
        answers: unknown;
        form_fields: unknown;
        form_version: number;
        id: string;
        submitted_at: Date;
        version: number;
      }[]
    >`
      select id, answers, form_fields, form_version, submitted_at, version
      from private.collection_submissions
      where form_id = ${input.formId} and student_account_id = ${input.studentAccountId}
      order by version desc
      limit 100
    `;
    const submissionIds = rows.map((row) => row.id);
    const files = await this.loadSubmittedFiles(submissionIds);
    const events = await this.loadCheckingEvents(submissionIds);

    return {
      entries: rows.map((row) => ({
        answers: this.answers(row.answers),
        checkingEvents: events.get(row.id) ?? [],
        fields: this.fields(row.form_fields),
        files: files.get(row.id) ?? {},
        formVersion: row.form_version,
        id: row.id,
        submittedAt: row.submitted_at,
        version: row.version,
      })),
      firstSubmittedAt: obligation.first_submitted_at,
      form: this.mapForm(obligation),
      isLate: isFirstSubmissionLate({
        deadlineAt: obligation.deadline_at,
        firstSubmittedAt: obligation.first_submitted_at,
      }),
      status: obligation.obligation_status,
    };
  }

  /**
   * The review queue for one form.
   *
   * Reads only submitted content. Response drafts are never joined here, so an
   * Instructor cannot see what a Student is still working on.
   */
  async listFormSubmissions(
    formId: string,
  ): Promise<{ form: CollectionForm; entries: CollectionReviewEntry[] } | null> {
    const forms = await this.database.sql<FormRow[]>`
      select id, group_id, title, description, status, fields, deadline_at, version,
        created_from_template_id
      from public.collection_forms
      where id = ${formId}
    `;
    const form = forms[0];
    if (form === undefined) return null;

    const rows = await this.database.sql<ReviewRow[]>`
      select obligation.student_account_id, obligation.status as obligation_status,
        obligation.first_submitted_at,
        submission.id as submission_id, submission.answers,
        submission.form_fields as submission_fields,
        submission.form_version as submission_form_version,
        submission.version as submission_version, submission.submitted_at,
        checking.reason as checking_reason,
        person_name.first_name_th, person_name.last_name_th
      from public.collection_obligations as obligation
      join public.accounts as account on account.id = obligation.student_account_id
      join private.person_names as person_name on person_name.person_id = account.person_id
      left join private.collection_submissions as submission on submission.id = obligation.latest_submission_id
      left join lateral (
        select event.reason
        from private.collection_checking_events as event
        where event.submission_id = obligation.latest_submission_id
          and event.decision = 'changes_required'
        order by event.occurred_at desc
        limit 1
      ) as checking on true
      where obligation.form_id = ${formId}
      order by person_name.first_name_th, person_name.last_name_th, obligation.student_account_id
      limit 500
    `;

    const files = await this.loadSubmittedFiles(
      rows.flatMap((row) => (row.submission_id === null ? [] : [row.submission_id])),
    );

    return {
      entries: rows.map((row) => ({
        firstSubmittedAt: row.first_submitted_at,
        /*
         * Derived here against the form's current deadline rather than stored at
         * submit: extending a deadline must recalculate timeliness, and the
         * retained first_submitted_at is what it is measured against.
         */
        isLate: isFirstSubmissionLate({
          deadlineAt: form.deadline_at,
          firstSubmittedAt: row.first_submitted_at,
        }),
        latestCheckingReason:
          row.obligation_status === 'changes_required' ? row.checking_reason : null,
        latestSubmission:
          row.submission_id === null || row.submission_version === null || row.submitted_at === null
            ? null
            : {
                answers: this.answers(row.answers),
                fields: this.fields(row.submission_fields),
                files: files.get(row.submission_id) ?? {},
                formVersion: row.submission_form_version!,
                id: row.submission_id,
                submittedAt: row.submitted_at,
                version: row.submission_version,
              },
        rosterName: { firstNameTh: row.first_name_th, lastNameTh: row.last_name_th },
        status: row.obligation_status,
        studentAccountId: row.student_account_id,
      })),
      form: this.mapForm(form),
    };
  }

  async listStudentObligations(studentAccountId: string, now: Date): Promise<StudentObligation[]> {
    const rows = await this.database.sql<ObligationRow[]>`
      select form.id, form.group_id, form.title, form.description, form.status, form.fields,
        form.deadline_at, form.version, form.created_from_template_id,
        obligation.status as obligation_status, obligation.first_submitted_at,
        draft.answers as draft_answers, draft.version as draft_version, draft.updated_at as draft_updated_at,
        submission.id as submission_id, submission.answers,
        submission.form_fields as submission_fields,
        submission.form_version as submission_form_version,
        submission.version as submission_version,
        submission.submitted_at, checking.reason as checking_reason,
        person_name.first_name_th, person_name.last_name_th,
        round.status as round_status, membership.status as membership_status
      from public.collection_obligations as obligation
      join public.collection_forms as form on form.id = obligation.form_id
      join public.collection_groups as collection_group on collection_group.id = form.group_id
      join public.collection_rounds as round on round.id = collection_group.round_id
      join public.collection_group_memberships as membership
        on membership.group_id = collection_group.id
        and membership.student_account_id = obligation.student_account_id
      join public.accounts as account on account.id = obligation.student_account_id
      join private.person_names as person_name on person_name.person_id = account.person_id
      left join private.collection_response_drafts as draft
        on draft.form_id = obligation.form_id and draft.student_account_id = obligation.student_account_id
      left join private.collection_submissions as submission on submission.id = obligation.latest_submission_id
      left join lateral (
        select event.reason
        from private.collection_checking_events as event
        where event.submission_id = obligation.latest_submission_id
          and event.decision = 'changes_required'
        order by event.occurred_at desc
        limit 1
      ) as checking on true
      where obligation.student_account_id = ${studentAccountId}
      order by obligation.assigned_at desc limit 200
    `;
    if (rows.length === 0) return [];

    const files = await this.loadObligationFiles(
      studentAccountId,
      rows.map((row) => row.id),
      rows.flatMap((row) => (row.submission_id === null ? [] : [row.submission_id])),
    );

    return rows.map((row) => ({
      draft:
        row.draft_version === null || row.draft_updated_at === null
          ? null
          : {
              answers: this.answers(row.draft_answers),
              files: files.draft.get(row.id) ?? {},
              updatedAt: row.draft_updated_at,
              version: row.draft_version,
            },
      firstSubmittedAt: row.first_submitted_at,
      form: this.mapForm(row),
      hasDeadlinePassed: hasDeadlinePassed({ deadlineAt: row.deadline_at, now }),
      isLate: isFirstSubmissionLate({
        deadlineAt: row.deadline_at,
        firstSubmittedAt: row.first_submitted_at,
      }),
      /*
       * Read through the same gate the write path uses, so the form the
       * Student sees and the write Core would accept cannot disagree.
       */
      isWritable: isResponseWritable({
        form_status: row.status,
        membership_status: row.membership_status,
        round_status: row.round_status,
        status: row.obligation_status,
      }),
      latestCheckingReason:
        row.obligation_status === 'changes_required' ? row.checking_reason : null,
      latestSubmission:
        row.submission_id === null || row.submission_version === null || row.submitted_at === null
          ? null
          : {
              answers: this.answers(row.answers),
              fields: this.fields(row.submission_fields),
              files: files.submitted.get(row.submission_id) ?? {},
              formVersion: row.submission_form_version!,
              id: row.submission_id,
              submittedAt: row.submitted_at,
              version: row.submission_version,
            },
      rosterName: { firstNameTh: row.first_name_th, lastNameTh: row.last_name_th },
      status: row.obligation_status,
    }));
  }

  /**
   * Values this Student may reuse: answers carried by submissions that passed
   * checking, restricted to forms in the same group. Ordering across candidates is
   * decided in the domain, so this returns every eligible answer once per key.
   */
  async listReusableValues(input: {
    excludeFormId: string;
    groupId: string;
    studentAccountId: string;
  }): Promise<ReusableValueCandidate[]> {
    const rows = await this.database.sql<
      { answers: unknown; fields: unknown; submitted_at: Date }[]
    >`
      select submission.answers, submission.form_fields as fields, submission.submitted_at
      from public.collection_obligations as obligation
      join public.collection_forms as form on form.id = obligation.form_id
      join private.collection_submissions as submission
        on submission.id = obligation.latest_submission_id
      where obligation.student_account_id = ${input.studentAccountId}
        and obligation.status = 'passed'
        and form.group_id = ${input.groupId}
        and form.id <> ${input.excludeFormId}
      order by submission.submitted_at desc
      limit 200
    `;

    const candidates: ReusableValueCandidate[] = [];
    for (const row of rows) {
      const answers = this.answers(row.answers);
      for (const field of this.fields(row.fields)) {
        if (field.mappingKey === undefined || field.type === 'file_upload') continue;
        const value = answers[field.id];
        if (value === undefined || value === null) continue;
        candidates.push({
          fieldType: field.type,
          mappingKey: field.mappingKey,
          submittedAt: row.submitted_at,
          value,
        });
      }
    }
    return candidates;
  }

  async saveDraft(input: {
    answers: CollectionAnswers;
    expectedVersion: number;
    formId: string;
    now: Date;
    studentAccountId: string;
  }) {
    return this.database.sql.begin(async (transaction) => {
      const eligible = await transaction<ResponseWriteState[]>`
        select obligation.status, form.status as form_status, membership.status as membership_status,
          round.status as round_status
        from public.collection_obligations as obligation
        join public.collection_forms as form on form.id = obligation.form_id
        join public.collection_groups as collection_group on collection_group.id = form.group_id
        join public.collection_rounds as round on round.id = collection_group.round_id
        join public.collection_group_memberships as membership
          on membership.group_id = collection_group.id and membership.student_account_id = obligation.student_account_id
        where obligation.form_id = ${input.formId} and obligation.student_account_id = ${input.studentAccountId}
        for update of obligation, round
      `;
      const state = eligible[0];
      if (state === undefined || !isResponseWritable(state)) return 'forbidden' as const;
      const rows =
        input.expectedVersion === 0
          ? await transaction<{ version: number }[]>`
              insert into private.collection_response_drafts
                (form_id, student_account_id, answers, version, updated_at)
              values (${input.formId}, ${input.studentAccountId}, ${transaction.json(input.answers)}, 1, ${input.now})
              on conflict (form_id, student_account_id) do nothing
              returning version
            `
          : await transaction<{ version: number }[]>`
              update private.collection_response_drafts
              set answers = ${transaction.json(input.answers)}, version = version + 1, updated_at = ${input.now}
              where form_id = ${input.formId} and student_account_id = ${input.studentAccountId}
                and version = ${input.expectedVersion}
              returning version
            `;
      const row = rows[0];
      if (row === undefined) return 'stale' as const;
      if (input.expectedVersion !== 0 && row.version !== input.expectedVersion + 1)
        return 'stale' as const;
      return row;
    });
  }

  /**
   * Registers a pending upload slot. Only an authorized finalize call moves it
   * into quarantine after the browser has completed the signed PUT.
   */
  async createUpload(input: {
    byteSize: number;
    declaredContentType: string;
    fieldId: string;
    filename: string;
    formId: string;
    now: Date;
    storageKey: string;
    studentAccountId: string;
  }): Promise<CollectionFile> {
    const rows = await this.database.sql<FileRow[]>`
      insert into private.collection_files
        (form_id, field_id, student_account_id, storage_key, original_filename,
          declared_content_type, byte_size, status, created_at)
      values (${input.formId}, ${this.database.sql.text(input.fieldId)}, ${input.studentAccountId}, ${input.storageKey},
        ${input.filename}, ${input.declaredContentType}, ${input.byteSize}, 'pending_upload', ${input.now})
      returning id, form_id, field_id, student_account_id, original_filename, declared_content_type,
        detected_content_type, byte_size, status, inspection_error_code, created_at
    `;
    return this.mapFile(rows[0]!);
  }

  async listFieldFiles(input: {
    fieldId: string;
    formId: string;
    now: Date;
    studentAccountId: string;
  }): Promise<CollectionFile[]> {
    const rows = await this.database.sql<FileRow[]>`
      select file.id, file.form_id, file.field_id, file.student_account_id, file.original_filename,
        file.declared_content_type, file.detected_content_type, file.byte_size, file.status,
        file.inspection_error_code, file.created_at
      from private.collection_files as file
      left join private.collection_draft_files as draft_file on draft_file.file_id = file.id
      where file.student_account_id = ${input.studentAccountId} and file.form_id = ${input.formId}
        and file.field_id = ${this.database.sql.text(input.fieldId)}
        and (
          draft_file.file_id is not null
          or (file.status = 'pending_upload' and file.created_at > ${input.now} - interval '15 minutes')
        )
      order by file.created_at desc limit ${MAX_FILES_PER_FIELD * 4}
    `;
    return rows.map((row) => this.mapFile(row));
  }

  async finalizeUpload(input: { fileId: string; formId: string; studentAccountId: string }) {
    const rows = await this.database.sql<{ id: string }[]>`
      update private.collection_files
      set status = 'quarantined'
      where id = ${input.fileId} and form_id = ${input.formId}
        and student_account_id = ${input.studentAccountId} and status = 'pending_upload'
      returning id
    `;
    if (rows[0] !== undefined) return 'finalized' as const;
    const existing = await this.database.sql<{ id: string }[]>`
      select id from private.collection_files
      where id = ${input.fileId} and form_id = ${input.formId}
        and student_account_id = ${input.studentAccountId}
        and status in ('quarantined', 'inspecting', 'ready')
    `;
    return existing[0] === undefined ? ('not_found' as const) : ('finalized' as const);
  }

  async findPendingUploadForRetry(input: {
    fileId: string;
    formId: string;
    studentAccountId: string;
  }) {
    const rows = await this.database.sql<{ declared_content_type: string; storage_key: string }[]>`
      select declared_content_type, storage_key from private.collection_files
      where id = ${input.fileId} and form_id = ${input.formId}
        and student_account_id = ${input.studentAccountId} and status = 'pending_upload'
    `;
    const row = rows[0];
    return row === undefined
      ? null
      : { declaredContentType: row.declared_content_type, storageKey: row.storage_key };
  }

  async attachDraftFile(input: {
    fieldId: string;
    fileId: string;
    formId: string;
    studentAccountId: string;
  }) {
    return this.database.sql.begin(async (transaction) => {
      /*
       * Ownership is verified by the where clause rather than trusted from the
       * request, so a file id from another Student or form cannot be attached.
       */
      const owned = await transaction<{ id: string }[]>`
        select id from private.collection_files
        where id = ${input.fileId} and student_account_id = ${input.studentAccountId}
          and form_id = ${input.formId} and field_id = ${transaction.text(input.fieldId)}
      `;
      if (owned[0] === undefined) return 'not_found' as const;

      const draft = await transaction<{ form_id: string }[]>`
        select form_id from private.collection_response_drafts
        where form_id = ${input.formId} and student_account_id = ${input.studentAccountId}
        for update
      `;
      // A draft row must exist first; the selection hangs off it by foreign key.
      if (draft[0] === undefined) return 'forbidden' as const;

      const existing = await transaction<{ file_id: string; position: number }[]>`
        select file_id, position from private.collection_draft_files
        where form_id = ${input.formId} and student_account_id = ${input.studentAccountId}
          and field_id = ${transaction.text(input.fieldId)}
        order by position
      `;
      if (existing.some((row) => row.file_id === input.fileId)) return 'attached' as const;
      if (existing.length >= MAX_FILES_PER_FIELD) return 'too_many' as const;

      await transaction`
        insert into private.collection_draft_files
          (form_id, student_account_id, field_id, file_id, position)
        values (${input.formId}, ${input.studentAccountId}, ${transaction.text(input.fieldId)}, ${input.fileId},
          ${existing.length})
      `;
      return 'attached' as const;
    });
  }

  async detachDraftFile(input: { fileId: string; formId: string; studentAccountId: string }) {
    return this.database.sql.begin(async (transaction) => {
      const removed = await transaction<{ field_id: string }[]>`
        delete from private.collection_draft_files
        where form_id = ${input.formId} and student_account_id = ${input.studentAccountId}
          and file_id = ${input.fileId}
        returning field_id
      `;
      const row = removed[0];
      if (row === undefined) return 'not_found' as const;
      // Positions must stay contiguous from zero for the primary key to hold.
      await this.renumberDraftField(transaction, {
        fieldId: row.field_id,
        formId: input.formId,
        studentAccountId: input.studentAccountId,
      });
      return 'detached' as const;
    });
  }

  /**
   * Claims one waiting file with a bounded lease.
   *
   * The CTE and update are one statement, so the row lock is held only while
   * changing queue state. Expired work is reclaimable after a worker crash;
   * the lease token prevents that stale worker from completing the new claim.
   */
  async claimFileForInspection() {
    const claimed = await this.database.sql<
      {
        declared_content_type: string;
        id: string;
        inspection_lease_id: string;
        original_filename: string;
        storage_key: string;
      }[]
    >`
      with candidate as (
        select id
        from private.collection_files
        where status = 'quarantined'
          or (status = 'inspecting' and inspection_lease_expires_at <= now())
        order by created_at
        limit 1
        for update skip locked
      )
      update private.collection_files as file
      set status = 'inspecting', inspection_lease_id = gen_random_uuid(),
        inspection_lease_expires_at = now() + interval '2 minutes'
      from candidate
      where file.id = candidate.id
      returning file.id, file.storage_key, file.original_filename,
        file.declared_content_type, file.inspection_lease_id
    `;
    const file = claimed[0];
    if (file === undefined) return null;
    return {
      declaredContentType: file.declared_content_type,
      id: file.id,
      leaseId: file.inspection_lease_id,
      originalFilename: file.original_filename,
      storageKey: file.storage_key,
    };
  }

  /**
   * Writes the inspection result. A file becomes `ready` only here, and only
   * with a detected type; the table's own CHECK constraint rejects any other
   * combination, so an incomplete result cannot be stored as a pass.
   */
  async completeInspection(input: {
    detectedContentType: string | null;
    errorCode: string | null;
    fileId: string;
    isAccepted: boolean;
    leaseId: string;
    now: Date;
  }): Promise<void> {
    if (input.isAccepted && input.detectedContentType !== null) {
      await this.database.sql`
        update private.collection_files
        set status = 'ready', detected_content_type = ${input.detectedContentType},
          inspected_at = ${input.now}, inspection_error_code = null,
          inspection_lease_id = null, inspection_lease_expires_at = null
        where id = ${input.fileId} and status = 'inspecting'
          and inspection_lease_id = ${input.leaseId}
      `;
      return;
    }
    /*
     * Anything that is not an accepted result is a failure, including an accepted
     * verdict that arrived without a detected type. Failing closed here means an
     * inspector bug cannot turn into a file the product treats as checked.
     */
    await this.database.sql`
      update private.collection_files
      set status = 'failed', detected_content_type = ${input.detectedContentType},
        inspected_at = ${input.now},
        inspection_error_code = ${input.errorCode ?? 'FILE_INSPECTION_FAILED'},
        inspection_lease_id = null, inspection_lease_expires_at = null
      where id = ${input.fileId} and status = 'inspecting'
        and inspection_lease_id = ${input.leaseId}
    `;
  }

  /**
   * Resolves a file the caller is allowed to read.
   *
   * Authorization is the query. A Student reads only their own files. An
   * Instructor reads only files attached to a submitted response, never a draft
   * selection, because a draft is the Student's private working state.
   */
  async findReadableFile(input: { actorAccountId: string; fileId: string; isInstructor: boolean }) {
    const rows = await this.database.sql<
      { original_filename: string; status: CollectionFileStatus; storage_key: string }[]
    >`
      select file.storage_key, file.original_filename, file.status
      from private.collection_files as file
      where file.id = ${input.fileId}
        and (
          (${input.isInstructor} and exists (
            select 1 from private.collection_submission_files as submitted
            where submitted.file_id = file.id
          ))
          or file.student_account_id = ${input.actorAccountId}
        )
    `;
    const row = rows[0];
    if (row === undefined) return null;
    return {
      originalFilename: row.original_filename,
      status: row.status,
      storageKey: row.storage_key,
    };
  }

  async submit(input: {
    formId: string;
    idempotencyKey: string;
    now: Date;
    studentAccountId: string;
  }) {
    return this.database.sql.begin(async (transaction) => {
      const prior = await transaction<{ id: string; version: number }[]>`
        select id, version from private.collection_submissions
        where form_id = ${input.formId} and student_account_id = ${input.studentAccountId}
          and idempotency_key = ${input.idempotencyKey}
        limit 1
      `;
      if (prior[0] !== undefined) {
        return { submissionId: prior[0].id, version: prior[0].version };
      }
      const states = await transaction<
        (ResponseWriteState & { draft_answers: unknown; fields: unknown; form_version: number })[]
      >`
        select draft.answers as draft_answers, form.fields, form.version as form_version,
          obligation.status, form.status as form_status,
          membership.status as membership_status, round.status as round_status
        from public.collection_obligations as obligation
        join public.collection_forms as form on form.id = obligation.form_id
        join public.collection_groups as collection_group on collection_group.id = form.group_id
        join public.collection_rounds as round on round.id = collection_group.round_id
        join public.collection_group_memberships as membership
          on membership.group_id = collection_group.id and membership.student_account_id = obligation.student_account_id
        left join private.collection_response_drafts as draft
          on draft.form_id = obligation.form_id and draft.student_account_id = obligation.student_account_id
        where obligation.form_id = ${input.formId} and obligation.student_account_id = ${input.studentAccountId}
        for update of obligation, round
      `;
      const state = states[0];
      if (state === undefined || !isResponseWritable(state)) return 'forbidden' as const;
      if (state.draft_answers === null) return 'missing_draft' as const;

      const fields = this.fields(state.fields);
      const answers = reconcileDraftAnswers(fields, this.answers(state.draft_answers));
      const answerError = findAnswerError(fields, answers, { isComplete: true });
      if (answerError !== null) {
        return {
          code: answerError.code,
          fieldId: answerError.fieldId,
          outcome: 'invalid' as const,
        };
      }

      /*
       * Files are revalidated here against current rows, not against what the
       * browser selected: a file that has not passed inspection is refused, so an
       * unscanned upload can never become an accepted document.
       */
      const allSelected = await this.loadDraftFieldFiles(transaction, {
        formId: input.formId,
        studentAccountId: input.studentAccountId,
      });
      const activeFileFieldIds = new Set(
        fields.filter((field) => field.type === 'file_upload').map((field) => field.id),
      );
      const selected = new Map(
        [...allSelected].filter(([fieldId]) => activeFileFieldIds.has(fieldId)),
      );
      const fileError = findSubmissionFileError(
        fields
          .filter((field) => field.type === 'file_upload')
          .map((field) => ({ field, files: selected.get(field.id) ?? [] })),
        { formId: input.formId, studentAccountId: input.studentAccountId },
      );
      if (fileError !== null) {
        return { code: fileError.code, fieldId: fileError.fieldId, outcome: 'invalid' as const };
      }

      const versions = await transaction<{ next_version: number }[]>`
        select (coalesce(max(version), 0) + 1)::int as next_version from private.collection_submissions
        where form_id = ${input.formId} and student_account_id = ${input.studentAccountId}
      `;
      const version = versions[0]!.next_version;
      const submissions = await transaction<{ id: string }[]>`
        insert into private.collection_submissions
          (form_id, student_account_id, idempotency_key, version, answers,
            form_version, form_fields, submitted_at)
        values (${input.formId}, ${input.studentAccountId}, ${input.idempotencyKey}, ${version},
          ${transaction.json(answers)}, ${state.form_version}, ${transaction.json(fields)}, ${input.now})
        returning id
      `;
      const submissionId = submissions[0]!.id;
      // Copying the selection freezes it: a later draft change cannot rewrite history.
      for (const [fieldId, files] of selected) {
        for (const [position, file] of files.entries()) {
          await transaction`
            insert into private.collection_submission_files (submission_id, field_id, file_id, position)
            values (${submissionId}, ${transaction.text(fieldId)}, ${file.id}, ${position})
          `;
        }
      }
      await transaction`
        update public.collection_obligations
        set status = 'awaiting_checking', latest_submission_id = ${submissionId},
          first_submitted_at = coalesce(first_submitted_at, ${input.now})
        where form_id = ${input.formId} and student_account_id = ${input.studentAccountId}
      `;
      return { submissionId, version };
    });
  }

  async checkSubmission(input: {
    actorAccountId: string;
    decision: 'changes_required' | 'passed';
    expectedSubmissionId: string;
    now: Date;
    reason: string | null;
  }): Promise<'checked' | 'not_found' | 'round_closed' | 'stale'> {
    return this.database.sql.begin(async (transaction) => {
      const round = await transaction<{ status: string }[]>`
        select collection_round.status
        from private.collection_submissions as submission
        join public.collection_forms as form on form.id = submission.form_id
        join public.collection_groups as collection_group on collection_group.id = form.group_id
        join public.collection_rounds as collection_round on collection_round.id = collection_group.round_id
        where submission.id = ${input.expectedSubmissionId}
        for update of collection_round
      `;
      if (round[0]?.status === 'closed') return 'round_closed';
      const rows = await transaction<{ form_id: string; student_account_id: string }[]>`
        update public.collection_obligations
        set status = ${input.decision}
        where latest_submission_id = ${input.expectedSubmissionId} and status = 'awaiting_checking'
        returning form_id, student_account_id
      `;
      if (rows.length === 0) {
        const exists = await transaction<{ present: boolean }[]>`
          select exists(select 1 from private.collection_submissions where id = ${input.expectedSubmissionId}) as present
        `;
        return exists[0]?.present === true ? 'stale' : 'not_found';
      }
      await transaction`
        insert into private.collection_checking_events
          (submission_id, instructor_account_id, decision, reason, occurred_at)
        values (${input.expectedSubmissionId}, ${input.actorAccountId}, ${input.decision}, ${input.reason}, ${input.now})
      `;
      /*
       * Keyed by the submission, not by the decision, so re-checking a later
       * version notifies again while a retry of this same check does not.
       */
      const decided = rows[0];
      if (decided !== undefined) {
        await this.insertNotifications(transaction, {
          formId: decided.form_id,
          kind: input.decision === 'passed' ? 'submission_passed' : 'changes_requested',
          now: input.now,
          studentAccountIds: [decided.student_account_id],
          subjectKey: input.expectedSubmissionId,
        });
      }
      return 'checked';
    });
  }

  /**
   * Writes notification rows inside the caller's transaction.
   *
   * No eligibility check here: the caller is already holding the rows that
   * caused the event, so the round is open and the membership is current by
   * construction. `on conflict do nothing` keeps a retried write idempotent.
   */
  private async insertNotifications(
    transaction: DatabaseClient['sql'],
    input: {
      formId: string;
      kind: CollectionNotificationKind;
      now: Date;
      studentAccountIds: string[];
      subjectKey: string;
    },
  ): Promise<void> {
    if (input.studentAccountIds.length === 0) return;
    await transaction`
      insert into private.collection_notifications
        (form_id, student_account_id, kind, subject_key, created_at)
      select ${input.formId}, recipient, ${input.kind}, ${input.subjectKey}, ${input.now}
      from unnest(${input.studentAccountIds}::uuid[]) as recipient
      on conflict do nothing
    `;
  }

  private async renumberDraftField(
    transaction: DatabaseClient['sql'],
    input: { fieldId: string; formId: string; studentAccountId: string },
  ): Promise<void> {
    await transaction`
      with ordered as (
        select file_id, row_number() over (order by position) - 1 as next_position
        from private.collection_draft_files
        where form_id = ${input.formId} and student_account_id = ${input.studentAccountId}
          and field_id = ${transaction.text(input.fieldId)}
      )
      update private.collection_draft_files as draft_file
      set position = ordered.next_position
      from ordered
      where draft_file.form_id = ${input.formId}
        and draft_file.student_account_id = ${input.studentAccountId}
        and draft_file.field_id = ${transaction.text(input.fieldId)}
        and draft_file.file_id = ordered.file_id
        and draft_file.position <> ordered.next_position
    `;
  }

  private async loadDraftFieldFiles(
    transaction: DatabaseClient['sql'],
    input: { formId: string; studentAccountId: string },
  ): Promise<Map<string, CollectionFile[]>> {
    const rows = await transaction<(FileRow & { selection_field_id: string })[]>`
      select file.id, file.form_id, file.field_id, file.student_account_id, file.original_filename,
        file.declared_content_type, file.detected_content_type, file.byte_size, file.status,
        file.inspection_error_code, file.created_at, draft_file.field_id as selection_field_id
      from private.collection_draft_files as draft_file
      join private.collection_files as file on file.id = draft_file.file_id
      where draft_file.form_id = ${input.formId}
        and draft_file.student_account_id = ${input.studentAccountId}
      order by draft_file.field_id, draft_file.position
    `;
    const byField = new Map<string, CollectionFile[]>();
    for (const row of rows) {
      const files = byField.get(row.selection_field_id) ?? [];
      files.push(this.mapFile(row));
      byField.set(row.selection_field_id, files);
    }
    return byField;
  }

  /** Loads draft and submitted file selections for a page of obligations at once. */
  private async loadObligationFiles(
    studentAccountId: string,
    formIds: string[],
    submissionIds: string[],
  ): Promise<{
    draft: Map<string, DraftFileSelection>;
    submitted: Map<string, DraftFileSelection>;
  }> {
    const draftRows = await this.database.sql<
      (FileRow & { selection_field_id: string; selection_form_id: string })[]
    >`
      select file.id, file.form_id, file.field_id, file.student_account_id, file.original_filename,
        file.declared_content_type, file.detected_content_type, file.byte_size, file.status,
        file.inspection_error_code, file.created_at, draft_file.field_id as selection_field_id,
        draft_file.form_id as selection_form_id
      from private.collection_draft_files as draft_file
      join private.collection_files as file on file.id = draft_file.file_id
      where draft_file.student_account_id = ${studentAccountId}
        and draft_file.form_id = any(${formIds}::uuid[])
      order by draft_file.form_id, draft_file.field_id, draft_file.position
    `;

    const submitted = await this.loadSubmittedFiles(submissionIds);

    const draft = new Map<string, DraftFileSelection>();
    for (const row of draftRows) {
      const selection = draft.get(row.selection_form_id) ?? {};
      selection[row.selection_field_id] = [
        ...(selection[row.selection_field_id] ?? []),
        this.mapFile(row),
      ];
      draft.set(row.selection_form_id, selection);
    }
    return { draft, submitted };
  }

  /**
   * Submitted files for any set of submissions, keyed by submission id.
   *
   * Deliberately not scoped to one Student: the review queue loads many
   * Students at once, and a submission id already identifies its owner.
   */
  private async loadSubmittedFiles(
    submissionIds: string[],
  ): Promise<Map<string, DraftFileSelection>> {
    const submitted = new Map<string, DraftFileSelection>();
    if (submissionIds.length === 0) return submitted;

    const rows = await this.database.sql<
      (FileRow & { selection_field_id: string; submission_id: string })[]
    >`
      select file.id, file.form_id, file.field_id, file.student_account_id,
        file.original_filename, file.declared_content_type, file.detected_content_type,
        file.byte_size, file.status, file.inspection_error_code, file.created_at,
        submission_file.field_id as selection_field_id, submission_file.submission_id
      from private.collection_submission_files as submission_file
      join private.collection_files as file on file.id = submission_file.file_id
      where submission_file.submission_id = any(${submissionIds}::uuid[])
      order by submission_file.submission_id, submission_file.field_id, submission_file.position
    `;
    for (const row of rows) {
      const selection = submitted.get(row.submission_id) ?? {};
      selection[row.selection_field_id] = [
        ...(selection[row.selection_field_id] ?? []),
        this.mapFile(row),
      ];
      submitted.set(row.submission_id, selection);
    }
    return submitted;
  }

  /**
   * Counts unfinished obligations across every form in one round.
   *
   * Takes the client so the closing transaction can read the same counts it
   * then stores, under the round's own row lock.
   */
  private async readRoundPendingWork(
    client: DatabaseClient['sql'],
    roundId: string,
  ): Promise<RoundPendingWork> {
    const rows = await client<
      { awaiting_checking: number; changes_required: number; not_submitted: number }[]
    >`
      select
        count(*) filter (where obligation.status = 'not_submitted')::int as not_submitted,
        count(*) filter (where obligation.status = 'awaiting_checking')::int as awaiting_checking,
        count(*) filter (where obligation.status = 'changes_required')::int as changes_required
      from public.collection_obligations as obligation
      join public.collection_forms as form on form.id = obligation.form_id
      join public.collection_groups as collection_group on collection_group.id = form.group_id
      where collection_group.round_id = ${roundId}
    `;
    const row = rows[0];
    return {
      awaitingChecking: row?.awaiting_checking ?? 0,
      changesRequired: row?.changes_required ?? 0,
      notSubmitted: row?.not_submitted ?? 0,
    };
  }

  /**
   * Decisions recorded against each submitted version, oldest first.
   *
   * The Instructor is identified by display name only: history is something to
   * read, not a directory of Account identifiers the reader could act on.
   */
  private async loadCheckingEvents(
    submissionIds: string[],
  ): Promise<Map<string, CollectionSubmissionHistoryEntry['checkingEvents']>> {
    const bySubmission = new Map<string, CollectionSubmissionHistoryEntry['checkingEvents']>();
    if (submissionIds.length === 0) return bySubmission;

    const rows = await this.database.sql<
      {
        decision: 'changes_required' | 'passed';
        first_name_th: string;
        last_name_th: string;
        occurred_at: Date;
        reason: string | null;
        submission_id: string;
      }[]
    >`
      select event.submission_id, event.decision, event.reason, event.occurred_at,
        person_name.first_name_th, person_name.last_name_th
      from private.collection_checking_events as event
      join public.accounts as account on account.id = event.instructor_account_id
      join private.person_names as person_name on person_name.person_id = account.person_id
      where event.submission_id = any(${submissionIds}::uuid[])
      order by event.submission_id, event.occurred_at
    `;
    for (const row of rows) {
      const events = bySubmission.get(row.submission_id) ?? [];
      events.push({
        decision: row.decision,
        instructorName: `${row.first_name_th} ${row.last_name_th}`.trim(),
        occurredAt: row.occurred_at,
        reason: row.reason,
      });
      bySubmission.set(row.submission_id, events);
    }
    return bySubmission;
  }

  private mapForm(row: FormRow): CollectionForm {
    return {
      createdFromTemplateId: row.created_from_template_id,
      deadlineAt: row.deadline_at,
      description: row.description,
      fields: this.fields(row.fields),
      groupId: row.group_id,
      id: row.id,
      status: row.status,
      title: row.title,
      version: row.version,
    };
  }

  private mapTemplate(row: TemplateRow): CollectionFormTemplate {
    return {
      createdAt: row.created_at,
      description: row.description,
      fields: this.fields(row.fields),
      id: row.id,
      name: row.name,
      updatedAt: row.updated_at,
      version: row.version,
    };
  }

  private mapFile(row: FileRow): CollectionFile {
    return {
      // bigint arrives as a string from the driver; the column caps it well below 2^53.
      byteSize: Number(row.byte_size),
      createdAt: row.created_at,
      declaredContentType: row.declared_content_type,
      detectedContentType: row.detected_content_type,
      fieldId: row.field_id,
      formId: row.form_id,
      id: row.id,
      inspectionErrorCode: row.inspection_error_code,
      originalFilename: row.original_filename,
      status: row.status,
      studentAccountId: row.student_account_id,
    };
  }

  private fields(value: unknown): CollectionField[] {
    if (!Array.isArray(value)) throw new Error('COLLECTION_FIELDS_CORRUPT');
    return value as CollectionField[];
  }

  private answers(value: unknown): CollectionAnswers {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as CollectionAnswers;
  }
}
