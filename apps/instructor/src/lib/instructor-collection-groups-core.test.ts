import { describe, expect, it, vi } from 'vitest';
import { InstructorCollectionGroupsCoreClient } from './instructor-collection-groups-core';

const STUDENT = {
  accountId: '40000000-0000-4000-8000-000000000001',
  entryYear: 2566,
  firstNameTh: 'สมหญิง',
  lastNameTh: 'ใจดี',
  status: 'selectable',
  studentId: '66012345',
};

function clientReturning(payload: unknown) {
  const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(payload));
  const client = new InstructorCollectionGroupsCoreClient(
    { coreUrl: 'https://core.test', instructorBffSecret: 'secret' },
    fetchImpl,
  );
  return { client, fetchImpl };
}

function sentRequest(fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>) {
  const [url, init] = fetchImpl.mock.calls[0] ?? [];
  return {
    body: JSON.parse(String(init?.body)) as unknown,
    method: init?.method,
    url: String(url),
  };
}

/* `q` may be a Student ID prefix, which must never enter a URL (ADR 0020). */
describe('InstructorCollectionGroupsCoreClient Student search', () => {
  it('sends the search in the body of a POST', async () => {
    const { client, fetchImpl } = clientReturning({
      hasCurrentAcademicYear: true,
      nextCursor: null,
      students: [STUDENT],
    });

    const page = await client.listStudents('session', {
      cursor: null,
      entryYear: 2566,
      groupId: null,
      q: '6601',
    });

    expect(page.students[0]?.studentId).toBe('66012345');
    const request = sentRequest(fetchImpl);
    expect(request.method).toBe('POST');
    expect(request.url).toBe('https://core.test/v1/internal/instructor/students/search');
    expect(request.body).toEqual({ entryYear: 2566, limit: 50, q: '6601' });
  });

  it('sends select-all filters in the body of a POST', async () => {
    const { client, fetchImpl } = clientReturning({ students: [STUDENT] });

    await client.selectAllStudents('session', {
      entryYear: null,
      groupId: '10000000-0000-4000-8000-000000000001',
      q: '6601',
      selectedCount: 3,
    });

    const request = sentRequest(fetchImpl);
    expect(request.method).toBe('POST');
    expect(request.url).toBe('https://core.test/v1/internal/instructor/students/select-all');
    expect(request.body).toEqual({
      groupId: '10000000-0000-4000-8000-000000000001',
      q: '6601',
      selectedCount: 3,
    });
  });
});
