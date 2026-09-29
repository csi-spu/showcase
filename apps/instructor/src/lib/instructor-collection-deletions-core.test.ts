import { describe, expect, it, vi } from 'vitest';
import { InstructorCollectionDeletionsCoreClient } from './instructor-collection-deletions-core';

const ID = '70000000-0000-4000-8000-000000000001';
const DELETION_ID = '71000000-0000-4000-8000-000000000001';

const PREVIEW = {
  blockedReason: null,
  counts: { assignedStudentCount: 40, formCount: 5, groupCount: 2, submittedStudentCount: 38 },
  group: null,
  kind: 'round',
  name: 'ชุดงานฝึกงาน',
  round: null,
};

const ENTRY = {
  counts: { assignedStudentCount: 3, formCount: 1, groupCount: 0, submittedStudentCount: 1 },
  deletedAt: '2026-09-29T03:00:00.000Z',
  deletedByName: 'ผู้สอน ทดสอบ',
  groupName: 'กลุ่ม A',
  id: DELETION_ID,
  kind: 'form',
  name: 'แบบฟอร์มสมัคร',
  restore: {
    reason: 'ลบผิด',
    restoredAt: '2026-09-29T04:00:00.000Z',
    restoredByName: 'ผู้สอน ทดสอบ',
  },
  restoreAvailability: { status: 'already_restored' },
  roundName: 'ชุดงานฝึกงาน',
};

function clientReturning(payload: unknown) {
  const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(payload));
  const client = new InstructorCollectionDeletionsCoreClient(
    { coreUrl: 'https://core.test', instructorBffSecret: 'secret' },
    fetchImpl,
  );
  return { client, fetchImpl };
}

function sentRequest(fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>) {
  const [url, init] = fetchImpl.mock.calls[0] ?? [];
  return {
    body: init?.body === undefined ? undefined : (JSON.parse(String(init.body)) as unknown),
    method: init?.method,
    url: String(url),
  };
}

describe('InstructorCollectionDeletionsCoreClient', () => {
  it('reads a preview from the path of the item kind', async () => {
    const { client, fetchImpl } = clientReturning(PREVIEW);

    expect(await client.previewDeletion('session', 'round', ID)).toEqual(PREVIEW);
    expect(sentRequest(fetchImpl)).toMatchObject({
      method: 'GET',
      url: `https://core.test/v1/internal/instructor/collection/rounds/${ID}/deletion-preview`,
    });
  });

  it('sends the typed name to delete a form', async () => {
    const { client, fetchImpl } = clientReturning({ deletionId: DELETION_ID });

    await client.deleteItem('session', 'form', ID, { confirmationName: 'แบบฟอร์มสมัคร' });

    expect(sentRequest(fetchImpl)).toEqual({
      body: { confirmationName: 'แบบฟอร์มสมัคร' },
      method: 'POST',
      url: `https://core.test/v1/internal/instructor/collection/forms/${ID}/delete`,
    });
  });

  it('reads the first log page without a cursor and a later one with it', async () => {
    const first = clientReturning({ entries: [ENTRY], nextCursor: 'MTc5MDA3MTIwMDEyMzQ1Ng' });
    expect((await first.client.listDeletions('session', null)).entries).toEqual([ENTRY]);
    expect(sentRequest(first.fetchImpl).url).toBe(
      'https://core.test/v1/internal/instructor/collection/deletions',
    );

    const next = clientReturning({ entries: [], nextCursor: null });
    await next.client.listDeletions('session', 'MTc5MDA3MTIwMDEyMzQ1Ng');
    expect(sentRequest(next.fetchImpl).url).toBe(
      'https://core.test/v1/internal/instructor/collection/deletions?cursor=MTc5MDA3MTIwMDEyMzQ1Ng',
    );
  });

  it('sends the restore reason', async () => {
    const { client, fetchImpl } = clientReturning({ deletionId: DELETION_ID });

    await client.restoreDeletion('session', DELETION_ID, { reason: 'ลบผิด' });

    expect(sentRequest(fetchImpl)).toEqual({
      body: { reason: 'ลบผิด' },
      method: 'POST',
      url: `https://core.test/v1/internal/instructor/collection/deletions/${DELETION_ID}/restore`,
    });
  });

  it('rejects Student data on a log entry', async () => {
    const { client } = clientReturning({
      entries: [{ ...ENTRY, studentId: '66000001' }],
      nextCursor: null,
    });

    await expect(client.listDeletions('session', null)).rejects.toThrow();
  });

  it('rejects an ancestor without a name', async () => {
    const { client } = clientReturning({
      entries: [{ ...ENTRY, restore: null, restoreAvailability: { status: 'ancestor_deleted' } }],
      nextCursor: null,
    });

    await expect(client.listDeletions('session', null)).rejects.toThrow();
  });
});
