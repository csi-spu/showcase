import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../auth/infrastructure/database.client';
import { findAnswerError } from '../application/collection-field';
import { findSubmissionFileError } from '../application/collection-files';
import type {
  CollectionAnswers,
  CollectionField,
  CollectionFile,
  CollectionFileStatus,
  CollectionForm,
  CollectionFormTemplate,
  CollectionFormsRepository,
  CollectionReviewEntry,
  DraftFileSelection,
  StudentObligation,
} from '../application/collection-forms.ports';
import type { ReusableValueCandidate } from '../application/reusable-values';

const MAX_FILES_PER_FIELD = 5;

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
  first_name_th: string;
  last_name_th: string;
  obligation_status: CollectionReviewEntry['status'];
  student_account_id: string;
  submission_id: string | null;
  submission_version: number | null;
  submitted_at: Date | null;
}

interface ObligationRow extends FormRow {
  answers: unknown;
  checking_reason: string | null;
  draft_answers: unknown;
  draft_updated_at: Date | null;
  draft_version: number | null;
  first_name_th: string;
  last_name_th: string;
  obligation_status: StudentObligation['status'];
  submission_id: string | null;
  submission_version: number | null;
  submitted_at: Date | null;
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

  /**
   * Replaces a Draft form's whole definition.
   *
   * The status is rechecked under a row lock so a form cannot be edited by one
   * request while another opens it and freezes the structure.
   */
  async updateDraftForm(input: {
    actorAccountId: string;
    deadlineAt: Date | null;
    description: string;
    fields: CollectionField[];
    formId: string;
    now: Date;
    title: string;
  }) {
    return this.database.sql.begin(async (transaction) => {
      const rows = await transaction<{ round_status: string; status: string }[]>`
        select form.status, round.status as round_status
        from public.collection_forms as form
        join public.collection_groups as collection_group on collection_group.id = form.group_id
        join public.collection_rounds as round on round.id = collection_group.round_id
        where form.id = ${input.formId}
        for update of form
      `;
      const row = rows[0];
      if (row === undefined) return 'not_found' as const;
      if (row.round_status === 'closed') return 'round_closed' as const;
      if (row.status !== 'draft') return 'not_draft' as const;

      const updated = await transaction<FormRow[]>`
        update public.collection_forms
        set title = ${input.title}, description = ${input.description},
          fields = ${transaction.json(input.fields)}, deadline_at = ${input.deadlineAt},
          version = version + 1
        where id = ${input.formId}
        returning id, group_id, title, description, status, fields, deadline_at, version,
        created_from_template_id
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
        for update of form
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
      await transaction`
        insert into public.collection_obligations (form_id, student_account_id, assigned_at)
        select ${input.formId}, student_account_id, ${input.now}
        from public.collection_group_memberships
        where group_id = ${row.group_id} and status = 'current'
        on conflict do nothing
      `;
      return this.mapForm({ ...row, status: 'open', version: row.version + 1 });
    });
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
        submission.id as submission_id, submission.answers,
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
        latestCheckingReason:
          row.obligation_status === 'changes_required' ? row.checking_reason : null,
        latestSubmission:
          row.submission_id === null || row.submission_version === null || row.submitted_at === null
            ? null
            : {
                answers: this.answers(row.answers),
                files: files.get(row.submission_id) ?? {},
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

  async listStudentObligations(studentAccountId: string): Promise<StudentObligation[]> {
    const rows = await this.database.sql<ObligationRow[]>`
      select form.id, form.group_id, form.title, form.description, form.status, form.fields,
        form.deadline_at, form.version, form.created_from_template_id,
        obligation.status as obligation_status,
        draft.answers as draft_answers, draft.version as draft_version, draft.updated_at as draft_updated_at,
        submission.id as submission_id, submission.answers, submission.version as submission_version,
        submission.submitted_at, checking.reason as checking_reason,
        person_name.first_name_th, person_name.last_name_th
      from public.collection_obligations as obligation
      join public.collection_forms as form on form.id = obligation.form_id
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
      form: this.mapForm(row),
      latestCheckingReason:
        row.obligation_status === 'changes_required' ? row.checking_reason : null,
      latestSubmission:
        row.submission_id === null || row.submission_version === null || row.submitted_at === null
          ? null
          : {
              answers: this.answers(row.answers),
              files: files.submitted.get(row.submission_id) ?? {},
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
      select submission.answers, form.fields, submission.submitted_at
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
      const eligible = await transaction<
        { status: StudentObligation['status']; form_status: string; membership_status: string }[]
      >`
        select obligation.status, form.status as form_status, membership.status as membership_status
        from public.collection_obligations as obligation
        join public.collection_forms as form on form.id = obligation.form_id
        join public.collection_groups as collection_group on collection_group.id = form.group_id
        join public.collection_group_memberships as membership
          on membership.group_id = collection_group.id and membership.student_account_id = obligation.student_account_id
        where obligation.form_id = ${input.formId} and obligation.student_account_id = ${input.studentAccountId}
      `;
      const state = eligible[0];
      if (
        state === undefined ||
        state.form_status !== 'open' ||
        state.membership_status !== 'current' ||
        !['not_submitted', 'changes_required'].includes(state.status)
      )
        return 'forbidden' as const;
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
   * Registers an upload slot. The row is created quarantined and stays that way
   * until an inspection records a result, so nothing here can make a file usable.
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
          declared_content_type, byte_size, created_at)
      values (${input.formId}, ${input.fieldId}, ${input.studentAccountId}, ${input.storageKey},
        ${input.filename}, ${input.declaredContentType}, ${input.byteSize}, ${input.now})
      returning id, form_id, field_id, student_account_id, original_filename, declared_content_type,
        detected_content_type, byte_size, status, inspection_error_code, created_at
    `;
    return this.mapFile(rows[0]!);
  }

  async listFieldFiles(input: {
    fieldId: string;
    formId: string;
    studentAccountId: string;
  }): Promise<CollectionFile[]> {
    const rows = await this.database.sql<FileRow[]>`
      select id, form_id, field_id, student_account_id, original_filename, declared_content_type,
        detected_content_type, byte_size, status, inspection_error_code, created_at
      from private.collection_files
      where student_account_id = ${input.studentAccountId} and form_id = ${input.formId}
        and field_id = ${input.fieldId}
      order by created_at desc limit ${MAX_FILES_PER_FIELD * 4}
    `;
    return rows.map((row) => this.mapFile(row));
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
          and form_id = ${input.formId} and field_id = ${input.fieldId}
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
          and field_id = ${input.fieldId}
        order by position
      `;
      if (existing.some((row) => row.file_id === input.fileId)) return 'attached' as const;
      if (existing.length >= MAX_FILES_PER_FIELD) return 'too_many' as const;

      await transaction`
        insert into private.collection_draft_files
          (form_id, student_account_id, field_id, file_id, position)
        values (${input.formId}, ${input.studentAccountId}, ${input.fieldId}, ${input.fileId},
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
        {
          draft_answers: unknown;
          fields: unknown;
          status: StudentObligation['status'];
          form_status: string;
          membership_status: string;
        }[]
      >`
        select draft.answers as draft_answers, form.fields, obligation.status, form.status as form_status,
          membership.status as membership_status
        from public.collection_obligations as obligation
        join public.collection_forms as form on form.id = obligation.form_id
        join public.collection_groups as collection_group on collection_group.id = form.group_id
        join public.collection_group_memberships as membership
          on membership.group_id = collection_group.id and membership.student_account_id = obligation.student_account_id
        left join private.collection_response_drafts as draft
          on draft.form_id = obligation.form_id and draft.student_account_id = obligation.student_account_id
        where obligation.form_id = ${input.formId} and obligation.student_account_id = ${input.studentAccountId}
        for update of obligation
      `;
      const state = states[0];
      if (
        state === undefined ||
        state.form_status !== 'open' ||
        state.membership_status !== 'current' ||
        !['not_submitted', 'changes_required'].includes(state.status)
      )
        return 'forbidden' as const;
      if (state.draft_answers === null) return 'missing_draft' as const;

      const fields = this.fields(state.fields);
      const answers = this.answers(state.draft_answers);
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
      const selected = await this.loadDraftFieldFiles(transaction, {
        formId: input.formId,
        studentAccountId: input.studentAccountId,
      });
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
          (form_id, student_account_id, idempotency_key, version, answers, submitted_at)
        values (${input.formId}, ${input.studentAccountId}, ${input.idempotencyKey}, ${version}, ${transaction.json(state.draft_answers)}, ${input.now})
        returning id
      `;
      const submissionId = submissions[0]!.id;
      // Copying the selection freezes it: a later draft change cannot rewrite history.
      for (const [fieldId, files] of selected) {
        for (const [position, file] of files.entries()) {
          await transaction`
            insert into private.collection_submission_files (submission_id, field_id, file_id, position)
            values (${submissionId}, ${fieldId}, ${file.id}, ${position})
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
      return 'checked';
    });
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
          and field_id = ${input.fieldId}
      )
      update private.collection_draft_files as draft_file
      set position = ordered.next_position
      from ordered
      where draft_file.form_id = ${input.formId}
        and draft_file.student_account_id = ${input.studentAccountId}
        and draft_file.field_id = ${input.fieldId}
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
