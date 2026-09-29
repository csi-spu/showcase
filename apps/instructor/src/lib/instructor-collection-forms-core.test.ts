import { describe, expect, it, vi } from 'vitest';
import { InstructorCollectionFormsCoreClient } from './instructor-collection-forms-core';

const FORM_ID = '20000000-0000-4000-8000-000000000001';
const STUDENT_ACCOUNT_ID = '40000000-0000-4000-8000-000000000001';
const BASE = 'https://core.test/v1/internal/instructor/collection';

const ENTRY = {
  firstSubmittedAt: null,
  isLate: false,
  latestCheckingReason: null,
  latestSubmission: null,
  rosterName: { firstNameTh: 'สมชาย', lastNameTh: 'ตัวอย่าง' },
  status: 'not_submitted',
  studentAccountId: STUDENT_ACCOUNT_ID,
  studentId: '66000001',
};

const QUEUE = {
  entries: [ENTRY],
  form: {
    createdFromTemplateId: null,
    deadlineAt: null,
    description: '',
    fields: [],
    groupId: '10000000-0000-4000-8000-000000000001',
    id: FORM_ID,
    status: 'open',
    title: 'เอกสารฝึกงาน',
    version: 1,
  },
  page: 1,
  statusCounts: {
    awaiting_checking: 0,
    changes_required: 0,
    not_submitted: 1,
    passed: 0,
    withdrawn: 0,
  },
  total: 1,
};

function clientReturning(payload: unknown) {
  const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(payload));
  const client = new InstructorCollectionFormsCoreClient(
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

describe('InstructorCollectionFormsCoreClient review queue', () => {
  it('reads a page with its order and status filter in the query string', async () => {
    const { client, fetchImpl } = clientReturning(QUEUE);

    const queue = await client.listSubmissions('session', FORM_ID, {
      page: 2,
      pageSize: 25,
      sort: 'name',
      status: 'passed',
    });

    expect(queue.total).toBe(1);
    expect(sentRequest(fetchImpl)).toEqual({
      body: undefined,
      method: 'GET',
      url: `${BASE}/forms/${FORM_ID}/submissions?page=2&pageSize=25&sort=name&status=passed`,
    });
  });

  it('leaves the status out when every status is listed', async () => {
    const { client, fetchImpl } = clientReturning(QUEUE);

    await client.listSubmissions('session', FORM_ID, {
      page: 1,
      pageSize: 10,
      sort: 'status',
      status: null,
    });

    expect(sentRequest(fetchImpl).url).toBe(
      `${BASE}/forms/${FORM_ID}/submissions?page=1&pageSize=10&sort=status`,
    );
  });

  /* The term may be a Student ID prefix, which must never enter a URL (ADR 0020). */
  it('sends a search in the body of a POST', async () => {
    const { client, fetchImpl } = clientReturning(QUEUE);

    await client.searchSubmissions('session', FORM_ID, {
      page: 1,
      pageSize: 10,
      search: '6600',
      sort: 'status',
      status: null,
    });

    expect(sentRequest(fetchImpl)).toEqual({
      body: { page: 1, pageSize: 10, search: '6600', sort: 'status' },
      method: 'POST',
      url: `${BASE}/forms/${FORM_ID}/submissions/search`,
    });
  });

  it("reads a Student's place under the order the table was in", async () => {
    const { client, fetchImpl } = clientReturning({
      entry: ENTRY,
      next: null,
      page: 1,
      pageStudents: [{ rosterName: ENTRY.rosterName, studentAccountId: STUDENT_ACCOUNT_ID }],
      position: 1,
      previous: null,
      total: 1,
    });

    const position = await client.reviewPosition('session', FORM_ID, STUDENT_ACCOUNT_ID, {
      pageSize: 50,
      sort: 'submittedDesc',
      status: 'awaiting_checking',
    });

    expect(position.position).toBe(1);
    expect(sentRequest(fetchImpl)).toEqual({
      body: undefined,
      method: 'GET',
      url: `${BASE}/forms/${FORM_ID}/students/${STUDENT_ACCOUNT_ID}/review-position?pageSize=50&sort=submittedDesc&status=awaiting_checking`,
    });
  });
});
