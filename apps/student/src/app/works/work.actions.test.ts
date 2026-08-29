import { beforeEach, describe, expect, it, vi } from 'vitest';
const dependencies = vi.hoisted(() => ({
  createWork: vi.fn(),
  readToken: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: dependencies.revalidate }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/server-environment', () => ({
  getStudentServerEnvironment: () => ({
    coreUrl: 'https://core.test',
    studentBffSecret: 'x'.repeat(32),
  }),
}));
vi.mock('@/lib/student-auth-session', () => ({ readStudentSessionToken: dependencies.readToken }));
vi.mock('@/lib/student-works-core', () => ({
  StudentWorksCoreClient: class {
    createWork = dependencies.createWork;
  },
  StudentWorksCoreError: class extends Error {
    code = 'TEST';
    status = 500;
  },
}));
import { autosaveWorkAction } from './work.actions';

describe('autosaveWorkAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dependencies.readToken.mockResolvedValue('session');
    dependencies.createWork.mockResolvedValue({
      work: {
        publicId: '64000000-0000-4000-8000-000000000001',
        savedAt: '2026-08-29T00:00:00.000Z',
        version: 1,
      },
    });
  });
  it('accepts one partial field and derives actor outside the browser payload', async () => {
    await expect(
      autosaveWorkAction({
        expectedVersion: null,
        idempotencyKey: '64000000-0000-4000-8000-000000000002',
        patch: { title: 'ผลงาน' },
        publicId: null,
      }),
    ).resolves.toMatchObject({ outcome: 'saved', version: 1 });
    expect(dependencies.createWork).toHaveBeenCalledWith('session', {
      idempotencyKey: '64000000-0000-4000-8000-000000000002',
      title: 'ผลงาน',
    });
  });
  it('rejects unknown fields before Core', async () => {
    await expect(
      autosaveWorkAction({
        expectedVersion: null,
        idempotencyKey: '64000000-0000-4000-8000-000000000002',
        patch: { studentId: '12345678' },
        publicId: null,
      }),
    ).resolves.toEqual({ error: 'invalid', outcome: 'error' });
    expect(dependencies.createWork).not.toHaveBeenCalled();
  });
});
