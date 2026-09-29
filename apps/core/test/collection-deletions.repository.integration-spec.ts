import { ConfigService } from '@nestjs/config';
import { DatabaseClient } from '../src/modules/auth/infrastructure/database.client';
import type { CollectionField } from '../src/modules/collection-forms/application/collection-forms.ports';
import { PostgresCollectionFormsRepository } from '../src/modules/collection-forms/infrastructure/postgres-collection-forms.repository';
import { PostgresCollectionDeletionsRepository } from '../src/modules/collection-deletions/infrastructure/postgres-collection-deletions.repository';
import { PostgresCollectionGroupsRepository } from '../src/modules/collection-groups/infrastructure/postgres-collection-groups.repository';
import { PostgresCollectionOverviewRepository } from '../src/modules/collection-overview/infrastructure/postgres-collection-overview.repository';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const INSTRUCTOR_PERSON = '5b000000-0000-4000-8000-000000000001';
const INSTRUCTOR = '5b000000-0000-4000-8000-000000000002';
const STUDENT_PERSON = '5b000000-0000-4000-8000-000000000003';
const STUDENT = '5b000000-0000-4000-8000-000000000004';
const NOW = new Date('2026-09-30T10:00:00.000Z');

const TEXT_FIELD: CollectionField = {
  description: '',
  id: 'company',
  label: 'บริษัท',
  required: true,
  type: 'short_text',
};

