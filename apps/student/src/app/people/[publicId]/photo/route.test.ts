import { describe, expect, it, vi } from 'vitest';
import { GET } from './route';

vi.mock('@/lib/server-environment', () => ({
  getStudentServerEnvironment: () => ({
    coreUrl: 'https://core.example.test',
    studentBffSecret: 'student-bff-secret-with-at-least-32-characters',
    visitorUrl: 'https://visitor.example.test',
  }),
}));

describe('GET /people/:publicId/photo', () => {
  it('redirects a valid public profile photo to the Visitor surface', async () => {
    const publicId = '64000000-0000-4000-8000-000000000003';

    const response = await GET(new Request(`http://localhost/people/${publicId}/photo`), {
      params: Promise.resolve({ publicId }),
    });

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      `https://visitor.example.test/people/${publicId}/photo`,
    );
  });

  it('does not redirect an invalid public profile identifier', async () => {
    const response = await GET(new Request('http://localhost/people/not-a-uuid/photo'), {
      params: Promise.resolve({ publicId: 'not-a-uuid' }),
    });

    expect(response.status).toBe(404);
    expect(response.headers.get('location')).toBeNull();
  });
});