describe('PostgresCollectionDeletionsRepository integration', () => {
  const database = new DatabaseClient(new ConfigService({ DATABASE_URL }));
  const deletions = new PostgresCollectionDeletionsRepository(database);
  const forms = new PostgresCollectionFormsRepository(database);
  const groups = new PostgresCollectionGroupsRepository(database);
  const overview = new PostgresCollectionOverviewRepository(database);

  beforeAll(async () => {
    await cleanup();
    await database.sql`
      insert into public.people (id) values (${INSTRUCTOR_PERSON}), (${STUDENT_PERSON})
    `;
    await database.sql`
      insert into public.students (person_id, entry_year, access_ends_academic_year)
      values (${STUDENT_PERSON}, 2569, 2576)
    `;
    await database.sql`
      insert into public.accounts (id, person_id, provider_user_id, credential_state, created_at, updated_at)
      values (${INSTRUCTOR}, ${INSTRUCTOR_PERSON}, ${INSTRUCTOR_PERSON}, 'set', ${NOW}, ${NOW}),
        (${STUDENT}, ${STUDENT_PERSON}, ${STUDENT_PERSON}, 'set', ${NOW}, ${NOW})
    `;
    await database.sql`
      insert into public.account_roles (account_id, role)
      values (${INSTRUCTOR}, 'instructor'), (${STUDENT}, 'student')
    `;
    await database.sql`
      insert into private.person_names (person_id, first_name_th, last_name_th)
      values (${INSTRUCTOR_PERSON}, 'ผู้สอน', 'ทดสอบ'), (${STUDENT_PERSON}, 'นักศึกษา', 'ทดสอบ')
    `;
  });

  afterAll(async () => {
    await cleanup();
    await database.onApplicationShutdown();
  });

  beforeEach(cleanupCollectionData);

  it('removes a round with everything beneath it and counts what it removed', async () => {
    const roundId = await createRound('รอบลบ');
    const groupA = await createGroup(roundId, 'กลุ่มเอ', [STUDENT]);
    const groupB = await createGroup(roundId, 'กลุ่มบี', []);
    const submittedForm = await createOpenForm(groupA, 'ส่งแล้ว');
    await createOpenForm(groupA, 'ยังไม่ส่ง');
    const formB = await createOpenForm(groupB, 'แบบฟอร์มบี');
    await submit(submittedForm, '5b000000-0000-4000-8000-000000000100');

    const expectedCounts = {
      assignedStudentCount: 1,
      formCount: 3,
      groupCount: 2,
      submittedStudentCount: 1,
    };
    await expect(deletions.previewDeletion({ id: roundId, kind: 'round' })).resolves.toEqual({
      blockedReason: null,
      counts: expectedCounts,
      group: null,
      kind: 'round',
      name: 'รอบลบ',
      round: null,
    });

    await expect(
      deletions.deleteItem({
        actorAccountId: INSTRUCTOR,
        confirmationName: 'รอบ',
        now: NOW,
        target: { id: roundId, kind: 'round' },
      }),
    ).resolves.toEqual({ outcome: 'confirmation_mismatch' });
    const deletionId = await deleteItem({ id: roundId, kind: 'round' }, '  รอบลบ  ');

    await expect(stampedIds(deletionId)).resolves.toEqual({
      forms: 3,
      groups: [groupA, groupB].sort(),
      rounds: [roundId],
    });
    await expect(deletions.previewDeletion({ id: roundId, kind: 'round' })).resolves.toBeNull();
    await expect(
      deletions.deleteItem({
        actorAccountId: INSTRUCTOR,
        confirmationName: 'รอบลบ',
        now: NOW,
        target: { id: roundId, kind: 'round' },
      }),
    ).resolves.toEqual({ outcome: 'not_found' });

    const log = await deletions.listDeletions({ before: null, limit: 20 });
    expect(log.entries.find((entry) => entry.id === deletionId)).toMatchObject({
      counts: expectedCounts,
      deletedByName: 'ผู้สอน ทดสอบ',
      kind: 'round',
      name: 'รอบลบ',
      restore: null,
      restoreAvailability: { status: 'available' },
      roundName: null,
    });

    /* Every Instructor and Student read hides the removed items. */
    await expect(groups.findRound(roundId)).resolves.toBeNull();
    await expect(groups.findGroup(groupA)).resolves.toBeNull();
    await expect(forms.getForm(formB)).resolves.toBeNull();
    await expect(forms.listGroupForms(groupA)).resolves.toEqual([]);
    await expect(forms.listStudentObligations(STUDENT, NOW)).resolves.toEqual([]);
    const options = await overview.getFilterOptions({ groupLimit: 200, roundLimit: 200 });
    expect(options.rounds.map((round) => round.id)).not.toContain(roundId);
    expect(options.groups.map((group) => group.id)).not.toContain(groupA);
  });

  it('keeps a closed round whole: its items stay put until the round is deleted or reopened', async () => {
    const roundId = await createRound('รอบปิด');
    const groupId = await createGroup(roundId, 'กลุ่ม', [STUDENT]);
    const formId = await createOpenForm(groupId, 'แบบฟอร์ม');
    const formDeletion = await deleteItem({ id: formId, kind: 'form' }, 'แบบฟอร์ม');
    await closeRound(roundId);

    await expect(deletions.previewDeletion({ id: groupId, kind: 'group' })).resolves.toMatchObject({
      blockedReason: 'round_closed',
      round: { id: roundId, name: 'รอบปิด' },
    });
    await expect(
      deletions.deleteItem({
        actorAccountId: INSTRUCTOR,
        confirmationName: 'กลุ่ม',
        now: NOW,
        target: { id: groupId, kind: 'group' },
      }),
    ).resolves.toEqual({ outcome: 'round_closed' });
    await expect(restore(formDeletion)).resolves.toEqual({
      availability: { status: 'round_closed' },
      outcome: 'unavailable',
    });

    const roundDeletion = await deleteItem({ id: roundId, kind: 'round' }, 'รอบปิด');
    await expect(restore(roundDeletion)).resolves.toEqual({ outcome: 'restored' });
    await expect(groups.findRound(roundId)).resolves.toMatchObject({ status: 'closed' });
    /* The form was removed by its own, earlier deletion, so it stays removed. */
    await expect(forms.getForm(formId)).resolves.toBeNull();
  });

  it('restores only the rows its own deletion removed, outermost first', async () => {
    const roundId = await createRound('รอบ');
    const groupId = await createGroup(roundId, 'กลุ่มแม่', [STUDENT]);
    const earlierForm = await createOpenForm(groupId, 'ลบก่อน');
    const laterForm = await createOpenForm(groupId, 'ลบพร้อมกลุ่ม');
    const formDeletion = await deleteItem({ id: earlierForm, kind: 'form' }, 'ลบก่อน');
    const groupDeletion = await deleteItem({ id: groupId, kind: 'group' }, 'กลุ่มแม่');

    await expect(stampedIds(groupDeletion)).resolves.toEqual({
      forms: 1,
      groups: [groupId],
      rounds: [],
    });
    await expect(restore(formDeletion)).resolves.toEqual({
      availability: { ancestorKind: 'group', ancestorName: 'กลุ่มแม่', status: 'ancestor_deleted' },
      outcome: 'unavailable',
    });

    await expect(restore(groupDeletion)).resolves.toEqual({ outcome: 'restored' });
    await expect(forms.getForm(laterForm)).resolves.toMatchObject({ status: 'open' });
    await expect(forms.getForm(earlierForm)).resolves.toBeNull();

    await expect(restore(formDeletion)).resolves.toEqual({ outcome: 'restored' });
    await expect(forms.getForm(earlierForm)).resolves.toMatchObject({ status: 'open' });
    await expect(restore(formDeletion)).resolves.toEqual({
      availability: { status: 'already_restored' },
      outcome: 'unavailable',
    });

    const log = await deletions.listDeletions({ before: null, limit: 20 });
    expect(log.entries.find((entry) => entry.id === formDeletion)).toMatchObject({
      groupName: 'กลุ่มแม่',
      restore: { reason: 'ลบผิด', restoredByName: 'ผู้สอน ทดสอบ' },
      restoreAvailability: { status: 'already_restored' },
      roundName: 'รอบ',
    });
  });

  it('pages the log newest first without skipping entries that share a timestamp', async () => {
    /* Far-future times keep other fixtures' deletions off these pages. */
    const at = new Date('2099-01-01T00:00:00.000Z');
    const roundId = await createRound('รอบ');
    const groupId = await createGroup(roundId, 'กลุ่ม', []);
    const first = await deleteItem(
      { id: await createOpenForm(groupId, 'หนึ่ง'), kind: 'form' },
      'หนึ่ง',
      at,
    );
    const second = await deleteItem(
      { id: await createOpenForm(groupId, 'สอง'), kind: 'form' },
      'สอง',
      at,
    );
    const third = await deleteItem(
      { id: await createOpenForm(groupId, 'สาม'), kind: 'form' },
      'สาม',
      new Date(at.getTime() + 1_000),
    );

    const page = await deletions.listDeletions({ before: null, limit: 2 });
    expect(page.hasMore).toBe(true);
    expect(page.entries[0]?.id).toBe(third);
    const last = page.entries[1]!;
    const next = await deletions.listDeletions({
      before: { deletedAtMicros: last.deletedAtMicros, deletionId: last.id },
      limit: 2,
    });
    expect([last.id, next.entries[0]?.id].sort()).toEqual([first, second].sort());
  });

  it('fails an export the builder claims after its group was deleted, and restoring does not requeue it', async () => {
    const roundId = await createRound('รอบ');
    const groupId = await createGroup(roundId, 'กลุ่ม', [STUDENT]);
    const formId = await createOpenForm(groupId, 'แบบฟอร์ม');
    const job = await forms.createExport({
      formIds: [formId],
      groupId,
      kind: 'excel',
      maxForms: 30,
      maxStudents: 1_000,
      now: NOW,
      requestedByAccountId: INSTRUCTOR,
    });
    if (job === null) throw new Error('expected export');
    const groupDeletion = await deleteItem({ id: groupId, kind: 'group' }, 'กลุ่ม');

    await expect(
      forms.claimExportForBuilding({ leaseSeconds: 600, maxAttempts: 3, now: NOW }),
    ).resolves.toBe('group_deleted');
    const rows = await database.sql<{ error_code: string | null; status: string }[]>`
      select status, error_code from private.collection_exports where id = ${job.id}
    `;
    expect(rows[0]).toEqual({ error_code: 'COLLECTION_EXPORT_GROUP_DELETED', status: 'failed' });

    await expect(restore(groupDeletion)).resolves.toEqual({ outcome: 'restored' });
    await expect(
      forms.claimExportForBuilding({ leaseSeconds: 600, maxAttempts: 3, now: NOW }),
    ).resolves.toBeNull();
    await expect(forms.getExport(job.id)).resolves.toMatchObject({ status: 'failed' });
  });

  it('refuses Student writes and new forms beneath a deleted item', async () => {
    const roundId = await createRound('รอบ');
    const groupId = await createGroup(roundId, 'กลุ่ม', [STUDENT]);
    const formId = await createOpenForm(groupId, 'แบบฟอร์ม');
    await deleteItem({ id: groupId, kind: 'group' }, 'กลุ่ม');

    await expect(
      forms.saveDraft({
        answers: { company: 'CSI' },
        expectedVersion: 0,
        formId,
        now: NOW,
        studentAccountId: STUDENT,
      }),
    ).resolves.toBe('not_found');
    await expect(
      forms.submit({
        formId,
        idempotencyKey: '5b000000-0000-4000-8000-000000000200',
        now: NOW,
        studentAccountId: STUDENT,
      }),
    ).resolves.toBe('not_found');
    await expect(
      forms.createUpload({
        byteSize: 1_000,
        declaredContentType: 'application/pdf',
        fieldId: 'company',
        filename: 'late.pdf',
        formId,
        now: NOW,
        storageKey: 'collection-files/5b000000-0000-4000-8000-000000000201',
        studentAccountId: STUDENT,
      }),
    ).resolves.toBeNull();
    await expect(
      forms.createForm({
        actorAccountId: INSTRUCTOR,
        createdFromTemplateId: null,
        deadlineAt: null,
        description: '',
        fields: [TEXT_FIELD],
        groupId,
        now: NOW,
        title: 'ใหม่',
      }),
    ).resolves.toBeNull();
  });

  async function deleteItem(
    target: { id: string; kind: 'form' | 'group' | 'round' },
    confirmationName: string,
    now: Date = NOW,
  ): Promise<string> {
    const result = await deletions.deleteItem({
      actorAccountId: INSTRUCTOR,
      confirmationName,
      now,
      target,
    });
    if (result.outcome !== 'deleted') throw new Error(`expected deletion, got ${result.outcome}`);
    return result.deletionId;
  }

  function restore(deletionId: string) {
    return deletions.restoreDeletion({
      actorAccountId: INSTRUCTOR,
      deletionId,
      now: NOW,
      reason: 'ลบผิด',
    });
  }

  async function stampedIds(deletionId: string) {
    const rounds = await database.sql<{ id: string }[]>`
      select id from public.collection_rounds where deletion_id = ${deletionId} order by id
    `;
    const stampedGroups = await database.sql<{ id: string }[]>`
      select id from public.collection_groups where deletion_id = ${deletionId} order by id
    `;
    const stampedForms = await database.sql<{ count: number }[]>`
      select count(*)::int as count from public.collection_forms where deletion_id = ${deletionId}
    `;
    return {
      forms: stampedForms[0]!.count,
      groups: stampedGroups.map((row) => row.id),
      rounds: rounds.map((row) => row.id),
    };
  }

  async function createRound(name: string): Promise<string> {
    const rows = await database.sql<{ id: string }[]>`
      insert into public.collection_rounds (name, created_by_account_id, created_at)
      values (${name}, ${INSTRUCTOR}, ${NOW}) returning id
    `;
    return rows[0]!.id;
  }

  async function createGroup(roundId: string, name: string, members: string[]): Promise<string> {
    const rows = await database.sql<{ id: string }[]>`
      insert into public.collection_groups (round_id, name, created_by_account_id, created_at)
      values (${roundId}, ${name}, ${INSTRUCTOR}, ${NOW}) returning id
    `;
    for (const member of members) {
      await database.sql`
        insert into public.collection_group_memberships
          (group_id, student_account_id, membership_source, added_by_account_id, added_at)
        values (${rows[0]!.id}, ${member}, 'individual', ${INSTRUCTOR}, ${NOW})
      `;
    }
    return rows[0]!.id;
  }

  async function createOpenForm(groupId: string, title: string): Promise<string> {
    const form = await forms.createForm({
      actorAccountId: INSTRUCTOR,
      createdFromTemplateId: null,
      deadlineAt: null,
      description: '',
      fields: [TEXT_FIELD],
      groupId,
      now: NOW,
      title,
    });
    if (form === null) throw new Error('expected form');
    const opened = await forms.openForm({ actorAccountId: INSTRUCTOR, formId: form.id, now: NOW });
    if (typeof opened === 'string') throw new Error(`expected opened form, got ${opened}`);
    return form.id;
  }

  async function submit(formId: string, idempotencyKey: string) {
    await forms.saveDraft({
      answers: { company: 'CSI' },
      expectedVersion: 0,
      formId,
      now: NOW,
      studentAccountId: STUDENT,
    });
    const submitted = await forms.submit({
      formId,
      idempotencyKey,
      now: NOW,
      studentAccountId: STUDENT,
    });
    if (typeof submitted === 'string' || 'outcome' in submitted) {
      throw new Error('expected submission');
    }
  }

  async function closeRound(roundId: string) {
    const result = await forms.setRoundStatus({
      actorAccountId: INSTRUCTOR,
      expectedStatus: 'active',
      nextStatus: 'closed',
      now: NOW,
      reason: 'ปิดรอบ',
      roundId,
    });
    if (typeof result === 'string') throw new Error(`expected closed round, got ${result}`);
  }

  async function cleanupCollectionData() {
    await database.sql.begin(async (transaction) => {
      /* Items and their deletions reference each other, so markers go first. */
      await transaction`update public.collection_forms set deletion_id = null where created_by_account_id = ${INSTRUCTOR}`;
      await transaction`update public.collection_groups set deletion_id = null where created_by_account_id = ${INSTRUCTOR}`;
      await transaction`update public.collection_rounds set deletion_id = null where created_by_account_id = ${INSTRUCTOR}`;
      await transaction`delete from private.collection_deletions where deleted_by_account_id = ${INSTRUCTOR}`;
      await transaction`
        delete from private.collection_export_entries
        where export_id in (
          select id from private.collection_exports where requested_by_account_id = ${INSTRUCTOR}
        )
      `;
      await transaction`
        delete from private.collection_export_forms
        where export_id in (
          select id from private.collection_exports where requested_by_account_id = ${INSTRUCTOR}
        )
      `;
      await transaction`delete from private.collection_exports where requested_by_account_id = ${INSTRUCTOR}`;
      await transaction`delete from private.collection_files where student_account_id = ${STUDENT}`;
      await transaction`delete from private.collection_response_drafts where student_account_id = ${STUDENT}`;
      await transaction`update public.collection_obligations set latest_submission_id = null where student_account_id = ${STUDENT}`;
      await transaction`delete from private.collection_submissions where student_account_id = ${STUDENT}`;
      await transaction`delete from public.collection_obligations where student_account_id = ${STUDENT}`;
      await transaction`delete from private.collection_notifications where student_account_id = ${STUDENT}`;
      await transaction`delete from private.collection_form_structure_events where actor_account_id = ${INSTRUCTOR}`;
      await transaction`delete from private.collection_form_metadata_events where actor_account_id = ${INSTRUCTOR}`;
      await transaction`delete from public.collection_forms where created_by_account_id = ${INSTRUCTOR}`;
      await transaction`delete from public.collection_group_memberships where student_account_id = ${STUDENT}`;
      await transaction`delete from public.collection_groups where created_by_account_id = ${INSTRUCTOR}`;
      await transaction`delete from private.collection_round_lifecycle_events where actor_account_id = ${INSTRUCTOR}`;
      await transaction`delete from public.collection_rounds where created_by_account_id = ${INSTRUCTOR}`;
    });
  }

  async function cleanup() {
    await cleanupCollectionData();
    await database.sql.begin(async (transaction) => {
      await transaction`delete from public.account_roles where account_id in (${INSTRUCTOR}, ${STUDENT})`;
      await transaction`delete from private.person_names where person_id in (${INSTRUCTOR_PERSON}, ${STUDENT_PERSON})`;
      await transaction`delete from public.accounts where id in (${INSTRUCTOR}, ${STUDENT})`;
      await transaction`delete from public.students where person_id = ${STUDENT_PERSON}`;
      await transaction`delete from public.people where id in (${INSTRUCTOR_PERSON}, ${STUDENT_PERSON})`;
    });
  }
});
